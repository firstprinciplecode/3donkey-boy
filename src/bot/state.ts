import { LETTER_CHARS } from '../entities/items';
import { mod, TANGENTS, squareCoords, type Level } from '../level';
import { ROUTES, type RouteStep } from './routes';
import type { GameView } from './view';

/**
 * What the bot (and Jev) sees each decision: compact, object-centric JSON rather than pixels.
 * Distances are in world units. `dx` is measured along the player's ring (positive = to the right
 * as seen from outside the pyramid), `dy` is height above the player's feet.
 */
export interface Nearby {
  kind: string;
  ring: number;
  dx: number;
  dy: number;
  /** Speed along the ring (positive = moving right), from the last two readings. */
  vx?: number;
  vy?: number;
  size?: number;
}

export interface LadderInfo {
  index: number;
  dx: number;
  open: boolean;
  lock?: string;
  toSummit?: boolean;
}

export interface BotState {
  status: string;
  level: { number: number; name: string; rings: number; round: number };
  player: {
    ring: number;
    side: number;
    offset: number;
    state: string;
    /** Height above the player's floor: how far up a ladder, or how high a jump is. */
    height: number;
    vx: number;
    vy: number;
    hammerSeconds: number;
  };
  ladders: { up: LadderInfo[]; down: LadderInfo[] };
  /** Nearest open gap in the floor each way (null when there is floor for the next 6 units). */
  floor: { gapLeft: Gap | null; gapRight: Gap | null };
  threats: Nearby[];
  items: Nearby[];
  goals: { relicsLeft: number; orbsLeft: number; letters: string };
  /** The next step of this level's route. Follow `action` unless a threat is about to hit you. */
  objective: Objective;
  run: { score: number; lives: number; bonus: number };
}

export interface Objective {
  action: 'left' | 'right' | 'up';
  /** How far to walk in `action`'s direction. 0 while climbing. */
  distance: number;
  step: number;
  steps: number;
  text: string;
}

export interface Gap {
  at: number;
  width: number;
}

const SCAN = 6;
const SCAN_STEP = 0.25;
const MAX_THREATS = 8;
const MAX_ITEMS = 6;
const round2 = (v: number) => Math.round(v * 100) / 100;

type Point = { x: number; y: number; z: number };

/** Remembers where each object was last reading, so the state can say which way it is moving. */
export class StateReader {
  private last = new WeakMap<object, { x: number; y: number; z: number; t: number }>();
  private routeAt = 0;

  constructor(private readonly view: GameView) {}

  /** A new attempt starts back at the first step of the route. */
  reset(): void {
    this.routeAt = 0;
  }

  read(clock: number): BotState {
    const v = this.view;
    const L = v.level;
    const p = v.player;
    const { side, offset } = L.ringSide(p.ring, p.s);

    const where = (key: object, at: Point, kind: string, ring?: number, size?: number): Nearby => {
      const c = squareCoords(at.x, at.z);
      const r = ring ?? Math.max(0, Math.min(L.ringCount - 1, Math.floor((at.y + 0.25) / L.def.tierHeight)));
      const dx = L.ringDelta(p.ring, L.sOf(p.ring, c.side, c.offset), p.s);
      const out: Nearby = { kind, ring: r, dx: round2(dx), dy: round2(at.y - p.position.y) };
      if (size !== undefined) out.size = round2(size);
      const prev = this.last.get(key);
      if (prev && clock > prev.t) {
        const dt = clock - prev.t;
        const t = TANGENTS[c.side];
        out.vx = round2(((at.x - prev.x) * t.x + (at.z - prev.z) * t.z) / dt);
        out.vy = round2((at.y - prev.y) / dt);
      }
      this.last.set(key, { x: at.x, y: at.y, z: at.z, t: clock });
      return out;
    };

    const threats: Nearby[] = [
      ...v.barrels.barrels.filter((b) => !b.done && b.state !== 'sink').map((b) => where(b, b.pos, b.look, b.ring, b.radius)),
      ...v.barrels.dangers.map((d) => where(d, d, 'scorch', undefined, d.r)),
      ...v.fires.map((f) => where(f, f.position, 'fire')),
      ...v.ghosts.map((g) => where(g, g.position, 'ghost')),
      ...v.crawlers.map((c) => where(c, c.position, 'crawler', c.ring, c.radius)),
      ...v.totems.map((t) => where(t, t.position, 'totem', t.ring, t.radius)),
      ...v.hazards.dangers.map((d) => where(d, d, 'falling_hazard', undefined, d.r)),
    ];
    const pending = v.items.filter((it) => !it.collected);
    const items = pending.filter((it) => it.type !== 'orb').map((it) => where(it, it.position, it.type));

    return {
      status: v.state,
      level: { number: v.levelIndex + 1, name: L.def.name, rings: L.ringCount, round: v.round },
      player: {
        ring: p.ring,
        side,
        offset: round2(offset),
        state: p.state,
        height: round2(p.position.y - L.tierTop(p.ring)),
        vx: round2(p.vs),
        vy: round2(p.vy),
        hammerSeconds: p.hasHammer ? round2(Math.max(0, v.hammerTime)) : 0,
      },
      ladders: this.ladders(),
      floor: { gapLeft: this.gap(-1), gapRight: this.gap(1) },
      threats: nearest(threats, MAX_THREATS),
      items: nearest(items, MAX_ITEMS),
      goals: {
        relicsLeft: pending.filter((it) => it.type === 'relic').length,
        orbsLeft: pending.filter((it) => it.type === 'orb').length,
        letters: v.items
          .filter((it) => LETTER_CHARS[it.type] && it.collected)
          .map((it) => LETTER_CHARS[it.type])
          .join(''),
      },
      objective: this.objective(),
      run: { score: v.score, lives: v.lives, bonus: v.bonus },
    };
  }

