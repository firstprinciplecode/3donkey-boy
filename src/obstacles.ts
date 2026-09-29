import * as THREE from 'three';
import { COLORS, OBSTACLES, VINE } from './config';
import { mod, sideYaw, squarePoint, type Level, type RingSpan, type Spot } from './level';
import type { LockDef, PlatformDef, VineDef } from './levels/types';
import { makeConveyorTexture } from './textures';
import { box, material, unitBox } from './voxel';

/**
 * What's under a spot on a ring: `null` = open gap (fall into the spike pit), otherwise the speed
 * (along s) the floor carries you at: 0 for plain floor, non-zero on conveyors and moving platforms.
 */
export type Carry = number | null;

export interface ObstacleEnv {
  carry(ring: number, s: number): Carry;
  isLadderOpen(index: number): boolean;
  /** How fast walking speed catches up with the controls; Infinity on normal floor. */
  grip(ring: number, s: number): number;
  /** True if there is a spring pad under this spot. */
  spring(ring: number, s: number): boolean;
  /** Index of a vine whose end is within reach of hands at this spot and height, or -1. */
  grabVine(ring: number, s: number, handY: number): number;
  /** Where the end of a vine is now, and how fast it's moving. */
  vineTip(index: number): Readonly<VineTip>;
}

export interface VineTip {
  s: number;
  y: number;
  vs: number;
  vy: number;
}

export interface ObstacleEvents {
  crumbled: boolean;
  switched: Spot | null;
}

interface Crumble {
  span: RingSpan;
  group: THREE.Group;
  cells: THREE.Mesh[];
  state: 'intact' | 'shaking' | 'falling' | 'gone';
  t: number;
}

interface Platform {
  span: RingSpan;
  def: PlatformDef;
  group: THREE.Group;
  amp: number;
  s: number;
  vel: number;
}

interface Conveyor {
  span: RingSpan;
  dir: 1 | -1;
  texture: THREE.Texture;
}

interface Lock {
  def: LockDef;
  group: THREE.Group;
  open: boolean;
  t: number;
  switchS: number;
  switchCap: THREE.Mesh | null;
  switchFlag: THREE.Mesh | null;
}

interface Spring {
  ring: number;
  s: number;
  coil: THREE.Group;
  t: number;
}

interface Vine {
  ring: number;
  s: number;
  pivotY: number;
  period: number;
  phase: number;
  rope: THREE.Group;
  tip: VineTip;
}

const LOCK_COLORS = { switch: COLORS.red, key: COLORS.pink, relics: COLORS.teal } as const;

/** Spring pad: a base plate and a coil group that squashes when it fires. */
export function springParts(): { base: THREE.Mesh; coil: THREE.Group } {
  const coil = new THREE.Group();
  for (let i = 0; i < 3; i++) coil.add(box(0.5, 0.08, 0.5, i % 2 ? COLORS.cream : COLORS.grey, 0, 0.12 + i * 0.12, 0));
  coil.add(box(0.8, 0.12, 0.8, COLORS.red, 0, 0.46, 0), box(0.5, 0.04, 0.5, COLORS.yellow, 0, 0.53, 0));
  return { base: box(0.9, 0.08, 0.9, COLORS.charcoal, 0, 0.04, 0), coil };
}

/** Dynamic level pieces: crumbling tiles, moving platforms, conveyors and locked ladders. */
export class Obstacles implements ObstacleEnv {
  readonly group = new THREE.Group();
  private readonly level: Level;
  private readonly pits: RingSpan[];
  private readonly crumbles: Crumble[] = [];
  private readonly platforms: Platform[] = [];
  private readonly conveyors: Conveyor[] = [];
  private readonly ice: RingSpan[];
  private readonly springs: Spring[] = [];
  private readonly vines: Vine[] = [];
  private readonly locks: Lock[] = [];
  private readonly lockByLadder = new Map<number, Lock>();
  private readonly ownedMaterials: THREE.Material[] = [];
  private clock = 0;

  constructor(level: Level) {
    this.level = level;
    const def = level.def;
    this.pits = def.pits.map((p) => level.span(p));
    def.crumbles.forEach((c) => this.addCrumble(level.span(c)));
    def.platforms.forEach((p) => this.addPlatform(p));
    def.conveyors.forEach((c) => this.addConveyor(level.span(c), c.dir));
    this.ice = (def.ice ?? []).map((s) => level.span(s));
    this.ice.forEach((s) => this.addIce(s));
    (def.springs ?? []).forEach((s) => this.addSpring(s));
    (def.vines ?? []).forEach((v) => this.addVine(v));
    def.locks.forEach((l) => this.addLock(l));
    this.reset(true);
  }

