import * as THREE from 'three';
import type { SkinName } from '../levels/types';
import { box, cone, material } from '../voxel';
import { BOSS_LOOKS, type BossPart } from './bossLooks';

const THROW_DURATION = 0.75;
const ARM_PIVOT_X = 1.45;
const ARM_PIVOT_Y = 1.7;

/** The monster on the summit, lobbing barrels. Each level skin has its own look (see bossLooks.ts). */
export class Boss {
  readonly group = new THREE.Group();
  private readonly legs = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private look: SkinName | null = null;
  private throwT = -1;
  private released = false;
  private t = 0;

  constructor(look: SkinName = 'meadow') {
    this.armL.position.set(-ARM_PIVOT_X, ARM_PIVOT_Y, 0);
    this.armR.position.set(ARM_PIVOT_X, ARM_PIVOT_Y, 0);
    this.body.position.y = 1;
    this.body.add(this.armL, this.armR);
    this.group.add(this.legs, this.body);
    this.setLook(look);
  }

  /** Swaps in another skin's monster. The meshes share cached geometry and materials, so nothing needs disposing. */
  setLook(look: SkinName): void {
    if (look === this.look) return;
    this.look = look;
    this.legs.clear();
    this.armL.clear();
    this.armR.clear();
    this.body.remove(...this.body.children.filter((c) => c !== this.armL && c !== this.armR));
    const groups = { root: this.legs, body: this.body, armL: this.armL, armR: this.armR };
    for (const part of BOSS_LOOKS[look]) groups[part.g].add(mesh(part));
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

function mesh(part: BossPart): THREE.Mesh {
  const glow = part.glow ? { emissive: part.c } : undefined;
  if (part.cone) {
    const m = cone(part.s[0], part.s[1], part.c, part.p[0], part.p[1], part.p[2]);
    if (glow) m.material = material(part.c, glow);
    return m;
  }
  return box(part.s[0], part.s[1], part.s[2], part.c, part.p[0], part.p[1], part.p[2], glow);
}
