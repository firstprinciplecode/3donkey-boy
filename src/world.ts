import * as THREE from 'three';
import { COLORS } from './config';
import { BOSS_POS, PIT_DEPTH, mod, squareCoords, type Level, type Spot } from './level';
import { SKINS, type DecorKind, type Skin } from './levels/skins';
import type { SpanDef } from './levels/types';
import { buildBackground } from './background';
import { Frame } from './frame';
import { buildBaseSpikes, buildFences, buildNeonRibs, neonPanels, type NeonPanels } from './terraceExtras';
import { seededRandom } from './utils';
import { VoxelBuilder } from './voxel';

type Rand = () => number;

/**
 * Static voxel scenery for a level, baked into instanced meshes. `glowing` lights up windows,
 * lanterns and balloons for dusk/night. Call `disposeWorld` when swapping levels.
 */
export function buildWorld(level: Level, glowing = false): THREE.Group {
  const vb = new VoxelBuilder();
  const def = level.def;
  const skin = SKINS[def.skin];
  const rand = seededRandom(hashString(def.name));
  const gaps: SpanDef[] = [...def.pits, ...def.crumbles, ...def.platforms];

  const neon = neonPanels(level, rand);

  for (let k = 0; k <= level.summitTier; k++) buildTier(vb, level, skin, k, gaps, rand, neon);
  def.ladders.forEach((l) => buildLadder(vb, level, l));
  def.chutes.forEach((c) => buildChute(vb, level, c));
  buildDecor(vb, level, skin, gaps, rand);
  buildLanterns(vb, level);
  buildNeonRibs(vb, level, neon);
  buildFences(vb, level, gaps, rand);
  buildSummit(vb, level);
  buildDrum(vb, level);
  vb.castShadows(false);
  buildBaseSpikes(vb, level, rand);
  buildBackground(vb, skin, rand);

  return vb.build(glowing);
}

