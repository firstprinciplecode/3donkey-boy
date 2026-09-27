import * as THREE from 'three';
import { COLORS, TOTEM } from '../config';
import { mod, sideYaw, type Level } from '../level';
import type { PatrolDef } from '../levels/types';
import type { ObstacleEnv } from '../obstacles';
import { box, cone } from '../voxel';

type Phase = 'walk' | 'crouch' | 'hop';

/** Legs, black body, cream horns and a toothy face on the outward (+z) side. */
export function buildTotemRig(): { root: THREE.Group; body: THREE.Group; legs: THREE.Mesh[]; pupils: THREE.Mesh[] } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-0.22, 0.22].map((x) => box(0.2, 0.55, 0.22, COLORS.black, x, 0.28, 0));
  const feet = [-0.22, 0.22].map((x) => box(0.28, 0.1, 0.34, COLORS.cream, x, 0.05, 0.04));
  legs.forEach((leg, i) => leg.add(feet[i]));
  feet.forEach((f) => f.position.set(0, -0.23, 0.04));
  body.add(
    box(0.96, 1.1, 0.8, COLORS.black, 0, 1.1, 0),
    box(0.76, 0.3, 0.66, COLORS.charcoal, 0, 1.78, 0),
    cone(0.2, 0.62, COLORS.cream, -0.26, 1.93, 0),
    cone(0.2, 0.62, COLORS.cream, 0.26, 1.93, 0),
    cone(0.1, 0.3, COLORS.pink, 0, 1.93, 0),
    box(0.26, 0.26, 0.04, COLORS.pink, -0.22, 1.32, 0.41),
    box(0.26, 0.26, 0.04, COLORS.pink, 0.22, 1.32, 0.41),
    box(0.58, 0.2, 0.04, COLORS.red, 0, 0.88, 0.41),
  );
  for (let i = 0; i < 4; i++) body.add(cone(0.06, 0.12, COLORS.cream, -0.21 + i * 0.14, 0.9, 0.43));
  const pupils = [-0.22, 0.22].map((x) => box(0.1, 0.12, 0.05, COLORS.black, x, 1.3, 0.43));
  body.add(...pupils);
  root.add(...legs, body);
  return { root, body, legs, pupils };
}

/**
 * Spike totem from the poster: plods along a stretch of ring, and every couple of seconds crouches
 * and hops straight up. It's too tall to jump over — the way past is to run underneath mid-hop
 * (or smash it with the hammer).
 */
export class Totem {
  readonly group = new THREE.Group();
  /** Centre of the hitbox in world space. */
  readonly position = new THREE.Vector3();
  /** Second hitbox sphere stacked on the first, so it can't be cleared with a jump. */
  readonly head = new THREE.Vector3();
  readonly radius: number = TOTEM.radius;
  readonly ring: number;
  /** Height of the hitbox bottom above the floor; the player fits underneath once this clears 1.5. */
  clearance = 0;
  scored = false;
  /** True for the one update in which it lands, so the game can shake dust and play a thud. */
  landed = false;
  private readonly level: Level;
  private readonly s0: number;
  private readonly length: number;
  private readonly speed: number;
  private readonly rig = buildTotemRig();
  private progress: number;
  private dir: 1 | -1 = 1;
  private phase: Phase = 'walk';
  private phaseT = 0;
  private clock = TOTEM.hopEvery * (0.4 + Math.random() * 0.6);
  private t = Math.random() * 10;
  private hop = 0;

  constructor(level: Level, patrol: PatrolDef, speed: number) {
    this.level = level;
    this.ring = patrol.ring;
    this.s0 = level.sOf(patrol.ring, patrol.from[0], patrol.from[1]);
    const s1 = level.sOf(patrol.ring, patrol.to[0], patrol.to[1]);
    this.length = mod(s1 - this.s0, level.ringLength(patrol.ring));
    this.speed = speed;
    this.progress = this.length / 2;
    this.group.add(this.rig.root);
    this.place();
  }

  get airborne(): boolean {
    return this.phase === 'hop';
  }

  update(dt: number, env: ObstacleEnv): void {
    this.t += dt;
    this.landed = false;
    this.phaseT += dt;
    let squash = 0;

    if (this.phase === 'walk') {
      const next = this.progress + this.dir * this.speed * dt;
      const ahead = mod(this.s0 + next + this.dir * 0.6, this.level.ringLength(this.ring));
      if (next > this.length || next < 0 || env.carry(this.ring, ahead) === null) this.dir = -this.dir as 1 | -1;
      else this.progress = next;
      this.clock -= dt;
      if (this.clock <= 0) this.enter('crouch');
    } else if (this.phase === 'crouch') {
      squash = Math.min(1, this.phaseT / TOTEM.crouchTime);
      if (this.phaseT >= TOTEM.crouchTime) this.enter('hop');
    } else {
      const u = this.phaseT / TOTEM.hopTime;
      if (u >= 1) {
        this.enter('walk');
        this.clock = TOTEM.hopEvery * (0.8 + Math.random() * 0.4);
        this.landed = true;
        this.scored = false;
      }
      this.hop = u >= 1 ? 0 : Math.sin(u * Math.PI) * TOTEM.hopHeight;
    }
    if (this.phase !== 'hop') this.hop = 0;

    const { body, legs, pupils } = this.rig;
    const stride = this.phase === 'walk' ? Math.sin(this.t * 9) : 0;
    legs[0].position.y = 0.28 + Math.max(0, stride) * 0.12;
    legs[1].position.y = 0.28 + Math.max(0, -stride) * 0.12;
    const tuck = this.phase === 'hop' ? 0.55 : 1;
    for (const leg of legs) leg.scale.y = tuck;
    body.scale.set(1 + squash * 0.12, 1 - squash * 0.18, 1 + squash * 0.12);
    body.rotation.z = this.phase === 'walk' ? Math.sin(this.t * 9) * 0.04 : 0;
    for (const p of pupils) p.position.x = Math.sign(p.position.x) * 0.22 + this.dir * 0.06;
    this.place();
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseT = 0;
  }

  private place(): void {
    const L = this.level;
    const p = L.ringPoint(this.ring, mod(this.s0 + this.progress, L.ringLength(this.ring)));
    const y = L.tierTop(this.ring);
    this.group.position.set(p.x, y + this.hop, p.z);
    this.group.rotation.y = sideYaw(p.side);
    this.clearance = this.hop + 0.35;
    this.position.set(p.x, y + this.hop + 0.95, p.z);
    this.head.set(p.x, y + this.hop + 1.75, p.z);
  }
}
