import { squareCoords } from '../level';
import { SKINS } from '../levels/skins';
import type { ItemType, LevelDef, NeonWallDef, PatrolDef, SpanDef, SpotDef, TerracePaint, TilePattern } from '../levels/types';

const SIDES = ['south', 'east', 'north', 'west'] as const;
const NEAR = 0.8;

export type Tool =
  | 'ladder'
  | 'chute'
  | 'pit'
  | 'crumble'
  | 'conveyor'
  | 'platform'
  | 'ice'
  | 'spring'
  | 'vine'
  | 'jet'
  | 'drop'
  | 'start'
  | 'drum'
  | ItemType;

export type Piece =
  | { kind: 'ladder' | 'chute' | 'item' | 'pit' | 'crumble' | 'conveyor' | 'platform' | 'ice' | 'spring' | 'vine' | 'jet' | 'drop' | 'patrol' | 'crawler' | 'totem'; index: number }
  | { kind: 'start' | 'drum' }
  | { kind: 'switch'; index: number };

type SpanKey = 'pits' | 'crumbles' | 'conveyors' | 'platforms' | 'ice';
type PatrolKey = 'patrols' | 'crawlers' | 'totems';

const SPAN_KEYS: readonly SpanKey[] = ['pits', 'crumbles', 'conveyors', 'platforms', 'ice'];

/** `snap` is the grid step along the walkway, such as 1 or 0.5. */
export function spotOnRing(ring: number, x: number, z: number, snap = 1): SpotDef {
  const { side, offset } = squareCoords(x, z);
  return { ring, side, offset: snapTo(offset, snap) };
}

export function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step + 0;
}

/** Span edges must land on whole cells, so the centre snaps to whole or half cells by width. */
export function snapSpan(offset: number, width: number): number {
  return Math.round(offset - width / 2) + width / 2;
}

export function sideName(side: number): string {
  return SIDES[side] ?? 'south';
}

export function spotText(spot: SpotDef): string {
  return `Ring ${spot.ring + 1}, ${SIDES[spot.side]} side, offset ${spot.offset}`;
}

export function terraceView(def: LevelDef, tier: number): TerracePaint {
  const painted = def.tiers?.[tier];
  if (painted) return painted;
  const style = SKINS[def.skin].tiers[tier % SKINS[def.skin].tiers.length];
  return { top: [...style.top], side: [...style.side], pattern: style.pattern };
}

export function piecesAt(def: LevelDef, spot: SpotDef): Piece[] {
  const found: Piece[] = [];
  const add = <T extends SpotDef>(kind: Piece['kind'], list: readonly T[] | undefined) => {
    list?.forEach((entry, index) => {
      if ('width' in entry ? covers(entry as SpanDef, spot) : near(entry, spot)) found.push({ kind, index } as Piece);
    });
  };
  add('ladder', def.ladders);
  add('chute', def.chutes);
  add('item', def.items.map((item) => item.spot));
  add('pit', def.pits);
  add('crumble', def.crumbles);
  add('conveyor', def.conveyors);
  add('platform', def.platforms);
  add('ice', def.ice);
  add('spring', def.springs);
  add('vine', def.vines);
  add('jet', def.jets);
  add('drop', def.drops);
  if (near(def.playerStart, spot)) found.push({ kind: 'start' });
  if (near(def.drum, spot)) found.push({ kind: 'drum' });
  const addPatrol = (kind: 'patrol' | 'crawler' | 'totem', list: readonly PatrolDef[] | undefined) => {
    list?.forEach((patrol, index) => {
      const from = { ring: patrol.ring, side: patrol.from[0], offset: patrol.from[1] };
      const to = { ring: patrol.ring, side: patrol.to[0], offset: patrol.to[1] };
      if (near(from, spot) || near(to, spot)) found.push({ kind, index });
    });
  };
  addPatrol('patrol', def.patrols);
  addPatrol('crawler', def.crawlers);
  addPatrol('totem', def.totems);
  def.locks.forEach((lock, index) => {
    if (lock.kind === 'switch' && near(lock.switchAt, spot)) found.push({ kind: 'switch', index });
  });
  return found;
}

export function pieceLabel(def: LevelDef, piece: Piece): string {
  if (piece.kind === 'item') return label(def.items[piece.index].type);
  if (piece.kind === 'pit' || piece.kind === 'crumble' || piece.kind === 'ice') return `${label(piece.kind)}, width ${spanOf(def, piece).width}`;
  if (piece.kind === 'conveyor') return `Conveyor ${def.conveyors[piece.index].dir === 1 ? 'right' : 'left'}, width ${def.conveyors[piece.index].width}`;
  if (piece.kind === 'platform') return `Platform gap, width ${def.platforms[piece.index].width}`;
  if (piece.kind === 'ladder') return ladderLabel(def, piece.index);
  if (piece.kind === 'switch') return `Switch for ${ladderLabel(def, def.locks[piece.index].ladder)}`;
  if (piece.kind === 'patrol' || piece.kind === 'crawler' || piece.kind === 'totem') return label(piece.kind);
  return label(piece.kind);
}

