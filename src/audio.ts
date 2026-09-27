/** Tiny chiptune SFX synthesized with WebAudio, so there are no asset files to host. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const VOLUME = 0.5;

/** Browsers require a user gesture before audio can start. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

/** The shared context and master bus (null until the first user gesture unlocks audio). */
export function audioGraph(): { ctx: AudioContext; master: GainNode } | null {
  return ctx && master ? { ctx, master } : null;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : VOLUME;
  return muted;
}

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  slideTo?: number;
  delay?: number;
}

function tone(freq: number, duration: number, opts: ToneOptions = {}): void {
  if (!ctx || !master) return;
  const { type = 'square', volume = 0.12, slideTo, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(master);
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
  score: () => arpeggio([988, 1319], 0.07, 0.1),
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
};
