import * as THREE from 'three';
import { COLORS, OBSTACLES, PHYSICS } from '../config';
import { PIT_DEPTH, mod, sideYaw, type LadderPath, type Level, type Spot } from '../level';
import type { ObstacleEnv } from '../obstacles';
import { damp, dampAngle } from '../utils';
import { box } from '../voxel';

export type PlayerState = 'ground' | 'air' | 'ladder' | 'dead';

export interface Controls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

export interface StepResult {
  jumped: boolean;
  landed: boolean;
  reachedSummit: boolean;
  fellInPit: boolean;
  /** Tried to climb a ladder that is locked (index), or -1. */
  blockedLadder: number;
  /** Tried to climb while holding the hammer. */
  hammerBlocked: boolean;
  /** Launched off a spring pad. */
  bounced: boolean;
}

export class Player {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  private readonly rig = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly hammer = new THREE.Group();

  level: Level;
  ring = 0;
  /** Distance along the current ring. */
  s = 0;
  y = 0;
  /** Speed along the ring (positive = right, seen from outside). */
  vs = 0;
  vy = 0;
  state: PlayerState = 'ground';
  hasHammer = false;
  private path: LadderPath | null = null;
  private d = 0;
  private side = 0;
  private facing = 1;
  private moving = false;
  private inPit = false;
  private animT = 0;
  private deathT = 0;
  private heading = Math.PI / 2;

  constructor(level: Level) {
    this.level = level;
    this.group.add(this.rig);

    this.legL.position.set(-0.14, 0.45, 0);
    this.legR.position.set(0.14, 0.45, 0);
    this.legL.add(box(0.2, 0.45, 0.24, COLORS.charcoal, 0, -0.225, 0));
    this.legR.add(box(0.2, 0.45, 0.24, COLORS.charcoal, 0, -0.225, 0));

    this.armL.position.set(-0.37, 0.92, 0);
    this.armR.position.set(0.37, 0.92, 0);
    this.armL.add(box(0.16, 0.44, 0.2, COLORS.yellow, 0, -0.2, 0));
    this.armR.add(box(0.16, 0.44, 0.2, COLORS.yellow, 0, -0.2, 0));

    this.hammer.position.set(0, -0.38, 0.05);
    this.hammer.add(box(0.08, 0.08, 0.7, COLORS.brown, 0, 0, 0.3), box(0.3, 0.3, 0.46, COLORS.charcoal, 0, 0, 0.7));
    this.hammer.visible = false;
    this.armR.add(this.hammer);

    this.rig.add(
      this.legL,
      this.legR,
      this.armL,
      this.armR,
      box(0.56, 0.5, 0.4, COLORS.orange, 0, 0.71, 0),
      box(0.58, 0.08, 0.42, COLORS.pink, 0, 0.5, 0),
      box(0.4, 0.36, 0.36, COLORS.cream, 0, 1.18, 0),
      box(0.07, 0.1, 0.02, COLORS.black, -0.09, 1.2, 0.185),
      box(0.07, 0.1, 0.02, COLORS.black, 0.09, 1.2, 0.185),
      box(0.42, 0.1, 0.38, COLORS.orange, 0, 1.38, 0),
      box(0.62, 0.52, 0.56, COLORS.cyan, 0, 1.22, 0, { opacity: 0.4 }),
    );
  }

  get isWalking(): boolean {
    return this.moving && (this.state === 'ground' || (this.state === 'ladder' && !this.onVerticalPart));
  }

  get isClimbing(): boolean {
    return this.moving && this.state === 'ladder' && this.onVerticalPart;
  }

  get grounded(): boolean {
    return this.state === 'ground';
  }

  private get onVerticalPart(): boolean {
    return this.path !== null && this.path.isVertical(this.d);
  }