  /** `relock` also closes gates and doors (new round); after a death only crumbles/platforms reset. */
  reset(relock: boolean): void {
    this.clock = 0;
    for (const c of this.crumbles) {
      c.state = 'intact';
      c.t = 0;
      c.group.visible = true;
      c.group.position.set(0, 0, 0);
      for (const cell of c.cells) cell.position.copy(cell.userData.base as THREE.Vector3);
    }
    for (const p of this.platforms) this.placePlatform(p, 0);
    for (const v of this.vines) this.swingVine(v, 0);
    if (!relock) return;
    for (const lock of this.locks) {
      lock.open = false;
      lock.t = 0;
      lock.group.visible = true;
      lock.group.position.y = 0;
      lock.group.scale.setScalar(1);
      if (lock.switchCap && lock.switchFlag) {
        lock.switchCap.position.y = 0.23;
        lock.switchCap.material = material(COLORS.red);
        lock.switchFlag.material = material(COLORS.red);
      }
    }
  }

  update(dt: number, player: { ring: number; s: number; grounded: boolean }): ObstacleEvents {
    this.clock += dt;
    const events: ObstacleEvents = { crumbled: false, switched: null };
    const L = this.level;

    for (const c of this.crumbles) {
      if (c.state === 'intact' && player.grounded && L.inSpan(c.span, player.ring, player.s)) {
        c.state = 'shaking';
        c.t = 0;
        events.crumbled = true;
      }
      c.t += dt;
      if (c.state === 'shaking') {
        for (const cell of c.cells) {
          const base = cell.userData.base as THREE.Vector3;
          cell.position.set(base.x + (Math.random() - 0.5) * 0.08, base.y, base.z + (Math.random() - 0.5) * 0.08);
        }
        if (c.t >= OBSTACLES.crumbleDelay) {
          c.state = 'falling';
          c.t = 0;
        }
      } else if (c.state === 'falling') {
        c.group.position.y = -6 * c.t * c.t;
        if (c.t >= OBSTACLES.crumbleFall) {
          c.state = 'gone';
          c.group.visible = false;
        }
      }
    }

    for (const p of this.platforms) this.placePlatform(p, this.clock);
    for (const v of this.vines) this.swingVine(v, this.clock);
    for (const c of this.conveyors) c.texture.offset.x -= (OBSTACLES.conveyorSpeed * dt) / 1;
    for (const sp of this.springs) {
      sp.t += dt;
      const k = Math.max(0, 1 - sp.t / 0.45);
      sp.coil.scale.y = 1 - 0.45 * k * Math.cos(sp.t * 28);
    }

    for (const lock of this.locks) {
      if (lock.def.kind === 'switch' && !lock.open && player.grounded && player.ring === lock.def.switchAt.ring) {
        if (L.ringDistance(player.ring, player.s, lock.switchS) < OBSTACLES.switchReach) {
          this.openLock(lock);
          events.switched = lock.def.switchAt;
        }
      }
      if (lock.open && lock.group.visible) {
        lock.t += dt;
        const k = Math.min(1, lock.t / 0.6);
        if (lock.def.kind === 'switch') lock.group.position.y = -2.2 * k;
        else {
          lock.group.position.y = 2.5 * k;
          lock.group.scale.setScalar(1 - 0.9 * k);
        }
        if (k >= 1) lock.group.visible = false;
      }
    }
    return events;
  }

  carry(ring: number, s: number): Carry {
    const L = this.level;
    const margin = OBSTACLES.pitMargin;
    for (const pit of this.pits) if (L.inSpan(pit, ring, s, margin)) return null;
    for (const c of this.crumbles) {
      if ((c.state === 'falling' || c.state === 'gone') && L.inSpan(c.span, ring, s, margin)) return null;
    }
    for (const p of this.platforms) {
      if (!L.inSpan(p.span, ring, s, margin)) continue;
      return Math.abs(L.ringDelta(ring, s, p.s)) < p.def.platformWidth / 2 + 0.1 ? p.vel : null;
    }
    for (const c of this.conveyors) {
      if (L.inSpan(c.span, ring, s)) return c.dir * OBSTACLES.conveyorSpeed;
    }
    return 0;
  }

