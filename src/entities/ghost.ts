import * as THREE from 'three';
import { COLORS } from '../config';
import { mod, sideYaw, type Level } from '../level';
import type { PatrolDef } from '../levels/types';
import { box } from '../voxel';

/** Glass-headed flying critter from the poster; patrols a stretch of one ring (flying over pits). */
export class Ghost {
  readonly group = new THREE.Group();
  /** Centre of the body in world space. */
  readonly position = new THREE.Vector3();
  private progress: number;
  private dir = 1;
  private t = Math.random() * 10;
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly level: Level;
  private readonly ring: number;
  private readonly s0: number;
  private readonly length: number;
  private readonly speed: number;

  constructor(level: Level, patrol: PatrolDef, speed: number) {
    this.level = level;
    this.ring = patrol.ring;
    this.s0 = level.sOf(patrol.ring, patrol.from[0], patrol.from[1]);
    const s1 = level.sOf(patrol.ring, patrol.to[0], patrol.to[1]);
    this.length = mod(s1 - this.s0, level.ringLength(patrol.ring));
    this.speed = speed;
    this.progress = this.length / 2;
    const B = COLORS.black;

    this.group.add(
      box(0.8, 0.6, 0.6, B, 0, 0, 0),
      box(0.36, 0.22, 0.3, COLORS.charcoal, 0, 0.46, 0),
      box(0.72, 0.46, 0.58, COLORS.cyan, 0, 0.5, 0, { opacity: 0.55 }),
      box(0.14, 0.14, 0.04, COLORS.pink, -0.18, 0.08, 0.31),
      box(0.14, 0.14, 0.04, COLORS.pink, 0.18, 0.08, 0.31),
    );
    for (let i = 0; i < 4; i++) {
      this.group.add(box(0.07, 0.12, 0.04, COLORS.cream, -0.21 + i * 0.14, -0.16, 0.31));
    }
    for (const sx of [-0.28, 0, 0.28]) this.group.add(box(0.1, 0.2, 0.1, B, sx, -0.38, 0));

    this.wingL.position.set(-0.4, 0.05, 0);
    this.wingR.position.set(0.4, 0.05, 0);
    this.wingL.add(box(0.5, 0.1, 0.4, B, -0.25, 0, 0), box(0.25, 0.1, 0.3, B, -0.55, -0.1, 0));
    this.wingR.add(box(0.5, 0.1, 0.4, B, 0.25, 0, 0), box(0.25, 0.1, 0.3, B, 0.55, -0.1, 0));
    this.group.add(this.wingL, this.wingR);
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt;
    this.progress += this.dir * this.speed * dt;
    if (this.progress > this.length) {
      this.progress = this.length;
      this.dir = -1;
    } else if (this.progress < 0) {
      this.progress = 0;
      this.dir = 1;
    }
    const L = this.level;
    const p = L.ringPoint(this.ring, mod(this.s0 + this.progress, L.ringLength(this.ring)));
    const y = L.tierTop(this.ring) + 0.75 + Math.sin(this.t * 3) * 0.2;
    this.position.set(p.x, y, p.z);

    const flap = Math.sin(this.t * 18) * 0.6;
    this.wingL.rotation.z = flap;
    this.wingR.rotation.z = -flap;
    this.group.position.copy(this.position);
    this.group.rotation.y = sideYaw(p.side) + (this.dir > 0 ? 0.5 : -0.5);
  }
}
