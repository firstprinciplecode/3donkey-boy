import { COLORS, RAINBOW } from '../config';
import type { SkinName, TilePattern } from './types';

export type DecorKind =
  | 'tree'
  | 'pine'
  | 'pot'
  | 'arcade'
  | 'cart'
  | 'cactus'
  | 'palm'
  | 'lollipop'
  | 'maple'
  | 'pumpkin'
  | 'haystack'
  | 'mushroom'
  | 'snowpine'
  | 'snowman'
  | 'iceblock'
  | 'obelisk'
  | 'urn'
  | 'rock'
  | 'tiki'
  | 'topiary'
  | 'shrub'
  | 'pottree';

export type CrawlerLook = 'hedgehog' | 'penguin' | 'snake' | 'scorpion';
export type TotemLook = 'spike' | 'gummy' | 'cactus' | 'scarecrow' | 'yeti' | 'mummy' | 'golem';
export type DropLook = 'acorn' | 'icicle' | 'spike' | 'lavarock';
export type RelicLook = 'pumpkin' | 'idol' | 'present';
export type ProjectileLook = 'barrel' | 'snowball' | 'tumbleweed' | 'pumpkin' | 'lavarock' | 'boulder' | 'gumball';

/**
 * How a terrace top uses its colours:
 * - `checker`: two colours alternating (more than two cycle diagonally, like the rainbow ring)
 * - `gingham`: light, mid and dark tints of one colour woven like a picnic cloth
 * - `speckle`: mostly the first colour, scattered with the second and a rare third
 * - `rows`: bands that follow the terrace from its edge to the wall behind it
 * - `border`: a checker of the first two colours framed by the third along both edges
 * - `stripes`: awning stripes running across the terrace, from its edge to the wall
 */
export interface TierStyle {
  top: readonly number[];
  side: readonly number[];
  pattern?: TilePattern;
}

export interface Skin {
  /** One style per tier from the ground up; repeats if the pyramid is taller. */
  tiers: readonly TierStyle[];
  /** Horizontal bands on the ground tier's wall, like the poster's floating island. */
  baseBands: readonly number[];
  windowColor: number;
  decor: Partial<Record<DecorKind, number>>;
  clouds: readonly number[];
  towers: readonly (readonly [number, number])[];
  towerWindow: number;
  island: { top: number; bands: readonly number[] };
  balloons: readonly number[];
  crawler: CrawlerLook;
  /** Look of the level's hopping totems; size, hitbox and hop are the same for all of them. */
  totem: TotemLook;
  drop: DropLook;
  /** What the boss throws; only the look changes, the physics and hitbox stay the same. */
  projectile: ProjectileLook;
  relic: { look: RelicLook; name: string };
}

const STYLE = {
  grass: { top: [0xbfe56a, COLORS.grass, COLORS.grassDark], side: [COLORS.stone, COLORS.stoneDark], pattern: 'gingham' },
  tile: { top: [COLORS.cream, COLORS.creamDark, COLORS.cyan], side: [COLORS.teal, COLORS.cyan], pattern: 'border' },
  checker: { top: [COLORS.charcoal, COLORS.grey], side: [COLORS.pink, COLORS.magenta] },
  rainbow: { top: RAINBOW, side: [COLORS.charcoal, COLORS.grey] },
  candy: { top: [COLORS.cream, COLORS.pink], side: [0xffb3cf, COLORS.cream], pattern: 'stripes' },
  mint: { top: [COLORS.cream, COLORS.mint, COLORS.mintDark], side: [COLORS.purple, 0xb48ef0], pattern: 'gingham' },
  sand: { top: [COLORS.sand, 0xcbb788, 0xeadcb6], side: [COLORS.tan, COLORS.orange], pattern: 'speckle' },
  brick: { top: [COLORS.creamDark, COLORS.sand], side: [0xc4553a, 0xa8432c], pattern: 'rows' },
  leaves: { top: [COLORS.orange, COLORS.maple, COLORS.yellow], side: [COLORS.brown, 0x5e3920], pattern: 'speckle' },
  harvest: { top: [COLORS.yellow, COLORS.tan], side: [COLORS.rust, COLORS.maple], pattern: 'rows' },
  moss: { top: [COLORS.grassDark, COLORS.leaf, COLORS.grass], side: [COLORS.stone, COLORS.stoneDark], pattern: 'speckle' },
  snow: { top: [COLORS.snow, COLORS.snowShade, 0xffffff], side: [COLORS.iceDark, COLORS.ice], pattern: 'speckle' },
  frost: { top: [COLORS.snow, COLORS.ice, COLORS.iceDark], side: [COLORS.blue, 0x5a9ae0], pattern: 'border' },
  granite: { top: [COLORS.snow, COLORS.snowShade], side: [COLORS.grey, COLORS.charcoal], pattern: 'rows' },
  sandstone: { top: [COLORS.sandstone, COLORS.sand], side: [COLORS.sandstoneDark, 0xa97c45], pattern: 'rows' },
  tomb: { top: [COLORS.gold, COLORS.sandstone, COLORS.teal], side: [COLORS.teal, 0x1f7f80], pattern: 'border' },
  basalt: { top: [COLORS.basalt, COLORS.basaltDark, COLORS.rust], side: [COLORS.lava, COLORS.rust], pattern: 'speckle' },
  beach: { top: [COLORS.sand, 0xf2e2b8], side: [COLORS.basalt, COLORS.basaltDark], pattern: 'stripes' },
  jungle: { top: [COLORS.lime, COLORS.grass, COLORS.leaf], side: [COLORS.basaltDark, COLORS.basalt], pattern: 'gingham' },
} satisfies Record<string, TierStyle>;

