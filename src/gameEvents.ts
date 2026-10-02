import type { TimeOfDay } from './timeOfDay';

export type SmashTarget = 'barrel' | 'fire' | 'ghost' | 'crawler' | 'totem';

/** Moments the game reports outward (achievements, rich presence). Practice runs report nothing. */
export type GameEvent =
  | { type: 'runStart' }
  | { type: 'roundStart'; level: number; levelName: string; round: number }
  | { type: 'roundClear'; levelName: string; round: number; time: TimeOfDay }
  | { type: 'lifeLost' }
  | { type: 'score'; score: number }
  | { type: 'combo'; multiplier: number }
  | { type: 'spelled' }
  | { type: 'hammer' }
  | { type: 'smash'; target: SmashTarget }
  | { type: 'underTotem' }
  | { type: 'gameOver'; score: number }
  | { type: 'scoreSaved'; rank: number | null };
