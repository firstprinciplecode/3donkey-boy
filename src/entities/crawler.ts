import * as THREE from 'three';
import { COLORS, CRAWLER } from '../config';
import { mod, sideYaw, type Level } from '../level';
import type { PatrolDef } from '../levels/types';
import type { CrawlerLook } from '../levels/skins';
import type { ObstacleEnv } from '../obstacles';
import { box, cone } from '../voxel';

interface Rig {
  root: THREE.Group;
  /** Called every frame with the running clock and how far into the special move we are (0 = off). */
  animate(t: number, special: number): void;
}

/**
 * Ground monster pacing a stretch of ring, turning back at pits. Every few seconds it does its
 * special move: snakes and scorpions stop and rear up (taller, harder to jump), penguins belly
 * slide and hedgehogs curl up and roll (both twice as fast, but low).
 */
export class Crawler {
  readonly group = new THREE.Group();
  /** Centre of the hitbox in world space. */
  readonly position = new THREE.Vector3();
  radius: number = CRAWLER.radius;
  /** Top of the body above the floor, for jump-over scoring. */
  height = 0.7;
  scored = false;
  readonly ring: number;
  private readonly level: Level;
  private readonly s0: number;
  private readonly length: number;
  private readonly speed: number;
  private readonly look: CrawlerLook;
  private readonly rig: Rig;
  private progress: number;
  private dir: 1 | -1 = 1;
  private t = Math.random() * 10;
  private specialClock = CRAWLER.rearEvery * (0.5 + Math.random());
  private specialT = -1;

  constructor(level: Level, patrol: PatrolDef, look: CrawlerLook, speed: number) {
    this.level = level;
    this.ring = patrol.ring;
    this.s0 = level.sOf(patrol.ring, patrol.from[0], patrol.from[1]);
    const s1 = level.sOf(patrol.ring, patrol.to[0], patrol.to[1]);
    this.length = mod(s1 - this.s0, level.ringLength(patrol.ring));
    this.speed = speed;
    this.look = look;
    this.progress = this.length / 2;
    this.rig = RIGS[look]();
    this.group.add(this.rig.root);
    this.place();
  }

  private get rears(): boolean {
    return this.look === 'snake' || this.look === 'scorpion';
  }

  update(dt: number, env: ObstacleEnv): void {
    this.t += dt;
    const special = this.specialT >= 0 ? this.specialT / CRAWLER.rearTime : 0;
    if (this.specialT >= 0) {
      this.specialT += dt;
      if (this.specialT >= CRAWLER.rearTime) {
        this.specialT = -1;
        this.specialClock = CRAWLER.rearEvery * (0.7 + Math.random() * 0.6);
      }
    } else {
      this.specialClock -= dt;
      if (this.specialClock <= 0) this.specialT = 0;
    }

    const moving = this.specialT < 0 || !this.rears;
    if (moving) {
      const speed = this.speed * (this.specialT >= 0 ? 2 : 1);
      const next = this.progress + this.dir * speed * dt;
      const L = this.level;
      const ahead = mod(this.s0 + next + this.dir * 0.5, L.ringLength(this.ring));
      if (next > this.length || next < 0 || env.carry(this.ring, ahead) === null) {
        this.dir = -this.dir as 1 | -1;
      } else {
        this.progress = next;
      }
    }

    const up = this.rears && this.specialT >= 0 ? Math.sin(Math.min(1, special * 1.6) * Math.PI * 0.5) : 0;
    this.height = 0.7 + up * 0.5;
    this.radius = CRAWLER.radius + up * 0.1;
    this.rig.animate(this.t, this.specialT >= 0 ? Math.max(0.001, special) : 0);
    this.place(up);
  }

  private place(up = 0): void {
    const L = this.level;
    const p = L.ringPoint(this.ring, mod(this.s0 + this.progress, L.ringLength(this.ring)));
    const y = L.tierTop(this.ring);
    this.group.position.set(p.x, y, p.z);
    this.group.rotation.y = sideYaw(p.side) + (this.dir > 0 ? 0 : Math.PI);
    this.position.set(p.x, y + 0.35 + up * 0.3, p.z);
  }
}

function snake(): Rig {
  const root = new THREE.Group();
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const seg = box(0.3, 0.22, 0.24, i % 2 ? COLORS.yellow : COLORS.leaf, -i * 0.26, 0.11, 0);
    segments.push(seg);
    root.add(seg);
  }
  const head = new THREE.Group();
  const tongue = box(0.18, 0.03, 0.06, COLORS.red, 0.3, 0.05, 0);
  head.add(
    box(0.38, 0.26, 0.32, COLORS.leaf, 0.08, 0.13, 0),
    box(0.08, 0.08, 0.04, COLORS.yellow, 0.16, 0.2, 0.17),
    box(0.08, 0.08, 0.04, COLORS.yellow, 0.16, 0.2, -0.17),
    box(0.04, 0.06, 0.05, COLORS.black, 0.18, 0.2, 0.19),
    box(0.04, 0.06, 0.05, COLORS.black, 0.18, 0.2, -0.19),
    tongue,
  );
  head.position.x = 0.22;
  root.add(head);
  return {
    root,
    animate(t, special) {
      const rear = special > 0 ? Math.sin(Math.min(1, special * 1.6) * Math.PI * 0.5) * (special > 0.85 ? (1 - special) / 0.15 : 1) : 0;
      segments.forEach((seg, i) => {
        seg.position.z = Math.sin(t * 9 - i * 1.1) * 0.12 * (1 - rear * 0.7);
        seg.position.y = 0.11 + Math.max(0, rear * (0.8 - i * 0.28));
      });
      head.position.y = rear * 0.85;
      head.rotation.z = -rear * 0.35;
      tongue.visible = Math.sin(t * 6) > 0.3 || rear > 0.2;
    },
  };
}

