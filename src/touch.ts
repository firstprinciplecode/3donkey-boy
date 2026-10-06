import chevronIcon from './assets/touch/chevron.svg';
import jumpIcon from './assets/touch/jump.svg';
import type { Input } from './input';

const arrow = (side: string, code: string) =>
  `<span class="touch__arrow touch__arrow--${side}" data-dir="${code}"><img src="${chevronIcon}" alt="" /></span>`;

const MARKUP = `
<div class="touch__zone" data-zone></div>
<div class="touch__pad" data-pad aria-label="Direction pad">
  ${arrow('up', 'ArrowUp')}${arrow('down', 'ArrowDown')}${arrow('left', 'ArrowLeft')}${arrow('right', 'ArrowRight')}
</div>
<button type="button" class="touch__jump" data-code="Space" aria-label="Jump"><img src="${jumpIcon}" alt="" /></button>`;

/** Fraction of the pad's radius treated as the centre, where the thumb steers nowhere. */
const DEAD_CENTRE = 0.12;
/** Left and right win unless the thumb is this many times further up or down than sideways. */
const VERTICAL_BIAS = 1.4;
/** A press shorter than this is a tap: left and right still run for this long, up and down latch a climb. */
const TAP_TIME = 0.18;

/** Keeps a finger's moves and release coming to `el` even after it slides off; optional, so failures are ignored. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Pointer already released or not capturable; up/cancel events still release the control.
  }
}

/**
 * On-screen pad and jump button for touch screens, feeding the same key codes as the keyboard.
 * Pausing is the browser leaving the tab, which auto-pauses, and jump resumes. Mute stays on the M key.
 * CSS shows them only while the input mode is `touch`.
 */
export function mountTouchControls(input: Input): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch';
  root.innerHTML = MARKUP;
  document.body.appendChild(root);

  const pad = root.querySelector<HTMLElement>('[data-pad]');
  const zone = root.querySelector<HTMLElement>('[data-zone]');
  if (pad && zone) wirePad(zone, pad, input);

  for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-code]')) {
    const code = button.dataset.code ?? '';
    let pointer: number | null = null;
    const release = () => {
      if (pointer === null) return;
      pointer = null;
      button.classList.remove('on');
      input.touch(code, false);
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      capture(button, e.pointerId);
      button.classList.add('on');
      input.touch(code, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  // Stops the long-press menu and double-tap zoom stealing a held button.
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  return root;
}

/** The one direction a thumb at (dx, dy) of the pad's radius points: no diagonals, sideways first. */
function wedge(dx: number, dy: number): string | null {
  if (Math.hypot(dx, dy) < DEAD_CENTRE) return null;
  if (Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS) return dy < 0 ? 'ArrowUp' : 'ArrowDown';
  return dx < 0 ? 'ArrowLeft' : 'ArrowRight';
}

/**
 * Steers from anywhere in `zone`, aimed from the centre of the visible `pad`. A quick tap on left
 * or right still runs for TAP_TIME, so tapping steps; a quick tap on up or down is reported as a
 * tap, which the game turns into a climb that keeps going.
 */
function wirePad(zone: HTMLElement, pad: HTMLElement, input: Input): void {
  const arrows = new Map<string, HTMLElement>();
  for (const el of pad.querySelectorAll<HTMLElement>('[data-dir]')) arrows.set(el.dataset.dir ?? '', el);
  let pointer: number | null = null;
  let current: string | null = null;
  let since = 0;
  const lingering = new Map<string, number>();

  const light = () => {
    for (const [code, el] of arrows) el.classList.toggle('on', code === current || lingering.has(code));
  };
  const letGo = (code: string) => {
    lingering.delete(code);
    input.touch(code, false);
    light();
  };
  const engage = (code: string | null) => {
    if (code) {
      for (const [other, timer] of lingering) {
        clearTimeout(timer);
        if (other !== code) letGo(other);
      }
      lingering.clear();
      input.touch(code, true);
    }
    current = code;
    since = performance.now();
    light();
  };
  /** Ends the current direction; `lifted` is a finger leaving the screen rather than sliding on. */
  const release = (lifted: boolean) => {
    const code = current;
    current = null;
    if (!code) return;
    const held = (performance.now() - since) / 1000;
    const vertical = code === 'ArrowUp' || code === 'ArrowDown';
    if (lifted && held < TAP_TIME && !vertical) {
      lingering.set(code, window.setTimeout(() => letGo(code), (TAP_TIME - held) * 1000));
      return;
    }
    if (lifted && held < TAP_TIME) input.touchTap(code);
    letGo(code);
  };

  const aim = (e: PointerEvent) => {
    const box = pad.getBoundingClientRect();
    const radius = box.width / 2;
    const next = wedge((e.clientX - (box.left + radius)) / radius, (e.clientY - (box.top + box.height / 2)) / radius);
    if (next === current) return;
    release(false);
    engage(next);
  };

  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (pointer !== null) release(false);
    pointer = e.pointerId;
    capture(zone, e.pointerId);
    aim(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) aim(e);
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    release(true);
  };
  zone.addEventListener('pointerup', lift);
  zone.addEventListener('pointercancel', lift);
  zone.addEventListener('lostpointercapture', lift);
}