  private objective(): Objective {
    const { level: L, player: p } = this.view;
    const route = ROUTES[L.def.name] ?? [];
    const steps = place(route);
    while (this.routeAt < steps.length) {
      const step = steps[this.routeAt];
      const climbedPast = p.ring > step.ring && p.grounded;
      const arrived =
        step.kind === 'go' &&
        p.ring === step.ring &&
        p.grounded &&
        L.ringDistance(p.ring, p.s, L.sOf(step.ring, step.side, step.offset)) < 0.45;
      if (climbedPast || arrived) this.routeAt++;
      else break;
    }
    const step = steps[this.routeAt];
    const at = { step: Math.min(this.routeAt + 1, route.length), steps: route.length };
    if (!step || step.kind === 'climb') {
      return { ...at, action: 'up', distance: 0, text: 'Climb up. Hold up until you are standing on the next floor.' };
    }
    const distance = round2(directed(L, p.ring, p.s, L.sOf(p.ring, step.side, step.offset), step.go));
    const action = step.go > 0 ? 'right' : 'left';
    return {
      ...at,
      action,
      distance,
      text: `Walk ${action} ${distance} units to the next ladder, then climb. Turn around only to dodge something about to hit you.`,
    };
  }

  private ladders(): BotState['ladders'] {
    const { level: L, player: p, obstacles } = this.view;
    const info = (index: number, s: number, toSummit: boolean): LadderInfo => {
      const lock = obstacles.lockKind(index);
      return {
        index,
        dx: round2(L.ringDelta(p.ring, s, p.s)),
        open: obstacles.isLadderOpen(index),
        ...(lock ? { lock } : {}),
        ...(toSummit ? { toSummit } : {}),
      };
    };
    const up = L.ladderPaths.filter((l) => l.ladder.ring === p.ring).map((l) => info(l.index, l.bottomS, l.topS === null));
    const down = L.ladderPaths
      .filter((l) => l.topS !== null && l.ladder.ring + 1 === p.ring)
      .map((l) => info(l.index, l.topS as number, false));
    const byDistance = (a: LadderInfo, b: LadderInfo) => Math.abs(a.dx) - Math.abs(b.dx);
    return { up: up.sort(byDistance), down: down.sort(byDistance) };
  }

  private gap(dir: 1 | -1): Gap | null {
    const { player: p, obstacles } = this.view;
    let start = -1;
    for (let d = SCAN_STEP; d <= SCAN; d += SCAN_STEP) {
      const open = obstacles.carry(p.ring, p.s + dir * d) === null;
      if (open && start < 0) start = d;
      if (!open && start >= 0) return { at: round2(start), width: round2(d - start) };
    }
    return start >= 0 ? { at: round2(start), width: round2(SCAN - start) } : null;
  }
}

function nearest(list: Nearby[], max: number): Nearby[] {
  return list.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy)).slice(0, max);
}

interface PlacedGo {
  kind: 'go';
  ring: number;
  go: 1 | -1;
  side: number;
  offset: number;
}
interface PlacedClimb {
  kind: 'climb';
  ring: number;
}

/** Tags each route step with the ring it happens on. A climb raises the ring for the steps after it. */
function place(route: readonly RouteStep[]): (PlacedGo | PlacedClimb)[] {
  let ring = 0;
  return route.map((step) => {
    if ('climb' in step) {
      const placed: PlacedClimb = { kind: 'climb', ring };
      ring += 1;
      return placed;
    }
    return { kind: 'go', ring, go: step.go, side: step.to[0], offset: step.to[1] };
  });
}

/** Distance along the ring from `from` to `to`, walking only in `dir`. */
function directed(level: Level, ring: number, from: number, to: number, dir: 1 | -1): number {
  const len = level.ringLength(ring);
  return dir === 1 ? mod(to - from, len) : mod(from - to, len);
}
