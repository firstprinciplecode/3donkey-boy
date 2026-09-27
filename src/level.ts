import type { LevelDef, SpanDef, SpotDef } from './levels/types';

export type { ItemType } from './levels/types';
export type Spot = Readonly<SpotDef>;

/**
 * The level is a stepped, four-sided pyramid. Tier 0 is the ground terrace, tier `summitTier` the
 * top. Rings 0..ringCount-1 are the walkways on top of each tier, outside the tier above.
 *
 * Positions on a ring are a 1D distance `s` along its square path. `s` grows when walking
 * "right" as seen from outside the pyramid: south (+z) face, then east, north and west.
 * Authored spots use (side, offset) where offset is measured from the middle of that side,
 * so the same spot on neighbouring rings lines up straight in/out from the pyramid.
 */

export const BASE_DEPTH = 10;
/** Depth of spike pits below the walkway. */
export const PIT_DEPTH = 1;
export const BOSS_POS = { x: -1, z: 0 } as const;
const LADDER_STANDOFF = 0.35;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export const TANGENTS: readonly { x: number; z: number }[] = [
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
];

export const NORMALS: readonly { x: number; z: number }[] = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

export const mod = (a: number, n: number): number => ((a % n) + n) % n;
/** Yaw that turns local +z to face outward from `side` (and local +x along increasing s). */
export const sideYaw = (side: number): number => side * (Math.PI / 2);

export function squarePoint(radius: number, side: number, offset: number): { x: number; z: number } {
  switch (side) {
    case 0:
      return { x: offset, z: radius };
    case 1:
      return { x: radius, z: -offset };
    case 2:
      return { x: -offset, z: -radius };
    default:
      return { x: -radius, z: offset };
  }
}

/** Inverse of squarePoint: which side a world (x, z) is on, its offset along that side and its radius. */
export function squareCoords(x: number, z: number): { side: number; offset: number; radius: number } {
  if (z >= Math.abs(x)) return { side: 0, offset: x, radius: z };
  if (x >= Math.abs(z)) return { side: 1, offset: -z, radius: x };
  if (-z >= Math.abs(x)) return { side: 2, offset: -x, radius: -z };
  return { side: 3, offset: z, radius: -x };
}

export interface LadderPath {
  readonly index: number;
  readonly ladder: Spot;
  readonly length: number;
  readonly bottomS: number;
  /** s on the upper ring, or null when the ladder leads to the summit. */
  readonly topS: number | null;
  point(d: number): Point3;
  isVertical(d: number): boolean;
}

/** A stretch of one ring, stored in ring coordinates. */
export interface RingSpan {
  readonly ring: number;
  readonly center: number;
  readonly half: number;
  readonly def: Readonly<SpanDef>;
}

export class Level {
  readonly def: LevelDef;
  readonly ringCount: number;
  readonly summitTier: number;
  readonly ladderPaths: readonly LadderPath[];
  readonly chuteByRing: readonly (Spot | null)[];
  readonly summitPath: LadderPath;
  readonly baseBottom: number;

  constructor(def: LevelDef) {
    this.def = def;
    this.ringCount = def.rings;
    this.summitTier = def.rings;
    this.baseBottom = -BASE_DEPTH;
    this.ladderPaths = def.ladders.map((l, i) => this.makeLadderPath(l, i));
    this.chuteByRing = Array.from({ length: def.rings }, (_, k) => def.chutes.find((c) => c.ring === k) ?? null);
    const summit = this.ladderPaths.find((p) => p.topS === null);
    if (!summit) throw new Error(`Level "${def.name}" has no ladder to the summit`);
    this.summitPath = summit;
  }

  tierHalf(k: number): number {
    return this.def.summitHalf + (this.summitTier - k) * this.def.terraceDepth;
  }

  tierTop(k: number): number {
    return k * this.def.tierHeight;
  }

  ringRadius(k: number): number {
    return this.tierHalf(k) - this.def.terraceDepth / 2;
  }

  ringLength(k: number): number {
    return 8 * this.ringRadius(k);
  }

  sOf(ring: number, side: number, offset: number): number {
    const r = this.ringRadius(ring);
    return mod(side * 2 * r + r + offset, 8 * r);
  }

  spotS(spot: Spot): number {
    return this.sOf(spot.ring, spot.side, spot.offset);
  }

  ringSide(ring: number, s: number): { side: number; offset: number } {
    const r = this.ringRadius(ring);
    const ss = mod(s, 8 * r);
    const side = Math.min(3, Math.floor(ss / (2 * r)));
    return { side, offset: ss - side * 2 * r - r };
  }

  ringPoint(ring: number, s: number): { x: number; z: number; side: number } {
    const { side, offset } = this.ringSide(ring, s);
    return { ...squarePoint(this.ringRadius(ring), side, offset), side };
  }

  ringDistance(ring: number, a: number, b: number): number {
    const len = this.ringLength(ring);
    const d = mod(a - b, len);
    return Math.min(d, len - d);
  }

  /** Signed shortest distance from `b` to `a` along the ring. */
  ringDelta(ring: number, a: number, b: number): number {
    const len = this.ringLength(ring);
    const d = mod(a - b, len);
    return d > len / 2 ? d - len : d;
  }

  /** True if moving `delta` from `prev` in direction `dir` (+1 = increasing s) passes `target`. */
  crossed(ring: number, prev: number, target: number, delta: number, dir: 1 | -1): boolean {
    return mod(dir * (target - prev), this.ringLength(ring)) < delta;
  }

  span(def: Readonly<SpanDef>): RingSpan {
    return { ring: def.ring, center: this.spotS(def), half: def.width / 2, def };
  }

  inSpan(span: RingSpan, ring: number, s: number, margin = 0): boolean {
    return span.ring === ring && this.ringDistance(ring, s, span.center) < span.half - margin;
  }

  /** Walk in to the wall, climb straight up, step over the edge onto the next ring. */
  private makeLadderPath(l: Spot, index: number): LadderPath {
    const upper = l.ring + 1;
    const wall = this.tierHalf(upper);
    const y0 = this.tierTop(l.ring);
    const y1 = this.tierTop(upper);
    const toSummit = upper === this.summitTier;
    const rBottom = this.ringRadius(l.ring);
    const rFoot = wall + LADDER_STANDOFF;
    const rTop = toSummit ? wall - 1.2 : this.ringRadius(upper);
    const a = rBottom - rFoot;
    const b = y1 - y0;
    const c = rFoot - rTop;
    return {
      index,
      ladder: l,
      length: a + b + c,
      bottomS: this.spotS(l),
      topS: toSummit ? null : this.sOf(upper, l.side, l.offset),
      point(d) {
        let r: number;
        let y: number;
        if (d <= a) {
          r = rBottom - d;
          y = y0;
        } else if (d <= a + b) {
          r = rFoot;
          y = y0 + (d - a);
        } else {
          r = rFoot - (d - a - b);
          y = y1;
        }
        const p = squarePoint(r, l.side, l.offset);
        return { x: p.x, y, z: p.z };
      },
      isVertical(d) {
        return d > a && d < a + b;
      },
    };
  }
}
