const WIDTH_KEY = 'popscotch.editor.panel';
const OPEN_KEY = 'popscotch.editor.open';
const FOLD_KEY = 'popscotch.editor.folded';
const DEFAULT_WIDTH = 360;
const DEFAULT_OPEN = ['selection', 'place', 'terrace'];

/**
 * The side panel's width (drag the grip), whether it is folded away, and which sections are open.
 * All three survive a reload. `onResize` runs whenever the stage changes size.
 */
export function setupLayout(panel: HTMLElement, onResize: () => void): Set<string> {
  const root = document.documentElement;
  const grip = document.querySelector<HTMLElement>('#grip');
  const fold = document.querySelector<HTMLButtonElement>('#fold');
  const open = new Set<string>(readList(OPEN_KEY) ?? DEFAULT_OPEN);

  const setWidth = (width: number) => {
    const clamped = Math.round(Math.min(Math.max(width, 260), window.innerWidth * 0.6));
    root.style.setProperty('--panel', `${clamped}px`);
    localStorage.setItem(WIDTH_KEY, String(clamped));
    onResize();
  };
  const setFolded = (folded: boolean) => {
    document.body.classList.toggle('folded', folded);
    localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
    onResize();
  };

  const saved = Number(localStorage.getItem(WIDTH_KEY));
  if (saved) root.style.setProperty('--panel', `${saved}px`);
  if (localStorage.getItem(FOLD_KEY) === '1') document.body.classList.add('folded');

  grip?.addEventListener('pointerdown', (event) => {
    grip.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  grip?.addEventListener('pointermove', (event) => {
    if (grip.hasPointerCapture(event.pointerId)) setWidth(window.innerWidth - event.clientX);
  });
  grip?.addEventListener('pointerup', () => document.body.classList.remove('resizing'));
  grip?.addEventListener('dblclick', () => setWidth(DEFAULT_WIDTH));
  fold?.addEventListener('click', () => setFolded(!document.body.classList.contains('folded')));
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || isTyping(event.target)) return;
    event.preventDefault();
    setFolded(!document.body.classList.contains('folded'));
  });

  // `toggle` does not bubble, so listen in the capture phase.
  panel.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.dataset.section) return;
    if (details.open) open.add(details.dataset.section);
    else open.delete(details.dataset.section);
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  }, true);

  return open;
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function readList(key: string): string[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : null;
  } catch {
    return null;
  }
}
