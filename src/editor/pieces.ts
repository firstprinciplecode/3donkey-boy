import type { LevelDef, PatrolDef, SpotDef } from '../levels/types';
import { pieceLabel, type Piece } from './level-edit';

export type End = 'from' | 'to';

/** One grabbable thing on the map. A patrol has a handle at each end. */
export interface Handle {
  piece: Piece;
  end?: End;
}

type IndexedKind = Exclude<Piece['kind'], 'start' | 'drum'>;

export function listHandles(def: LevelDef): Handle[] {
  const out: Handle[] = [{ piece: { kind: 'start' } }, { piece: { kind: 'drum' } }];
  const each = (kind: IndexedKind, list: readonly unknown[] | undefined) => {
    list?.forEach((_, index) => out.push({ piece: { kind, index } as Piece }));
  };
  each('ladder', def.ladders);
  each('chute', def.chutes);
  each('item', def.items);
  each('pit', def.pits);
  each('crumble', def.crumbles);
  each('conveyor', def.conveyors);
  each('platform', def.platforms);
  each('ice', def.ice);
  each('spring', def.springs);
  each('vine', def.vines);
  each('jet', def.jets);
  each('drop', def.drops);
  const ends = (kind: 'patrol' | 'crawler' | 'totem', list: readonly PatrolDef[] | undefined) => {
    list?.forEach((_, index) => {
      out.push({ piece: { kind, index }, end: 'from' }, { piece: { kind, index }, end: 'to' });
    });
  };
  ends('patrol', def.patrols);
  ends('crawler', def.crawlers);
  ends('totem', def.totems);
  def.locks.forEach((lock, index) => {
    if (lock.kind === 'switch') out.push({ piece: { kind: 'switch', index } });
  });
  return out;
}

export function handleSpot(def: LevelDef, handle: Handle): SpotDef | null {
  const patrol = patrolOf(def, handle.piece);
  if (patrol) {
    const [side, offset] = handle.end === 'to' ? patrol.to : patrol.from;
    return { ring: patrol.ring, side, offset };
  }
  const spot = spotOf(def, handle.piece);
  return spot ? { ring: spot.ring, side: spot.side, offset: spot.offset } : null;
}

/** Width along the walkway for spans, 0 for single spots. */
export function handleWidth(def: LevelDef, handle: Handle): number {
  const spot = spotOf(def, handle.piece);
  return spot && 'width' in spot && typeof spot.width === 'number' ? spot.width : 0;
}

/** Moves a handle to `to`. Returns false when the move is not allowed, such as a patrol changing terrace. */
export function moveHandle(def: LevelDef, handle: Handle, to: SpotDef): boolean {
  const patrol = patrolOf(def, handle.piece);
  if (patrol) {
    if (to.ring !== patrol.ring) return false;
    patrol[handle.end === 'to' ? 'to' : 'from'] = [to.side, to.offset];
    return true;
  }
  const spot = spotOf(def, handle.piece);
  if (!spot) return false;
  spot.ring = to.ring;
  spot.side = to.side;
  spot.offset = to.offset;
  return true;
}

export function sameHandle(a: Handle | null, b: Handle | null): boolean {
  if (!a || !b) return a === b;
  const ai = 'index' in a.piece ? a.piece.index : -1;
  const bi = 'index' in b.piece ? b.piece.index : -1;
  return a.piece.kind === b.piece.kind && ai === bi && a.end === b.end;
}

export function handleLabel(def: LevelDef, handle: Handle): string {
  const base = pieceLabel(def, handle.piece);
  if (!handle.end) return base;
  return `${base} ${handle.end === 'from' ? 'start' : 'end'}`;
}

export function handleKey(handle: Handle): string {
  const index = 'index' in handle.piece ? handle.piece.index : 0;
  return `${handle.piece.kind}:${index}:${handle.end ?? ''}`;
}

function patrolOf(def: LevelDef, piece: Piece): PatrolDef | undefined {
  if (piece.kind === 'patrol') return def.patrols[piece.index];
  if (piece.kind === 'crawler') return def.crawlers?.[piece.index];
  if (piece.kind === 'totem') return def.totems?.[piece.index];
  return undefined;
}

function spotOf(def: LevelDef, piece: Piece): SpotDef | undefined {
  switch (piece.kind) {
    case 'start':
      return def.playerStart;
    case 'drum':
      return def.drum;
    case 'ladder':
      return def.ladders[piece.index];
    case 'chute':
      return def.chutes[piece.index];
    case 'item':
      return def.items[piece.index]?.spot;
    case 'pit':
      return def.pits[piece.index];
    case 'crumble':
      return def.crumbles[piece.index];
    case 'conveyor':
      return def.conveyors[piece.index];
    case 'platform':
      return def.platforms[piece.index];
    case 'ice':
      return def.ice?.[piece.index];
    case 'spring':
      return def.springs?.[piece.index];
    case 'vine':
      return def.vines?.[piece.index];
    case 'jet':
      return def.jets?.[piece.index];
    case 'drop':
      return def.drops?.[piece.index];
    case 'switch': {
      const lock = def.locks[piece.index];
      return lock?.kind === 'switch' ? lock.switchAt : undefined;
    }
    default:
      return undefined;
  }
}
