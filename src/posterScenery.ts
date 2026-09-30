import { COLORS, RAINBOW } from './config';
import { Frame } from './frame';
import { squareCoords } from './level';
import { GLYPH_W, glyphCells } from './pixelFont';
import type { VoxelBuilder } from './voxel';

type Rand = () => number;

/**
 * Frame for a background piece at (x, z) whose front faces the pyramid: author the front at
 * negative `v`. Seen from the centre, `u` runs right-to-left, so glyphs are drawn with `-u`.
 */
function facingCentre(x: number, z: number): Frame {
  const { side, offset, radius } = squareCoords(x, z);
  return new Frame(side, radius, offset);
}

function spot(rand: Rand, min: number, max: number): { x: number; z: number } {
  const angle = rand() * Math.PI * 2;
  const radius = min + rand() * (max - min);
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

/** Isometric staircase cloud: stacked slabs that shrink and step back as they rise. */
export function steppedCloud(vb: VoxelBuilder, f: Frame, y: number, size: number, rand: Rand): void {
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const w = size * (1 - i * 0.26);
    const d = size * 0.6 * (1 - i * 0.2);
    const u = (rand() - 0.5) * size * 0.2 + i * size * 0.08;
    f.block(vb, u, y + i * size * 0.22, i * 0.2, w, size * 0.22, d, i % 2 ? 0xffffff : COLORS.cream);
  }
  f.block(vb, -size * 0.45, y - 0.05, -0.1, size * 0.3, size * 0.15, size * 0.4, COLORS.creamDark);
}

/** Tiny coloured cubes floating round a cloud, like the poster's sprinkles. */
function sprinkles(vb: VoxelBuilder, f: Frame, y: number, spread: number, rand: Rand): void {
  const n = 5 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const s = 0.25 + rand() * 0.25;
    f.glow(vb, (rand() - 0.5) * spread * 2, y + (rand() - 0.3) * spread, -rand() * 2, s, s, s, RAINBOW[Math.floor(rand() * RAINBOW.length)]);
  }
}

/** Chunky block letter in the u/y plane, front towards -v. */
function blockLetter(vb: VoxelBuilder, f: Frame, ch: string, uCenter: number, yBottom: number, v: number, cell: number): void {
  const u0 = uCenter + ((GLYPH_W - 1) / 2) * cell;
  for (const [col, row] of glyphCells(ch)) {
    const u = u0 - col * cell;
    const y = yBottom + row * cell + cell / 2;
    f.glow(vb, u, y, v - cell * 0.4, cell, cell, cell * 0.6, COLORS.yellow);
    f.box(vb, u - cell * 0.2, y - cell * 0.2, v + cell * 0.1, cell, cell, cell * 0.6, COLORS.orange);
  }
}

/** Cloud with a hanging rainbow ribbon and a big letter at its foot (the poster's "D" flag). */
export function rainbowBanner(vb: VoxelBuilder, f: Frame, y: number, ch: string, rand: Rand): void {
  const stripe = 0.6;
  const length = 7 + rand() * 3;
  RAINBOW.forEach((color, i) => {
    const u = (i - (RAINBOW.length - 1) / 2) * stripe;
    const tip = i % 2 ? 0.6 : 0;
    f.glow(vb, u, y - (length - tip) / 2, 0, stripe, length - tip, 0.3, color);
  });
  steppedCloud(vb, f, y - 0.4, 6, rand);
  blockLetter(vb, f, ch, 0, y - length - 5.4, -0.6, 1);
}

/** Cloud trailing a rainbow down a staircase of steps. */
export function rainbowTrail(vb: VoxelBuilder, f: Frame, y: number, rand: Rand): void {
  const steps = 6 + Math.floor(rand() * 4);
  const dir = rand() < 0.5 ? 1 : -1;
  for (let s = 0; s < steps; s++) {
    RAINBOW.forEach((color, i) => {
      f.glow(vb, dir * (s * 0.9), y - s * 0.9 - i * 0.28, 0, 0.9, 0.28, 0.3, color);
    });
  }
  steppedCloud(vb, f, y - 0.2, 5, rand);
}

