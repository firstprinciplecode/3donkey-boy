import * as THREE from 'three';
import { BARREL, COLORS, SNOWBALL } from '../config';
import { PIT_DEPTH, mod, sideYaw, type LadderPath, type Level } from '../level';
import type { ProjectileLook } from '../levels/skins';
import type { ObstacleEnv } from '../obstacles';
import { makeBarrelCapTexture, makeBarrelSideTexture } from '../textures';
import { dampAngle } from '../utils';

const R = BARREL.radius;
const LENGTH = 0.8;
const MAX_LIFETIME = 120;
const SINK_TIME = 0.3;
const MAX_SNOW_R = R * SNOWBALL.maxScale;
const SNOW_GROWTH = (MAX_SNOW_R - R) / SNOWBALL.growDistance;

export type BarrelState = 'roll' | 'transfer' | 'ladder' | 'sink';

export interface Barrel {
  root: THREE.Group;
  mesh: THREE.Mesh;
  look: ProjectileLook;
  /** Rolling radius; snowballs grow from BARREL.radius as they roll. */
  radius: number;
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

function randomDir(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

let assets: { geometry: THREE.CylinderGeometry; materials: THREE.Material[] } | null = null;

function barrelAssets() {
  if (!assets) {
    const geometry = new THREE.CylinderGeometry(R, R, LENGTH, 16);
    geometry.rotateX(Math.PI / 2);
    const side = new THREE.MeshLambertMaterial({ map: makeBarrelSideTexture() });
    const cap = new THREE.MeshLambertMaterial({ map: makeBarrelCapTexture() });
    assets = { geometry, materials: [side, cap, cap] };
  }
  return assets;
}

export function createBarrelMesh(): THREE.Mesh {
  const { geometry, materials } = barrelAssets();
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.receiveShadow = true;
  return mesh;
}

let snowAssets: { geometry: THREE.BufferGeometry; material: THREE.Material } | null = null;

/** Faceted ball with a scatter of shaded faces, so the tumble reads even when it's small on screen. */
function snowballAssets() {
  if (!snowAssets) {
    const geometry = new THREE.IcosahedronGeometry(R, 1).toNonIndexed();
    const shades = [COLORS.snow, COLORS.snow, COLORS.ice, COLORS.iceDark];
    const colors: number[] = [];
    const c = new THREE.Color();
    const faces = geometry.attributes.position.count / 3;
    for (let f = 0; f < faces; f++) {
      c.setHex(shades[(f * 7 + (f >> 2)) % shades.length]);
      for (let v = 0; v < 3; v++) colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    snowAssets = { geometry, material };
  }
  return snowAssets;
}

export function createSnowballMesh(): THREE.Mesh {
  const { geometry, material } = snowballAssets();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createProjectileMesh(look: ProjectileLook): THREE.Mesh {
  return look === 'snowball' ? createSnowballMesh() : createBarrelMesh();
}

/** Ammo stacked beside the boss: upright barrels, or a pyramid of snowballs. */
export function createBarrelPile(x: number, y: number, z: number, look: ProjectileLook = 'barrel'): THREE.Group {
  const pile = new THREE.Group();
  const snow = look === 'snowball';
  const spots: [number, number][] = snow
    ? [
        [-0.45, R],
        [0.45, R],
        [0, R * 2.5],
      ]
    : [
        [-0.45, LENGTH / 2],
        [0.45, LENGTH / 2],
        [0, LENGTH * 1.5],
      ];
  for (const [dx, dy] of spots) {
    const m = createProjectileMesh(look);
    if (!snow) m.rotation.x = Math.PI / 2;
    m.position.set(x + dx, y + dy, z);
    pile.add(m);
  }
  return pile;
}

/**
 * Barrels roll either way around a ring (re-rolling their direction on each landing), dropping
 * off each ring's chute onto the ring below until the drum on the ground ring. Rings are loops,
 * so every barrel reaches a chute whichever way it goes, unless it rolls into a pit first.
 */
export class BarrelManager {
  readonly group = new THREE.Group();
  readonly barrels: Barrel[] = [];
  private readonly pool: Record<ProjectileLook, { root: THREE.Group; mesh: THREE.Mesh }[]> = { barrel: [], snowball: [] };
  level: Level;
  look: ProjectileLook = 'barrel';
  env: ObstacleEnv | null = null;
  speedMul = 1;
  ladderChance: number = BARREL.ladderChance;
  onDrum: ((b: Barrel) => void) | null = null;
  onPit: ((b: Barrel) => void) | null = null;

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
    const look = this.look;
    const parts = this.pool[look].pop() ?? this.createParts(look);
    parts.root.rotation.set(0, sideYaw(spawn.side), 0);
    this.group.add(parts.root);
    const barrel: Barrel = {
      ...parts,
      look,
      radius: R,
      pos: from.clone(),
      state: 'roll',
      ring: spawn.ring,
      s: L.spotS(spawn),
      dir: randomDir(),
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
    this.startTransfer(barrel, from, spawn.ring, L.spotS(spawn), 0.8, 1.8);
    this.barrels.push(barrel);
    this.sync(barrel, 0);
  }

  /** Remove a barrel immediately (e.g. smashed by the hammer). */
  smash(b: Barrel): void {
    b.done = true;
  }

  clear(): void {
    for (const b of this.barrels) this.release(b);
    this.barrels.length = 0;
  }

  update(dt: number): void {
    const speed = BARREL.baseSpeed * this.speedMul;
    for (const b of this.barrels) {
      if (b.done) continue;
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
  }

  private stepRoll(b: Barrel, dt: number, speed: number): void {
    const L = this.level;
    const delta = speed * dt;
    const prev = b.s;
    b.s = mod(b.s + b.dir * delta, L.ringLength(b.ring));
    if (b.look === 'snowball') b.radius = Math.min(MAX_SNOW_R, b.radius + delta * SNOW_GROWTH);
    b.mesh.rotation.z -= (b.dir * delta) / b.radius;

    for (const path of L.ladderPaths) {
      if (path.topS === null || path.ladder.ring + 1 !== b.ring) continue;
      if (this.env && !this.env.isLadderOpen(path.index)) continue;
      if (L.crossed(b.ring, prev, path.topS, delta, b.dir) && Math.random() < this.ladderChance) {
        b.state = 'ladder';
        b.path = path;
        b.d = path.length;
        return;
      }
    }

    const chute = L.chuteByRing[b.ring];
    if (chute && L.crossed(b.ring, prev, L.spotS(chute), delta, b.dir)) {
      const below = b.ring - 1;
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
    b.root.position.set(b.pos.x, b.pos.y + b.radius, b.pos.z);
    b.mesh.scale.setScalar(b.radius / R);
    const side =
      b.state === 'ladder' && b.path
        ? b.path.ladder.side
        : L.ringPoint(b.state === 'transfer' ? b.toRing : b.ring, b.state === 'transfer' ? b.toS : b.s).side;
    // Axis along the outward normal so it rolls along the ring; along the wall when on a ladder.
    const yaw = sideYaw(side) + (b.state === 'ladder' ? Math.PI / 2 : 0);
    b.root.rotation.y = dt > 0 ? dampAngle(b.root.rotation.y, yaw, 20, dt) : yaw;
  }

  private createParts(look: ProjectileLook): { root: THREE.Group; mesh: THREE.Mesh } {
    const root = new THREE.Group();
    const mesh = createProjectileMesh(look);
    root.add(mesh);
    return { root, mesh };
  }

  private release(b: Barrel): void {
    this.group.remove(b.root);
    b.mesh.rotation.set(0, 0, 0);
    b.mesh.scale.setScalar(1);
    this.pool[b.look].push({ root: b.root, mesh: b.mesh });
  }
}
