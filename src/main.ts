import './style.css';
import { createBackdrop, createForeground, mountPaperGrain } from './backdrop';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
import { platform } from './platform';
import { Stage } from './stage';
import { mountTouchControls } from './touch';

const MAX_FRAME_DT = 1 / 20;

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function showFatal(message: string): void {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = message;
  document.body.appendChild(el);
}

async function boot(): Promise<void> {
  await platform.init();
  createBackdrop(element('backdrop'));
  createForeground(element('foreground'));
  mountPaperGrain(element('fx'));

  let stage: Stage;
  try {
    stage = new Stage(element('stage'));
  } catch (err) {
    console.error(err);
    showFatal('Popscotch needs WebGL. Please try a recent version of Chrome, Safari, Firefox or Edge.');
    return;
  }

  const input = new Input();
  input.onModeChange = (mode) => {
    document.body.dataset.input = mode;
  };
  if (platform.prefersGamepad) input.setMode('pad');
  else if (platform.kind === 'web' && window.matchMedia('(pointer: coarse)').matches) input.setMode('touch');
  document.body.dataset.input = input.mode;
  mountTouchControls(input);

  const hud = new Hud(element('hud'));
  hud.showQuit = platform.quit !== null;
  const game = new Game(stage, hud, input);
  game.onEvent = (event) => platform.onGameEvent(event);
  game.onQuit = platform.quit;
  platform.onInterrupt(() => game.autoPause());
  if (import.meta.env.DEV) Object.assign(window, { __game: game, __input: input });

  /** While a test bot drives the game it advances frames itself; the loop only keeps drawing. */
  let manual = false;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('bot')) {
    void import('./bot/hook').then(({ installBot }) => installBot({ game, setManual: (on) => (manual = on) }));
  }

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    if (!manual) {
      input.poll();
      game.update(dt);
    }
    stage.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.autoPause();
  });
}

void boot();