/** Giant mint tower monster with horns, a spiky crown and a toothy face, far behind the pyramid. */
export function castleMonster(vb: VoxelBuilder, f: Frame, bottom: number, height: number): void {
  const half = 2.5;
  const top = bottom + height;
  for (let y = 0; y < height; y++) {
    const ledge = y % 9 === 8;
    const h = ledge ? half + 0.5 : half;
    for (let iu = -h; iu < h; iu++) {
      for (let iv = -h; iv < h; iv++) {
        const edge = Math.max(Math.abs(iu + 0.5), Math.abs(iv + 0.5)) > h - 1;
        if (!edge) continue;
        const color = ledge ? COLORS.cream : (iu + iv + y) % 2 ? COLORS.mint : COLORS.mintDark;
        f.box(vb, iu + 0.5, bottom + y + 0.5, iv + 0.5, 1, 1, 1, color);
      }
    }
  }
  const front = -half - 0.05;
  const faceY = top - 4;
  f.box(vb, -1.2, faceY, front, 1.2, 1.2, 0.1, COLORS.cream);
  f.box(vb, 1.2, faceY, front, 1.2, 1.2, 0.1, COLORS.cream);
  f.glow(vb, -1.1, faceY - 0.1, front - 0.06, 0.5, 0.6, 0.06, COLORS.pink);
  f.glow(vb, 1.3, faceY - 0.1, front - 0.06, 0.5, 0.6, 0.06, COLORS.pink);
  f.box(vb, 0, faceY - 2.2, front, 3.4, 1.4, 0.1, COLORS.black);
  for (let i = 0; i < 5; i++) {
    f.box(vb, -1.36 + i * 0.68, faceY - 1.72, front - 0.06, 0.4, 0.4, 0.06, COLORS.cream);
    f.box(vb, -1.02 + i * 0.68, faceY - 2.68, front - 0.06, 0.4, 0.4, 0.06, COLORS.cream);
  }
  f.cone(vb, -half + 0.6, top, 0, 0.8, 4, COLORS.cream);
  f.cone(vb, half - 0.6, top, 0, 0.8, 4, COLORS.cream);
  for (let i = -1; i <= 1; i++) f.cone(vb, i * 1.1, top, -half + 0.5, 0.35, 1.6, COLORS.mintDark);
  f.cone(vb, 0, top, 0, 0.6, 2.4, COLORS.pink);
}

const BANNER_LETTERS = ['D', 'P', 'O', 'U'];

export function buildPosterScenery(vb: VoxelBuilder, rand: Rand): void {
  const a = rand() * Math.PI * 2;
  const r = 80 + rand() * 8;
  const cx = Math.sin(a) * r;
  const cz = Math.cos(a) * r;
  castleMonster(vb, facingCentre(cx, cz), -22.5, 44 + Math.floor(rand() * 8));

  for (let i = 0; i < 3; i++) {
    const { x, z } = spot(rand, 50, 62);
    rainbowBanner(vb, facingCentre(x, z), 20 + rand() * 12, BANNER_LETTERS[Math.floor(rand() * BANNER_LETTERS.length)], rand);
  }
  for (let i = 0; i < 3; i++) {
    const { x, z } = spot(rand, 48, 62);
    rainbowTrail(vb, facingCentre(x, z), 14 + rand() * 16, rand);
  }
  for (let i = 0; i < 10; i++) {
    const { x, z } = spot(rand, 44, 64);
    const f = facingCentre(x, z);
    const y = -4 + rand() * 34;
    steppedCloud(vb, f, y, 3 + rand() * 4, rand);
    sprinkles(vb, f, y, 3, rand);
  }
}
