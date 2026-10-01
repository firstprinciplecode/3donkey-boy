import * as THREE from 'three';
import { TOTEM } from '../config';
import { mod, sideYaw, type Level } from '../level';
import type { TotemLook } from '../levels/skins';
import type { PatrolDef } from '../levels/types';
import type { ObstacleEnv } from '../obstacles';
import { box, cone } from '../voxel';
import { TOTEM_LOOKS, type TotemPart } from './totemLooks';

type Phase = 'walk' | 'crouch' | 'hop';

const LEG_X = 0.22;
const HIP_Y = 0.28;

function mesh(p: TotemPart): THREE.Mesh {
  const [x, y, z] = p.at;
  return p.shape === 'box' ? box(p.size[0], p.size[1], p.size[2], p.color, x, y, z) : cone(p.size[0], p.size[1], p.color, x, y, z);
}

/** Two legs and a body for the given theme's look, face on the outward (+z) side. */
export function buildTotemRig(look: TotemLook = 'spike'): {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
  pupils: { mesh: THREE.Mesh; x: number }[];
} {
  const parts = TOTEM_LOOKS[look];
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-LEG_X, LEG_X].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, HIP_Y, 0);
    leg.add(...parts.filter((p) => p.group === 'leg').map(mesh));
    return leg;
  });
  body.add(...parts.filter((p) => p.group === 'body').map(mesh));
  const pupils = parts.filter((p) => p.group === 'pupil').map((p) => ({ mesh: mesh(p), x: p.at[0] }));
  body.add(...pupils.map((p) => p.mesh));
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
  private readonly rig: ReturnType<typeof buildTotemRig>;
  private progress: number;
  private dir: 1 | -1 = 1;
  private phase: Phase = 'walk';
  private phaseT = 0;
  private clock = TOTEM.hopEvery * (0.4 + Math.random() * 0.6);
  private t = Math.random() * 10;
  private hop = 0;

  constructor(level: Level, patrol: PatrolDef, speed: number, look: TotemLook = 'spike') {
    this.level = level;
    this.rig = buildTotemRig(look);
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
    legs[0].position.y = HIP_Y + Math.max(0, stride) * 0.12;
    legs[1].position.y = HIP_Y + Math.max(0, -stride) * 0.12;
    const tuck = this.phase === 'hop' ? 0.55 : 1;
    for (const leg of legs) leg.scale.y = tuck;
    body.scale.set(1 + squash * 0.12, 1 - squash * 0.18, 1 + squash * 0.12);
    body.rotation.z = this.phase === 'walk' ? Math.sin(this.t * 9) * 0.04 : 0;
    for (const p of pupils) p.mesh.position.x = p.x + this.dir * 0.06;
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