export function disposeWorld(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      o.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function inGap(gaps: readonly SpanDef[], ring: number, x: number, z: number): boolean {
  const { side, offset } = squareCoords(x, z);
  return gaps.some((g) => g.ring === ring && g.side === side && Math.abs(offset - g.offset) < g.width / 2 - 0.01);
}

/**
 * One tier: a terrace ring of cells on top, plus the outer wall down to (one below) the terrace
 * underneath. Gap spans are cut out of the top layer and floored with spikes one cell down.
 */
function buildTier(
  vb: VoxelBuilder,
  level: Level,
  skin: Skin,
  k: number,
  gaps: readonly SpanDef[],
  rand: Rand,
  neon: NeonPanels,
): void {
  const half = level.tierHalf(k);
  const inner = k < level.summitTier ? level.tierHalf(k + 1) : 0;
  const top = level.tierTop(k);
  const wallBottom = k === 0 ? level.baseBottom : level.tierTop(k - 1) - PIT_DEPTH;
  const style = skin.tiers[k % skin.tiers.length];
  const multi = style.top.length > 2;

  for (let ix = -half; ix < half; ix++) {
    for (let iz = -half; iz < half; iz++) {
      const cx = ix + 0.5;
      const cz = iz + 0.5;
      const cheb = Math.max(Math.abs(cx), Math.abs(cz));
      if (cheb < inner) continue;

      if (k < level.summitTier && inGap(gaps, k, cx, cz)) {
        if (cheb < half - 1) vb.box(cx, top - PIT_DEPTH - 0.5, cz, 1, 1, 1, COLORS.charcoal);
        vb.cone(cx, top - PIT_DEPTH, cz, 0.2, 0.6, (ix + iz) % 2 ? COLORS.cream : COLORS.creamDark);
      } else {
        const topColor = multi ? style.top[mod(ix + iz, style.top.length)] : style.top[mod(ix + iz, 2)];
        vb.box(cx, top - 0.5, cz, 1, 1, 1, topColor);
      }

      if (cheb < half - 1) continue;
      const palette = neon.get(`${k}:${squareCoords(cx, cz).side}`);
      const layers = Math.round(top - wallBottom) - 1;
      for (let y = top - 1, layer = 0; y > wallBottom; y--, layer++) {
        if (k === 0) vb.box(cx, y - 0.5, cz, 1, 1, 1, skin.baseBands[layer % skin.baseBands.length]);
        else if (palette) vb.box(cx, y - 0.5, cz, 1, 1, 1, palette[Math.min(palette.length - 1, Math.floor((layer / layers) * palette.length))]);
        else if (rand() < 0.07) vb.glow(cx, y - 0.5, cz, 1, 1, 1, skin.windowColor);
        else vb.box(cx, y - 0.5, cz, 1, 1, 1, style.side[mod(ix + iz + layer, 2)]);
      }
    }
  }
}

function buildLadder(vb: VoxelBuilder, level: Level, l: Spot): void {
  const upper = l.ring + 1;
  const f = new Frame(l.side, level.tierHalf(upper) + 0.08, l.offset);
  const y0 = level.tierTop(l.ring);
  const y1 = level.tierTop(upper);
  const len = y1 - y0;
  f.box(vb, -0.32, y0 + len / 2, 0, 0.1, len, 0.1, COLORS.yellow);
  f.box(vb, 0.32, y0 + len / 2, 0, 0.1, len, 0.1, COLORS.yellow);
  for (let y = y0 + 0.35; y < y1 - 0.2; y += 0.42) {
    f.box(vb, 0, y, 0, 0.6, 0.08, 0.08, COLORS.cream);
  }
}

/** Striped lip where barrels tumble off to the ring below. */
function buildChute(vb: VoxelBuilder, level: Level, c: Spot): void {
  const f = new Frame(c.side, level.tierHalf(c.ring), c.offset);
  const y = level.tierTop(c.ring);
  f.block(vb, 0, y, -1.2, 1.2, 0.06, 0.9, COLORS.yellow);
  f.block(vb, 0, y, -0.4, 1.2, 0.06, 0.6, COLORS.pink);
  f.block(vb, 0, y - 0.35, 0.3, 1.2, 0.3, 0.6, COLORS.yellow);
  f.block(vb, 0, y - 0.95, 0.75, 1.2, 0.3, 0.5, COLORS.pink);
}

type DecorFn = (vb: VoxelBuilder, f: Frame, y: number, rand: Rand) => void;

/** Voxel "sphere": three crossed slabs, the lime topiary look from the poster. */
function limeBall(vb: VoxelBuilder, f: Frame, yCenter: number, r: number, u = 0): void {
  const d = r * 2;
  f.box(vb, u, yCenter, 0, d, d * 0.62, d * 0.62, COLORS.lime);
  f.box(vb, u, yCenter, 0, d * 0.62, d, d * 0.62, COLORS.lime);
  f.box(vb, u, yCenter, 0, d * 0.62, d * 0.62, d, COLORS.limeDark);
  f.box(vb, u - r * 0.25, yCenter + r * 0.3, r + 0.02, d * 0.2, d * 0.2, 0.04, COLORS.cream);
}

const DECOR: Record<DecorKind, DecorFn> = {
  tree(vb, f, y, rand) {
    const s = 0.85 + rand() * 0.35;
    f.block(vb, 0, y, 0, 0.25 * s, 0.6 * s, 0.25 * s, COLORS.brown);
    f.block(vb, 0, y + 0.5 * s, 0, 0.95 * s, 0.7 * s, 0.95 * s, COLORS.leaf);
    f.block(vb, 0, y + 1.1 * s, 0, 0.7 * s, 0.55 * s, 0.7 * s, COLORS.grass);
    f.block(vb, 0, y + 1.6 * s, 0, 0.35 * s, 0.35 * s, 0.35 * s, COLORS.grassDark);
  },
  pine(vb, f, y, rand) {
    const s = 0.9 + rand() * 0.35;
    f.block(vb, 0, y, 0, 0.2 * s, 0.4 * s, 0.2 * s, COLORS.brown);
    f.cone(vb, 0, y + 0.3 * s, 0, 0.42 * s, 1.5 * s, COLORS.leafDark);
  },
  pot(vb, f, y) {
    f.block(vb, 0, y, 0, 0.5, 0.4, 0.5, COLORS.orange);
    f.block(vb, 0, y + 0.4, 0, 0.62, 0.45, 0.62, COLORS.grass);
    f.block(vb, -0.15, y + 0.85, 0.12, 0.15, 0.15, 0.15, COLORS.red);
    f.block(vb, 0.16, y + 0.85, -0.1, 0.15, 0.15, 0.15, COLORS.yellow);
    f.block(vb, 0.05, y + 0.85, 0.2, 0.12, 0.12, 0.12, COLORS.pink);
  },
  arcade(vb, f, y) {
    f.block(vb, 0, y, 0, 0.8, 1.6, 0.7, COLORS.teal);
    f.box(vb, 0, y + 1.1, 0.36, 0.6, 0.45, 0.02, COLORS.black);
    f.box(vb, 0, y + 1.1, 0.37, 0.46, 0.3, 0.02, COLORS.cyan);
    f.box(vb, 0, y + 0.75, 0.42, 0.8, 0.12, 0.2, COLORS.pink);
    f.block(vb, 0, y + 1.6, 0, 0.86, 0.26, 0.76, COLORS.yellow);
  },
  cart(vb, f, y) {
    f.block(vb, 0, y + 0.2, 0, 1.6, 0.7, 0.8, COLORS.pink);
    f.box(vb, 0, y + 0.55, 0.41, 1.6, 0.12, 0.02, COLORS.cream);
    f.box(vb, -0.55, y + 0.2, 0.42, 0.3, 0.3, 0.1, COLORS.black);
    f.box(vb, 0.55, y + 0.2, 0.42, 0.3, 0.3, 0.1, COLORS.black);
    f.block(vb, -0.7, y + 0.9, 0, 0.08, 0.95, 0.08, COLORS.cream);
    f.block(vb, 0.7, y + 0.9, 0, 0.08, 0.95, 0.08, COLORS.cream);
    f.block(vb, 0, y + 1.85, 0, 1.4, 0.32, 0.5, COLORS.tan);
    f.block(vb, 0, y + 2.0, 0, 1.65, 0.26, 0.3, COLORS.red);
    f.block(vb, 0, y + 2.26, 0, 1.2, 0.05, 0.12, COLORS.yellow);
  },
  cactus(vb, f, y, rand) {
    const h = 1.2 + rand() * 0.8;
    f.block(vb, 0, y, 0, 0.36, h, 0.36, COLORS.leaf);
    f.block(vb, -0.3, y + h * 0.4, 0, 0.26, 0.18, 0.2, COLORS.leaf);
    f.block(vb, -0.38, y + h * 0.4, 0, 0.18, 0.5, 0.18, COLORS.leaf);
    f.block(vb, 0.3, y + h * 0.55, 0, 0.26, 0.18, 0.2, COLORS.leaf);
    f.block(vb, 0.38, y + h * 0.55, 0, 0.18, 0.4, 0.18, COLORS.leaf);
    f.block(vb, 0, y + h, 0, 0.14, 0.14, 0.14, COLORS.pink);
  },
  palm(vb, f, y, rand) {
    const h = 1.8 + rand() * 0.6;
    for (let i = 0; i < 5; i++) f.block(vb, i * 0.04, y + (i * h) / 5, 0, 0.22, h / 5 + 0.02, 0.22, i % 2 ? COLORS.brown : COLORS.tan);
    f.box(vb, 0.2, y + h, 0, 1.4, 0.1, 0.3, COLORS.leaf);
    f.box(vb, 0.2, y + h, 0, 0.3, 0.1, 1.2, COLORS.leaf);
    f.box(vb, 0.2, y + h + 0.1, 0, 0.8, 0.1, 0.8, COLORS.grass);
    f.block(vb, 0.1, y + h - 0.25, 0.1, 0.16, 0.16, 0.16, COLORS.brown);
  },
  lollipop(vb, f, y, rand) {
    const h = 1.15 + rand() * 0.4;
    const colors = [COLORS.pink, COLORS.purple, COLORS.cyan, COLORS.yellow];
    const candy = colors[Math.floor(rand() * colors.length)];
    const cell = 0.14;
    const radius = 3;
    const head = y + h + radius * cell;
    const spin = rand() * Math.PI * 2;
    f.block(vb, 0, y, 0, 0.1, h, 0.1, COLORS.cream);
    // A round disc, coloured by a spiral so the swirl stays readable at this size.
    for (let iy = -radius; iy <= radius; iy++) {
      for (let ix = -radius; ix <= radius; ix++) {
        const r2 = ix * ix + iy * iy;
        if (r2 > radius * radius + 1) continue;
        const swirl = Math.atan2(iy, ix) + spin + Math.sqrt(r2) * 1.4;
        const cream = Math.floor((swirl + Math.PI) / Math.PI) % 2 === 0;
        f.box(vb, ix * cell, head + iy * cell, 0, cell * 0.98, cell * 0.98, 0.16, cream ? COLORS.cream : candy);
      }
    }
  },
  maple(vb, f, y, rand) {
    const s = 0.9 + rand() * 0.3;
    const crown = rand() < 0.5 ? COLORS.maple : COLORS.orange;
    f.block(vb, 0, y, 0, 0.26 * s, 0.7 * s, 0.26 * s, COLORS.brown);
    f.block(vb, 0, y + 0.6 * s, 0, 1.05 * s, 0.6 * s, 1.05 * s, crown);
    f.block(vb, 0, y + 1.15 * s, 0, 0.75 * s, 0.5 * s, 0.75 * s, COLORS.yellow);
    f.block(vb, 0.3 * s, y + 1.6 * s, 0.1, 0.3 * s, 0.3 * s, 0.3 * s, crown);
  },
  pumpkin(vb, f, y, rand) {
    const s = 0.8 + rand() * 0.4;
    f.block(vb, 0, y, 0, 0.7 * s, 0.5 * s, 0.6 * s, COLORS.orange);
    f.block(vb, 0, y + 0.04, 0, 0.5 * s, 0.44 * s, 0.7 * s, COLORS.maple);
    f.block(vb, 0, y + 0.5 * s, 0, 0.1, 0.18, 0.1, COLORS.leafDark);
  },
  haystack(vb, f, y) {
    f.block(vb, 0, y, 0, 1.1, 0.5, 0.8, COLORS.yellow);
    f.block(vb, 0, y + 0.5, 0, 0.8, 0.4, 0.6, COLORS.tan);
    f.box(vb, 0, y + 0.25, 0.41, 1.12, 0.08, 0.02, COLORS.brown);
  },
  mushroom(vb, f, y, rand) {
    const h = 0.5 + rand() * 0.4;
    f.block(vb, 0, y, 0, 0.22, h, 0.22, COLORS.cream);
    f.block(vb, 0, y + h, 0, 0.8, 0.3, 0.8, COLORS.red);
    f.box(vb, -0.18, y + h + 0.31, 0.12, 0.14, 0.02, 0.14, COLORS.cream);
    f.box(vb, 0.2, y + h + 0.31, -0.1, 0.12, 0.02, 0.12, COLORS.cream);
  },
  snowpine(vb, f, y, rand) {
    const s = 0.9 + rand() * 0.35;
    f.block(vb, 0, y, 0, 0.2 * s, 0.4 * s, 0.2 * s, COLORS.brown);
    f.cone(vb, 0, y + 0.3 * s, 0, 0.46 * s, 1.1 * s, COLORS.leafDark);
    f.cone(vb, 0, y + 0.9 * s, 0, 0.34 * s, 0.9 * s, COLORS.snow);
  },
  snowman(vb, f, y) {
    f.block(vb, 0, y, 0, 0.7, 0.6, 0.7, COLORS.snow);
    f.block(vb, 0, y + 0.6, 0, 0.5, 0.45, 0.5, COLORS.snow);
    f.block(vb, 0, y + 1.05, 0, 0.36, 0.34, 0.36, COLORS.snowShade);
    f.box(vb, -0.08, y + 1.26, 0.19, 0.06, 0.06, 0.02, COLORS.black);
    f.box(vb, 0.08, y + 1.26, 0.19, 0.06, 0.06, 0.02, COLORS.black);
    f.box(vb, 0, y + 1.18, 0.26, 0.06, 0.06, 0.16, COLORS.orange);
    f.box(vb, 0, y + 0.98, 0, 0.54, 0.08, 0.54, COLORS.red);
    f.block(vb, 0, y + 1.39, 0, 0.44, 0.06, 0.44, COLORS.black);
    f.block(vb, 0, y + 1.45, 0, 0.26, 0.26, 0.26, COLORS.black);
  },
  iceblock(vb, f, y, rand) {
    const s = 0.6 + rand() * 0.4;
    f.block(vb, 0, y, 0, s, s, s, COLORS.ice);
    f.block(vb, 0.12, y + s, -0.08, s * 0.6, s * 0.6, s * 0.6, COLORS.iceDark);
  },
  obelisk(vb, f, y, rand) {
    const h = 1.6 + rand() * 0.8;
    f.block(vb, 0, y, 0, 0.6, 0.2, 0.6, COLORS.sandstoneDark);
    f.block(vb, 0, y + 0.2, 0, 0.4, h, 0.4, COLORS.sandstone);
    f.box(vb, 0, y + 0.2 + h * 0.6, 0.21, 0.18, 0.18, 0.02, COLORS.teal);
    f.cone(vb, 0, y + 0.2 + h, 0, 0.28, 0.4, COLORS.gold);
  },
  urn(vb, f, y) {
    f.block(vb, 0, y, 0, 0.36, 0.14, 0.36, COLORS.rust);
    f.block(vb, 0, y + 0.14, 0, 0.56, 0.5, 0.56, COLORS.maple);
    f.box(vb, 0, y + 0.4, 0, 0.58, 0.08, 0.58, COLORS.gold);
    f.block(vb, 0, y + 0.64, 0, 0.3, 0.2, 0.3, COLORS.rust);
  },
  rock(vb, f, y, rand) {
    const s = 0.7 + rand() * 0.5;
    f.block(vb, 0, y, 0, 0.9 * s, 0.5 * s, 0.8 * s, COLORS.stoneDark);
    f.block(vb, 0.1, y + 0.5 * s, 0, 0.6 * s, 0.35 * s, 0.5 * s, COLORS.stone);
  },
  topiary(vb, f, y, rand) {
    const h = 0.5 + rand() * 0.5;
    f.block(vb, 0, y, 0, 0.5, 0.36, 0.5, COLORS.terracotta);
    f.box(vb, 0, y + 0.36, 0, 0.58, 0.08, 0.58, COLORS.creamDark);
    f.block(vb, 0, y + 0.4, 0, 0.08, h, 0.08, COLORS.brown);
    limeBall(vb, f, y + 0.4 + h + 0.35, 0.36);
    if (rand() < 0.5) limeBall(vb, f, y + 0.4 + h + 0.95, 0.22);
  },
  shrub(vb, f, y, rand) {
    const r = 0.3 + rand() * 0.14;
    limeBall(vb, f, y + r, r);
    limeBall(vb, f, y + r * 0.7, r * 0.7, 0.45);
  },
  pottree(vb, f, y, rand) {
    const s = 0.8 + rand() * 0.3;
    const pot = [COLORS.pink, COLORS.teal, COLORS.yellow, COLORS.terracotta][Math.floor(rand() * 4)];
    f.block(vb, 0, y, 0, 0.44, 0.34, 0.44, pot);
    f.box(vb, 0, y + 0.3, 0, 0.5, 0.08, 0.5, COLORS.cream);
    f.block(vb, 0, y + 0.34, 0, 0.08, 0.3 * s, 0.08, COLORS.brown);
    f.cone(vb, 0, y + 0.5 * s, 0, 0.3 * s, 0.9 * s, COLORS.grassDark);
    f.block(vb, 0, y + 1.35 * s, 0, 0.1, 0.1, 0.1, COLORS.yellow);
  },
  tiki(vb, f, y) {
    f.block(vb, 0, y, 0, 0.55, 1.5, 0.45, COLORS.brown);
    f.box(vb, 0, y + 1.2, 0.23, 0.4, 0.1, 0.02, COLORS.yellow);
    f.box(vb, -0.12, y + 1.02, 0.24, 0.1, 0.1, 0.02, COLORS.lava);
    f.box(vb, 0.12, y + 1.02, 0.24, 0.1, 0.1, 0.02, COLORS.lava);
    f.box(vb, 0, y + 0.66, 0.24, 0.3, 0.12, 0.02, COLORS.cream);
    f.block(vb, 0, y + 1.5, 0, 0.7, 0.2, 0.55, COLORS.grass);
  },
};

/** One decor prop on its own, facing +z, for previews such as the assets page. */
export function buildDecorPiece(kind: DecorKind, rand: Rand = () => 0.45): THREE.Group {
  const vb = new VoxelBuilder();
  DECOR[kind](vb, new Frame(0, 0, 0), 0, rand);
  return vb.build();
}

function pickDecor(skin: Skin, rand: Rand): DecorKind {
  const entries = Object.entries(skin.decor) as [DecorKind, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r <= 0) return kind;
  }
  return entries[0][0];
}

