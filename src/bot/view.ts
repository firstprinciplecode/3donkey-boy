import type { BarrelManager } from '../entities/barrels';
import type { Crawler } from '../entities/crawler';
import type { Fire } from '../entities/fire';
import type { Ghost } from '../entities/ghost';
import type { Item } from '../entities/items';
import type { Player } from '../entities/player';
import type { Totem } from '../entities/totem';
import type { Game } from '../game';
import type { Hazards } from '../hazards';
import type { Level } from '../level';
import type { Obstacles } from '../obstacles';

/**
 * The parts of Game the bot reads. They are private to the game, so the bot reaches them through
 * this one read-only lens instead of the game growing a public API just for testing. If a field is
 * renamed, `viewGame` fails loudly at startup rather than letting the bot play blind.
 */
export interface GameView {
  readonly state: string;
  readonly stateTime: number;
  readonly clock: number;
  readonly score: number;
  readonly lives: number;
  readonly round: number;
  readonly bonus: number;
  readonly hammerTime: number;
  readonly levelIndex: number;
  readonly level: Level;
  readonly player: Player;
  readonly barrels: BarrelManager;
  readonly ghosts: readonly Ghost[];
  readonly fires: readonly Fire[];
  readonly crawlers: readonly Crawler[];
  readonly totems: readonly Totem[];
  readonly items: readonly Item[];
  readonly obstacles: Obstacles;
  readonly hazards: Hazards;
  /** Starting from the bot is always a practice run, so its scores stay off the hi-score table. */
  practice: boolean;
  startGame(level: number): void;
}

const FIELDS = [
  'state', 'stateTime', 'clock', 'score', 'lives', 'round', 'bonus', 'hammerTime', 'levelIndex', 'level', 'player',
  'barrels', 'ghosts', 'fires', 'crawlers', 'totems', 'items', 'obstacles', 'hazards', 'practice',
] as const;

export function viewGame(game: Game): GameView {
  const view = game as unknown as GameView;
  const missing: string[] = FIELDS.filter((key) => !(key in view));
  if (typeof view.startGame !== 'function') missing.push('startGame');
  if (missing.length) throw new Error(`[bot] Game no longer has: ${missing.join(', ')}`);
  return view;
}