  reset(spot: Spot): void {
    this.ring = spot.ring;
    this.s = this.level.spotS(spot);
    this.y = this.level.tierTop(spot.ring);
    this.vs = 0;
    this.vy = 0;
    this.state = 'ground';
    this.path = null;
    this.facing = 1;
    this.moving = false;
    this.inPit = false;
    this.deathT = 0;
    this.setHammer(false);
    this.rig.rotation.set(0, 0, 0);
    this.updatePosition();
    this.heading = sideYaw(this.side) + Math.PI / 2;
    this.rig.rotation.set(0, this.heading, 0);
    this.group.position.copy(this.position);
  }

  setHammer(on: boolean): void {
    this.hasHammer = on;
    this.hammer.visible = on;
  }

  /** Blink the hammer when it's about to run out. */
  set hammerBlink(on: boolean) {
    this.hammer.visible = this.hasHammer && !on;
  }

  die(): void {
    this.state = 'dead';
    this.deathT = 0;
  }

  step(dt: number, c: Controls, env: ObstacleEnv): StepResult {
    const result: StepResult = {
      jumped: false,
      landed: false,
      reachedSummit: false,
      fellInPit: false,
      blockedLadder: -1,
      hammerBlocked: false,
      bounced: false,
    };
    if (this.state === 'ground') this.stepGround(dt, c, env, result);
    else if (this.state === 'air') this.stepAir(dt, env, result);
    else if (this.state === 'ladder') this.stepLadder(dt, c, result);
    this.updatePosition();
    return result;
  }

  private tryLadder(path: LadderPath | undefined, d: number, env: ObstacleEnv, result: StepResult): boolean {
    if (!path) return false;
    if (!env.isLadderOpen(path.index)) {
      result.blockedLadder = path.index;
      return false;
    }
    if (this.hasHammer) {
      result.hammerBlocked = true;
      return false;
    }
    this.enterLadder(path, d);
    return true;
  }

  private stepGround(dt: number, c: Controls, env: ObstacleEnv, result: StepResult): void {
    const L = this.level;
    const grab = PHYSICS.ladderGrab;
    if (c.up) {
      const path = L.ladderPaths.find((p) => p.ladder.ring === this.ring && L.ringDistance(this.ring, this.s, p.bottomS) < grab);
      if (this.tryLadder(path, 0.01, env, result)) return;
    }
    if (c.down) {
      const path = L.ladderPaths.find(
        (p) => p.topS !== null && p.ladder.ring + 1 === this.ring && L.ringDistance(this.ring, this.s, p.topS) < grab,
      );
      if (path && this.tryLadder(path, path.length - 0.01, env, result)) return;
    }

    const dir = Number(c.right) - Number(c.left);
    if (dir !== 0) this.facing = dir;
    const grip = env.grip(this.ring, this.s);
    const target = dir * PHYSICS.moveSpeed;
    this.vs = Number.isFinite(grip) ? damp(this.vs, target, grip, dt) : target;
    this.moving = dir !== 0 || Math.abs(this.vs) > 0.5;

    const carry = env.carry(this.ring, this.s) ?? 0;
    if (c.jump) {
      // Air control is locked at take-off, as in the arcade original (you keep the floor's momentum).
      this.state = 'air';
      this.vs += carry;
      this.vy = PHYSICS.jumpVelocity;
      result.jumped = true;
      return;
    }
    this.s = mod(this.s + (this.vs + carry) * dt, L.ringLength(this.ring));
    if (env.carry(this.ring, this.s) === null) {
      this.state = 'air';
      this.vy = 0;
    } else if (this.onSpring(env)) {
      this.launch(result);
    }
  }

  /** Pads only fire when you run onto them, so you can stand on one without bouncing forever. */
  private onSpring(env: ObstacleEnv): boolean {
    return Math.abs(this.vs) > 0.5 && env.spring(this.ring, this.s);
  }

  private launch(result: StepResult): void {
    this.state = 'air';
    this.vy = OBSTACLES.springVelocity;
    result.bounced = true;
  }