/** Props line the inside of each terrace, against the wall of the tier above (never in front of the player). */
function buildDecor(vb: VoxelBuilder, level: Level, skin: Skin, gaps: readonly SpanDef[], rand: Rand): void {
  const def = level.def;
  const keepClear: { ring: number; side: number; offset: number; pad: number }[] = [
    ...def.ladders.map((l) => ({ ...l, pad: 1.7 })),
    { ...def.drum, pad: 2 },
    ...def.locks.flatMap((l) => (l.kind === 'switch' ? [{ ...l.switchAt, pad: 1.4 }] : [])),
    ...[...gaps, ...def.conveyors].map((g) => ({ ...g, pad: g.width / 2 + 0.8 })),
  ];

  for (let k = 0; k < level.ringCount; k++) {
    const inner = level.tierHalf(k + 1);
    const y = level.tierTop(k);
    for (let side = 0; side < 4; side++) {
      let offset = -inner + 1.2 + rand();
      while (offset < inner - 1.2) {
        const blocked = keepClear.some((c) => c.ring === k && c.side === side && Math.abs(c.offset - offset) < c.pad);
        if (!blocked) {
          const kind = pickDecor(skin, rand);
          if (kind === 'cart') {
            if (offset + 1.8 < inner - 1.2) {
              DECOR.cart(vb, new Frame(side, inner + 0.55, offset + 0.6), y, rand);
              offset += 1.4;
            }
          } else {
            DECOR[kind](vb, new Frame(side, inner + 0.55, offset), y, rand);
          }
        }
        offset += 1.8 + rand() * 1.6;
      }
    }
  }
}

