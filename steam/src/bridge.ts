/**
 * The only surface the game page can reach in the desktop build. The preload script exposes it
 * as `window.popscotch`; the main process validates every call again, so treat it as untrusted.
 */
export interface SteamInfo {
  /** False when the Steam client isn't running; the game still plays, without Steam features. */
  steam: boolean;
  steamDeck: boolean;
  /** Steam's UI language (e.g. "english"), or null without Steam. */
  language: string | null;
}

export interface SteamBridge {
  info(): Promise<SteamInfo>;
  unlockAchievement(id: string): void;
  /** Raises an integer stat to `value` if it's higher than what Steam has. */
  setStatMax(name: string, value: number): void;
  addStat(name: string, amount: number): void;
  setPresence(key: string, value: string | null): void;
  /** The save file from Steam Cloud, or null if there isn't one (or no Steam). */
  readCloudSave(): Promise<string | null>;
  writeCloudSave(json: string): void;
  /** Called when the window loses focus (Alt-Tab, the Steam Deck's Steam or quick-access menu). */
  onInterrupt(listener: () => void): void;
  quit(): void;
}

export const IPC = {
  info: 'popscotch:info',
  achievement: 'popscotch:achievement',
  statMax: 'popscotch:stat-max',
  statAdd: 'popscotch:stat-add',
  presence: 'popscotch:presence',
  cloudRead: 'popscotch:cloud-read',
  cloudWrite: 'popscotch:cloud-write',
  interrupt: 'popscotch:interrupt',
  quit: 'popscotch:quit',
} as const;
