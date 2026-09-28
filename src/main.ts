import './style.css';
import { createBackdrop, createForeground } from './backdrop';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
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

function boot(): void {
  createBackdrop(element('backdrop'));
  createForeground(element('foreground'));

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
  if (window.matchMedia('(pointer: coarse)').matches) input.setMode('touch');
  document.body.dataset.input = input.mode;
  mountTouchControls(input);

  const game = new Game(stage, new Hud(element('hud')), input);
  if (import.meta.env.DEV) Object.assign(window, { __game: game, __input: input });

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
    last = now;
    input.poll();
    game.update(dt);
    stage.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.autoPause();
  });
}

boot();
