import type { LevelDef, LockDef, PatrolDef, SpotDef } from './types';

type Ringed = { ring: number };

/** New outer terraces laid under an authored pyramid. Rings here count from the new ground ring. */
export interface BaseRings {
  rings: number;
  /** Climbs between the new rings. The one on the top new ring should stand under the old player start. */
  ladders: SpotDef[];
  /** One chute on each new ring above the ground, plus one on the old ground ring (ring `rings`). */
  chutes: SpotDef[];
  playerStart: SpotDef;
  drum: SpotDef;
  items?: LevelDef['items'];
  /** Listed first, so `ghosts` picks these before the old ones. */
  patrols?: PatrolDef[];
  crawlers?: PatrolDef[];
  totems?: PatrolDef[];
  pits?: LevelDef['pits'];
  crumbles?: LevelDef['crumbles'];
  conveyors?: LevelDef['conveyors'];
  platforms?: LevelDef['platforms'];
  ice?: LevelDef['ice'];
  springs?: LevelDef['springs'];
  vines?: LevelDef['vines'];
  jets?: LevelDef['jets'];
  drops?: LevelDef['drops'];
}

/**
 * Grows a pyramid by stacking it on `base.rings` new outer terraces. Each old ring keeps its exact
 * radius (ring k only depends on how many rings sit above it), so the authored layout and its route
 * still work unchanged. The start and drum move down to the new ground ring. New ladders are appended,
 * so lock indices into the old ladder list stay valid.
 */
export function growBase(top: LevelDef, base: BaseRings, tweak: Partial<Pick<LevelDef, 'ghosts' | 'fires' | 'summitHalf' | 'tip'>> = {}): LevelDef {
  const k = base.rings;
  const up = <T extends Ringed>(entry: T): T => ({ ...entry, ring: entry.ring + k });
  const upAll = <T extends Ringed>(list: readonly T[] | undefined): T[] => (list ?? []).map(up);
  const lock = (entry: LockDef): LockDef => (entry.kind === 'switch' ? { ...entry, switchAt: up(entry.switchAt) } : entry);
  return {
    ...top,
    ...tweak,
    rings: top.rings + k,
    ladders: [...upAll(top.ladders), ...base.ladders],
    chutes: [...upAll(top.chutes), ...base.chutes],
    playerStart: base.playerStart,
    drum: base.drum,
    barrelSpawn: up(top.barrelSpawn),
    items: [...top.items.map((item) => ({ ...item, spot: up(item.spot) })), ...(base.items ?? [])],
    patrols: [...(base.patrols ?? []), ...upAll(top.patrols)],
    crawlers: [...upAll(top.crawlers), ...(base.crawlers ?? [])],
    totems: [...upAll(top.totems), ...(base.totems ?? [])],
    pits: [...upAll(top.pits), ...(base.pits ?? [])],
    crumbles: [...upAll(top.crumbles), ...(base.crumbles ?? [])],
    conveyors: [...upAll(top.conveyors), ...(base.conveyors ?? [])],
    platforms: [...upAll(top.platforms), ...(base.platforms ?? [])],
    ice: [...upAll(top.ice), ...(base.ice ?? [])],
    springs: [...upAll(top.springs), ...(base.springs ?? [])],
    vines: [...upAll(top.vines), ...(base.vines ?? [])],
    jets: [...upAll(top.jets), ...(base.jets ?? [])],
    drops: [...upAll(top.drops), ...(base.drops ?? [])],
    locks: top.locks.map(lock),
    neon: top.neon?.map((wall) => ({ ...wall, tier: wall.tier + k })),
  };
}
