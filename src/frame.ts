import { NORMALS, TANGENTS, squarePoint } from './level';
import type { VoxelBuilder } from './voxel';

/**
 * Local frame on one side of the pyramid: `u` runs along the side (to the right as seen from
 * outside), `v` points outward. Lets decor be authored once and placed on any of the 4 faces.
 */
export class Frame {
  private readonly side: number;
  private readonly bx: number;
  private readonly bz: number;

  constructor(side: number, radius: number, offset: number) {
    this.side = side;
    const p = squarePoint(radius, side, offset);
    this.bx = p.x;
    this.bz = p.z;
  }

  box(vb: VoxelBuilder, u: number, y: number, v: number, su: number, sy: number, sv: number, color: number): void {
    const { x, z } = this.at(u, v);
    const alongX = this.side % 2 === 0;
    vb.box(x, y, z, alongX ? su : sv, sy, alongX ? sv : su, color);
  }

  block(vb: VoxelBuilder, u: number, yBottom: number, v: number, su: number, sy: number, sv: number, color: number): void {
    this.box(vb, u, yBottom + sy / 2, v, su, sy, sv, color);
  }

  glow(vb: VoxelBuilder, u: number, y: number, v: number, su: number, sy: number, sv: number, color: number): void {
    const { x, z } = this.at(u, v);
    const alongX = this.side % 2 === 0;
    vb.glow(x, y, z, alongX ? su : sv, sy, alongX ? sv : su, color);
  }

  cone(vb: VoxelBuilder, u: number, yBottom: number, v: number, radius: number, height: number, color: number): void {
    const { x, z } = this.at(u, v);
    vb.cone(x, yBottom, z, radius, height, color);
  }

  private at(u: number, v: number): { x: number; z: number } {
    const t = TANGENTS[this.side];
    const n = NORMALS[this.side];
    return { x: this.bx + t.x * u + n.x * v, z: this.bz + t.z * u + n.z * v };
  }
}
