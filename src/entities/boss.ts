import * as THREE from 'three';
import { COLORS } from '../config';
import { box, cone } from '../voxel';

const THROW_DURATION = 0.75;

/** The black, cone-spiked monster from the poster, lobbing barrels from the top girder. */
export class Boss {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private throwT = -1;
  private released = false;
  private t = 0;

  constructor() {
    const B = COLORS.black;
    this.group.add(box(0.7, 1, 0.8, B, -0.65, 0.5, 0), box(0.7, 1, 0.8, B, 0.65, 0.5, 0));

    this.body.position.y = 1;
    this.body.add(
      box(2.4, 2, 1.8, B, 0, 1, 0),
      cone(0.35, 1.1, COLORS.cream, -0.7, 2, 0),
      cone(0.35, 1.1, COLORS.cream, 0.7, 2, 0),
      box(0.5, 0.3, 0.5, COLORS.pink, 0, 2.15, 0.3),
      box(0.45, 0.45, 0.1, COLORS.pink, -0.55, 1.45, 0.91),
      box(0.45, 0.45, 0.1, COLORS.pink, 0.55, 1.45, 0.91),
      box(0.16, 0.16, 0.05, COLORS.black, -0.5, 1.4, 0.97),
      box(0.16, 0.16, 0.05, COLORS.black, 0.6, 1.4, 0.97),
      box(1.6, 0.6, 0.1, COLORS.charcoal, 0, 0.6, 0.91),
    );
    for (let i = 0; i < 6; i++) {
      const x = -0.6 + i * 0.24;
      this.body.add(box(0.14, 0.22, 0.06, COLORS.cream, x, 0.78, 0.97));
      this.body.add(box(0.14, 0.18, 0.06, COLORS.cream, x + 0.12, 0.42, 0.97));
    }

    this.armL.position.set(-1.45, 1.7, 0);
    this.armR.position.set(1.45, 1.7, 0);
    for (const arm of [this.armL, this.armR]) {
      arm.add(box(0.55, 1.4, 0.7, B, 0, -0.65, 0), box(0.68, 0.5, 0.8, COLORS.charcoal, 0, -1.45, 0));
    }
    this.body.add(this.armL, this.armR);
    this.group.add(this.body);
  }

  get busy(): boolean {
    return this.throwT >= 0;
  }

  playThrow(): void {
    if (this.busy) return;
    this.throwT = 0;
    this.released = false;
  }

  /** Returns true on the frame the barrel should be released. */
  update(dt: number): boolean {
    this.t += dt;
    let release = false;

    if (this.throwT >= 0) {
      this.throwT += dt;
      const k = Math.min(1, this.throwT / THROW_DURATION);
      const lift = k < 0.5 ? Math.sin((k / 0.5) * (Math.PI / 2)) : 1 - (k - 0.5) / 0.5;
      this.armR.rotation.z = lift * 2.6;
      this.armL.rotation.z = -lift * 0.8;
      if (!this.released && k >= 0.5) {
        this.released = true;
        release = true;
      }
      if (k >= 1) this.throwT = -1;
    } else {
      const sway = Math.sin(this.t * 3) * 0.12;
      this.armL.rotation.z = -0.15 - sway;
      this.armR.rotation.z = 0.15 + sway;
    }

    this.body.position.y = 1 + Math.abs(Math.sin(this.t * 3)) * 0.08;
    return release;
  }
}
