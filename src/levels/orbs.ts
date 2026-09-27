import { ORBS } from '../config';
import type { Level, Spot } from '../level';
import { seededRandom } from '../utils';

/**
 * Bonus bubbles hover at jump height along each ring. They're generated (seeded by the level
 * name, so every visit matches) and keep clear of ladders, the drum, the start and other items.
 */
export function orbSpots(level: Level): Spot[] {
  const def = level.def;
  let seed = 7;
  for (let i = 0; i < def.name.length; i++) seed = (seed * 31 + def.name.charCodeAt(i)) >>> 0;
  const rand = seededRandom(seed);
  const avoid: { ring: number; side: number; offset: number; pad: number }[] = [
    ...def.ladders.flatMap((l) => [
      { ...l, pad: 1.6 },
      { ring: l.ring + 1, side: l.side, offset: l.offset, pad: 1.6 },
    ]),
    ...def.items.map((it) => ({ ...it.spot, pad: 1.4 })),
    { ...def.drum, pad: 2.5 },
    { ...def.playerStart, pad: 2 },
  ];
  const spots: Spot[] = [];
  for (let ring = 0; ring < level.ringCount; ring++) {
    const r = level.ringRadius(ring);
    for (let n = 0, tries = 0; n < ORBS.perRing && tries < 40; tries++) {
      const side = Math.floor(rand() * 4);
      const offset = Math.round((rand() * 2 - 1) * (r - 1.5) * 2) / 2;
      const candidate = { ring, side, offset };
      const clash = [...avoid, ...spots.map((s) => ({ ...s, pad: 3 }))].some(
        (a) => a.ring === ring && a.side === side && Math.abs(a.offset - offset) < a.pad,
      );
      if (clash) continue;
      spots.push(candidate);
      n++;
    }
  }
  return spots;
}
