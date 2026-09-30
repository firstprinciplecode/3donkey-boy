/**
 * Renders the web game's synthesized audio to WAV files for Roblox, which can only play uploaded
 * assets. A small offline stand-in for WebAudio runs the real `sfx` recipes and music sequencer from
 * src/, so the Roblox sounds stay in step with the web ones.
 *
 * Output: roblox/audio/*.wav (upload these) and roblox/src/client/SoundSprite.luau (cue offsets).
 * Run: npm run roblox:audio
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
/** Silence after each effect in the sheet, so a late stop can't bleed into the next cue. */
const CUE_GAP = 0.25;
const PEAK = 0.9;

type Event = { kind: 'set' | 'linear' | 'exp'; value: number; time: number };

class Param {
  private events: Event[] = [];
  constructor(private base: number) {}
  get value(): number {
    return this.base;
  }
  set value(v: number) {
    this.base = v;
  }
  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  get automated(): boolean {
    return this.events.length > 0;
  }
  at(t: number): number {
    let prev: Event | null = null;
    for (const e of this.events) {
      if (e.time <= t) {
        prev = e;
        continue;
      }
      if (e.kind === 'set') break;
      const v0 = prev ? prev.value : this.base;
      const t0 = prev ? prev.time : t;
      const k = (t - t0) / (e.time - t0);
      return e.kind === 'linear' ? v0 + (e.value - v0) * k : v0 * (e.value / v0) ** k;
    }
    return prev ? prev.value : this.base;
  }
}

abstract class Node {
  inputs: Node[] = [];
  connect<T extends Node>(dest: T): T {
    dest.inputs.push(this);
    return dest;
  }
}

/** A rendered stretch of signal starting at sample `start`. */
type Clip = { start: number; data: Float32Array };

class Oscillator extends Node {
  type: OscillatorType = 'sine';
  frequency = new Param(440);
  detune = new Param(0);
  startTime = 0;
  stopTime = Infinity;
  start(t = 0): void {
    this.startTime = t;
  }
  stop(t: number): void {
    this.stopTime = t;
  }
}

class Buffer {
  private data: Float32Array;
  constructor(readonly length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class BufferSource extends Node {
  buffer: Buffer | null = null;
  startTime = 0;
  offset = 0;
  stopTime = Infinity;
  start(t = 0, offset = 0): void {
    this.startTime = t;
    this.offset = offset;
  }
  stop(t: number): void {
    this.stopTime = t;
  }
}

class Gain extends Node {
  gain = new Param(1);
}

class Biquad extends Node {
  type: BiquadFilterType = 'lowpass';
  frequency = new Param(350);
  Q = new Param(1);
}

class Delay extends Node {
  delayTime = new Param(0);
}

class Destination extends Node {}

class OfflineContext {
  currentTime = 0;
  readonly sampleRate = SAMPLE_RATE;
  readonly state = 'running';
  readonly destination = new Destination();
  readonly sources: (Oscillator | BufferSource)[] = [];
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createGain = () => new Gain();
  createBiquadFilter = () => new Biquad();
  createDelay = () => new Delay();
  createBuffer = (_channels: number, length: number) => new Buffer(length);
  createOscillator = () => this.track(new Oscillator());
  createBufferSource = () => this.track(new BufferSource());
  private track<T extends Oscillator | BufferSource>(src: T): T {
    this.sources.push(src);
    return src;
  }
}

/** PolyBLEP correction that rounds off a waveform step, so square and saw don't alias. */
function blep(p: number, dp: number): number {
  if (p < dp) {
    const x = p / dp;
    return x + x - x * x - 1;
  }
  if (p > 1 - dp) {
    const x = (p - 1) / dp;
    return x * x + x + x + 1;
  }
  return 0;
}

class Renderer {
  private cache = new Map<Node, Clip>();
  constructor(private readonly end: number) {}

  render(node: Node): Clip {
    let clip = this.cache.get(node);
    if (!clip) {
      clip = this.compute(node);
      this.cache.set(node, clip);
    }
    return clip;
  }

  private compute(node: Node): Clip {
    if (node instanceof Oscillator) return this.oscillator(node);
    if (node instanceof BufferSource) return this.bufferSource(node);
    if (node instanceof Delay) return this.delay(node);
    const clip = this.mix(node.inputs, node instanceof Biquad ? 0.05 : 0);
    if (node instanceof Gain) this.applyGain(node.gain, clip);
    if (node instanceof Biquad) this.filter(node, clip);
    return clip;
  }

  private span(from: number, to: number): { start: number; length: number } {
    const start = Math.max(0, Math.round(from * SAMPLE_RATE));
    const stop = Math.min(this.end, Math.round(to * SAMPLE_RATE));
    return { start, length: Math.max(0, stop - start) };
  }

  private mix(inputs: Node[], tail: number): Clip {
    const clips = inputs.map((n) => this.render(n)).filter((c) => c.data.length > 0);
    if (clips.length === 0) return { start: 0, data: new Float32Array(0) };
    const start = Math.min(...clips.map((c) => c.start));
    const stop = Math.min(this.end, Math.max(...clips.map((c) => c.start + c.data.length)) + Math.round(tail * SAMPLE_RATE));
    const data = new Float32Array(stop - start);
    for (const c of clips) {
      const at = c.start - start;
      for (let i = 0; i < c.data.length; i++) data[at + i] += c.data[i];
    }
    return { start, data };
  }

  private applyGain(gain: Param, clip: Clip): void {
    if (!gain.automated) {
      const g = gain.value;
      for (let i = 0; i < clip.data.length; i++) clip.data[i] *= g;
      return;
    }
    for (let i = 0; i < clip.data.length; i++) clip.data[i] *= gain.at((clip.start + i) / SAMPLE_RATE);
  }

  private oscillator(osc: Oscillator): Clip {
    const { start, length } = this.span(osc.startTime, osc.stopTime);
    const data = new Float32Array(length);
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = (start + i) / SAMPLE_RATE;
      const f = osc.frequency.at(t) * 2 ** (osc.detune.at(t) / 1200);
      const dp = f / SAMPLE_RATE;
      let v: number;
      switch (osc.type) {
        case 'square':
          v = (phase < 0.5 ? 1 : -1) + blep(phase, dp) - blep((phase + 0.5) % 1, dp);
          break;
        case 'sawtooth': {
          const p = (phase + 0.5) % 1;
          v = 2 * p - 1 - blep(p, dp);
          break;
        }
        case 'triangle':
          v = 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5);
          break;
        default:
          v = Math.sin(2 * Math.PI * phase);
      }
      data[i] = v;
      phase = (phase + dp) % 1;
    }
    return { start, data };
  }

