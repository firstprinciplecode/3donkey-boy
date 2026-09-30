import type { Game } from '../game';
import { ACTIONS, type BotAction } from './actions';
import { StateReader, type BotState } from './state';
import { viewGame } from './view';

/**
 * Test-player hook, loaded only in dev builds with `?bot` in the URL (see main.ts). It turns the
 * game into an environment you can step: pick an action, advance a fixed number of frames, read
 * the new state. The page keeps rendering, so a headed browser shows the bot playing.
 *
 * Buttons are pressed by dispatching the same keyboard events a player makes, so the game's input
 * handling is exercised exactly as in normal play.
 */

export type Outcome = 'playing' | 'died' | 'cleared' | 'gameover';

export interface StepReport {
  state: BotState;
  outcome: Outcome;
  frames: number;
  /** Best guess at what ended the attempt, when `outcome` is "died". */
  cause?: string;
}

/** What the on-screen readout adds to the raw game state: the decision just made. */
export interface BotNote {
  action?: BotAction;
  thinking?: boolean;
  confidence?: number;
  danger?: number;
  jumpUseful?: number;
  latencyMs?: number;
  probabilities?: Record<string, number>;
  outcome?: string;
  cause?: string;
}

export interface BotApi {
  actions: BotAction[];
  /** Starts a practice run on this level (1-based). `seed` makes barrels, fires and ghosts repeatable. */
  start(level: number, seed?: number): BotState;
  act(action: BotAction, frames?: number): StepReport;
  state(): BotState;
  /** Refreshes the corner readout. Pass a note to show the decision on top of the game state. */
  show(note?: BotNote): void;
}

export interface BotHost {
  game: Game;
  /** Hands frame stepping to the bot (true) or back to requestAnimationFrame (false). */
  setManual(on: boolean): void;
}

const FRAME = 1 / 60;
const DEFAULT_FRAMES = 8;
const START_LIMIT = 60 * 10;

export function installBot(host: BotHost): BotApi {
  const view = viewGame(host.game);
  const reader = new StateReader(view);
  const held = new Set<string>();

  const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const release = () => {
    for (const code of held) key('keyup', code);
    held.clear();
  };
  const frame = () => host.game.update(FRAME);
  const read = () => reader.read(view.clock);
  const panel = mountReadout();
  let lastNote: BotNote = {};
  const show = (note?: BotNote) => {
    if (note) lastNote = note;
    renderReadout(panel, read(), lastNote);
  };

  const outcome = (): Outcome => {
    if (view.state === 'dying') return 'died';
    if (view.state === 'clear') return 'cleared';
    if (view.state === 'gameover' || view.state === 'initials') return 'gameover';
    return 'playing';
  };

  const api: BotApi = {
    actions: Object.keys(ACTIONS) as BotAction[],

    start(level, seed) {
      release();
      if (seed !== undefined) Math.random = seeded(seed);
      view.startGame(level);
      view.practice = true;
      reader.reset();
      for (let i = 0; i < START_LIMIT && view.state !== 'playing'; i++) frame();
      show();
      return read();
    },

    act(action, frames = DEFAULT_FRAMES) {
      if (view.state === 'paused') key('keydown', 'KeyP');
      const want = new Set<string>(ACTIONS[action].filter((code) => code !== 'Space'));
      for (const code of held) if (!want.has(code)) key('keyup', code);
      for (const code of want) if (!held.has(code)) key('keydown', code);
      held.clear();
      for (const code of want) held.add(code);
      if ((ACTIONS[action] as readonly string[]).includes('Space')) {
        key('keydown', 'Space');
        key('keyup', 'Space');
      }

      let ran = 0;
      let result: Outcome = 'playing';
      while (ran < frames) {
        const before = read();
        frame();
        ran++;
        result = outcome();
        if (result !== 'playing') {
          release();
          const cause = result === 'died' ? deathCause(before) : undefined;
          show({ ...lastNote, action, thinking: false, outcome: result, ...(cause ? { cause } : {}) });
          return { state: read(), outcome: result, frames: ran, ...(cause ? { cause } : {}) };
        }
      }
      show({ ...lastNote, action, thinking: false });
      return { state: read(), outcome: result, frames: ran };
    },

    state: read,
    show,
  };

  host.setManual(true);
  Object.assign(window, { __bot: api });
  console.info('[bot] ready: window.__bot.start(level), .act(action, frames), .state()');
  return api;
}

const READOUT_CSS = `
  #bot-view {
    position: fixed;
    top: 64px;
    right: 12px;
    z-index: 50;
    width: 280px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(11, 13, 23, 0.9);
    color: #d9def5;
    font: 12px/1.45 ui-monospace, 'SF Mono', Menlo, monospace;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  #bot-view b { display: block; font-size: 16px; color: #38f2e0; }
  #bot-view .dim { color: #8b93b8; }
  #bot-view .bad { color: #ff8ab0; }
`;

function mountReadout(): HTMLElement {
  const style = document.createElement('style');
  style.textContent = READOUT_CSS;
  const panel = document.createElement('aside');
  panel.id = 'bot-view';
  document.head.append(style);
  document.body.append(panel);
  return panel;
}

function renderReadout(panel: HTMLElement, state: BotState, note: BotNote = {}): void {
  const p = state.player;
  const line = (label: string, text: string) => `<div><span class="dim">${label} </span>${text}</div>`;
  const threats = state.threats.slice(0, 4).map((t) => `${t.kind} ${signed(t.dx)}`).join(', ') || 'none';
  const ladder = state.ladders.up[0];
  const action = note.thinking ? 'thinking…' : (note.action ?? '—');
  const verdict = note.cause ?? note.outcome ?? '';
  const probs = note.probabilities
    ? Object.entries(note.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, probability]) => `${name} ${Math.round(probability * 100)}%`)
        .join(' · ')
    : '';
  panel.innerHTML = [
    `<b class="${verdict ? 'bad' : ''}">${action}</b>`,
    probs ? `<div class="dim">${probs}</div>` : '',
    note.confidence !== undefined ? line('sure', `${Math.round(note.confidence * 100)}%`) : '',
    note.danger !== undefined ? line('danger', note.danger.toFixed(2)) : '',
    note.latencyMs !== undefined ? line('jev', `${note.latencyMs} ms`) : '',
    verdict ? `<div class="bad">${verdict}</div>` : '',
    line('goal', `${state.objective.action} ${state.objective.distance} · step ${state.objective.step}/${state.objective.steps}`),
    line('where', `ring ${p.ring + 1} · ${p.state} · height ${p.height}`),
    line('run', `${state.run.lives} lives · bonus ${state.run.bonus}`),
    line('threats', threats),
    ladder ? line('ladder', `${ladder.open ? 'open' : `locked (${ladder.lock})`} ${signed(ladder.dx)}`) : '',
  ].join('');
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

/** What most likely ended the attempt, judged from the state one frame before. */
function deathCause(before: BotState): string {
  if (before.run.bonus <= 0) return 'bonus ran out';
  const close = before.threats.find((t) => Math.abs(t.dx) < 1.6 && t.dy > -1 && t.dy < 2.4);
  if (close) return `hit by ${close.kind}`;
  if (before.player.state === 'air') return 'fell into a pit';
  return 'unknown';
}

/** mulberry32: small, fast and good enough to make runs repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