  private stepAir(dt: number, env: ObstacleEnv, result: StepResult): void {
    const L = this.level;
    const top = L.tierTop(this.ring);
    this.vy += PHYSICS.gravity * dt;
    if (!this.inPit) this.s = mod(this.s + this.vs * dt, L.ringLength(this.ring));
    this.y += this.vy * dt;

    const overGap = env.carry(this.ring, this.s) === null;
    if (overGap && this.y < top - 0.05) this.inPit = true;
    if (this.inPit) {
      if (this.y <= top - PIT_DEPTH * 0.7) {
        this.y = top - PIT_DEPTH * 0.7;
        result.fellInPit = true;
      }
      return;
    }
    if (!overGap && this.y <= top) {
      this.y = top;
      this.vy = 0;
      if (this.onSpring(env)) {
        this.launch(result);
        return;
      }
      this.state = 'ground';
      result.landed = true;
    }
  }

  private stepLadder(dt: number, c: Controls, result: StepResult): void {
    const path = this.path;
    if (!path) {
      this.state = 'ground';
      return;
    }
    const dir = Number(c.up) - Number(c.down);
    this.moving = dir !== 0;
    this.d += dir * PHYSICS.climbSpeed * dt;

    if (this.d >= path.length) {
      if (path.topS === null) {
        this.d = path.length;
        result.reachedSummit = true;
      } else {
        this.leaveLadder(path.ladder.ring + 1, path.topS);
      }
    } else if (this.d <= 0) {
      this.leaveLadder(path.ladder.ring, path.bottomS);
    }
  }

  private enterLadder(path: LadderPath, d: number): void {
    this.state = 'ladder';
    this.path = path;
    this.d = d;
    this.vs = 0;
    this.vy = 0;
  }

  private leaveLadder(ring: number, s: number): void {
    this.state = 'ground';
    this.ring = ring;
    this.s = s;
    this.y = this.level.tierTop(ring);
    this.path = null;
    this.moving = false;
  }

  private updatePosition(): void {
    if (this.path && this.state === 'ladder') {
      const p = this.path.point(this.d);
      this.position.set(p.x, p.y, p.z);
      this.side = this.path.ladder.side;
      return;
    }
    const p = this.level.ringPoint(this.ring, this.s);
    this.position.set(p.x, this.y, p.z);
    this.side = p.side;
  }

  animate(dt: number): void {
    this.animT += dt;

    if (this.state === 'dead') {
      this.deathT += dt;
      if (this.deathT < 1) this.rig.rotation.y += dt * 16;
      else this.rig.rotation.z = damp(this.rig.rotation.z, Math.PI / 2, 10, dt);
      const hop = this.deathT < 0.6 && !this.inPit ? Math.sin((this.deathT / 0.6) * Math.PI) : 0;
      this.group.position.set(this.position.x, this.position.y + hop, this.position.z);
      return;
    }

    const yaw = sideYaw(this.side);
    const targetHeading = this.state === 'ladder' ? yaw + Math.PI : yaw + (this.facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.heading = dampAngle(this.heading, targetHeading, 16, dt);
    this.rig.rotation.set(0, this.heading, 0);

    let legL = 0;
    let legR = 0;
    let armL = 0;
    let armR = 0;
    if (this.isWalking) {
      const s = Math.sin(this.animT * 14) * 0.7;
      legL = s;
      legR = -s;
      armL = -s;
      armR = s;
    } else if (this.state === 'ladder' && this.onVerticalPart) {
      const s = this.moving ? Math.sin(this.animT * 10) : 0;
      armL = -2.6 + s * 0.4;
      armR = -2.6 - s * 0.4;
      legL = s * 0.5;
      legR = -s * 0.5;
    } else if (this.state === 'air') {
      legL = 0.7;
      legR = -0.5;
      armL = -2.4;
      armR = -2.4;
    }
    if (this.hasHammer) armR = -1.6 + Math.sin(this.animT * 16) * 1.3;
    const k = 24;
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, k, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, k, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, k, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, k, dt);
    this.group.position.copy(this.position);
  }
}