  grip(ring: number, s: number): number {
    for (const span of this.ice) if (this.level.inSpan(span, ring, s)) return OBSTACLES.iceGrip;
    return Infinity;
  }

  spring(ring: number, s: number): boolean {
    return this.springs.some((sp) => sp.ring === ring && this.level.ringDistance(ring, s, sp.s) < OBSTACLES.springReach);
  }

  /** Plays the squash animation on the pad under this spot. */
  boing(ring: number, s: number): void {
    for (const sp of this.springs) {
      if (sp.ring === ring && this.level.ringDistance(ring, s, sp.s) < OBSTACLES.springReach) sp.t = 0;
    }
  }

  grabVine(ring: number, s: number, handY: number): number {
    return this.vines.findIndex(
      (v) => v.ring === ring && Math.hypot(this.level.ringDelta(ring, s, v.tip.s), handY - v.tip.y) < VINE.grabReach,
    );
  }

  vineTip(index: number): Readonly<VineTip> {
    return this.vines[index].tip;
  }

  isLadderOpen(index: number): boolean {
    const lock = this.lockByLadder.get(index);
    return !lock || lock.open;
  }

  lockKind(index: number): LockDef['kind'] | null {
    const lock = this.lockByLadder.get(index);
    return lock && !lock.open ? lock.def.kind : null;
  }

  /** Opens every key door; returns true if any was closed. */
  unlockKeyDoors(): boolean {
    return this.unlock('key');
  }

  /** Opens the relic seals once the last relic has been collected. */
  unlockRelicDoors(): boolean {
    return this.unlock('relics');
  }

  private unlock(kind: LockDef['kind']): boolean {
    let any = false;
    for (const lock of this.locks) {
      if (lock.def.kind === kind && !lock.open) {
        this.openLock(lock);
        any = true;
      }
    }
    return any;
  }

  dispose(): void {
    for (const c of this.conveyors) c.texture.dispose();
    for (const m of this.ownedMaterials) m.dispose();
  }

  private openLock(lock: Lock): void {
    lock.open = true;
    lock.t = 0;
    if (lock.switchCap && lock.switchFlag) {
      lock.switchCap.position.y = 0.14;
      lock.switchCap.material = material(COLORS.grass);
      lock.switchFlag.material = material(COLORS.grass);
    }
  }

  /** A group sitting on the walkway at a ring spot, local +x along increasing s and +z outward. */
  private anchor(ring: number, side: number, offset: number, radius = this.level.ringRadius(ring)): THREE.Group {
    const g = new THREE.Group();
    const p = squarePoint(radius, side, offset);
    g.position.set(p.x, this.level.tierTop(ring), p.z);
    g.rotation.y = sideYaw(side);
    return g;
  }

  private addCrumble(span: RingSpan): void {
    const L = this.level;
    const { ring, side, offset, width } = span.def;
    const top = L.tierTop(ring);
    const inner = L.tierHalf(ring + 1);
    const outer = L.tierHalf(ring);
    const group = new THREE.Group();
    const cells: THREE.Mesh[] = [];
    let i = 0;
    for (let u = offset - width / 2 + 0.5; u < offset + width / 2; u += 1) {
      for (let r = inner + 0.5; r < outer; r += 1, i++) {
        const p = squarePoint(r, side, u);
        const cell = box(0.94, 0.9, 0.94, i % 2 ? COLORS.tan : 0xc98f4e, p.x, top - 0.45, p.z);
        cell.userData.base = cell.position.clone();
        cells.push(cell);
        group.add(cell);
      }
    }
    this.group.add(group);
    this.crumbles.push({ span, group, cells, state: 'intact', t: 0 });
  }

  private addPlatform(def: PlatformDef): void {
    const span = this.level.span(def);
    const depth = this.level.def.terraceDepth - 0.3;
    const group = new THREE.Group();
    group.add(
      box(def.platformWidth, 0.3, depth, COLORS.yellow, 0, -0.15, 0),
      box(def.platformWidth + 0.04, 0.12, 0.2, COLORS.pink, 0, -0.26, depth / 2 - 0.1),
      box(def.platformWidth + 0.04, 0.12, 0.2, COLORS.pink, 0, -0.26, -depth / 2 + 0.1),
      box(0.2, 0.5, 0.2, COLORS.black, 0, -0.55, 0),
    );
    this.group.add(group);
    const amp = Math.max(0, span.half - def.platformWidth / 2 - 0.05);
    const platform: Platform = { span, def, group, amp, s: span.center, vel: 0 };
    this.platforms.push(platform);
    this.placePlatform(platform, 0);
  }

