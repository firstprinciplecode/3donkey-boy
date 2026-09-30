import { unlockAudio } from './audio';
import type { SkinName } from './levels/types';
import { music } from './music';
import { SONG_ORDER, SONGS, STEPS_PER_BAR, canonicalNote, songError, type Bar, type SongTheme } from './song-data';

const draft = structuredClone(SONGS) as Record<SkinName, SongTheme>;
let current: SkinName = 'meadow';
let playing = false;

function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const themes = required<HTMLElement>('#themes');
const grid = required<HTMLElement>('#grid');
const status = required<HTMLElement>('#status');
const playButton = required<HTMLButtonElement>('#play');
const piano = required<HTMLElement>('#piano');

interface Cell {
  bar: number;
  col: number;
}

const BASS_COL = STEPS_PER_BAR;
let anchor: Cell = { bar: 0, col: 0 };
let active: Cell = { bar: 0, col: 0 };
/** Where a pasted block starts. A row or column copy keeps this at its first cell. */
let origin: Cell = { bar: 0, col: 0 };
let dragging = false;
let dragKind: 'cell' | 'row' | 'col' | null = null;
let picked = false;
/** Last copied block, rests included, so a paste lands exactly as copied. */
let copied: string[][] | null = null;

function slotsOf(bar: Bar): string[] {
  const slots = bar.lead.trim().split(/\s+/);
  while (slots.length < STEPS_PER_BAR) slots.push('.');
  return slots.slice(0, STEPS_PER_BAR);
}

function writeLead(bar: Bar, slots: string[]): void {
  bar.lead = slots.join(' ');
}

function setStatus(message: string): void {
  status.textContent = message;
}

function apply(skin: SkinName): string | null {
  const error = music.setBars(skin, draft[skin].bars);
  return error;
}

function cellInput(bar: number, col: number): HTMLInputElement | null {
  return grid.querySelector<HTMLInputElement>(`input[data-bar="${bar}"][data-col="${col}"]`);
}

function cellValue(bar: number, col: number): string {
  const row = draft[current].bars[bar];
  if (!row) return '.';
  if (col === BASS_COL) return row.root;
  return slotsOf(row)[col] ?? '.';
}

function setCell(bar: number, col: number, value: string): void {
  const row = draft[current].bars[bar];
  if (!row || col < 0 || col > BASS_COL) return;
  if (col === BASS_COL) row.root = value;
  else {
    const slots = slotsOf(row);
    slots[col] = value === '' ? '.' : value;
    writeLead(row, slots);
  }
}

function selectionBounds(): { r0: number; r1: number; c0: number; c1: number } {
  return {
    r0: Math.min(anchor.bar, active.bar),
    r1: Math.max(anchor.bar, active.bar),
    c0: Math.min(anchor.col, active.col),
    c1: Math.max(anchor.col, active.col),
  };
}

function paintSelection(): void {
  for (const cell of grid.querySelectorAll<HTMLInputElement>('input.sel')) cell.classList.remove('sel');
  if (!picked) return;
  const { r0, r1, c0, c1 } = selectionBounds();
  for (let bar = r0; bar <= r1; bar++) {
    for (let col = c0; col <= c1; col++) cellInput(bar, col)?.classList.add('sel');
  }
}

function refreshValues(): void {
  for (const input of grid.querySelectorAll<HTMLInputElement>('input[data-bar]')) {
    const bar = Number(input.dataset.bar);
    const col = Number(input.dataset.col);
    input.value = cellValue(bar, col);
    input.classList.remove('bad');
  }
}

function choose(pos: Cell, extend: boolean): void {
  if (extend) active = pos;
  else {
    anchor = pos;
    active = pos;
    origin = pos;
  }
  picked = true;
  paintSelection();
  highlightKey();
}

function lastBar(): number {
  return draft[current].bars.length - 1;
}