  private bufferSource(src: BufferSource): Clip {
    const buffer = src.buffer?.getChannelData() ?? new Float32Array(0);
    const skip = Math.round(src.offset * SAMPLE_RATE);
    const playable = (buffer.length - skip) / SAMPLE_RATE;
    const { start, length } = this.span(src.startTime, Math.min(src.stopTime, src.startTime + playable));
    return { start, data: buffer.slice(skip, skip + length) };
  }

  /** WebAudio's biquad formulas; lowpass and highpass Q are in decibels, bandpass Q is linear. */
  private filter(node: Biquad, clip: Clip): void {
    const { data } = clip;
    let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    let lastF = NaN;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const t = (clip.start + i) / SAMPLE_RATE;
      const f = Math.min(node.frequency.at(t), SAMPLE_RATE / 2 - 1);
      if (f !== lastF) {
        lastF = f;
        const w0 = (2 * Math.PI * f) / SAMPLE_RATE;
        const cos = Math.cos(w0);
        const q = node.Q.at(t);
        const alpha = node.type === 'bandpass' ? Math.sin(w0) / (2 * q) : Math.sin(w0) / (2 * 10 ** (q / 20));
        const a0 = 1 + alpha;
        if (node.type === 'lowpass') {
          b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
        } else if (node.type === 'highpass') {
          b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
        } else if (node.type === 'bandpass') {
          b0 = alpha; b1 = 0; b2 = -alpha;
        } else {
          throw new Error(`unsupported filter ${node.type}`);
        }
        b0 /= a0; b1 /= a0; b2 /= a0;
        a1 = (-2 * cos) / a0;
        a2 = (1 - alpha) / a0;
      }
      const x = data[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      data[i] = y;
    }
  }

  /** Feedback echo: a gain fed only by this delay and feeding back into it is the feedback path. */
  private delay(node: Delay): Clip {
    const isFeedback = (n: Node) => n instanceof Gain && n.inputs.length === 1 && n.inputs[0] === node;
    const feedback = node.inputs.find(isFeedback) as Gain | undefined;
    const dry = this.mix(node.inputs.filter((n) => !isFeedback(n)), 0);
    const d = Math.round(node.delayTime.value * SAMPLE_RATE);
    const fb = feedback?.gain.value ?? 0;
    const data = new Float32Array(this.end - dry.start);
    for (let i = d; i < data.length; i++) {
      const x = i - d < dry.data.length ? dry.data[i - d] : 0;
      data[i] = x + fb * data[i - d];
    }
    return { start: dry.start, data };
  }
}

function wav(samples: Float32Array, scale: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i] * scale)) * 32767), true);
  }
  return bytes;
}

function peak(samples: Float32Array): number {
  let m = 0;
  for (const v of samples) m = Math.max(m, Math.abs(v));
  return m;
}

/** Copies `clip` onto a zeroed timeline of `length` samples beginning at sample `from`. */
function excerpt(clip: Clip, from: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const j = from + i - clip.start;
    if (j >= 0 && j < clip.data.length) out[i] = clip.data[j];
  }
  return out;
}