  private placePlatform(p: Platform, t: number): void {
    const w = (Math.PI * 2) / p.def.period;
    const L = this.level;
    p.s = L.sOf(p.span.ring, p.def.side, p.def.offset + p.amp * Math.sin(w * t));
    p.vel = p.amp * w * Math.cos(w * t);
    const pt = L.ringPoint(p.span.ring, p.s);
    p.group.position.set(pt.x, L.tierTop(p.span.ring), pt.z);
    p.group.rotation.y = sideYaw(pt.side);
  }

  private addConveyor(span: RingSpan, dir: 1 | -1): void {
    const { ring, side, offset, width } = span.def;
    const depth = this.level.def.terraceDepth - 0.5;
    const texture = makeConveyorTexture();
    texture.repeat.set(width, 1);
    const mat = new THREE.MeshLambertMaterial({ map: texture });
    this.ownedMaterials.push(mat);
    const belt = new THREE.Mesh(unitBox, mat);
    belt.scale.set(width, 0.06, depth);
    belt.position.y = 0.03;
    belt.receiveShadow = true;
    const g = this.anchor(ring, side, offset);
    g.add(
      belt,
      box(width + 0.1, 0.14, 0.12, COLORS.grey, 0, 0.05, depth / 2 + 0.06),
      box(width + 0.1, 0.14, 0.12, COLORS.grey, 0, 0.05, -depth / 2 - 0.06),
    );
    if (dir < 0) g.rotateY(Math.PI);
    this.group.add(g);
    this.conveyors.push({ span, dir, texture });
  }

  private addIce(span: RingSpan): void {
    const { ring, side, offset, width } = span.def;
    const depth = this.level.def.terraceDepth - 0.3;
    const g = this.anchor(ring, side, offset);
    const sheet = box(width, 0.05, depth, COLORS.ice, 0, 0.025, 0, { opacity: 0.85 });
    sheet.renderOrder = 1;
    g.add(sheet);
    for (let u = -width / 2 + 0.6; u < width / 2 - 0.3; u += 1.3) {
      g.add(box(0.5, 0.02, 0.06, COLORS.snow, u, 0.06, depth * 0.2), box(0.3, 0.02, 0.06, COLORS.snow, u + 0.4, 0.06, -depth * 0.25));
    }
    this.group.add(g);
  }

  private addSpring(spot: Spot): void {
    const g = this.anchor(spot.ring, spot.side, spot.offset);
    const { base, coil } = springParts();
    g.add(base, coil);
    this.group.add(g);
    this.springs.push({ ring: spot.ring, s: this.level.spotS(spot), coil, t: 1 });
  }

  /**
   * A beam reaching out from the tier above, with a leafy rope hanging from its end over the pit.
   * The rope swings in the plane of the walkway (local x, along s).
   */
  private addVine(def: VineDef): void {
    const L = this.level;
    const g = this.anchor(def.ring, def.side, def.offset);
    const upper = L.def.tierHeight;
    const postZ = L.tierHalf(def.ring + 1) - L.ringRadius(def.ring) - 0.4;
    const postH = VINE.pivot + 0.3 - upper;
    const beam = 0.3 - postZ;
    g.add(
      box(0.3, postH, 0.3, COLORS.brown, 0, upper + postH / 2, postZ),
      box(0.26, 0.26, beam, COLORS.brown, 0, VINE.pivot + 0.15, postZ + beam / 2 - 0.15),
    );
    const rope = new THREE.Group();
    rope.position.y = VINE.pivot;
    const segments = Math.ceil(VINE.length / 0.5);
    const seg = VINE.length / segments;
    for (let i = 0; i < segments; i++) {
      const y = -(i + 0.5) * seg;
      rope.add(box(0.12, seg + 0.02, 0.12, i % 2 ? COLORS.leaf : COLORS.leafDark, 0, y, 0));
      if (i % 2 === 0) rope.add(box(0.2, 0.1, 0.06, COLORS.grass, i % 4 ? -0.12 : 0.12, y, 0));
    }
    rope.add(box(0.22, 0.3, 0.22, COLORS.leafDark, 0, -VINE.length, 0));
    g.add(rope);
    this.group.add(g);
    const vine: Vine = {
      ring: def.ring,
      s: L.spotS(def),
      pivotY: L.tierTop(def.ring) + VINE.pivot,
      period: def.period ?? VINE.period,
      phase: def.phase ?? 0,
      rope,
      tip: { s: 0, y: 0, vs: 0, vy: 0 },
    };
    this.vines.push(vine);
    this.swingVine(vine, 0);
  }

