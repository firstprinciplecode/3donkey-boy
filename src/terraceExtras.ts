import { cascadeSpots } from './cascades';
import { COLORS } from './config';
import { Frame } from './frame';
import type { Level } from './level';
import type { SpanDef } from './levels/types';
import type { VoxelBuilder } from './voxel';

type Rand = () => number;

/** Wall faces (`"tier:side"`) painted as neon ribbed panels, with their top-to-bottom gradient. */
export type NeonPanels = Map<string, readonly number[]>;

const NEON_PALETTES: readonly (readonly number[])[] = [
  [COLORS.neon, COLORS.pink, COLORS.magenta, COLORS.violet],
  [COLORS.yellow, COLORS.orange, COLORS.maple, COLORS.pink],
];

/** One or two tier walls per level get the poster's striped neon treatment. */
export function neonPanels(level: Level, rand: Rand): NeonPanels {
  const panels: NeonPanels = new Map();
  const count = level.ringCount > 4 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const tier = 1 + Math.floor(rand() * (level.ringCount - 1));
    const side = Math.floor(rand() * 4);
    panels.set(`${tier}:${side}`, NEON_PALETTES[i % NEON_PALETTES.length]);
  }
  return panels;
}

/** Thin glowing ribs over each neon panel, stopping short of ladders and barrel chutes. */
export function buildNeonRibs(vb: VoxelBuilder, level: Level, panels: NeonPanels): void {
  const def = level.def;
  for (const [key, palette] of panels) {
    const [tier, side] = key.split(':').map(Number);
    const half = level.tierHalf(tier);
    const top = level.tierTop(tier);
    const floor = level.tierTop(tier - 1);
    const rib = palette[0] === COLORS.neon ? 0xffb3ec : COLORS.cream;
    for (let offset = -half + 1; offset <= half - 1; offset += 1) {
      const nearLadder = def.ladders.some((l) => l.ring === tier - 1 && l.side === side && Math.abs(l.offset - offset) < 0.9);
      const nearChute = def.chutes.some((c) => c.ring === tier && c.side === side && Math.abs(c.offset - offset) < 1.1);
      if (nearLadder || nearChute) continue;
      const f = new Frame(side, half, offset);
      f.glow(vb, 0, (top - 0.15 + floor) / 2, 0.05, 0.12, top - 0.15 - floor, 0.1, rib);
    }
  }
}

/**
 * White picket fences on stretches of terrace edge. They skip gaps, chutes, ladder tops, the drum
 * and the cascade lips, and stay low so they never hide the player.
 */
export function buildFences(vb: VoxelBuilder, level: Level, gaps: readonly SpanDef[], rand: Rand): void {
  const def = level.def;
  const cascades = cascadeSpots(level);
  const blocked = (ring: number, side: number, offset: number) =>
    gaps.some((g) => g.ring === ring && g.side === side && Math.abs(g.offset - offset) < g.width / 2 + 0.3) ||
    def.chutes.some((c) => c.ring === ring && c.side === side && Math.abs(c.offset - offset) < 1.3) ||
    def.ladders.some((l) => l.ring === ring - 1 && l.side === side && Math.abs(l.offset - offset) < 1) ||
    (ring === def.drum.ring && side === def.drum.side && Math.abs(def.drum.offset - offset) < 1.6) ||
    (ring === 0 && cascades.some((c) => c.side === side && Math.abs(c.offset - offset) < c.width / 2 + 0.3));

  for (let k = 0; k < level.ringCount; k++) {
    const half = level.tierHalf(k);
    const y = level.tierTop(k);
    for (let side = 0; side < 4; side++) {
      if (rand() < 0.45) continue;
      const len = 3 + rand() * 5;
      const start = -half + 1.2 + rand() * Math.max(0, half * 2 - 2.4 - len);
      let prev: number | null = null;
      for (let offset = start; offset <= start + len; offset += 0.3) {
        if (blocked(k, side, offset)) {
          prev = null;
          continue;
        }
        const f = new Frame(side, half, offset);
        f.block(vb, 0, y, -0.14, 0.08, 0.42, 0.06, COLORS.cream);
        f.block(vb, 0, y + 0.42, -0.14, 0.05, 0.06, 0.05, COLORS.cream);
        if (prev !== null) {
          const mid = new Frame(side, half, (offset + prev) / 2);
          mid.box(vb, 0, y + 0.14, -0.14, 0.3, 0.05, 0.03, COLORS.creamDark);
          mid.box(vb, 0, y + 0.32, -0.14, 0.3, 0.05, 0.03, COLORS.creamDark);
        }
        prev = offset;
      }
    }
  }
}

/** Black sawtooth spikes hanging under the rim of the floating base, like the poster's island. */
export function buildBaseSpikes(vb: VoxelBuilder, level: Level, rand: Rand): void {
  const half = level.tierHalf(0);
  const y = level.baseBottom;
  for (let ix = -half; ix < half; ix++) {
    for (let iz = -half; iz < half; iz++) {
      const cx = ix + 0.5;
      const cz = iz + 0.5;
      const cheb = Math.max(Math.abs(cx), Math.abs(cz));
      if (cheb < half - 3) continue;
      const depth = half - cheb;
      const h = 0.6 + rand() * 1.2 + depth * 0.5;
      vb.spike(cx, y, cz, 1.35, h, (ix + iz) % 2 ? COLORS.black : COLORS.charcoal);
    }
  }
}
