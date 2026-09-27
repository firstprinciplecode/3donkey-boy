import type { LevelDef, SpanDef, SpotDef } from './types';

const LIMITS = { maxRings: 8, maxDepth: 6, maxEntries: 64 } as const;
const EPS = 1e-6;

/**
 * Sanity checks for a level definition. Returns human-readable problems (empty = OK).
 * Run on the bundled levels in dev; anything loaded from outside (e.g. a future editor) must pass
 * this before being built, since sizes and counts are capped here.
 */
export function validateLevel(def: LevelDef): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`${def.name}: ${msg}`);

  const intIn = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!intIn(def.rings, 2, LIMITS.maxRings)) err(`rings must be an integer 2..${LIMITS.maxRings}`);
  if (!intIn(def.terraceDepth, 2, LIMITS.maxDepth)) err(`terraceDepth must be an integer 2..${LIMITS.maxDepth}`);
  if (!intIn(def.summitHalf, 3, 8)) err('summitHalf must be an integer 3..8');
  if (!intIn(def.tierHeight, 2, 8)) err('tierHeight must be an integer 2..8');
  const lists = [def.ladders, def.chutes, def.items, def.patrols, def.pits, def.crumbles, def.conveyors, def.platforms, def.locks];
  if (lists.some((l) => l.length > LIMITS.maxEntries)) err(`at most ${LIMITS.maxEntries} entries per list`);
  if (errors.length) return errors;

  const radius = (ring: number) => def.summitHalf + (def.rings - ring) * def.terraceDepth - def.terraceDepth / 2;
  const label = (s: SpotDef) => `(ring ${s.ring}, side ${s.side}, offset ${s.offset})`;

  const checkSpot = (what: string, s: SpotDef, ringMax = def.rings - 1) => {
    if (!intIn(s.ring, 0, ringMax) || !intIn(s.side, 0, 3)) return err(`${what} ${label(s)} is not on a ring`);
    if (Math.abs(s.offset) > radius(s.ring) - 1 + EPS) err(`${what} ${label(s)} is too close to a corner`);
  };

  def.ladders.forEach((l, i) => checkSpot(`ladder ${i}`, l));
  def.chutes.forEach((c) => {
    checkSpot('chute', c);
    if (c.ring === 0) err('chutes on ring 0 have nowhere to drop to');
  });
  checkSpot('playerStart', def.playerStart);
  checkSpot('drum', def.drum);
  if (def.drum.ring !== 0) err('drum must be on ring 0');
  checkSpot('barrelSpawn', def.barrelSpawn);
  def.items.forEach((it) => checkSpot(`${it.type}`, it.spot));

  const summitLadders = def.ladders.filter((l) => l.ring === def.rings - 1);
  if (summitLadders.length !== 1) err('exactly one ladder must be on the last ring (it leads to the summit)');
  for (let k = 1; k < def.rings; k++) {
    if (!def.chutes.some((c) => c.ring === k)) err(`ring ${k} has no chute, barrels would circle forever`);
  }

  const spans: [string, SpanDef][] = [
    ...def.pits.map((s) => ['pit', s] as [string, SpanDef]),
    ...def.crumbles.map((s) => ['crumble', s] as [string, SpanDef]),
    ...def.conveyors.map((s) => ['conveyor', s] as [string, SpanDef]),
    ...def.platforms.map((s) => ['platform gap', s] as [string, SpanDef]),
  ];
  for (const [what, s] of spans) {
    checkSpot(what, s);
    if (!(s.width >= 1 && s.width <= 8)) err(`${what} ${label(s)} width must be 1..8`);
    const lo = s.offset - s.width / 2;
    if (Math.abs(lo - Math.round(lo)) > EPS) err(`${what} ${label(s)} edges must be whole numbers`);
    if (Math.abs(s.offset) + s.width / 2 > radius(s.ring) - 1 + EPS) err(`${what} ${label(s)} runs into a corner`);
  }
  for (const p of def.platforms) {
    if (!(p.platformWidth > 0.8 && p.platformWidth < p.width - 0.5)) err(`platform ${label(p)} platformWidth must fit inside the gap`);
    if (!(p.period >= 1.5)) err(`platform ${label(p)} period must be at least 1.5s`);
  }

  const within = (s: SpanDef, ring: number, side: number, offset: number, pad: number) =>
    s.ring === ring && s.side === side && Math.abs(offset - s.offset) < s.width / 2 + pad;
  const blocking = spans.filter(([what]) => what !== 'conveyor');
  for (const [what, s] of blocking) {
    def.ladders.forEach((l, i) => {
      if (within(s, l.ring, l.side, l.offset, 0.8)) err(`${what} ${label(s)} covers the foot of ladder ${i}`);
      if (within(s, l.ring + 1, l.side, l.offset, 0.8)) err(`${what} ${label(s)} covers the top of ladder ${i}`);
    });
    for (const spot of [def.playerStart, def.drum]) {
      if (within(s, spot.ring, spot.side, spot.offset, 0.8)) err(`${what} ${label(s)} covers ${label(spot)}`);
    }
    for (const c of def.chutes) {
      if (within(s, c.ring - 1, c.side, c.offset, 0.8)) err(`${what} ${label(s)} is where chute ${label(c)} lands`);
    }
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const [, a] = spans[i];
      const [, b] = spans[j];
      if (within(a, b.ring, b.side, b.offset, b.width / 2)) err(`${spans[i][0]} ${label(a)} overlaps ${spans[j][0]} ${label(b)}`);
    }
  }

  const lockedLadders = new Set<number>();
  for (const lock of def.locks) {
    if (!intIn(lock.ladder, 0, def.ladders.length - 1)) {
      err(`lock refers to missing ladder ${lock.ladder}`);
      continue;
    }
    if (lockedLadders.has(lock.ladder)) err(`ladder ${lock.ladder} has two locks`);
    lockedLadders.add(lock.ladder);
    if (lock.kind === 'switch') checkSpot('switch', lock.switchAt);
    if (lock.kind === 'key' && !def.items.some((it) => it.type === 'key')) err('key lock without a key item');
  }
  return errors;
}
