import { audioGraph } from './audio';

/**
 * Background music: an original bouncy minor-key synth loop in the style of early-70s Moog pop
 * (think "Popcorn"). Notes are scheduled slightly ahead on the WebAudio clock so the groove stays
 * tight even when frames drop.
 */

const BASE_BPM = 132;
const MAX_BPM = 164;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const VOLUME = 0.55;
const STEPS_PER_BAR = 16;

/** One bar: 16 sixteenth-note slots for the lead ('.' = rest) plus the bass root. */
interface Bar {
  lead: string;
  root: string;
}

const VERSE: Bar[] = [
  { lead: 'A4 . E5 . A4 . C5 . A4 . E5 . D5 . C5 .', root: 'A2' },
  { lead: 'B4 . A4 . G4 . A4 . E4 . . . A4 . . .', root: 'A2' },
  { lead: 'F4 . C5 . F4 . A4 . F4 . C5 . B4 . A4 .', root: 'F2' },
  { lead: 'G4 . D5 . G4 . B4 . D5 C5 B4 . G4 . . .', root: 'G2' },
  { lead: 'A4 . E5 . A4 . C5 . A4 . E5 . D5 . C5 .', root: 'A2' },
  { lead: 'B4 . C5 . D5 . E5 . F5 . E5 . D5 . C5 .', root: 'F2' },
  { lead: 'D5 . F5 . D5 . A4 . B4 . C5 . D5 . B4 .', root: 'D2' },
  { lead: 'E5 . . . B4 . G#4 . E4 . . . . . . .', root: 'E2' },
];

const CHORUS: Bar[] = [
  { lead: 'C5 . G5 . E5 . G5 . C6 . G5 . E5 . G5 .', root: 'C3' },
  { lead: 'B4 . G5 . D5 . G5 . B5 . A5 . G5 . D5 .', root: 'G2' },
  { lead: 'A4 . E5 . C5 . E5 . A5 . G5 . E5 . C5 .', root: 'A2' },
  { lead: 'B4 . E5 . G#4 . B4 . E5 . D5 . C5 . B4 .', root: 'E2' },
  { lead: 'F4 . A4 . C5 . F5 . E5 . D5 . C5 . A4 .', root: 'F2' },
  { lead: 'G4 . B4 . D5 . G5 . F5 . E5 . D5 . B4 .', root: 'G2' },
  { lead: 'C5 . E5 . G5 . C6 . B5 . G5 . E5 . C5 .', root: 'C3' },
  { lead: 'E5 . D5 . C5 . B4 . G#4 . B4 . E5 . . .', root: 'E2' },
];

const SONG = [...VERSE, ...CHORUS];

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + accidental;
}

const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);

interface Step {
  lead: number | null;
  bass: number | null;
}

/** Flattened song: the lead as written, the bass bouncing root / octave on every eighth note. */
const STEPS: Step[] = SONG.flatMap(({ lead, root }) => {
  const slots = lead.split(' ');
  if (slots.length !== STEPS_PER_BAR) throw new Error(`bar needs ${STEPS_PER_BAR} slots: ${lead}`);
  const r = midi(root);
  return slots.map((slot, i) => ({
    lead: slot === '.' ? null : midi(slot),
    bass: i % 2 === 0 ? r + (i % 4 === 2 ? 12 : 0) : null,
  }));
});

interface Nodes {
  bus: GainNode;
  echo: DelayNode;
  noise: AudioBuffer;
}

function buildNodes(ctx: AudioContext, master: GainNode): Nodes {
  const bus = ctx.createGain();
  bus.gain.value = VOLUME;
  bus.connect(master);

  // Spacey feedback echo on everything, the signature of the era's synth records.
  const echo = ctx.createDelay(1);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  feedback.gain.value = 0.3;
  wet.gain.value = 0.22;
  bus.connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  return { bus, echo, noise };
}

/** Plucky filtered square + detuned saw: the Moog-ish lead. */
function lead(ctx: AudioContext, out: AudioNode, t: number, note: number): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(5200, t);
  filter.frequency.exponentialRampToValueAtTime(700, t + 0.12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.09, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  filter.connect(gain).connect(out);

  for (const [type, detune] of [['square', 0], ['sawtooth', 8]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq(note);
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

function bass(ctx: AudioContext, out: AudioNode, t: number, note: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq(note);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.15);
}

function kick(ctx: AudioContext, out: AudioNode, t: number): void {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.28, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.16);
}

function noiseHit(
  ctx: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  t: number,
  filterType: BiquadFilterType,
  cutoff: number,
  volume: number,
  length: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + length + 0.02);
}

class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nodes: Nodes | null = null;
  private step = 0;
  private nextTime = 0;
  private bpm = BASE_BPM;
  private transpose = 0;

  private get stepDuration(): number {
    return 60 / this.bpm / 4;
  }

  /** Starts (or resumes) the loop. No-op until audio has been unlocked by a user gesture. */
  start(): void {
    const graph = audioGraph();
    if (!graph || this.timer) return;
    this.nodes ??= buildNodes(graph.ctx, graph.music);
    this.nodes.echo.delayTime.value = this.stepDuration * 3;
    this.nextTime = graph.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(graph.ctx), TICK_MS);
  }

  /** Halts, keeping the position so start() carries on from here. */
  pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Halts and rewinds to the top of the song. */
  stop(): void {
    this.pause();
    this.step = 0;
  }

  /** Nudges the tempo up with game speed (1 = normal). */
  setSpeed(mul: number): void {
    this.bpm = Math.min(MAX_BPM, BASE_BPM * (1 + (mul - 1) * 0.35));
    if (this.nodes) this.nodes.echo.delayTime.value = this.stepDuration * 3;
  }

  /** Lead jumps an octave while the hammer is held. */
  setHammer(on: boolean): void {
    this.transpose = on ? 12 : 0;
  }

  private schedule(ctx: AudioContext): void {
    if (!this.nodes) return;
    // If the timer was throttled (background tab), skip ahead rather than burst-play the backlog.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, this.nodes, this.step, this.nextTime);
      this.nextTime += this.stepDuration;
      this.step = (this.step + 1) % STEPS.length;
    }
  }

  private playStep(ctx: AudioContext, nodes: Nodes, index: number, t: number): void {
    const { lead: leadNote, bass: bassNote } = STEPS[index];
    const beat = index % STEPS_PER_BAR;
    if (leadNote !== null) lead(ctx, nodes.bus, t, leadNote + this.transpose);
    if (bassNote !== null) bass(ctx, nodes.bus, t, bassNote);
    if (beat % 8 === 0) kick(ctx, nodes.bus, t);
    if (beat % 8 === 4) noiseHit(ctx, nodes.bus, nodes.noise, t, 'bandpass', 1800, 0.12, 0.09);
    if (beat % 4 === 2) noiseHit(ctx, nodes.bus, nodes.noise, t, 'highpass', 7000, 0.05, 0.03);
  }
}

export const music = new Music();
