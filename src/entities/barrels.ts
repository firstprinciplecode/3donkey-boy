import * as THREE from 'three';
import { BARREL, COLORS } from '../config';
import type { Danger } from '../hazards';
import { PIT_DEPTH, mod, sideYaw, type LadderPath, type Level } from '../level';
import type { ProjectileLook } from '../levels/skins';
import type { ObstacleEnv } from '../obstacles';
import { dampAngle } from '../utils';
import { PROJECTILES, createProjectilePile } from './projectiles';

export { createBarrelMesh } from './projectiles';

const R = BARREL.radius;
const MAX_LIFETIME = 120;
const SINK_TIME = 0.3;
const SCORCH_RADIUS = 0.45;

export type BarrelState = 'roll' | 'transfer' | 'ladder' | 'sink';

export interface Barrel {
  root: THREE.Group;
  mesh: THREE.Mesh;
  look: ProjectileLook;
  /** Rolling radius; some projectiles start bigger or grow as they roll. */
  radius: number;
  /** Height of the current bounce above the floor (tumbleweeds); 0 for everything else. */
  lift: number;
  /** Bounce progress, in bounces. */
  hop: number;
  /** Halves from a split pumpkin don't split again. */
  split: boolean;
  /** Bottom-centre of the barrel in world space. */
  pos: THREE.Vector3;
  state: BarrelState;
  ring: number;
  s: number;
  /** Rolling direction around the ring: +1 = increasing s (clockwise from outside). */
  dir: 1 | -1;
  path: LadderPath | null;
  d: number;
  from: THREE.Vector3;
  toRing: number;
  toS: number;
  t: number;
  duration: number;
  arc: number;
  age: number;
  scored: boolean;
  done: boolean;
}

/** Centre height of a barrel's hit sphere. */
export function barrelCentreY(b: Barrel): number {
  return b.pos.y + b.lift + b.radius;
}

