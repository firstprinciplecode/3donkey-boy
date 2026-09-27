/**
 * Level definitions are plain, JSON-serialisable data so they can later be authored in an editor.
 *
 * Positions on a ring are written as (side, offset): side 0..3 = south, east, north, west face;
 * offset is measured from the middle of that side, growing to the right as seen from outside.
 * Spans (pits, crumbles, conveyors, platform gaps) are centred on `offset` and must stay on one
 * side; their edges must land on whole numbers so they line up with the voxel grid.
 */

export type SkinName = 'meadow' | 'candy' | 'desert' | 'autumn' | 'winter' | 'tomb' | 'volcano';
export type ItemType = 'gem' | 'hotdog' | 'oneup' | 'hammer' | 'key' | 'relic';

export interface SpotDef {
  ring: number;
  side: number;
  offset: number;
}

export interface SpanDef extends SpotDef {
  width: number;
}

export interface ConveyorDef extends SpanDef {
  /** +1 pushes toward increasing s (right as seen from outside), -1 the other way. */
  dir: 1 | -1;
}

/** A spike pit too wide to jump, crossed on a platform sliding back and forth. */
export interface PlatformDef extends SpanDef {
  platformWidth: number;
  /** Seconds for one full back-and-forth trip. */
  period: number;
}

/** A vent that erupts in a column of fire on a timer. */
export interface JetDef extends SpotDef {
  /** Seconds for one quiet + erupt cycle. */
  period: number;
  /** Shifts this jet's cycle so neighbouring jets take turns. */
  phase?: number;
}

export type LockDef =
  | { kind: 'switch'; ladder: number; switchAt: SpotDef }
  | { kind: 'key'; ladder: number }
  /** Opens once every `relic` item on the level has been picked up. */
  | { kind: 'relics'; ladder: number };

export interface ItemDef {
  type: ItemType;
  spot: SpotDef;
}

export interface PatrolDef {
  ring: number;
  from: [side: number, offset: number];
  to: [side: number, offset: number];
}

export interface LevelDef {
  name: string;
  skin: SkinName;
  /** Number of walkable terrace rings; the summit sits on top of the last one. */
  rings: number;
  terraceDepth: number;
  tierHeight: number;
  summitHalf: number;

  /** A ladder on ring k climbs the wall of tier k+1; the one on the last ring leads to the summit. */
  ladders: SpotDef[];
  /** Where barrels roll off a ring onto the one below. */
  chutes: SpotDef[];
  playerStart: SpotDef;
  drum: SpotDef;
  barrelSpawn: SpotDef;
  items: ItemDef[];
  /** Ghosts join in this order as rounds progress. */
  patrols: PatrolDef[];
  /** Ghosts on the first visit to this level; one more each time the levels loop. */
  ghosts: number;
  /** Max live flames spawned by barrels hitting the drum. */
  fires: number;

  pits: SpanDef[];
  crumbles: SpanDef[];
  conveyors: ConveyorDef[];
  platforms: PlatformDef[];
  locks: LockDef[];

  /** One line shown under the round banner the first time the level is played. */
  tip?: string;
  /** Slippery floor: you keep sliding after letting go. */
  ice?: SpanDef[];
  /** Pads that launch you high enough to clear a 5-wide pit. */
  springs?: SpotDef[];
  jets?: JetDef[];
  /** Icicles, acorns or rocks hanging over the walkway; they drop when you walk underneath. */
  drops?: SpotDef[];
  /** Ground monsters (snakes, penguins, …, by skin) that pace a stretch of ring. Jump them for points. */
  crawlers?: PatrolDef[];
}
