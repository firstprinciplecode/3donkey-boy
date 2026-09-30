import songs from './songs.json';
import type { SkinName } from './levels/types';

export const STEPS_PER_BAR = 16;

export interface Bar {
  lead: string;
  root: string;
}

export interface SongTheme {
  title: string;
  mode: string;
  bpm: number;
  voices: [OscillatorType, OscillatorType];
  detune: number;
  bars: Bar[];
}

export const SONG_ORDER: SkinName[] = ['meadow', 'candy', 'desert', 'autumn', 'winter', 'tomb', 'volcano'];

export const SONGS: Record<SkinName, SongTheme> = songs as Record<SkinName, SongTheme>;

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Sharp spelling of a note, so B♭4 and A#4 point at the same key. Rests have none. */
export function canonicalNote(token: string): string | null {
  if (token.trim() === '' || token.trim() === '.') return null;
  const note = midi(token);
  const octave = Math.floor(note / 12) - 1;
  return `${PITCH_NAMES[((note % 12) + 12) % 12]}${octave}`;
}

export function midi(name: string): number {
  const match = /^([A-G])(#|b)?(\d)$/.exec(name.trim());
  if (!match) throw new Error(`bad note ${name}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return 12 * (Number(match[3]) + 1) + SEMITONES[match[1]] + accidental;
}

export interface Step {
  lead: number | null;
  bass: number | null;
}

/** The lead as written, the bass bouncing root / octave on every eighth note. */
export function compileBars(song: Bar[]): Step[] {
  return song.flatMap((bar, barIndex) => {
    const slots = bar.lead.trim().split(/\s+/);
    if (slots.length !== STEPS_PER_BAR) {
      throw new Error(`Bar ${barIndex + 1} needs ${STEPS_PER_BAR} steps`);
    }
    let root: number;
    try {
      root = midi(bar.root);
    } catch {
      throw new Error(`Bar ${barIndex + 1} bass`);
    }
    return slots.map((slot, i) => {
      if (slot === '.') return { lead: null, bass: i % 2 === 0 ? root + (i % 4 === 2 ? 12 : 0) : null };
      try {
        return { lead: midi(slot), bass: i % 2 === 0 ? root + (i % 4 === 2 ? 12 : 0) : null };
      } catch {
        throw new Error(`Bar ${barIndex + 1} step ${i + 1}`);
      }
    });
  });
}

export function songError(song: Bar[]): string | null {
  try {
    if (song.length === 0) return 'The song is empty';
    compileBars(song);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Bad notes';
  }
}