  private swingVine(v: Vine, t: number): void {
    const w = (Math.PI * 2) / v.period;
    const phase = w * t + Math.PI * 2 * v.phase;
    const a = VINE.swing * Math.sin(phase);
    const da = VINE.swing * w * Math.cos(phase);
    const r = VINE.length;
    v.rope.rotation.z = a;
    v.tip.s = mod(v.s + r * Math.sin(a), this.level.ringLength(v.ring));
    v.tip.y = v.pivotY - r * Math.cos(a);
    v.tip.vs = r * Math.cos(a) * da;
    v.tip.vy = r * Math.sin(a) * da;
  }

  private addLock(def: LockDef): void {
    const L = this.level;
    const ladder = L.def.ladders[def.ladder];
    const wall = L.tierHalf(ladder.ring + 1);
    const g = this.anchor(ladder.ring, ladder.side, ladder.offset, wall + 0.8);
    const color = LOCK_COLORS[def.kind];
    if (def.kind === 'switch') {
      g.add(box(0.14, 2, 0.14, color, -0.65, 1, 0), box(0.14, 2, 0.14, color, 0.65, 1, 0));
      for (let y = 0.35; y < 2; y += 0.4) g.add(box(1.3, 0.08, 0.08, COLORS.yellow, 0, y, 0));
      for (let x = -0.33; x <= 0.34; x += 0.33) g.add(box(0.07, 1.9, 0.07, COLORS.yellow, x, 0.95, 0));
    } else if (def.kind === 'key') {
      g.add(
        box(1.4, 2.2, 0.26, color, 0, 1.1, 0),
        box(1.56, 0.16, 0.34, COLORS.cream, 0, 2.2, 0),
        box(0.3, 0.3, 0.1, COLORS.yellow, 0, 1.2, 0.16),
        box(0.12, 0.3, 0.1, COLORS.yellow, 0, 0.95, 0.16),
      );
    } else {
      const relics = L.def.items.filter((it) => it.type === 'relic').length;
      g.add(
        box(1.5, 2.3, 0.3, color, 0, 1.15, 0),
        box(1.7, 0.2, 0.4, COLORS.gold, 0, 2.35, 0),
        box(0.2, 2.3, 0.36, COLORS.gold, -0.75, 1.15, 0),
        box(0.2, 2.3, 0.36, COLORS.gold, 0.75, 1.15, 0),
      );
      for (let i = 0; i < relics; i++) {
        const x = (i - (relics - 1) / 2) * 0.38;
        g.add(box(0.24, 0.24, 0.06, COLORS.black, x, 1.5, 0.17), box(0.12, 0.12, 0.08, COLORS.gold, x, 1.5, 0.18));
      }
    }
    this.group.add(g);

    let switchS = 0;
    let switchCap: THREE.Mesh | null = null;
    let switchFlag: THREE.Mesh | null = null;
    if (def.kind === 'switch') {
      const at = def.switchAt;
      switchS = L.spotS(at);
      const sw = this.anchor(at.ring, at.side, at.offset);
      switchCap = box(0.55, 0.22, 0.55, COLORS.red, 0, 0.23, 0);
      switchFlag = box(0.5, 0.32, 0.04, COLORS.red, 0.27, 1.6, -0.9);
      sw.add(
        box(0.9, 0.12, 0.9, COLORS.charcoal, 0, 0.06, 0),
        switchCap,
        box(0.06, 1.8, 0.06, COLORS.cream, 0, 0.9, -0.9),
        switchFlag,
      );
      this.group.add(sw);
    }
    const lock: Lock = { def, group: g, open: false, t: 0, switchS, switchCap, switchFlag };
    this.locks.push(lock);
    this.lockByLadder.set(def.ladder, lock);
  }
}
