import { COLORS, RAINBOW } from '../config';
import type { SkinName } from './types';

export type DecorKind = 'tree' | 'pine' | 'pot' | 'arcade' | 'cart' | 'cactus' | 'palm' | 'lollipop';

export interface TierStyle {
  /** Alternating colours for the terrace top (rainbow styles cycle through all of them). */
  top: readonly number[];
  side: readonly number[];
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
}

const STYLE = {
  grass: { top: [COLORS.grass, COLORS.grassDark], side: [COLORS.stone, COLORS.stoneDark] },
  tile: { top: [COLORS.cream, COLORS.creamDark], side: [COLORS.teal, COLORS.cyan] },
  checker: { top: [COLORS.charcoal, COLORS.grey], side: [COLORS.pink, COLORS.magenta] },
  rainbow: { top: RAINBOW, side: [COLORS.charcoal, COLORS.grey] },
  candy: { top: [COLORS.cream, COLORS.pink], side: [0xffb3cf, COLORS.cream] },
  mint: { top: [COLORS.cyan, COLORS.cream], side: [COLORS.purple, 0xb48ef0] },
  sand: { top: [COLORS.sand, 0xcbb788], side: [COLORS.tan, COLORS.orange] },
  brick: { top: [COLORS.creamDark, COLORS.sand], side: [0xc4553a, 0xa8432c] },
} satisfies Record<string, TierStyle>;

export const SKINS: Record<SkinName, Skin> = {
  meadow: {
    tiers: [STYLE.grass, STYLE.tile, STYLE.checker, STYLE.grass, STYLE.rainbow],
    baseBands: RAINBOW,
    windowColor: COLORS.cyan,
    decor: { tree: 3, pine: 2, pot: 3, arcade: 1, cart: 1 },
    clouds: [COLORS.cream, 0xffffff],
    towers: [
      [COLORS.cream, COLORS.creamDark],
      [COLORS.black, COLORS.charcoal],
      [COLORS.cream, COLORS.cyan],
    ],
    towerWindow: COLORS.pink,
    island: { top: COLORS.grass, bands: RAINBOW },
    balloons: [COLORS.red, COLORS.yellow, COLORS.teal],
  },
  candy: {
    tiers: [STYLE.candy, STYLE.mint, STYLE.checker, STYLE.candy, STYLE.mint, STYLE.rainbow],
    baseBands: [COLORS.pink, COLORS.cream, COLORS.purple, COLORS.cream],
    windowColor: COLORS.yellow,
    decor: { lollipop: 4, pot: 2, arcade: 2, cart: 1, tree: 1 },
    clouds: [0xffe3f0, 0xffffff],
    towers: [
      [COLORS.pink, 0xffb3cf],
      [COLORS.purple, 0xb48ef0],
      [COLORS.cream, COLORS.cyan],
    ],
    towerWindow: COLORS.yellow,
    island: { top: COLORS.cream, bands: [COLORS.pink, COLORS.cream, COLORS.purple] },
    balloons: [COLORS.pink, COLORS.purple, COLORS.cyan],
  },
  desert: {
    tiers: [STYLE.sand, STYLE.brick, STYLE.tile, STYLE.sand, STYLE.brick, STYLE.checker, STYLE.rainbow],
    baseBands: [COLORS.orange, COLORS.tan, COLORS.sand, 0xc4553a],
    windowColor: COLORS.teal,
    decor: { cactus: 4, palm: 2, pot: 2, arcade: 1, cart: 1 },
    clouds: [0xfff1dc, 0xffffff],
    towers: [
      [COLORS.creamDark, COLORS.sand],
      [COLORS.black, COLORS.charcoal],
      [COLORS.tan, COLORS.orange],
    ],
    towerWindow: COLORS.teal,
    island: { top: COLORS.sand, bands: [COLORS.orange, COLORS.tan, 0xc4553a] },
    balloons: [COLORS.red, COLORS.orange, COLORS.blue],
  },
};