export function place(def: LevelDef, spot: SpotDef, tool: Tool): void {
  if (tool === 'start') {
    def.playerStart = { ...spot };
    return;
  }
  if (tool === 'drum') {
    def.drum = { ...spot };
    return;
  }
  if (tool === 'ladder') {
    moveOrPush(def.ladders, spot);
    return;
  }
  if (tool === 'chute') {
    const onRing = def.chutes.findIndex((chute) => chute.ring === spot.ring);
    if (onRing >= 0) def.chutes[onRing] = { ...spot };
    else def.chutes.push({ ...spot });
    return;
  }
  if (tool === 'pit' || tool === 'crumble' || tool === 'conveyor' || tool === 'platform' || tool === 'ice') {
    stripCovering(def, spot);
    const at = { ...spot, offset: snapSpan(spot.offset, 2) };
    if (tool === 'pit') def.pits.push({ ...at, width: 2 });
    else if (tool === 'crumble') def.crumbles.push({ ...at, width: 2 });
    else if (tool === 'conveyor') def.conveyors.push({ ...at, width: 2, dir: -1 });
    else if (tool === 'platform') def.platforms.push({ ...at, width: 4, platformWidth: 1.6, period: 3 });
    else (def.ice ??= []).push({ ...at, width: 2 });
    return;
  }
  if (tool === 'vine') {
    const pit = def.pits.find((entry) => covers(entry, spot));
    (def.vines ??= []).push({ ...(pit ? { ring: pit.ring, side: pit.side, offset: pit.offset } : spot) });
    return;
  }
  if (tool === 'spring') {
    putSpot((def.springs ??= []), { ...spot });
    return;
  }
  if (tool === 'jet') {
    putSpot((def.jets ??= []), { ...spot, period: 3.2 });
    return;
  }
  if (tool === 'drop') {
    putSpot((def.drops ??= []), { ...spot });
    return;
  }
  if (tool === 'orb') return;
  const letters = ['letter-1', 'letter-u', 'letter-p'] as const;
  if ((letters as readonly string[]).includes(tool)) {
    const previous = def.items.findIndex((item) => item.type === tool);
    if (previous >= 0) def.items.splice(previous, 1);
  }
  const at = def.items.findIndex((item) => near(item.spot, spot));
  if (at >= 0) def.items[at] = { type: tool, spot: { ...spot } };
  else def.items.push({ type: tool, spot: { ...spot } });
}

export function removePiece(def: LevelDef, piece: Piece): void {
  if (!('index' in piece)) return;
  const index = piece.index;
  if (piece.kind === 'switch') {
    def.locks.splice(index, 1);
    return;
  }
  if (piece.kind === 'ladder') {
    def.ladders.splice(index, 1);
    def.locks = def.locks.flatMap((lock) => {
      if (lock.ladder === index) return [];
      return lock.ladder > index ? [{ ...lock, ladder: lock.ladder - 1 }] : [lock];
    });
    return;
  }
  if (piece.kind === 'chute') def.chutes.splice(index, 1);
  else if (piece.kind === 'item') def.items.splice(index, 1);
  else if (piece.kind === 'patrol') def.patrols.splice(index, 1);
  else if (piece.kind === 'crawler') def.crawlers?.splice(index, 1);
  else if (piece.kind === 'totem') def.totems?.splice(index, 1);
  else if (isSpanKind(piece.kind)) spansOf(def, piece.kind).splice(index, 1);
  else if (piece.kind === 'spring') def.springs?.splice(index, 1);
  else if (piece.kind === 'vine') def.vines?.splice(index, 1);
  else if (piece.kind === 'jet') def.jets?.splice(index, 1);
  else if (piece.kind === 'drop') def.drops?.splice(index, 1);
}

/** Grows or shrinks a span by one cell at its right-hand edge, so the left edge stays put. */
export function resizeSpan(def: LevelDef, spot: SpotDef, dir: 1 | -1): void {
  const span = coveringSpan(def, spot);
  if (!span) return;
  const width = span.width + dir;
  if (width < 1 || width > 8) return;
  span.width = width;
  span.offset += dir / 2;
  if ('platformWidth' in span && typeof span.platformWidth === 'number' && span.platformWidth >= width - 0.5) {
    span.platformWidth = Math.max(1, width - 2);
  }
}

export function flipConveyor(def: LevelDef, spot: SpotDef): void {
  const conveyor = def.conveyors.find((entry) => covers(entry, spot));
  if (conveyor) conveyor.dir = conveyor.dir === 1 ? -1 : 1;
}

export function setLadderLock(def: LevelDef, ladder: number, kind: 'none' | 'key' | 'relics' | 'switch', switchAt: SpotDef): void {
  def.locks = def.locks.filter((lock) => lock.ladder !== ladder);
  if (kind === 'none') return;
  if (kind === 'switch') def.locks.push({ kind, ladder, switchAt: { ...switchAt } });
  else def.locks.push({ kind, ladder });
}