function scorpion(): Rig {
  const root = new THREE.Group();
  const legs: THREE.Mesh[] = [];
  root.add(box(0.62, 0.22, 0.44, COLORS.rust, 0, 0.2, 0), box(0.24, 0.18, 0.34, COLORS.black, 0.38, 0.2, 0));
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const leg = box(0.08, 0.2, 0.08, COLORS.black, -0.15 + i * 0.16, 0.08, side * 0.28);
      legs.push(leg);
      root.add(leg);
    }
  }
  const claws = new THREE.Group();
  claws.add(
    box(0.28, 0.12, 0.12, COLORS.rust, 0.62, 0.22, 0.2),
    box(0.28, 0.12, 0.12, COLORS.rust, 0.62, 0.22, -0.2),
    box(0.14, 0.1, 0.18, COLORS.lava, 0.8, 0.22, 0.2),
    box(0.14, 0.1, 0.18, COLORS.lava, 0.8, 0.22, -0.2),
  );
  const tail = new THREE.Group();
  tail.add(
    box(0.16, 0.16, 0.16, COLORS.rust, 0, 0.1, 0),
    box(0.16, 0.16, 0.16, COLORS.rust, 0.02, 0.28, 0),
    box(0.16, 0.16, 0.16, COLORS.rust, 0.12, 0.44, 0),
    cone(0.07, 0.2, COLORS.yellow, 0.26, 0.44, 0),
  );
  tail.position.set(-0.34, 0.24, 0);
  root.add(claws, tail);
  return {
    root,
    animate(t, special) {
      const rear = special > 0 ? Math.min(1, special * 3) * Math.min(1, (1 - special) * 4) : 0;
      legs.forEach((leg, i) => (leg.position.y = 0.08 + Math.max(0, Math.sin(t * 16 + i * 1.3)) * 0.05 * (1 - rear)));
      tail.scale.setScalar(1 + rear * 0.6);
      tail.rotation.z = -rear * 0.5 + Math.sin(t * 3) * 0.08;
      claws.position.y = rear * 0.25;
      claws.rotation.z = rear * 0.3;
    },
  };
}

function penguin(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(
    box(0.46, 0.66, 0.44, COLORS.black, 0, 0.33, 0),
    box(0.06, 0.5, 0.34, COLORS.cream, 0.23, 0.3, 0),
    box(0.16, 0.08, 0.12, COLORS.orange, 0.3, 0.5, 0),
    box(0.04, 0.08, 0.08, COLORS.cream, 0.24, 0.6, 0.12),
    box(0.04, 0.08, 0.08, COLORS.cream, 0.24, 0.6, -0.12),
    box(0.3, 0.06, 0.1, COLORS.orange, 0.08, 0.03, 0.12),
    box(0.3, 0.06, 0.1, COLORS.orange, 0.08, 0.03, -0.12),
    box(0.3, 0.1, 0.46, COLORS.red, 0, 0.62, 0),
  );
  const flipperL = box(0.3, 0.1, 0.06, COLORS.black, 0, 0.4, 0.25);
  const flipperR = box(0.3, 0.1, 0.06, COLORS.black, 0, 0.4, -0.25);
  body.add(flipperL, flipperR);
  root.add(body);
  return {
    root,
    animate(t, special) {
      const slide = special > 0 ? Math.min(1, special * 5) * Math.min(1, (1 - special) * 5) : 0;
      body.rotation.z = -slide * (Math.PI / 2) + (1 - slide) * Math.sin(t * 10) * 0.14;
      body.position.y = slide * 0.22;
      flipperL.rotation.x = Math.sin(t * 10) * 0.4 * (1 - slide) + slide * 0.5;
      flipperR.rotation.x = -flipperL.rotation.x;
    },
  };
}

function hedgehog(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(
    box(0.56, 0.38, 0.46, COLORS.brown, 0, 0.21, 0),
    box(0.2, 0.24, 0.3, COLORS.tan, 0.32, 0.16, 0),
    box(0.08, 0.08, 0.08, COLORS.black, 0.44, 0.18, 0),
    box(0.04, 0.06, 0.05, COLORS.black, 0.34, 0.26, 0.1),
    box(0.04, 0.06, 0.05, COLORS.black, 0.34, 0.26, -0.1),
  );
  for (let i = 0; i < 3; i++) {
    for (let j = -1; j <= 1; j++) body.add(cone(0.08, 0.22, i % 2 ? COLORS.cream : COLORS.rust, -0.2 + i * 0.16, 0.34, j * 0.14));
  }
  const pivot = new THREE.Group();
  pivot.position.y = 0.24;
  body.position.y = -0.22;
  pivot.add(body);
  root.add(pivot);
  return {
    root,
    animate(t, special) {
      const curl = special > 0 ? Math.min(1, special * 5) * Math.min(1, (1 - special) * 5) : 0;
      pivot.scale.set(1 - curl * 0.25, 1 + curl * 0.15, 1);
      pivot.rotation.z = curl > 0.5 ? -t * 14 : Math.sin(t * 12) * 0.05;
      pivot.position.y = 0.24 + curl * 0.04;
    },
  };
}

const RIGS: Record<CrawlerLook, () => Rig> = { snake, scorpion, penguin, hedgehog };
