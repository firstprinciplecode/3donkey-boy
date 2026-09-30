/** The bot's controller: each action is the set of keys held for one decision. */
export const ACTIONS = {
  wait: [],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: ['Space'],
  left_jump: ['ArrowLeft', 'Space'],
  right_jump: ['ArrowRight', 'Space'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
} as const satisfies Record<string, readonly string[]>;

export type BotAction = keyof typeof ACTIONS;
