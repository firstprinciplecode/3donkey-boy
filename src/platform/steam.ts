import type { SteamBridge } from '../../steam/src/bridge';
import type { GameEvent } from '../gameEvents';
import { HISCORE_LIST_KEY, PLAYER_NAME_KEY } from '../hiscore';
import { formatScore, levelTitle } from '../utils';
import { AchievementTracker } from './achievements';
import type { Platform } from './types';

declare global {
  interface Window {
    popscotch?: SteamBridge;
  }
}

/** Keys mirrored to Steam Cloud. Everything else in localStorage stays on this machine. */
const CLOUD_KEYS = [PLAYER_NAME_KEY, HISCORE_LIST_KEY] as const;
const SAVED_AT_KEY = 'popscotch.savedAt';
const SAVE_VERSION = 1;

interface CloudSave {
  version: number;
  savedAt: number;
  entries: Record<string, string>;
}

function parseSave(json: string | null): CloudSave | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json) as Partial<CloudSave>;
    if (data.version !== SAVE_VERSION || typeof data.savedAt !== 'number' || !data.entries) return null;
    return { version: SAVE_VERSION, savedAt: data.savedAt, entries: data.entries };
  } catch {
    return null;
  }
}

/** Takes the cloud copy when it's newer than this machine's, e.g. after playing on a Steam Deck. */
function restore(save: CloudSave | null): void {
  if (!save) return;
  const localAt = Number(localStorage.getItem(SAVED_AT_KEY)) || 0;
  if (save.savedAt <= localAt) return;
  for (const key of CLOUD_KEYS) {
    const value = save.entries[key];
    if (typeof value === 'string') localStorage.setItem(key, value);
  }
  localStorage.setItem(SAVED_AT_KEY, String(save.savedAt));
}

function snapshot(): string {
  const entries: Record<string, string> = {};
  for (const key of CLOUD_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  const savedAt = Date.now();
  localStorage.setItem(SAVED_AT_KEY, String(savedAt));
  return JSON.stringify({ version: SAVE_VERSION, savedAt, entries } satisfies CloudSave);
}

const CURSOR_IDLE_MS = 1500;

/** Fullscreen and played with a pad, so the mouse pointer only shows while it's moving. */
function hideIdleCursor(): void {
  let timer = 0;
  const hide = () => document.body.classList.add('cursor-idle');
  window.addEventListener('mousemove', () => {
    document.body.classList.remove('cursor-idle');
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, CURSOR_IDLE_MS);
  });
  hide();
}

export function createSteamPlatform(bridge: SteamBridge): Platform {
  const achievements = new AchievementTracker();
  const interruptListeners: Array<() => void> = [];
  let steamDeck = false;

  const presence = (status: string, values: Record<string, string> = {}) => {
    for (const [key, value] of Object.entries(values)) bridge.setPresence(key, value);
    bridge.setPresence('steam_display', status);
  };

  const report = (event: GameEvent) => {
    switch (event.type) {
      case 'roundStart':
        presence('#Climbing', { level: levelTitle(event.levelName), round: String(event.round) });
        break;
      case 'roundClear':
        bridge.addStat('rounds_cleared', 1);
        break;
      case 'gameOver':
        bridge.setStatMax('best_score', event.score);
        presence('#GameOver', { score: formatScore(event.score) });
        break;
      case 'scoreSaved':
        bridge.writeCloudSave(snapshot());
        break;
    }
  };

  return {
    kind: 'steam',
    get prefersGamepad() {
      return steamDeck;
    },
    quit: () => bridge.quit(),

    async init() {
      const [info, save] = await Promise.all([bridge.info(), bridge.readCloudSave()]);
      steamDeck = info.steamDeck;
      try {
        restore(parseSave(save));
      } catch {
        // Storage unavailable: the game falls back to its own defaults.
      }
      bridge.onInterrupt(() => {
        for (const listener of interruptListeners) listener();
      });
      hideIdleCursor();
      presence('#Title');
    },

    onGameEvent(event) {
      for (const id of achievements.handle(event)) bridge.unlockAchievement(id);
      report(event);
    },

    onInterrupt(listener) {
      interruptListeners.push(listener);
    },
  };
}