const LANTERN_SPACING = 5;

/** Wall lanterns along the back of each terrace; they only light up at dusk and night. */
function buildLanterns(vb: VoxelBuilder, level: Level): void {
  const def = level.def;
  const lanternY = Math.min(2.3, def.tierHeight - 0.5);
  for (let k = 0; k < level.ringCount; k++) {
    const inner = level.tierHalf(k + 1);
    const y = level.tierTop(k) + lanternY;
    for (let side = 0; side < 4; side++) {
      for (let offset = -inner + 2.5; offset <= inner - 2.5; offset += LANTERN_SPACING) {
        if (def.ladders.some((l) => l.ring === k && l.side === side && Math.abs(l.offset - offset) < 1.2)) continue;
        const f = new Frame(side, inner, offset);
        f.box(vb, 0, y, 0.18, 0.08, 0.08, 0.36, COLORS.charcoal);
        f.box(vb, 0, y - 0.02, 0.36, 0.34, 0.06, 0.34, COLORS.charcoal);
        f.glow(vb, 0, y - 0.2, 0.36, 0.26, 0.3, 0.26, COLORS.yellow);
      }
    }
  }
}

/** Spiked corner posts and a rainbow banner behind the boss. */
function buildSummit(vb: VoxelBuilder, level: Level): void {
  const y = level.tierTop(level.summitTier);
  const c = level.def.summitHalf - 0.4;
  for (const [x, z] of [
    [c, c],
    [c, -c],
    [-c, c],
    [-c, -c],
  ]) {
    vb.block(x, y, z, 0.5, 0.9, 0.5, COLORS.cream);
    vb.cone(x, y + 0.9, z, 0.25, 0.8, COLORS.creamDark);
  }
  const bands = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.grass, COLORS.teal, COLORS.blue, COLORS.purple];
  bands.forEach((color, i) => {
    vb.block(BOSS_POS.x - 1.6, y, -1.05 + i * 0.35, 0.3, 3, 0.35, color);
  });
  vb.block(BOSS_POS.x - 1.6, y + 3, 0, 0.4, 0.3, 2.6, COLORS.cream);
}

/** Pink drum at the edge of the ground ring; barrels disappear into it (and light fires). */
function buildDrum(vb: VoxelBuilder, level: Level): void {
  const drum = level.def.drum;
  const f = new Frame(drum.side, level.ringRadius(drum.ring) + 0.95, drum.offset);
  const y = level.tierTop(drum.ring);
  f.block(vb, 0, y, 0, 1.0, 1.2, 1.0, COLORS.pink);
  f.box(vb, 0, y + 0.3, 0, 1.04, 0.1, 1.04, COLORS.black);
  f.box(vb, 0, y + 0.9, 0, 1.04, 0.1, 1.04, COLORS.black);
  f.block(vb, -0.2, y + 1.2, 0.1, 0.28, 0.4, 0.28, COLORS.orange);
  f.block(vb, 0.18, y + 1.2, -0.12, 0.22, 0.6, 0.22, COLORS.yellow);
  f.block(vb, 0.04, y + 1.2, 0.25, 0.18, 0.28, 0.18, COLORS.red);
}