function selectRow(bar: number, extend: boolean): void {
  if (!extend || !picked) {
    anchor = { bar, col: 0 };
    origin = { bar, col: 0 };
  } else anchor = { bar: anchor.bar, col: 0 };
  active = { bar, col: BASS_COL };
  picked = true;
  paintSelection();
  highlightKey();
}

function selectColumn(col: number, extend: boolean): void {
  if (!extend || !picked) {
    anchor = { bar: 0, col };
    origin = { bar: 0, col };
  } else anchor = { bar: 0, col: anchor.col };
  active = { bar: lastBar(), col };
  picked = true;
  paintSelection();
  highlightKey();
}

function highlightKey(): void {
  const note = picked ? canonicalNote(cellValue(active.bar, active.col)) : null;
  for (const key of piano.querySelectorAll<HTMLButtonElement>('.key')) {
    key.classList.toggle('on', key.dataset.note === note);
  }
  document.querySelector('#rest')?.classList.toggle('on', picked && cellValue(active.bar, active.col) === '.');
  const match = note ? piano.querySelector<HTMLButtonElement>(`.key[data-note="${note}"]`) : null;
  if (!dragging) match?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function writeNote(note: string): void {
  if (!picked) {
    setStatus('Click a cell first.');
    return;
  }
  setCell(active.bar, active.col, note);
  const error = apply(current);
  refreshValues();
  paintSelection();
  highlightKey();
  setStatus(error ?? 'Edited. Save to keep it.');
  if (error) return;
  const nextCol = active.col < BASS_COL - 1 ? active.col + 1 : active.col;
  if (nextCol !== active.col) choose({ bar: active.bar, col: nextCol }, false);
  cellInput(active.bar, active.col)?.focus();
}

function buildPiano(): void {
  const white = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const blackAfter: Record<string, string | null> = { C: 'C#', D: 'D#', E: null, F: 'F#', G: 'G#', A: 'A#', B: null };
  const whites: { note: string }[] = [];
  for (let octave = 2; octave <= 5; octave++) {
    for (const name of white) whites.push({ note: `${name}${octave}` });
  }
  whites.push({ note: 'C6' });
  const inner = document.createElement('div');
  inner.className = 'piano-inner';
  const whiteWidth = 34;
  inner.style.width = `${whites.length * whiteWidth}px`;
  whites.forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'key white';
    button.dataset.note = key.note;
    button.textContent = key.note;
    button.style.left = `${index * whiteWidth}px`;
    button.style.width = `${whiteWidth}px`;
    button.addEventListener('click', () => writeNote(key.note));
    inner.append(button);
    const name = key.note[0];
    const accidental = blackAfter[name];
    const octave = key.note.slice(1);
    if (!accidental || octave === '6') return;
    const black = document.createElement('button');
    black.type = 'button';
    black.className = 'key black';
    black.dataset.note = `${accidental}${octave}`;
    black.textContent = accidental;
    black.style.left = `${index * whiteWidth + whiteWidth - 11}px`;
    black.style.width = '22px';
    black.addEventListener('click', () => writeNote(`${accidental}${octave}`));
    inner.append(black);
  });
  piano.append(inner);
  required<HTMLButtonElement>('#rest').addEventListener('click', () => writeNote('.'));
}