export const SKINS: Record<SkinName, Skin> = {
  meadow: {
    tiers: [STYLE.grass, STYLE.tile, STYLE.checker, STYLE.grass, STYLE.rainbow],
    baseBands: RAINBOW,
    windowColor: COLORS.cyan,
    decor: { tree: 3, pine: 2, pot: 2, arcade: 1, cart: 1, topiary: 2, shrub: 2, pottree: 2 },
    clouds: [COLORS.cream, 0xffffff],
    towers: [
      [COLORS.cream, COLORS.creamDark],
      [COLORS.black, COLORS.charcoal],
      [COLORS.cream, COLORS.cyan],
    ],
    towerWindow: COLORS.pink,
    island: { top: COLORS.grass, bands: RAINBOW },
    balloons: [COLORS.red, COLORS.yellow, COLORS.teal],
    crawler: 'hedgehog',
    totem: 'spike',
    drop: 'acorn',
    projectile: 'barrel',
    relic: { look: 'idol', name: 'idol' },
  },
  candy: {
    tiers: [STYLE.candy, STYLE.mint, STYLE.checker, STYLE.candy, STYLE.mint, STYLE.rainbow],
    baseBands: [COLORS.pink, COLORS.cream, COLORS.purple, COLORS.cream],
    windowColor: COLORS.yellow,
    decor: { lollipop: 4, pot: 2, arcade: 2, cart: 1, tree: 1, topiary: 2, pottree: 1 },
    clouds: [0xffe3f0, 0xffffff],
    towers: [
      [COLORS.pink, 0xffb3cf],
      [COLORS.purple, 0xb48ef0],
      [COLORS.cream, COLORS.cyan],
    ],
    towerWindow: COLORS.yellow,
    island: { top: COLORS.cream, bands: [COLORS.pink, COLORS.cream, COLORS.purple] },
    balloons: [COLORS.pink, COLORS.purple, COLORS.cyan],
    crawler: 'hedgehog',
    totem: 'gummy',
    drop: 'acorn',
    projectile: 'gumball',
    relic: { look: 'present', name: 'present' },
  },
  desert: {
    tiers: [STYLE.sand, STYLE.brick, STYLE.tile, STYLE.sand, STYLE.brick, STYLE.checker, STYLE.rainbow],
    baseBands: [COLORS.orange, COLORS.tan, COLORS.sand, 0xc4553a],
    windowColor: COLORS.teal,
    decor: { cactus: 4, palm: 2, pot: 1, arcade: 1, cart: 1, pottree: 2 },
    clouds: [0xfff1dc, 0xffffff],
    towers: [
      [COLORS.creamDark, COLORS.sand],
      [COLORS.black, COLORS.charcoal],
      [COLORS.tan, COLORS.orange],
    ],
    towerWindow: COLORS.teal,
    island: { top: COLORS.sand, bands: [COLORS.orange, COLORS.tan, 0xc4553a] },
    balloons: [COLORS.red, COLORS.orange, COLORS.blue],
    crawler: 'snake',
    totem: 'cactus',
    drop: 'spike',
    projectile: 'tumbleweed',
    relic: { look: 'idol', name: 'idol' },
  },
  autumn: {
    tiers: [STYLE.moss, STYLE.leaves, STYLE.harvest, STYLE.leaves, STYLE.checker, STYLE.rainbow],
    baseBands: [COLORS.maple, COLORS.orange, COLORS.yellow, COLORS.brown],
    windowColor: COLORS.yellow,
    decor: { maple: 4, pumpkin: 3, haystack: 2, mushroom: 2, pine: 1, cart: 1, shrub: 1 },
    clouds: [0xfff0dc, 0xffffff],
    towers: [
      [COLORS.cream, COLORS.creamDark],
      [COLORS.rust, COLORS.maple],
      [COLORS.black, COLORS.charcoal],
    ],
    towerWindow: COLORS.yellow,
    island: { top: COLORS.orange, bands: [COLORS.brown, COLORS.maple, COLORS.yellow] },
    balloons: [COLORS.maple, COLORS.yellow, COLORS.teal],
    crawler: 'hedgehog',
    totem: 'scarecrow',
    drop: 'acorn',
    projectile: 'pumpkin',
    relic: { look: 'pumpkin', name: 'pumpkin' },
  },
  winter: {
    tiers: [STYLE.snow, STYLE.frost, STYLE.granite, STYLE.snow, STYLE.frost, STYLE.rainbow],
    baseBands: [COLORS.snow, COLORS.ice, COLORS.iceDark, COLORS.blue],
    windowColor: COLORS.yellow,
    decor: { snowpine: 4, snowman: 3, iceblock: 2, pot: 1, arcade: 1 },
    clouds: [0xffffff, COLORS.snowShade],
    towers: [
      [COLORS.snow, COLORS.ice],
      [COLORS.black, COLORS.charcoal],
      [COLORS.snowShade, COLORS.iceDark],
    ],
    towerWindow: COLORS.yellow,
    island: { top: COLORS.snow, bands: [COLORS.ice, COLORS.iceDark, COLORS.blue] },
    balloons: [COLORS.red, COLORS.teal, COLORS.yellow],
    crawler: 'penguin',
    totem: 'yeti',
    drop: 'icicle',
    projectile: 'snowball',
    relic: { look: 'present', name: 'present' },
  },
  tomb: {
    tiers: [STYLE.sandstone, STYLE.tomb, STYLE.sandstone, STYLE.tomb, STYLE.checker, STYLE.sandstone, STYLE.rainbow],
    baseBands: [COLORS.gold, COLORS.sandstone, COLORS.teal, COLORS.sandstoneDark],
    windowColor: COLORS.lava,
    decor: { obelisk: 3, urn: 3, palm: 2, cactus: 2, rock: 1, pottree: 1 },
    clouds: [0xfff4e0, 0xffffff],
    towers: [
      [COLORS.sandstone, COLORS.sandstoneDark],
      [COLORS.teal, 0x1f7f80],
      [COLORS.black, COLORS.charcoal],
    ],
    towerWindow: COLORS.gold,
    island: { top: COLORS.sandstone, bands: [COLORS.gold, COLORS.teal, COLORS.sandstoneDark] },
    balloons: [COLORS.gold, COLORS.teal, COLORS.red],
    crawler: 'snake',
    totem: 'mummy',
    drop: 'spike',
    projectile: 'boulder',
    relic: { look: 'idol', name: 'idol' },
  },
  volcano: {
    tiers: [STYLE.beach, STYLE.jungle, STYLE.basalt, STYLE.jungle, STYLE.basalt, STYLE.checker, STYLE.rainbow],
    baseBands: [COLORS.lava, COLORS.orange, COLORS.basalt, COLORS.basaltDark],
    windowColor: COLORS.lava,
    decor: { palm: 4, tiki: 3, rock: 2, pot: 1, cart: 1, shrub: 2 },
    clouds: [0xffe6d0, 0xd9d2dc],
    towers: [
      [COLORS.basalt, COLORS.basaltDark],
      [COLORS.lava, COLORS.rust],
      [COLORS.cream, COLORS.creamDark],
    ],
    towerWindow: COLORS.lava,
    island: { top: COLORS.grass, bands: [COLORS.basalt, COLORS.lava, COLORS.basaltDark] },
    balloons: [COLORS.lava, COLORS.yellow, COLORS.teal],
    crawler: 'scorpion',
    totem: 'golem',
    drop: 'lavarock',
    projectile: 'lavarock',
    relic: { look: 'idol', name: 'idol' },
  },
};