interface MusicInternals {
  nodes: unknown;
  stepDuration: number;
  playStep(ctx: OfflineContext, nodes: unknown, index: number, t: number): void;
}

async function main(): Promise<void> {
  const ctx = new OfflineContext();
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = function () {
    return ctx;
  };
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  const { sfx, unlockAudio } = await import('../../src/audio.ts');
  const { music } = await import('../../src/music.ts');
  const { SONG_ORDER } = await import('../../src/song-data.ts');
  await unlockAudio();
  const master = ctx.destination.inputs[0] as Gain;
  const [sfxBus, musicBus] = master.inputs;

  // Effects sheet: each cue at its own time, randomised pitches pinned to their lowest note.
  const cues: { name: string; start: number; length: number }[] = [];
  const random = Math.random;
  Math.random = () => 0;
  let cursor = 0;
  for (const [name, play] of Object.entries(sfx)) {
    ctx.currentTime = cursor;
    const before = ctx.sources.length;
    (play as () => void)();
    const end = Math.max(...ctx.sources.slice(before).map((s) => s.stopTime));
    cues.push({ name, start: cursor, length: end - cursor });
    cursor = end + CUE_GAP;
  }
  Math.random = random;
  const sheetLength = Math.round(cursor * SAMPLE_RATE);

  // Each theme: four passes, the last two with the hammer's octave-up lead. The second and fourth
  // passes are kept, so each loop starts with the echo tail of the pass before it.
  const m = music as unknown as MusicInternals & { steps: readonly unknown[] };
  const STEPS = 256;
  const lead = 0.05;
  const songs: { skin: string; normal: Float32Array; hammer: Float32Array; loop: number }[] = [];
  for (const skin of SONG_ORDER) {
    music.setTheme(skin);
    music.setHammer(false);
    music.start();
    // Notes land on the music bus's child, which also feeds the echo. Drop the previous theme's
    // notes without unplugging that bus from the mix.
    (m.nodes as { bus: Gain }).bus.inputs = [];
    if (m.steps.length !== STEPS) throw new Error(`${skin} has ${m.steps.length} steps, expected ${STEPS}`);
    const loop = STEPS * m.stepDuration;
    for (let pass = 0; pass < 4; pass++) {
      music.setHammer(pass >= 2);
      for (let i = 0; i < STEPS; i++) m.playStep(ctx, m.nodes, i, lead + (pass * STEPS + i) * m.stepDuration);
    }
    const loopSamples = Math.round(loop * SAMPLE_RATE);
    const at = (pass: number) => Math.round((lead + pass * loop) * SAMPLE_RATE);
    const rendered = new Renderer(at(4) + SAMPLE_RATE).render(musicBus);
    songs.push({
      skin,
      normal: excerpt(rendered, at(1), loopSamples),
      hammer: excerpt(rendered, at(3), loopSamples),
      loop,
    });
  }
  globalThis.setInterval = realSetInterval;

  const sheet = excerpt(new Renderer(sheetLength).render(sfxBus), 0, sheetLength);
  const meadow = songs[0];
  // One scale for the effects and Meadow keeps their balance; every other theme is levelled to the
  // same peak so a sparser arrangement still sits next to the sound effects.
  const scale = PEAK / Math.max(peak(sheet), peak(meadow.normal), peak(meadow.hammer));
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  mkdirSync(join(root, 'audio'), { recursive: true });
  writeFileSync(join(root, 'audio/popscotch-sfx.wav'), wav(sheet, scale));
  for (const song of songs) {
    const own = PEAK / Math.max(peak(song.normal), peak(song.hammer));
    writeFileSync(join(root, `audio/popscotch-music-${song.skin}.wav`), wav(song.normal, own));
    writeFileSync(join(root, `audio/popscotch-music-${song.skin}-hammer.wav`), wav(song.hammer, own));
  }

  const round = (v: number) => Math.round(v * 10000) / 10000;
  const lines = cues.map((c) => `\t${c.name} = { start = ${round(c.start)}, length = ${round(c.length)} },`);
  writeFileSync(
    join(root, 'src/client/SoundSprite.luau'),
    [
      '-- Generated by roblox/tools/render-audio.ts (npm run roblox:audio); do not edit.',
      '-- Where each effect sits in popscotch-sfx.wav, in seconds.',
      'return {',
      `\tmusicLength = ${round(meadow.loop)},`,
      '\tcues = {',
      ...lines.map((l) => `\t${l}`),
      '\t},',
      '}',
      '',
    ].join('\n'),
  );
  console.log(
    `${cues.length} cues, sheet ${(sheetLength / SAMPLE_RATE).toFixed(1)} s, ${songs.length} themes, scale ${scale.toFixed(2)}`,
  );
  for (const song of songs) console.log(`  ${song.skin} ${(song.loop).toFixed(2)} s`);
}

await main();
