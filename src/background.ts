import { CAMERA, COLORS } from './config';
import type { Skin } from './levels/skins';
import type { VoxelBuilder } from './voxel';

type Rand = () => number;

/**
 * Everything here sits well outside the play camera's orbit (see CAMERA.playDistance), so scenery
 * on the near side falls behind the camera and only the far side shows, behind the pyramid.
 */
const NEAR_LIMIT = 40;
/** The widest base half-width the radii here were laid out for, with the camera just off its face. */
const SIZED_FOR = NEAR_LIMIT - CAMERA.playDistance - 3;

/** `reach` is the pyramid base half-width; bigger pyramids push the scenery out to match. */
export function buildBackground(vb: VoxelBuilder, skin: Skin, rand: Rand, reach: number): void {
  const push = Math.max(0, reach - SIZED_FOR);
  buildTowers(vb, skin, rand, push);
  buildClouds(vb, skin, rand, push);
  buildIslands(vb, skin, rand, push);
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
  vb.cone(x - 0.8, top, z, 0.45, 1.7, palette[1]);
  vb.cone(x + 0.8, top, z, 0.45, 1.7, palette[1]);
  if (!eyes) return;
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const ex = nx === 0 ? 0.6 : 0;
    const ez = nz === 0 ? 0.6 : 0;
    vb.box(x + nx * 1.52 - ex, top - 1.2, z + nz * 1.52 - ez, nx ? 0.05 : 0.5, 0.5, nz ? 0.05 : 0.5, windowColor);
    vb.box(x + nx * 1.52 + ex, top - 1.2, z + nz * 1.52 + ez, nx ? 0.05 : 0.5, 0.5, nz ? 0.05 : 0.5, windowColor);
  }
}

function buildTowers(vb: VoxelBuilder, skin: Skin, rand: Rand, push: number): void {
  const count = 3;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
    const radius = 78 + push + rand() * 14;
    const palette = skin.towers[i % skin.towers.length];
    spikeTower(vb, Math.sin(angle) * radius, Math.cos(angle) * radius, -24, 28 + Math.floor(rand() * 10), palette, skin.towerWindow, i === 0);
  }
}

function buildClouds(vb: VoxelBuilder, skin: Skin, rand: Rand, push: number, count = 8, minY = -6, maxY = 28): void {
  for (let i = 0; i < count; i++) {
    const { x, z } = around(rand, NEAR_LIMIT + push, 65 + push);
    const cy = minY + rand() * (maxY - minY);
    const puffs = 3 + Math.floor(rand() * 4);
    for (let j = 0; j < puffs; j++) {
      const s = 0.9 + rand() * 1.6;
      vb.box(x + (rand() - 0.5) * 3.5, cy + (rand() - 0.5), z + (rand() - 0.5) * 3.5, s, s * 0.8, s, skin.clouds[j % skin.clouds.length]);
    }
  }
}

/** Little floating islands like the pyramid's own base: grass cap, banded underside, maybe a tree. */
function buildIslands(vb: VoxelBuilder, skin: Skin, rand: Rand, push: number, count = 5, minY = -4, maxY = 22): void {
  for (let i = 0; i < count; i++) {
    const { x, z } = around(rand, NEAR_LIMIT + 2 + push, 62 + push);
    const y = minY + rand() * (maxY - minY);
    const half = 1 + Math.floor(rand() * 2);
    for (let ix = -half; ix < half; ix++) {
      for (let iz = -half; iz < half; iz++) {
        vb.box(x + ix + 0.5, y - 0.5, z + iz + 0.5, 1, 1, 1, skin.island.top);
      }
    }
    let underside = y - 1;
    let lastH = half;
    skin.island.bands.forEach((color, layer) => {
      const h = half - Math.floor(layer / 2);
      if (h <= 0) return;
      for (let ix = -h; ix < h; ix++) {
        for (let iz = -h; iz < h; iz++) vb.box(x + ix + 0.5, y - 1.5 - layer, z + iz + 0.5, 1, 1, 1, color);
      }
      underside = y - 2 - layer;
      lastH = h;
    });
    for (let ix = -lastH; ix < lastH; ix++) {
      for (let iz = -lastH; iz < lastH; iz++) vb.spike(x + ix + 0.5, underside, z + iz + 0.5, 1.35, 0.8 + rand() * 1.4, COLORS.black);
    }
    islandProp(vb, skin, x, y, z);
  }
}

/** A small cone in the island's own colours, so a sand level stays sandy and a snow level stays white. */
function islandProp(vb: VoxelBuilder, skin: Skin, x: number, y: number, z: number): void {
  const trunk = skin.towers[0][1];
  vb.block(x, y, z, 0.22, 0.55, 0.22, trunk);
  vb.cone(x, y + 0.45, z, 0.42, 1.05, skin.island.top);
}

