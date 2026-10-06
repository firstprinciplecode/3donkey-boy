import { COLORS } from '../config';
import { SKINS } from '../levels/skins';
import type { LevelDef } from '../levels/types';

export interface SwatchGroup {
  title: string;
  colors: number[];
}

const GROUPS = ['Greens', 'Yellows and oranges', 'Reds and pinks', 'Purples', 'Blues and teals', 'Sand and browns', 'Whites, greys and blacks'] as const;
type Group = (typeof GROUPS)[number];

/**
 * Every named colour plus every theme's floor and wall colours, plus anything this level already
 * uses, sorted into colour families from light to dark.
 */
export function swatchGroups(def: LevelDef): SwatchGroup[] {
  const all = new Set<number>(Object.values(COLORS));
  for (const skin of Object.values(SKINS)) {
    for (const style of skin.tiers) for (const color of [...style.top, ...style.side]) all.add(color);
  }
  for (const terrace of def.tiers ?? []) for (const color of [...terrace.top, ...terrace.side]) all.add(color);

  const buckets = new Map<Group, { color: number; l: number }[]>(GROUPS.map((group) => [group, []]));
  for (const color of all) {
    const hsl = toHsl(color);
    buckets.get(family(hsl))?.push({ color, l: hsl.l });
  }
  return GROUPS.map((title) => ({
    title,
    colors: (buckets.get(title) ?? []).sort((a, b) => b.l - a.l).map((entry) => entry.color),
  })).filter((group) => group.colors.length > 0);
}

function family({ h, s, l }: { h: number; s: number; l: number }): Group {
  if (s < 0.14 || l > 0.95 || l < 0.13) return 'Whites, greys and blacks';
  if (h >= 12 && h < 55 && (s < 0.5 || l < 0.42)) return 'Sand and browns';
  if (h < 12 || h >= 325) return 'Reds and pinks';
  if (h < 65) return 'Yellows and oranges';
  if (h < 165) return 'Greens';
  if (h < 255) return 'Blues and teals';
  if (h < 295) return 'Purples';
  return 'Reds and pinks';
}

function toHsl(color: number): { h: number; s: number; l: number } {
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}
