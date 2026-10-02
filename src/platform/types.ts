import type { GameEvent } from '../gameEvents';

/** What the game asks of where it runs: the browser, or the Steam desktop build. */
export interface Platform {
  readonly kind: 'web' | 'steam';
  /** Start in gamepad prompts rather than keyboard or touch (Steam Deck). */
  readonly prefersGamepad: boolean;
  /** Set when the platform can close the game (a desktop window, not a browser tab). */
  readonly quit: (() => void) | null;
  /** Called once before the game boots; may restore saves into localStorage. */
  init(): Promise<void>;
  onGameEvent(event: GameEvent): void;
  /** `listener` runs when a system overlay covers the game and it should pause. */
  onInterrupt(listener: () => void): void;
}