export function addPatrol(def: LevelDef, key: PatrolKey, from: SpotDef, to: SpotDef): void {
  let start = from;
  let end = to;
  if (key === 'totems' && from.side === to.side && from.offset > to.offset) {
    start = to;
    end = from;
  }
  const patrol: PatrolDef = { ring: start.ring, from: [start.side, start.offset], to: [end.side, end.offset] };
  (def[key] ??= []).push(patrol);
}

export type Surface = 'top' | 'side';

export function paint(
  def: LevelDef,
  tier: number,
  change: { pattern?: TilePattern; surface?: Surface; slot?: number; color?: number },
): void {
  const tiers = tiersOf(def);
  const terrace = tiers[tier];
  if (!terrace) return;
  if (change.pattern) terrace.pattern = change.pattern;
  if (change.slot !== undefined && change.color !== undefined) {
    const surface = change.surface ?? 'top';
    const colors = [...terrace[surface]];
    colors[change.slot] = change.color;
    terrace[surface] = colors.filter((color) => color !== undefined);
  }
  def.tiers = tiers;
}

/** Sets or clears the neon stripes on one wall face, starting from the walls the level shows now. */
export function setNeon(def: LevelDef, current: readonly NeonWallDef[], tier: number, side: number, look: 0 | 1 | null): void {
  const others = current.filter((wall) => wall.tier !== tier || wall.side !== side);
  def.neon = look === null ? others : [...others, { tier, side, look }];
}

export const PATTERNS: readonly TilePattern[] = ['checker', 'gingham', 'speckle', 'rows', 'border', 'stripes'];

function tiersOf(def: LevelDef): TerracePaint[] {
  if (def.tiers?.length === def.rings + 1) {
    return def.tiers.map((terrace) => ({ top: [...terrace.top], side: [...terrace.side], pattern: terrace.pattern }));
  }
  const skin = SKINS[def.skin];
  return Array.from({ length: def.rings + 1 }, (_, tier) => {
    const style = skin.tiers[tier % skin.tiers.length];
    return { top: [...style.top], side: [...style.side], pattern: style.pattern };
  });
}

function ladderLabel(def: LevelDef, index: number): string {
  const lock = def.locks.find((entry) => entry.ladder === index);
  const suffix = lock ? `, ${lock.kind} lock` : '';
  return `Ladder ${index + 1}${suffix}`;
}

function spanOf(def: LevelDef, piece: Piece): SpanDef {
  if (!('index' in piece) || !isSpanKind(piece.kind)) return def.pits[0];
  return spansOf(def, piece.kind)[piece.index];
}

function coveringSpan(def: LevelDef, spot: SpotDef): SpanDef | undefined {
  for (const key of SPAN_KEYS) {
    const found = def[key]?.find((entry) => covers(entry, spot));
    if (found) return found;
  }
  return undefined;
}

function stripCovering(def: LevelDef, spot: SpotDef): void {
  for (const key of SPAN_KEYS) {
    const list = def[key];
    if (!list) continue;
    for (let i = list.length - 1; i >= 0; i--) if (covers(list[i], spot)) list.splice(i, 1);
  }
}

function moveOrPush(list: SpotDef[], spot: SpotDef): void {
  const existing = list.findIndex((entry) => near(entry, spot));
  if (existing >= 0) list[existing] = { ...spot };
  else list.push({ ...spot });
}

function near(a: SpotDef, b: SpotDef): boolean {
  return a.ring === b.ring && a.side === b.side && Math.abs(a.offset - b.offset) < NEAR;
}

function covers(span: SpanDef, spot: SpotDef): boolean {
  return span.ring === spot.ring && span.side === spot.side && Math.abs(span.offset - spot.offset) < span.width / 2;
}

function isSpanKind(kind: Piece['kind']): kind is 'pit' | 'crumble' | 'conveyor' | 'platform' | 'ice' {
  return kind === 'pit' || kind === 'crumble' || kind === 'conveyor' || kind === 'platform' || kind === 'ice';
}

function spansOf(def: LevelDef, kind: 'pit' | 'crumble' | 'conveyor' | 'platform' | 'ice'): SpanDef[] {
  if (kind === 'pit') return def.pits;
  if (kind === 'crumble') return def.crumbles;
  if (kind === 'conveyor') return def.conveyors;
  if (kind === 'platform') return def.platforms;
  return (def.ice ??= []);
}

function putSpot<T extends SpotDef>(list: T[], entry: T): void {
  const existing = list.findIndex((item) => near(item, entry));
  if (existing >= 0) list[existing] = entry;
  else list.push(entry);
}

function label(kind: string): string {
  if (kind === 'oneup') return '1-up';
  if (kind === 'letter-1') return 'Letter 1';
  if (kind === 'letter-u') return 'Letter U';
  if (kind === 'letter-p') return 'Letter P';
  if (kind === 'patrol') return 'Ghost patrol';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
