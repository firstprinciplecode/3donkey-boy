/** Tiny chiptune SFX synthesized with WebAudio, so there are no asset files to host. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
const VOLUME = 0.5;
/** Player volume settings, 0..1 each; applied on top of VOLUME. */
const levels = { music: 1, sfx: 1 };

/** Browsers require a user gesture before audio can start. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = levels.sfx;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = levels.music;
      musicBus.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = sfxBus = musicBus = null;
  }
}

/** The shared context and the music bus (null until the first user gesture unlocks audio). */
export function audioGraph(): { ctx: AudioContext; music: GainNode } | null {
  return ctx && musicBus ? { ctx, music: musicBus } : null;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : VOLUME;
  return muted;
}

export function setVolumes(music: number, sfx: number): void {
  levels.music = music;
  levels.sfx = sfx;
  if (musicBus) musicBus.gain.value = music;
  if (sfxBus) sfxBus.gain.value = sfx;
}

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  slideTo?: number;
  delay?: number;
}

function tone(freq: number, duration: number, opts: ToneOptions = {}): void {
  if (!ctx || !sfxBus) return;
  const { type = 'square', volume = 0.12, slideTo, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const arpeggio = (notes: number[], step: number, len: number, volume = 0.08) =>
  notes.forEach((f, i) => tone(f, len, { delay: i * step, volume }));

export const sfx = {
  jump: () => tone(330, 0.16, { slideTo: 660, volume: 0.08 }),
  land: () => tone(140, 0.05, { type: 'triangle', volume: 0.12 }),
  step: () => tone(90 + Math.random() * 30, 0.03, { type: 'triangle', volume: 0.1 }),
  climb: () => tone(420 + Math.random() * 80, 0.03, { volume: 0.03 }),
  /** `combo` lifts the chime a whole tone per step so a chain sounds like it's climbing. */
  score: (combo = 1) => {
    const lift = 2 ** ((2 * (combo - 1)) / 12);
    arpeggio([988 * lift, 1319 * lift], 0.07, 0.1);
  },
  pickup: () => arpeggio([660, 880, 1320], 0.06, 0.08),
  oneUp: () => arpeggio([523, 659, 784, 1047, 1319], 0.07, 0.12),
  throw: () => tone(180, 0.22, { type: 'triangle', slideTo: 70, volume: 0.2 }),
  drum: () => tone(90, 0.25, { type: 'sawtooth', slideTo: 40, volume: 0.08 }),
  hit: () => tone(660, 0.7, { type: 'sawtooth', slideTo: 50, volume: 0.14 }),
  clear: () => arpeggio([523, 659, 784, 1047, 784, 1047, 1319], 0.11, 0.14, 0.1),
  gameOver: () => arpeggio([392, 330, 262, 196], 0.22, 0.3, 0.1),
  turn: () => tone(240, 0.3, { type: 'sine', slideTo: 520, volume: 0.1 }),
  crumble: () => tone(120, 0.35, { type: 'sawtooth', slideTo: 60, volume: 0.07 }),
  fall: () => tone(700, 0.5, { type: 'triangle', slideTo: 120, volume: 0.12 }),
  switch: () => arpeggio([392, 523, 784], 0.07, 0.12),
  unlock: () => arpeggio([523, 784, 1047, 1568], 0.08, 0.12),
  locked: () => tone(160, 0.12, { type: 'square', volume: 0.08 }),
  hammer: () => arpeggio([659, 784, 988, 1319], 0.06, 0.1),
  smash: () => tone(220, 0.18, { type: 'square', slideTo: 90, volume: 0.14 }),
  fire: () => tone(90, 0.4, { type: 'sawtooth', slideTo: 300, volume: 0.06 }),
  spring: () => tone(180, 0.35, { type: 'square', slideTo: 900, volume: 0.09 }),
  crack: () => tone(1400, 0.08, { type: 'triangle', slideTo: 700, volume: 0.07 }),
  shatter: () => tone(900, 0.2, { type: 'sawtooth', slideTo: 200, volume: 0.05 }),
  jet: () => tone(70, 0.5, { type: 'sawtooth', slideTo: 160, volume: 0.07 }),
  relic: () => arpeggio([587, 740, 880, 1175], 0.07, 0.12),
  stomp: () => tone(70, 0.25, { type: 'square', slideTo: 35, volume: 0.12 }),
  orb: () => tone(880, 0.12, { type: 'sine', slideTo: 1760, volume: 0.09 }),
  letter: () => arpeggio([784, 988, 1175], 0.06, 0.1),
  spelled: () => arpeggio([523, 659, 784, 1047, 1319, 1568, 2093], 0.07, 0.14, 0.1),
};