function renderThemes(): void {
  themes.replaceChildren();
  SONG_ORDER.forEach((skin, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1}. ${draft[skin].title}`;
    button.setAttribute('aria-pressed', String(skin === current));
    button.addEventListener('click', () => {
      current = skin;
      renderThemes();
      renderGrid();
    });
    themes.append(button);
  });
}

function renderGrid(): void {
  const song = draft[current];
  shown = -1;
  grid.replaceChildren();
  const head = document.createElement('div');
  head.className = 'bar head';
  head.append(document.createElement('span'));
  for (let step = 0; step < STEPS_PER_BAR; step++) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'axis';
    label.textContent = String(step + 1);
    bindAxis(label, 'col', step);
    head.append(label);
  }
  const bassHead = document.createElement('button');
  bassHead.type = 'button';
  bassHead.className = 'axis';
  bassHead.textContent = 'Bass';
  bindAxis(bassHead, 'col', BASS_COL);
  head.append(bassHead);
  grid.append(head);

  song.bars.forEach((bar, barIndex) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'axis';
    label.textContent = String(barIndex + 1);
    bindAxis(label, 'row', barIndex);
    row.append(label);
    const slots = slotsOf(bar);
    slots.forEach((slot, step) => {
      const input = document.createElement('input');
      input.value = slot;
      input.maxLength = 4;
      input.spellcheck = false;
      input.dataset.index = String(barIndex * STEPS_PER_BAR + step);
      input.dataset.bar = String(barIndex);
      input.dataset.col = String(step);
      input.setAttribute('aria-label', `Bar ${barIndex + 1} step ${step + 1}`);
      bindCell(input, barIndex, step);
      input.addEventListener('change', () => {
        const next = slotsOf(bar);
        const value = input.value.trim();
        next[step] = value === '' ? '.' : value;
        writeLead(bar, next);
        input.value = next[step];
        const error = apply(current);
        input.classList.toggle('bad', error !== null && error.includes(`Bar ${barIndex + 1} step ${step + 1}`));
        setStatus(error ?? 'Edited. Save to keep it.');
      });
      row.append(input);
    });
    const bass = document.createElement('input');
    bass.value = bar.root;
    bass.maxLength = 4;
    bass.spellcheck = false;
    bass.dataset.bar = String(barIndex);
    bass.dataset.col = String(BASS_COL);
    bass.setAttribute('aria-label', `Bar ${barIndex + 1} bass`);
    bindCell(bass, barIndex, BASS_COL);
    bass.addEventListener('change', () => {
      bar.root = bass.value.trim();
      const error = apply(current);
      bass.classList.toggle('bad', error !== null);
      setStatus(error ?? 'Edited. Save to keep it.');
    });
    row.append(bass);
    grid.append(row);
  });
  paintSelection();
  highlightKey();
}

function bindAxis(el: HTMLElement, kind: 'row' | 'col', index: number): void {
  el.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (kind === 'row') selectRow(index, event.shiftKey);
    else selectColumn(index, event.shiftKey);
    dragging = !event.shiftKey;
    dragKind = kind;
  });
  el.addEventListener('mouseenter', () => {
    if (!dragging || dragKind !== kind) return;
    if (kind === 'row') selectRow(index, true);
    else selectColumn(index, true);
  });
}

function bindCell(input: HTMLInputElement, bar: number, col: number): void {
  const pos = (): Cell => ({ bar, col });
  input.addEventListener('mousedown', (event) => {
    if (event.shiftKey) event.preventDefault();
    choose(pos(), event.shiftKey);
    dragging = !event.shiftKey;
    dragKind = 'cell';
  });
  input.addEventListener('mouseenter', () => {
    if (!dragging || dragKind !== 'cell') return;
    active = pos();
    paintSelection();
    highlightKey();
  });
  input.addEventListener('focus', () => {
    highlightKey();
  });
}

function selectionTable(): string[][] {
  const { r0, r1, c0, c1 } = selectionBounds();
  const rows: string[][] = [];
  for (let bar = r0; bar <= r1; bar++) {
    const cols: string[] = [];
    for (let col = c0; col <= c1; col++) cols.push(cellValue(bar, col));
    rows.push(cols);
  }
  return rows;
}

function clipboardGrid(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .replace(/\n$/, '')
    .split('\n')
    .map((row) => row.split('\t'));
}

function copySelection(event: ClipboardEvent): void {
  const field = document.activeElement;
  const { r0, r1, c0, c1 } = selectionBounds();
  const many = picked && (r0 !== r1 || c0 !== c1);
  if (
    !many &&
    field instanceof HTMLInputElement &&
    field.selectionStart !== field.selectionEnd
  ) {
    return;
  }
  if (!picked) return;
  copied = selectionTable();
  event.preventDefault();
  event.clipboardData?.setData('text/plain', copied.map((row) => row.join('\t')).join('\n'));
  setStatus(`Copied ${copied.length}×${copied[0]?.length ?? 0}, rests included`);
}

function pasteSelection(event: ClipboardEvent): void {
  if (!picked) return;
  const text = event.clipboardData?.getData('text/plain') ?? '';
  const fromClipboard = text ? clipboardGrid(text) : [];
  const block = fromClipboard.length > 0 ? fromClipboard : copied;
  if (!block || block.length === 0) return;
  const field = document.activeElement;
  const single = block.length === 1 && block[0].length === 1;
  if (
    single &&
    !copied &&
    field instanceof HTMLInputElement &&
    field.selectionStart !== field.selectionEnd
  ) {
    return;
  }
  event.preventDefault();
  const { r0, r1, c0, c1 } = selectionBounds();
  const fill = single && (r0 !== r1 || c0 !== c1);
  if (fill) {
    const value = block[0][0].trim() || '.';
    for (let bar = r0; bar <= r1; bar++) {
      for (let col = c0; col <= c1; col++) setCell(bar, col, value);
    }
  } else {
    block.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        setCell(origin.bar + rowIndex, origin.col + colIndex, value.trim() || '.');
      });
    });
    anchor = { ...origin };
    active = {
      bar: Math.min(lastBar(), origin.bar + block.length - 1),
      col: Math.min(BASS_COL, origin.col + Math.max(...block.map((row) => row.length)) - 1),
    };
  }
  const error = apply(current);
  refreshValues();
  paintSelection();
  highlightKey();
  setStatus(error ?? 'Pasted. Save to keep it.');
}

playButton.addEventListener('click', () => {
  void (async () => {
    await unlockAudio();
    const error = apply(current);
    if (error) {
      setStatus(error);
      return;
    }
    const { r0, c0, c1 } = selectionBounds();
    const entireRow = picked && c0 === 0 && c1 >= STEPS_PER_BAR - 1;
    music.stop();
    music.setTheme(current);
    if (entireRow) music.cue(r0 * STEPS_PER_BAR);
    music.start();
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    setStatus(`Playing ${draft[current].title}`);
  })();
});

document.querySelector('#stop')?.addEventListener('click', () => {
  music.stop();
  playing = false;
  playButton.setAttribute('aria-pressed', 'false');
  setStatus('Stopped');
});

document.querySelector('#save')?.addEventListener('click', () => {
  void (async () => {
    for (const skin of SONG_ORDER) {
      const error = songError(draft[skin].bars);
      if (error) {
        setStatus(`${draft[skin].title}: ${error}`);
        return;
      }
    }
    const res = await fetch('/api/songs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error ?? 'Save failed');
      return;
    }
    setStatus(playing ? `Saved. Playing ${draft[current].title}` : 'Saved');
  })();
});

let shown = -1;

function followPlayhead(): void {
  const head = music.playhead();
  const index = head.playing && head.skin === current ? head.index : -1;
  if (index !== shown) {
    shown = index;
    for (const cell of grid.querySelectorAll<HTMLInputElement>('input.now')) cell.classList.remove('now');
    for (const row of grid.querySelectorAll<HTMLElement>('.bar.now')) row.classList.remove('now');
    if (index >= 0) {
      const cell = grid.querySelector<HTMLInputElement>(`input[data-index="${index}"]`);
      cell?.classList.add('now');
      cell?.parentElement?.classList.add('now');
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  requestAnimationFrame(followPlayhead);
}

window.addEventListener('mouseup', () => {
  dragging = false;
  dragKind = null;
});
document.addEventListener('copy', copySelection);
document.addEventListener('paste', pasteSelection);

buildPiano();
renderThemes();
renderGrid();
followPlayhead();
setStatus('Pick a theme, click a cell, and play a key.');
