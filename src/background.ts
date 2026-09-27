import * as THREE from 'three';
import { COLORS } from './config';
import type { Skin } from './levels/skins';
import { box } from './voxel';
import type { VoxelBuilder } from './voxel';

type Rand = () => number;

/**
 * Everything here sits well outside the play camera's orbit (see CAMERA.playDistance), so scenery
 * on the near side falls behind the camera and only the far side shows, behind the pyramid.
 */
const NEAR_LIMIT = 40;

export function buildBackground(vb: VoxelBuilder, skin: Skin, rand: Rand): void {
  buildTowers(vb, skin, rand);
  buildClouds(vb, skin, rand);
  buildIslands(vb, skin, rand);
  buildBalloons(vb, skin, rand);
}

function around(rand: Rand, min: number, max: number): { x: number; z: number } {
  const angle = rand() * Math.PI * 2;
  const radius = min + rand() * (max - min);
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

function spikeTower(vb: VoxelBuilder, x: number, z: number, bottom: number, height: number, palette: readonly [number, number], windowColor: number, eyes: boolean): void {
  for (let y = 0; y < height; y++) {
    for (let ix = 0; ix < 3; ix++) {
      for (let iz = 0; iz < 3; iz++) {
        if (ix === 1 && iz === 1) continue;
        const isWindow = (ix === 1 || iz === 1) && y % 3 === 1 && y < height - 3;
        if (isWindow) vb.glow(x - 1 + ix, bottom + y + 0.5, z - 1 + iz, 1, 1, 1, windowColor);
        else vb.box(x - 1 + ix, bottom + y + 0.5, z - 1 + iz, 1, 1, 1, palette[(ix + iz + y) % 2]);
      }
    }
  }
  const top = bottom + height;
  vb.cone(x - 0.8, top, z, 0.45, 1.7, COLORS.cream);
  vb.cone(x + 0.8, top, z, 0.45, 1.7, COLORS.cream);
  if (!eyes) return;
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const ex = nx === 0 ? 0.6 : 0;
    const ez = nz === 0 ? 0.6 : 0;
    vb.box(x + nx * 1.52 - ex, top - 1.2, z + nz * 1.52 - ez, nx ? 0.05 : 0.5, 0.5, nz ? 0.05 : 0.5, COLORS.pink);
    vb.box(x + nx * 1.52 + ex, top - 1.2, z + nz * 1.52 + ez, nx ? 0.05 : 0.5, 0.5, nz ? 0.05 : 0.5, COLORS.pink);
  }
}

function buildTowers(vb: VoxelBuilder, skin: Skin, rand: Rand): void {
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rand() * 0.3;
    const radius = 70 + rand() * 20;
    const palette = skin.towers[i % skin.towers.length];
    spikeTower(vb, Math.sin(angle) * radius, Math.cos(angle) * radius, -24, 34 + Math.floor(rand() * 20), palette, skin.towerWindow, i % 2 === 0);
  }
}

function buildClouds(vb: VoxelBuilder, skin: Skin, rand: Rand): void {
  for (let i = 0; i < 28; i++) {
    const { x, z } = around(rand, NEAR_LIMIT, 65);
    const cy = -10 + rand() * 42;
    const puffs = 3 + Math.floor(rand() * 4);
    for (let j = 0; j < puffs; j++) {
      const s = 0.9 + rand() * 1.6;
      vb.box(x + (rand() - 0.5) * 3.5, cy + (rand() - 0.5), z + (rand() - 0.5) * 3.5, s, s * 0.8, s, skin.clouds[j % skin.clouds.length]);
    }
  }
}

