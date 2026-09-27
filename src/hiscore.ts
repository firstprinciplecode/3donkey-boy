import { HISCORE_KEY } from './config';

/** Top-10 table, stored separately from the old single-number hi-score. */
export const HISCORE_LIST_KEY = 'popscotch.hiscores';
const LEGACY_LIST_KEY = 'donkeyboy.hiscores';
const LEGACY_SCORE_KEY = 'donkeyboy.hiscore';
export const HISCORE_SIZE = 10;
const NAME_LENGTH = 3;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface HiScoreEntry {
  name: string;
  score: number;
}

/** Three letters, A–Z. Short input is padded so the slot is never blank. */
export function sanitizeName(raw: string): string {
  const letters = raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, NAME_LENGTH);
  return letters.padEnd(NAME_LENGTH, 'A');
}

export function cycleLetter(letter: string, delta: number): string {
  const index = Math.max(0, LETTERS.indexOf(letter));
  return LETTERS[(index + delta + LETTERS.length) % LETTERS.length];
}

function isEntry(value: unknown): value is HiScoreEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as HiScoreEntry;
  return typeof entry.name === 'string' && typeof entry.score === 'number' && Number.isFinite(entry.score);
}

/** Keep a stored name of exactly three A–Z or dash characters (the migrated placeholder). */
function storedName(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z-]/g, '')
    .slice(0, NAME_LENGTH);
  return cleaned.padEnd(NAME_LENGTH, '-');
}

/** One row per name: sorted high to low, and a repeated name keeps only its best score. */
export function normalizeBoard(value: unknown): HiScoreEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter(isEntry)
    .map((entry) => ({ name: storedName(entry.name), score: Math.max(0, Math.floor(entry.score)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((entry) => !seen.has(entry.name) && seen.add(entry.name))
    .slice(0, HISCORE_SIZE);
}

export function bestFor(board: HiScoreEntry[], name: string): number {
  return board.find((entry) => entry.name === name)?.score ?? 0;
}

/** Where a new score would land, or null if it misses the table. Ties rank below the older score. */
export function insertionIndex(board: HiScoreEntry[], score: number): number | null {
  const points = Math.floor(score);
  if (points <= 0) return null;
  const index = board.findIndex((entry) => points > entry.score);
  if (index === -1) return board.length < HISCORE_SIZE ? board.length : null;
  return index;
}

/**
 * Records a score under `name`. A name already on the table only moves up when the new score
 * beats its best (`improved: false` returns the untouched board and that name's row).
 */
export function insertScore(
  board: HiScoreEntry[],
  name: string,
  score: number,
): { board: HiScoreEntry[]; index: number; improved: boolean } | null {
  const clean = sanitizeName(name);
  const points = Math.floor(score);
  const existing = board.findIndex((entry) => entry.name === clean);
  if (existing !== -1 && board[existing].score >= points) return { board, index: existing, improved: false };
  const rest = board.filter((_, i) => i !== existing);
  const index = insertionIndex(rest, points);
  if (index === null) return null;
  rest.splice(index, 0, { name: clean, score: points });
  return { board: rest.slice(0, HISCORE_SIZE), index, improved: true };
}

/** Initials from the last saved score, so returning players don't retype them. */
export const PLAYER_NAME_KEY = 'popscotch.player';

export function loadPlayerName(): string | null {
  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_KEY);
    return raw && /^[A-Z]{3}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function savePlayerName(name: string): void {
  try {
    window.localStorage.setItem(PLAYER_NAME_KEY, sanitizeName(name));
  } catch {
    // Unavailable storage just means the name is asked for again next time.
  }
}

export function topScore(board: HiScoreEntry[]): number {
  return board[0]?.score ?? 0;
}

export function loadBoard(): HiScoreEntry[] {
  try {
    const raw = window.localStorage.getItem(HISCORE_LIST_KEY) ?? window.localStorage.getItem(LEGACY_LIST_KEY);
    if (raw) return normalizeBoard(JSON.parse(raw) as unknown);
    const legacy = Number(window.localStorage.getItem(HISCORE_KEY) ?? window.localStorage.getItem(LEGACY_SCORE_KEY));
    if (Number.isFinite(legacy) && legacy > 0) return [{ name: '---', score: Math.floor(legacy) }];
    return [];
  } catch {
    return [];
  }
}

export function saveBoard(board: HiScoreEntry[]): void {
  try {
    window.localStorage.setItem(HISCORE_LIST_KEY, JSON.stringify(board));
  } catch {
    // Storage can be unavailable (private mode, quota); the table just won't persist.
  }
}
