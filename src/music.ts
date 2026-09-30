import { audioGraph } from './audio';
import type { SkinName } from './levels/types';
import { compileBars, SONGS, STEPS_PER_BAR, type Bar, type Step } from './song-data';

/**
 * Background music: an original bouncy synth loop in the style of early-70s Moog pop
 * (think "Popcorn"). Every level shares the rhythm and the A tonic, and each one is written in
 * its own mode so the colour note is on the beat: the major third, the flat second, the sharp
 * fourth, the tritone. Meadow plays the original tune. Notes are scheduled slightly ahead on the WebAudio clock so the groove
 * stays tight even when frames drop.
 */

const MAX_BPM_MUL = 1.24;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const VOLUME = 0.55;
const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);

const SCORES = Object.fromEntries(
  Object.entries(SONGS).map(([skin, theme]) => [skin, compileBars(theme.bars)]),
) as Record<SkinName, Step[]>;

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

/** Plucky filtered pair of oscillators, one detuned: the Moog-ish lead. */
function lead(ctx: AudioContext, out: AudioNode, t: number, note: number, theme: (typeof SONGS)[SkinName]): void {
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

  const [first, second] = theme.voices;
  for (const [type, detune] of [[first, 0], [second, theme.detune]] as const) {
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
  /** Step currently sounding, or -1 when nothing is. */
  private head = -1;
  private marks: { index: number; time: number }[] = [];
  private skin: SkinName = 'meadow';
  private steps: Step[] = SCORES.meadow;
  private speedMul = 1;
  private bpm = SONGS.meadow.bpm;
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
    this.head = -1;
    this.marks = [];
  }

  /** Next press of start() begins at this step. */
  cue(index: number): void {
    const length = Math.max(1, this.steps.length);
    this.step = ((index % length) + length) % length;
    this.head = -1;
    this.marks = [];
  }

  /** Which theme is loaded, whether it is running, and the step you can hear. */
  playhead(): { skin: SkinName; index: number; playing: boolean } {
    return { skin: this.skin, index: this.head, playing: this.timer !== null };
  }

  /** Switches to a level's tune, tempo and lead tone. The song keeps its place in the bar. */
  setTheme(skin: SkinName): void {
    this.skin = skin;
    this.steps = SCORES[skin];
    this.applyTempo();
  }

  /**
   * Plays these bars for one theme immediately. Returns an error message when a note
   * can't be read, and leaves the current tune in place.
   */
  setBars(skin: SkinName, bars: Bar[]): string | null {
    try {
      const steps = compileBars(bars);
      SONGS[skin].bars = bars.map((bar) => ({ lead: bar.lead, root: bar.root }));
      SCORES[skin] = steps;
      if (this.skin === skin) this.steps = steps;
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Bad notes';
    }
  }

  /** Nudges the tempo up with game speed (1 = normal). */
  setSpeed(mul: number): void {
    this.speedMul = mul;
    this.applyTempo();
  }

  private applyTempo(): void {
    this.bpm = SONGS[this.skin].bpm * Math.min(MAX_BPM_MUL, 1 + (this.speedMul - 1) * 0.35);
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
      this.marks.push({ index: this.step, time: this.nextTime });
      this.playStep(ctx, this.nodes, this.step, this.nextTime);
      this.nextTime += this.stepDuration;
      this.step = (this.step + 1) % this.steps.length;
    }
    const now = ctx.currentTime;
    while (this.marks.length > 1 && this.marks[1].time <= now) this.marks.shift();
    if (this.marks.length > 0 && this.marks[0].time <= now) this.head = this.marks[0].index;
  }

  private playStep(ctx: AudioContext, nodes: Nodes, index: number, t: number): void {
    const { lead: leadNote, bass: bassNote } = this.steps[index];
    const beat = index % STEPS_PER_BAR;
    if (leadNote !== null) lead(ctx, nodes.bus, t, leadNote + this.transpose, SONGS[this.skin]);
    if (bassNote !== null) bass(ctx, nodes.bus, t, bassNote);
    if (beat % 8 === 0) kick(ctx, nodes.bus, t);
    if (beat % 8 === 4) noiseHit(ctx, nodes.bus, nodes.noise, t, 'bandpass', 1800, 0.12, 0.09);
    if (beat % 4 === 2) noiseHit(ctx, nodes.bus, nodes.noise, t, 'highpass', 7000, 0.05, 0.03);
  }
}

export const music = new Music();
