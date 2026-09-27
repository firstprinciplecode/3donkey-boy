import * as THREE from 'three';
import { COLORS, OBSTACLES } from './config';
import { sideYaw, squarePoint, type Level, type RingSpan, type Spot } from './level';
import type { LockDef, PlatformDef } from './levels/types';
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

const LOCK_COLORS = { switch: COLORS.red, key: COLORS.pink } as const;

/** Dynamic level pieces: crumbling tiles, moving platforms, conveyors and locked ladders. */
export class Obstacles implements ObstacleEnv {
  readonly group = new THREE.Group();
  private readonly level: Level;
  private readonly pits: RingSpan[];
  private readonly crumbles: Crumble[] = [];
  private readonly platforms: Platform[] = [];
  private readonly conveyors: Conveyor[] = [];
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
    for (const c of this.conveyors) c.texture.offset.x -= (OBSTACLES.conveyorSpeed * dt) / 1;

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
    let any = false;
    for (const lock of this.locks) {
      if (lock.def.kind === 'key' && !lock.open) {
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
    } else {
      g.add(
        box(1.4, 2.2, 0.26, color, 0, 1.1, 0),
        box(1.56, 0.16, 0.34, COLORS.cream, 0, 2.2, 0),
        box(0.3, 0.3, 0.1, COLORS.yellow, 0, 1.2, 0.16),
        box(0.12, 0.3, 0.1, COLORS.yellow, 0, 0.95, 0.16),
      );
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
