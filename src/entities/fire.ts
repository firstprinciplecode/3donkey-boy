import * as THREE from 'three';
import { COLORS, FIRE } from '../config';
import { mod, type LadderPath, type Level } from '../level';
import type { ObstacleEnv } from '../obstacles';
import { randRange } from '../utils';
import { box } from '../voxel';

/**
 * Living flame born when a barrel hits the drum (like the arcade oil drum). Wanders its ring,
 * turns back at gaps, and sometimes takes an open ladder up or down.
 */
export class Fire {
  readonly group = new THREE.Group();
  /** Centre of the flame in world space. */
  readonly position = new THREE.Vector3();
  private readonly level: Level;
  private readonly flame = new THREE.Group();
  private ring: number;
  private s: number;
  private dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  private path: LadderPath | null = null;
  private d = 0;
  private climbDir = 1;
  private turnClock = randRange(FIRE.minTurn, FIRE.maxTurn);
  private t = Math.random() * 10;
  private spawnT = 0;

  constructor(level: Level) {
    this.level = level;
    const drum = level.def.drum;
    this.ring = drum.ring;
    this.s = level.spotS(drum);
    this.flame.add(
      box(0.6, 0.4, 0.6, COLORS.red, 0, 0.2, 0, { emissive: COLORS.red }),
      box(0.46, 0.36, 0.46, COLORS.orange, 0, 0.55, 0, { emissive: COLORS.orange }),
      box(0.28, 0.3, 0.28, COLORS.yellow, 0, 0.85, 0, { emissive: COLORS.yellow }),
      box(0.1, 0.12, 0.04, COLORS.black, -0.12, 0.45, 0.24),
      box(0.1, 0.12, 0.04, COLORS.black, 0.12, 0.45, 0.24),
    );
    this.group.add(this.flame);
    this.updatePosition();
  }

  update(dt: number, env: ObstacleEnv, speedMul: number): void {
    const L = this.level;
    this.t += dt;
    this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
    const speed = FIRE.speed * speedMul;

    if (this.path) {
      this.d += this.climbDir * speed * 0.6 * dt;
      if (this.d >= this.path.length && this.path.topS !== null) {
        this.ring = this.path.ladder.ring + 1;
        this.s = this.path.topS;
        this.path = null;
      } else if (this.d <= 0) {
        this.ring = this.path.ladder.ring;
        this.s = this.path.bottomS;
        this.path = null;
      } else if (this.d >= this.path.length) {
        this.climbDir = -1;
      }
      this.updatePosition();
      return;
    }

    this.turnClock -= dt;
    if (this.turnClock <= 0) {
      this.turnClock = randRange(FIRE.minTurn, FIRE.maxTurn);
      if (Math.random() < 0.45) this.dir = -this.dir as 1 | -1;
    }

    const delta = speed * dt;
    const next = mod(this.s + this.dir * delta, L.ringLength(this.ring));
    if (env.carry(this.ring, next + this.dir * 0.4) === null) {
      this.dir = -this.dir as 1 | -1;
    } else {
      const prev = this.s;
      this.s = next;
      for (const p of L.ladderPaths) {
        if (!env.isLadderOpen(p.index) || Math.random() >= FIRE.ladderChance) continue;
        if (p.ladder.ring === this.ring && p.topS !== null && L.crossed(this.ring, prev, p.bottomS, delta, this.dir)) {
          this.enterLadder(p, 0.01, 1);
          break;
        }
        if (p.topS !== null && p.ladder.ring + 1 === this.ring && L.crossed(this.ring, prev, p.topS, delta, this.dir)) {
          this.enterLadder(p, p.length - 0.01, -1);
          break;
        }
      }
    }
    this.updatePosition();
  }

  private enterLadder(path: LadderPath, d: number, dir: number): void {
    this.path = path;
    this.d = d;
    this.climbDir = dir;
  }

  private updatePosition(): void {
    const L = this.level;
    let x: number;
    let y: number;
    let z: number;
    if (this.path) {
      const p = this.path.point(this.d);
      ({ x, y, z } = p);
    } else {
      const p = L.ringPoint(this.ring, this.s);
      x = p.x;
      z = p.z;
      y = L.tierTop(this.ring);
    }
    this.position.set(x, y + 0.45, z);
    this.group.position.set(x, y, z);
    const flicker = 1 + Math.sin(this.t * 22) * 0.08;
    this.flame.scale.set(this.spawnT / flicker, this.spawnT * flicker, this.spawnT / flicker);
    this.flame.rotation.y = this.t * 2;
  }
}
