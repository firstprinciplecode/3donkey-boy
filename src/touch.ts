import chevronIcon from './assets/touch/chevron.svg';
import jumpIcon from './assets/touch/jump.svg';
import type { Input } from './input';

const arrow = (side: string, code: string) =>
  `<span class="touch__arrow touch__arrow--${side}" data-dir="${code}"><img src="${chevronIcon}" alt="" /></span>`;

const MARKUP = `
<div class="touch__pad" data-pad aria-label="Direction pad">
  ${arrow('up', 'ArrowUp')}${arrow('down', 'ArrowDown')}${arrow('left', 'ArrowLeft')}${arrow('right', 'ArrowRight')}
</div>
<button type="button" class="touch__jump" data-code="Space" aria-label="Jump"><img src="${jumpIcon}" alt="" /></button>
<div class="touch__menu">
  <button type="button" class="touch__small" data-code="KeyP" aria-label="Pause">II</button>
  <button type="button" class="touch__small" data-code="KeyM" aria-label="Mute">&#9835;</button>
</div>`;

/** Fraction of the pad's radius the thumb must travel before a direction engages. */
const ENGAGE = 0.3;

/** Keeps a finger's moves and release coming to `el` even after it slides off; optional, so failures are ignored. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Pointer already released or not capturable; up/cancel events still release the control.
  }
}

/**
 * On-screen pad and buttons for touch screens, feeding the same key codes as the keyboard.
 * CSS shows them only while the input mode is `touch`.
 */
export function mountTouchControls(input: Input): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch';
  root.innerHTML = MARKUP;
  document.body.appendChild(root);

  const pad = root.querySelector<HTMLElement>('[data-pad]');
  if (pad) wirePad(pad, input);

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

function wirePad(pad: HTMLElement, input: Input): void {
  const arrows = new Map<string, HTMLElement>();
  for (const el of pad.querySelectorAll<HTMLElement>('[data-dir]')) arrows.set(el.dataset.dir ?? '', el);
  let pointer: number | null = null;
  let held = new Set<string>();

  const apply = (next: Set<string>) => {
    for (const code of held) if (!next.has(code)) input.touch(code, false);
    for (const code of next) if (!held.has(code)) input.touch(code, true);
    for (const [code, el] of arrows) el.classList.toggle('on', next.has(code));
    held = next;
  };

  const aim = (e: PointerEvent) => {
    const box = pad.getBoundingClientRect();
    const radius = box.width / 2;
    const dx = (e.clientX - (box.left + radius)) / radius;
    const dy = (e.clientY - (box.top + box.height / 2)) / radius;
    const next = new Set<string>();
    if (dx < -ENGAGE) next.add('ArrowLeft');
    if (dx > ENGAGE) next.add('ArrowRight');
    if (dy < -ENGAGE) next.add('ArrowUp');
    if (dy > ENGAGE) next.add('ArrowDown');
    apply(next);
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointer = e.pointerId;
    capture(pad, e.pointerId);
    aim(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) aim(e);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    apply(new Set());
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  pad.addEventListener('lostpointercapture', release);
}
