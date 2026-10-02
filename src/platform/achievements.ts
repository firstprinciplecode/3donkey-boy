import type { GameEvent } from '../gameEvents';
import { LEVELS } from '../levels/defs';

/**
 * Steam achievement API names with their store text. The partner site has to list the same
 * names; `npm run steam:achievements` prints them in that shape.
 */
export const ACHIEVEMENTS = {
  CLEAR_MEADOW: { name: 'Meadow Climber', description: 'Clear Meadow.' },
  CLEAR_CANDY_HILLS: { name: 'Sweet Summit', description: 'Clear Candy Hills.' },
  CLEAR_DESERT_ARCADE: { name: 'High Noon', description: 'Clear Desert Arcade.' },
  CLEAR_HARVEST_WOODS: { name: 'Pumpkin Picker', description: 'Clear Harvest Woods.' },
  CLEAR_FROST_PEAK: { name: 'Cold Feet', description: 'Clear Frost Peak.' },
  CLEAR_SERPENT_TOMB: { name: 'Curse Breaker', description: 'Clear Serpent Tomb.' },
  CLEAR_VOLCANO_ISLE: { name: 'Hot Steps', description: 'Clear Volcano Isle.' },
  FULL_CLIMB: { name: 'All Seven', description: 'Clear all seven levels in one run.' },
  SECOND_LAP: { name: 'Faster, Higher', description: 'Clear all seven levels twice in one run.' },
  FLAWLESS_CLIMB: { name: 'Not a Scratch', description: 'Clear all seven levels without losing a life.' },
  NIGHT_CLIMB: { name: 'Night Owl', description: 'Clear a round at night.' },
  SPELL_1UP: { name: 'Spelling Bee', description: 'Collect 1, U and P in one visit to a level.' },
  COMBO_X5: { name: 'Hopscotch', description: 'Reach a x5 jump combo.' },
  HAMMER_FIVE: { name: 'Hammer Time', description: 'Smash five things with one hammer.' },
  TOTEM_SMASH: { name: 'Topple', description: 'Smash a totem with the hammer.' },
  UNDER_TOTEM: { name: 'Limbo', description: 'Run under a hopping totem.' },
  SCORE_25K: { name: 'Climber', description: 'Score 25,000 points in one run.' },
  SCORE_75K: { name: 'Mountaineer', description: 'Score 75,000 points in one run.' },
  SCORE_150K: { name: 'Cloud Hopper', description: 'Score 150,000 points in one run.' },
  HIGH_TABLE: { name: 'Initials on the Wall', description: 'Put your initials on the top 10.' },
} as const satisfies Record<string, { name: string; description: string }>;

export type AchievementId = keyof typeof ACHIEVEMENTS;

const LEVEL_CLEARS: Readonly<Record<string, AchievementId>> = {
  meadow: 'CLEAR_MEADOW',
  'candy hills': 'CLEAR_CANDY_HILLS',
  'desert arcade': 'CLEAR_DESERT_ARCADE',
  'harvest woods': 'CLEAR_HARVEST_WOODS',
  'frost peak': 'CLEAR_FROST_PEAK',
  'serpent tomb': 'CLEAR_SERPENT_TOMB',
  'volcano isle': 'CLEAR_VOLCANO_ISLE',
};

const SCORE_MILESTONES: ReadonlyArray<readonly [number, AchievementId]> = [
  [25_000, 'SCORE_25K'],
  [75_000, 'SCORE_75K'],
  [150_000, 'SCORE_150K'],
];

const HAMMER_STREAK = 5;
const COMBO_MAX = 5;

/** Turns game events into achievements earned. Keeps the per-run counters some of them need. */
export class AchievementTracker {
  private livesLost = 0;
  private hammerSmashes = 0;
  private readonly earned = new Set<AchievementId>();

  /** Achievements first earned by this event in this session (Steam ignores repeats anyway). */
  handle(event: GameEvent): AchievementId[] {
    const hits = this.check(event).filter((id) => !this.earned.has(id));
    for (const id of hits) this.earned.add(id);
    return hits;
  }

  private check(event: GameEvent): AchievementId[] {
    switch (event.type) {
      case 'runStart':
        this.livesLost = 0;
        this.hammerSmashes = 0;
        return [];
      case 'lifeLost':
        this.livesLost += 1;
        this.hammerSmashes = 0;
        return [];
      case 'hammer':
        this.hammerSmashes = 0;
        return [];
      case 'roundClear':
        return this.roundClear(event);
      case 'score':
        return SCORE_MILESTONES.filter(([points]) => event.score >= points).map(([, id]) => id);
      case 'combo':
        return event.multiplier >= COMBO_MAX ? ['COMBO_X5'] : [];
      case 'spelled':
        return ['SPELL_1UP'];
      case 'smash': {
        this.hammerSmashes += 1;
        const hits: AchievementId[] = event.target === 'totem' ? ['TOTEM_SMASH'] : [];
        if (this.hammerSmashes >= HAMMER_STREAK) hits.push('HAMMER_FIVE');
        return hits;
      }
      case 'underTotem':
        return ['UNDER_TOTEM'];
      case 'scoreSaved':
        return event.rank === null ? [] : ['HIGH_TABLE'];
      default:
        return [];
    }
  }

  private roundClear(event: Extract<GameEvent, { type: 'roundClear' }>): AchievementId[] {
    const hits: AchievementId[] = [];
    const level = LEVEL_CLEARS[event.levelName];
    if (level) hits.push(level);
    if (event.time === 'night') hits.push('NIGHT_CLIMB');
    if (event.round >= LEVELS.length) hits.push('FULL_CLIMB');
    if (event.round >= LEVELS.length * 2) hits.push('SECOND_LAP');
    if (event.round === LEVELS.length && this.livesLost === 0) hits.push('FLAWLESS_CLIMB');
    return hits;
  }
}