function randomDir(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** Ammo stacked beside the boss, matching what it throws. */
export function createBarrelPile(x: number, y: number, z: number, look: ProjectileLook = 'barrel'): THREE.Group {
  return createProjectilePile(x, y, z, look);
}

interface Scorch {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  life: number;
  total: number;
}

const scorchMaterials = {
  base: new THREE.MeshBasicMaterial({ color: COLORS.lava, transparent: true }),
  core: new THREE.MeshBasicMaterial({ color: COLORS.yellow, transparent: true }),
};
const scorchBase = new THREE.BoxGeometry(0.9, 0.08, 0.9);
const scorchCore = new THREE.BoxGeometry(0.45, 0.14, 0.45);

type Parts = { root: THREE.Group; mesh: THREE.Mesh };

/**
 * Barrels roll either way around a ring (re-rolling their direction on each landing), dropping
 * off each ring's chute onto the ring below until the drum on the ground ring. Rings are loops,
 * so every barrel reaches a chute whichever way it goes, unless it rolls into a pit first.
 * The skin's projectile spec layers on size, speed, bouncing, splitting or scorching.
 */
export class BarrelManager {
  readonly group = new THREE.Group();
  readonly barrels: Barrel[] = [];
  /** Burning patches left by lava rocks, reported like hazard dangers. */
  readonly dangers: Danger[] = [];
  private readonly scorches: Scorch[] = [];
  private readonly pool = new Map<ProjectileLook, Parts[]>();
  level: Level;
  look: ProjectileLook = 'barrel';
  env: ObstacleEnv | null = null;
  speedMul = 1;
  ladderChance: number = BARREL.ladderChance;
  onDrum: ((b: Barrel) => void) | null = null;
  onPit: ((b: Barrel) => void) | null = null;
  onSplit: ((b: Barrel) => void) | null = null;
  onScorch: ((at: THREE.Vector3) => void) | null = null;

  constructor(level: Level) {
    this.level = level;
  }

  get count(): number {
    return this.barrels.length;
  }

  /** Launch a barrel from `from` (the boss's hand) onto the top ring. */
  spawn(from: THREE.Vector3): void {
    const L = this.level;
    const spawn = L.def.barrelSpawn;
    const barrel = this.create(this.look, from, spawn.ring, L.spotS(spawn), randomDir());
    this.startTransfer(barrel, from, spawn.ring, L.spotS(spawn), 0.8, 1.8);
    this.sync(barrel, 0);
  }

  /** Remove a barrel immediately (e.g. smashed by the hammer). */
  smash(b: Barrel): void {
    b.done = true;
  }

  clear(): void {
    for (const b of this.barrels) this.release(b);
    this.barrels.length = 0;
    for (const s of this.scorches) this.group.remove(s.mesh);
    this.scorches.length = 0;
    this.dangers.length = 0;
  }

  update(dt: number): void {
    const base = BARREL.baseSpeed * this.speedMul;
    // Splits add barrels mid-loop; they start moving next step.
    const live = this.barrels.length;
    for (let i = 0; i < live; i++) {
      const b = this.barrels[i];
      if (b.done) continue;
      const speed = base * PROJECTILES[b.look].speed;
      b.age += dt;
      if (b.state === 'roll') this.stepRoll(b, dt, speed);
      else if (b.state === 'transfer') this.stepTransfer(b, dt);
      else if (b.state === 'ladder') this.stepLadder(b, dt, speed);
      else this.stepSink(b, dt);
      if (b.age > MAX_LIFETIME) b.done = true;
      this.sync(b, dt);
    }
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      if (!this.barrels[i].done) continue;
      this.release(this.barrels[i]);
      this.barrels.splice(i, 1);
    }
    this.updateScorches(dt);
  }

  private create(look: ProjectileLook, at: THREE.Vector3, ring: number, s: number, dir: 1 | -1): Barrel {
    const spec = PROJECTILES[look];
    const parts = this.pool.get(look)?.pop() ?? this.createParts(look);
    spec.respawn?.(parts.mesh);
    parts.root.rotation.set(0, sideYaw(this.level.ringPoint(ring, s).side), 0);
    this.group.add(parts.root);
    const barrel: Barrel = {
      ...parts,
      look,
      radius: R * spec.scale,
      lift: 0,
      hop: 0,
      split: false,
      pos: at.clone(),
      state: 'roll',
      ring,
      s,
      dir,
      path: null,
      d: 0,
      from: new THREE.Vector3(),
      toRing: 0,
      toS: 0,
      t: 0,
      duration: 1,
      arc: 0,
      age: 0,
      scored: false,
      done: false,
    };
    this.barrels.push(barrel);
    return barrel;
  }

  private stepRoll(b: Barrel, dt: number, speed: number): void {
    const L = this.level;
    const spec = PROJECTILES[b.look];
    const delta = speed * dt;
    const prev = b.s;
    b.s = mod(b.s + b.dir * delta, L.ringLength(b.ring));
    if (spec.grow) {
      const max = R * spec.grow.maxScale;
      b.radius = Math.min(max, b.radius + (delta * (max - R * spec.scale)) / spec.grow.distance);
    }
    if (spec.hop) {
      b.hop += delta / spec.hop.every;
      b.lift = spec.hop.height * Math.abs(Math.sin(Math.PI * b.hop));
    }
    b.mesh.rotation.z -= (b.dir * delta) / b.radius;

    for (const path of L.ladderPaths) {
      if (path.topS === null || path.ladder.ring + 1 !== b.ring) continue;
      if (this.env && !this.env.isLadderOpen(path.index)) continue;
      if (L.crossed(b.ring, prev, path.topS, delta, b.dir) && Math.random() < this.ladderChance) {
        b.state = 'ladder';
        b.path = path;
        b.d = path.length;
        b.lift = 0;
        return;
      }
    }

    const chute = L.chuteByRing[b.ring];
    if (chute && L.crossed(b.ring, prev, L.spotS(chute), delta, b.dir)) {
      const below = b.ring - 1;
      b.lift = 0;
      this.startTransfer(b, b.pos, below, L.sOf(below, chute.side, chute.offset), 0.55, 0);
      return;
    }

    const drum = L.def.drum;
    if (b.ring === drum.ring && L.crossed(b.ring, prev, L.spotS(drum), delta, b.dir)) {
      b.done = true;
      this.onDrum?.(b);
      return;
    }

    const p = L.ringPoint(b.ring, b.s);
    b.pos.set(p.x, L.tierTop(b.ring), p.z);

    if (this.env && this.env.carry(b.ring, b.s) === null) {
      b.state = 'sink';
      b.t = 0;
    }
  }

  private stepSink(b: Barrel, dt: number): void {
    b.t += dt;
    b.pos.y -= (PIT_DEPTH / SINK_TIME) * dt;
    if (b.t >= SINK_TIME) {
      b.done = true;
      this.onPit?.(b);
    }
  }

  private startTransfer(b: Barrel, from: THREE.Vector3, ring: number, s: number, duration: number, arc: number): void {
    b.state = 'transfer';
    b.from.copy(from);
    b.toRing = ring;
    b.toS = s;
    b.t = 0;
    b.duration = duration;
    b.arc = arc;
  }

  private stepTransfer(b: Barrel, dt: number): void {
    const L = this.level;
    b.t = Math.min(1, b.t + dt / b.duration);
    const target = L.ringPoint(b.toRing, b.toS);
    const ty = L.tierTop(b.toRing);
    const t = b.t;
    b.pos.x = b.from.x + (target.x - b.from.x) * t;
    b.pos.z = b.from.z + (target.z - b.from.z) * t;
    // Lobbed barrels arc; barrels rolling off an edge accelerate downward.
    b.pos.y = b.arc > 0 ? b.from.y + (ty - b.from.y) * t + Math.sin(Math.PI * t) * b.arc : b.from.y + (ty - b.from.y) * t ** 3;
    b.mesh.rotation.z += dt * 8;
    if (b.t >= 1) {
      b.state = 'roll';
      b.ring = b.toRing;
      b.s = b.toS;
      if (Math.random() < BARREL.flipChance) b.dir = -b.dir as 1 | -1;
      // Only drops off a chute count as landings; the boss's lob onto the top ring doesn't.
      if (b.arc === 0) this.land(b);
    }
  }

  private land(b: Barrel): void {
    const spec = PROJECTILES[b.look];
    if (spec.splits && !b.split) {
      b.split = true;
      b.radius *= spec.splits.scale;
      const twin = this.create(b.look, b.pos, b.ring, b.s, -b.dir as 1 | -1);
      twin.split = true;
      twin.radius = b.radius;
      twin.mesh.rotation.z = b.mesh.rotation.z + Math.PI;
      this.sync(twin, 0);
      this.onSplit?.(b);
    }
    if (spec.scorch) {
      this.addScorch(b.pos, spec.scorch.life);
      this.onScorch?.(b.pos);
    }
  }

  private addScorch(at: THREE.Vector3, life: number): void {
    const mesh = new THREE.Group();
    const base = new THREE.Mesh(scorchBase, scorchMaterials.base);
    base.position.y = 0.04;
    const core = new THREE.Mesh(scorchCore, scorchMaterials.core);
    core.position.y = 0.08;
    mesh.add(base, core);
    mesh.position.copy(at);
    this.group.add(mesh);
    this.scorches.push({ mesh, pos: at.clone(), life, total: life });
  }

  private updateScorches(dt: number): void {
    this.dangers.length = 0;
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.group.remove(s.mesh);
        this.scorches.splice(i, 1);
        continue;
      }
      // Flicker, then shrink away over the last half second so the end is readable.
      const fade = Math.min(1, s.life / 0.5);
      const flicker = 1 + Math.sin(s.life * 23) * 0.08;
      s.mesh.scale.set(fade * flicker, 1, fade * flicker);
      this.dangers.push({ x: s.pos.x, y: s.pos.y + 0.1, z: s.pos.z, r: SCORCH_RADIUS * fade });
    }
  }

  private stepLadder(b: Barrel, dt: number, speed: number): void {
    const path = b.path;
    if (!path) {
      b.state = 'roll';
      return;
    }
    b.d -= speed * 0.7 * dt;
    b.mesh.rotation.z += (speed * dt) / b.radius;
    if (b.d <= 0) {
      b.state = 'roll';
      b.ring = path.ladder.ring;
      b.s = path.bottomS;
      b.path = null;
      if (Math.random() < BARREL.flipChance) b.dir = -b.dir as 1 | -1;
      return;
    }
    const p = path.point(b.d);
    b.pos.set(p.x, p.y, p.z);
  }

  private sync(b: Barrel, dt: number): void {
    const L = this.level;
    b.root.position.set(b.pos.x, barrelCentreY(b), b.pos.z);
    b.mesh.scale.setScalar(b.radius / R);
    const side =
      b.state === 'ladder' && b.path
        ? b.path.ladder.side
        : L.ringPoint(b.state === 'transfer' ? b.toRing : b.ring, b.state === 'transfer' ? b.toS : b.s).side;
    // Axis along the outward normal so it rolls along the ring; along the wall when on a ladder.
    const yaw = sideYaw(side) + (b.state === 'ladder' ? Math.PI / 2 : 0);
    b.root.rotation.y = dt > 0 ? dampAngle(b.root.rotation.y, yaw, 20, dt) : yaw;
  }

  private createParts(look: ProjectileLook): Parts {
    const root = new THREE.Group();
    const mesh = PROJECTILES[look].mesh();
    root.add(mesh);
    return { root, mesh };
  }

  private release(b: Barrel): void {
    this.group.remove(b.root);
    b.mesh.rotation.set(0, 0, 0);
    b.mesh.scale.setScalar(1);
    let pool = this.pool.get(b.look);
    if (!pool) this.pool.set(b.look, (pool = []));
    pool.push({ root: b.root, mesh: b.mesh });
  }
}