/** Little floating islands like the pyramid's own base: grass cap, banded underside, maybe a tree. */
function buildIslands(vb: VoxelBuilder, skin: Skin, rand: Rand): void {
  for (let i = 0; i < 9; i++) {
    const { x, z } = around(rand, NEAR_LIMIT + 2, 62);
    const y = -6 + rand() * 30;
    const half = 1 + Math.floor(rand() * 2);
    for (let ix = -half; ix < half; ix++) {
      for (let iz = -half; iz < half; iz++) {
        vb.box(x + ix + 0.5, y - 0.5, z + iz + 0.5, 1, 1, 1, skin.island.top);
      }
    }
    skin.island.bands.forEach((color, layer) => {
      const h = half - Math.floor(layer / 2);
      if (h <= 0) return;
      for (let ix = -h; ix < h; ix++) {
        for (let iz = -h; iz < h; iz++) vb.box(x + ix + 0.5, y - 1.5 - layer, z + iz + 0.5, 1, 1, 1, color);
      }
    });
    if (rand() < 0.6) {
      vb.block(x, y, z, 0.3, 0.7, 0.3, COLORS.brown);
      vb.block(x, y + 0.6, z, 1.1, 0.9, 1.1, COLORS.leaf);
      vb.block(x, y + 1.4, z, 0.6, 0.5, 0.6, COLORS.grass);
    } else {
      vb.cone(x, y, z, 0.4, 1.4, COLORS.cream);
    }
  }
}

function buildBalloons(vb: VoxelBuilder, skin: Skin, rand: Rand): void {
  for (let i = 0; i < 10; i++) {
    const { x, z } = around(rand, NEAR_LIMIT, 58);
    const y = 4 + rand() * 26;
    const color = skin.balloons[i % skin.balloons.length];
    vb.glow(x, y, z, 1.2, 1.4, 1.2, color);
    vb.glow(x, y + 0.1, z, 1.4, 0.9, 1.4, color);
    vb.box(x - 0.25, y + 0.35, z + 0.71, 0.3, 0.3, 0.02, 0xffffff);
    vb.box(x, y - 0.8, z, 0.3, 0.2, 0.3, color);
    vb.box(x, y - 1.8, z, 0.04, 1.8, 0.04, COLORS.charcoal);
  }
}

interface Flyer {
  group: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  radius: number;
  height: number;
  speed: number;
  angle: number;
}

/** A few big poster ghosts lazily circling far behind the pyramid. */
export class SkyCritters {
  readonly group = new THREE.Group();
  private readonly flyers: Flyer[] = [];
  private t = 0;

  constructor(count = 5) {
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.add(
        box(0.8, 0.6, 0.6, COLORS.black, 0, 0, 0),
        box(0.72, 0.46, 0.58, COLORS.cyan, 0, 0.5, 0, { opacity: 0.55 }),
        box(0.14, 0.14, 0.04, COLORS.pink, -0.18, 0.08, 0.31),
        box(0.14, 0.14, 0.04, COLORS.pink, 0.18, 0.08, 0.31),
      );
      const wingL = new THREE.Group();
      const wingR = new THREE.Group();
      wingL.position.set(-0.4, 0.05, 0);
      wingR.position.set(0.4, 0.05, 0);
      wingL.add(box(0.6, 0.1, 0.4, COLORS.black, -0.3, 0, 0));
      wingR.add(box(0.6, 0.1, 0.4, COLORS.black, 0.3, 0, 0));
      g.add(wingL, wingR);
      g.scale.setScalar(2 + (i % 3) * 0.6);
      this.group.add(g);
      this.flyers.push({
        group: g,
        wingL,
        wingR,
        radius: 44 + i * 4,
        height: 6 + ((i * 7) % 22),
        speed: (0.05 + (i % 3) * 0.02) * (i % 2 ? 1 : -1),
        angle: (i / count) * Math.PI * 2,
      });
    }
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt;
    for (const f of this.flyers) {
      f.angle += f.speed * dt;
      const x = Math.sin(f.angle) * f.radius;
      const z = Math.cos(f.angle) * f.radius;
      f.group.position.set(x, f.height + Math.sin(this.t * 1.3 + f.angle * 3) * 0.8, z);
      f.group.rotation.y = f.angle + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(this.t * 10 + f.radius) * 0.6;
      f.wingL.rotation.z = flap;
      f.wingR.rotation.z = -flap;
    }
  }
}
