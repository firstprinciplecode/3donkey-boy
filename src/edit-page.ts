import * as THREE from 'three';
import './editor/editor.css';
import { UndoStack } from './editor/history';
import { isTyping, setupLayout } from './editor/layout';
import {
  addPatrol,
  flipConveyor,
  paint,
  place,
  removePiece,
  resizeSpan,
  setLadderLock,
  setNeon,
  snapSpan,
  snapTo,
  spotText,
  type Surface,
  type Tool,
} from './editor/level-edit';
import { Marks } from './editor/marks';
import { Overlay } from './editor/overlay';
import { SNAPS, panelMarkup } from './editor/panel';
import { hitSurface, type SurfaceHit } from './editor/picking';
import { handleKey, handleLabel, handleSpot, handleWidth, listHandles, moveHandle, sameHandle, type Handle } from './editor/pieces';
import { EditorView } from './editor/view';
import { Level, squareCoords } from './level';
import { AUTHORED_LEVELS, LEVELS } from './levels/defs';
import { validateLevel } from './levels/validate';
import type { LevelDef, SpotDef, TilePattern } from './levels/types';
import { Stage } from './stage';
import { levelTitle } from './utils';
import { buildWorld, disposeWorld, levelNeonWalls } from './world';

const SNAP_KEY = 'popscotch.editor.snap';
/** Pixels of pointer travel before a press counts as a drag rather than a click. */
const DRAG_START = 4;
const FREE_STEP = 0.05;

type Wall = { tier: number; side: number };
type PatrolKey = 'patrols' | 'crawlers' | 'totems';
type Drag = {
  mode: 'press' | 'orbit' | 'pan' | 'move';
  x: number;
  y: number;
  travel: number;
  handle: Handle | null;
  target: SpotDef | null;
};

const panel = document.querySelector<HTMLElement>('#panel');
const readout = document.querySelector<HTMLElement>('#readout');
const stageEl = document.querySelector<HTMLElement>('#stage');
if (!panel || !readout || !stageEl) throw new Error('Missing editor markup');

const stage = new Stage(stageEl);
const view = new EditorView(stage);
const overlay = new Overlay();
const undoStack = new UndoStack();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const canvas = stage.renderer.domElement;
stage.scene.add(overlay.group);
const open = setupLayout(panel, () => stage.resize());

let index = Math.min(LEVELS.length - 1, Math.max(0, Number(new URLSearchParams(location.search).get('level')) || 0));
let def = structuredClone(LEVELS[index]) as LevelDef;
let level = new Level(def);
let world: THREE.Group | null = null;
let marks: Marks | null = null;
let tier = 0;
let spot: SpotDef | null = null;
let wall: Wall | null = null;
let selected: Handle | null = null;
let hovered: Handle | null = null;
let surface: Surface = 'top';
let slot = 0;
let snap = SNAPS.includes(Number(localStorage.getItem(SNAP_KEY))) ? Number(localStorage.getItem(SNAP_KEY)) : 0.5;
let pending: { key: PatrolKey; from: SpotDef } | null = null;
let dirty = false;
let drag: Drag | null = null;
let spaceHeld = false;
let note = 'Click a piece, walkway or wall. Right-drag or Space-drag to pan.';

// ---------------------------------------------------------------- state

function show(next: string): void {
  note = next;
  const el = panel?.querySelector('#status');
  if (el) el.textContent = next;
}

function loadLevel(next: number): void {
  index = next;
  def = structuredClone(LEVELS[index]) as LevelDef;
  undoStack.clear();
  dirty = false;
  pending = null;
  clearSelection();
  window.history.replaceState(null, '', `?level=${index}`);
  rebuild();
  view.frame(level);
  show(`${levelTitle(def.name)}. Click a piece, walkway or wall.`);
  render();
}

function rebuild(): void {
  if (world) {
    stage.scene.remove(world);
    disposeWorld(world);
  }
  level = new Level(def);
  world = buildWorld(level);
  stage.scene.add(world);
  stage.fitShadows(level.tierHalf(0));
  stage.renderer.shadowMap.needsUpdate = true;
  rebuildMarks();
  if (selected && !handleSpot(def, selected)) selected = null;
  if (selected) spot = handleSpot(def, selected);
  refreshHighlights();
}

function rebuildMarks(): void {
  if (marks) {
    stage.scene.remove(marks.group);
    marks.dispose();
  }
  marks = new Marks(level);
  stage.scene.add(marks.group);
}

/** Applies `change` to a copy and keeps it only if the level still validates. Returns whether it stuck. */
function commit(change: (draft: LevelDef) => boolean | void, message = 'Unsaved changes'): boolean {
  const draft = structuredClone(def) as LevelDef;
  const applied = change(draft) !== false;
  const errors = applied ? validateLevel(draft) : [];
  if (!applied || errors.length) {
    if (errors.length) show(`Not allowed: ${errors[0]}`);
    // A failed drag left its preview behind, so put the marks back where the level says.
    rebuildMarks();
    refreshHighlights();
    return false;
  }
  undoStack.record(def);
  def = draft;
  dirty = true;
  rebuild();
  render();
  show(message);
  return true;
}

function restore(next: LevelDef | null, message: string): void {
  if (!next) return;
  def = next;
  dirty = true;
  rebuild();
  render();
  show(message);
}

// ---------------------------------------------------------------- selection

function clearSelection(): void {
  selected = null;
  spot = null;
  wall = null;
}

function selectHandle(handle: Handle): void {
  const at = handleSpot(def, handle);
  if (!at) return;
  selected = handle;
  spot = at;
  wall = null;
  tier = at.ring;
  afterSelect(handleLabel(def, handle));
}

function selectSurface(hit: SurfaceHit): void {
  selected = null;
  tier = hit.tier;
  spot = hit.spot;
  wall = hit.surface === 'side' ? { tier: hit.tier, side: hit.side } : null;
  if (wall && wall.tier > 0) {
    surface = 'side';
    slot = Math.min(slot, 1);
  } else if (!wall) surface = 'top';
  afterSelect(wall ? `Wall of terrace ${wall.tier + 1}` : spot ? spotText(spot) : 'Summit floor');
}

function afterSelect(message: string): void {
  refreshHighlights();
  render();
  show(pending ? 'Now pick the other end, then press "to here".' : message);
}

function refreshHighlights(): void {
  marks?.highlight(hovered, selected);
  overlay.select(level, { tile: selected ? null : spot, wall, pin: selected ? spot : null });
}

/** Handles sitting on the selected walkway spot, so stacked pieces can be picked from a list. */
function handlesHere(): Handle[] {
  if (!spot) return [];
  const here = spot;
  return listHandles(def).filter((handle) => {
    const at = handleSpot(def, handle);
    if (!at || at.ring !== here.ring || at.side !== here.side) return false;
    return Math.abs(at.offset - here.offset) < Math.max(0.8, handleWidth(def, handle) / 2);
  });
}

function wallNeon(): 0 | 1 | null {
  const face = wall;
  if (!face) return null;
  return levelNeonWalls(level).find((entry) => entry.tier === face.tier && entry.side === face.side)?.look ?? null;
}

// ---------------------------------------------------------------- panel

function render(): void {
  if (!panel) return;
  const scroll = panel.scrollTop;
  panel.innerHTML = panelMarkup({
    def,
    index,
    levels: LEVELS,
    tier,
    spot,
    wall,
    neonLook: wallNeon(),
    selected,
    here: handlesHere(),
    pending: !!pending,
    surface,
    slot,
    snap,
    dirty,
    canUndo: undoStack.canUndo,
    canRedo: undoStack.canRedo,
    note,
    open,
  });
  panel.scrollTop = scroll;
}

panel.addEventListener('click', (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  const data = button.dataset;
  switch (data.act) {
    case 'undo':
      return undo();
    case 'redo':
      return redo();
    case 'save':
      return void persist(def);
    case 'revert':
      return revert();
    case 'pick': {
      const handle = handlesHere().find((entry) => handleKey(entry) === data.key);
      if (handle) selectHandle(handle);
      return;
    }
    case 'deselect':
      clearSelection();
      return afterSelect('Nothing selected');
    case 'remove':
      return removeSelected();
    case 'nudge':
      return nudge(Number(data.dir) === 1 ? 1 : -1);
    case 'ring':
      return changeRing(Number(data.dir) === 1 ? 1 : -1);
    case 'width':
      return resize(Number(data.dir) === 1 ? 1 : -1);
    case 'flip':
      if (spot) commit((draft) => flipConveyor(draft, spot as SpotDef));
      return;
    case 'lock': {
      const kind = data.lock;
      if (!spot || (kind !== 'none' && kind !== 'key' && kind !== 'relics' && kind !== 'switch')) return;
      const at = spot;
      commit((draft) => setLadderLock(draft, Number(data.ladder), kind, at));
      return;
    }
    case 'place':
      if (spot && data.tool) placeTool(data.tool as Tool, spot);
      return;
    case 'from':
      if (spot && (data.patrol === 'patrols' || data.patrol === 'crawlers' || data.patrol === 'totems')) {
        pending = { key: data.patrol, from: { ...spot } };
        render();
        show('Now click the other end on the same terrace, then press "to here".');
      }
      return;
    case 'to':
      return finishPatrol();
    case 'neon': {
      if (!wall) return;
      const { tier: face, side } = wall;
      const look = data.look === '0' ? 0 : data.look === '1' ? 1 : null;
      const current = levelNeonWalls(level);
      commit((draft) => setNeon(draft, current, face, side, look), look === null ? 'Neon stripes removed' : 'Neon stripes added');
      return;
    }
    case 'pattern':
      if (isPattern(data.pattern)) {
        const pattern = data.pattern;
        commit((draft) => paint(draft, tier, { pattern }));
      }
      return;
    case 'slot':
      surface = data.surface === 'side' ? 'side' : 'top';
      slot = Number(data.slot);
      return render();
    case 'swatch': {
      const color = Number(data.color);
      commit((draft) => paint(draft, tier, { surface, slot, color }));
      return;
    }
    case 'snap':
      snap = Number(data.snap);
      localStorage.setItem(SNAP_KEY, String(snap));
      return render();
    case 'turn':
      return view.turn(Number(data.dir) === 1 ? 1 : -1);
    case 'home':
      return view.frame(level);
  }
});

panel.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.dataset.act === 'level') {
    const next = Number(target.value);
    if (dirty && !confirm('Discard unsaved changes to this level?')) {
      target.value = String(index);
      return;
    }
    loadLevel(next);
  } else if (target instanceof HTMLInputElement && target.dataset.act === 'offset' && selected && spot) {
    const value = Number(target.value);
    if (Number.isFinite(value)) moveSelected({ ...spot, offset: value });
  }
});

function placeTool(tool: Tool, at: SpotDef): void {
  const ok = commit((draft) => place(draft, at, tool), `Placed ${tool}`);
  if (!ok) return;
  const made = handlesHere().filter((handle) =>
    handle.piece.kind === 'item' ? def.items[handle.piece.index]?.type === tool : handle.piece.kind === tool,
  );
  const last = made[made.length - 1];
  if (last) selectHandle(last);
}

function finishPatrol(): void {
  if (!spot || !pending) return;
  if (pending.from.ring !== spot.ring) {
    show('A patrol stays on one terrace. Pick an end on the same terrace.');
    return;
  }
  const { key, from } = pending;
  const to = spot;
  pending = null;
  commit((draft) => addPatrol(draft, key, from, to), 'Patrol added');
}

function removeSelected(): void {
  if (!selected) return;
  const piece = selected.piece;
  if (!('index' in piece)) {
    show('Start and drum can be moved but not removed.');
    return;
  }
  const label = handleLabel(def, selected);
  const draft = structuredClone(def) as LevelDef;
  removePiece(draft, piece);
  if (validateLevel(draft).length) {
    show(`Not allowed: ${validateLevel(draft)[0]}`);
    return;
  }
  selected = null;
  commit((next) => removePiece(next, piece), `Removed ${label}`);
}

function moveSelected(to: SpotDef): void {
  if (!selected) return;
  const handle = selected;
  const width = handleWidth(def, handle);
  const target = { ...to, offset: width > 0 ? snapSpan(to.offset, width) : to.offset };
  if (!commit((draft) => moveHandle(draft, handle, target), spotText(target))) {
    if (handle.end && target.ring !== handleSpot(def, handle)?.ring) show('A patrol end stays on its own terrace.');
    render();
  }
}

function nudge(dir: 1 | -1): void {
  if (!selected || !spot) return;
  const step = handleWidth(def, selected) > 0 ? 1 : snap;
  moveSelected({ ...spot, offset: snapTo(spot.offset + dir * step, step) });
}

function changeRing(dir: 1 | -1): void {
  if (!selected || !spot) return;
  const ring = spot.ring + dir;
  if (ring < 0 || ring >= level.ringCount) {
    show('There is no terrace that way.');
    return;
  }
  const limit = level.ringRadius(ring) - 1;
  moveSelected({ ...spot, ring, offset: THREE.MathUtils.clamp(spot.offset, -limit, limit) });
  tier = ring;
}

function resize(dir: 1 | -1): void {
  if (!spot || !selected || handleWidth(def, selected) === 0) return;
  const at = spot;
  commit((draft) => resizeSpan(draft, at, dir));
}

function undo(): void {
  restore(undoStack.undo(def), 'Undone');
}

function redo(): void {
  restore(undoStack.redo(def), 'Redone');
}

function revert(): void {
  if (!confirm(`Revert ${levelTitle(def.name)} to the original authored level?`)) return;
  undoStack.record(def);
  def = structuredClone(AUTHORED_LEVELS[index]) as LevelDef;
  pending = null;
  clearSelection();
  rebuild();
  void persist(null);
}

function isPattern(value: string | undefined): value is TilePattern {
  return value === 'checker' || value === 'gingham' || value === 'speckle' || value === 'rows' || value === 'border' || value === 'stripes';
}

async function persist(next: LevelDef | null): Promise<void> {
  show('Saving…');
  const response = await fetch('/api/level', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, def: next }),
  });
  const payload = (await response.json()) as { error?: string };
  if (response.ok) dirty = false;
  render();
  show(response.ok ? (next ? 'Saved' : 'Reverted to the original level') : (payload.error ?? 'Save failed'));
}

// ---------------------------------------------------------------- pointer

function aimRay(event: PointerEvent | WheelEvent): void {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
}

/** Whatever the pointer is over: the nearest pieces first, then the floor or wall behind them. */
function probe(): { pieces: Handle[]; surface: SurfaceHit | null } {
  const surfaceHit = hitSurface(level, raycaster.ray, snap);
  return { pieces: marks?.pick(raycaster, surfaceHit?.t) ?? [], surface: surfaceHit };
}

/** Projects the pointer onto `ring`'s floor so a dragged piece slides along its own terrace. */
function dragTarget(handle: Handle, ring: number, free: boolean): SpotDef | null {
  const ray = raycaster.ray;
  if (Math.abs(ray.direction.y) < 1e-5) return null;
  const t = (level.tierTop(ring) - ray.origin.y) / ray.direction.y;
  if (t < 0) return null;
  const { side, offset } = squareCoords(ray.origin.x + ray.direction.x * t, ray.origin.z + ray.direction.z * t);
  const width = handleWidth(def, handle);
  const limit = level.ringRadius(ring) - 1 - width / 2;
  const clamped = THREE.MathUtils.clamp(offset, -limit, limit);
  const snapped = width > 0 ? snapSpan(clamped, width) : snapTo(clamped, free ? FREE_STEP : snap);
  return { ring, side, offset: snapped };
}

function hover(): void {
  const { pieces, surface: hit } = probe();
  hovered = pieces[0] ?? null;
  marks?.highlight(hovered, selected);
  if (hovered) {
    overlay.hover(level, null);
    canvas.dataset.mode = 'hover';
    if (readout) readout.textContent = handleLabel(def, hovered);
    return;
  }
  canvas.dataset.mode = '';
  const face: Wall | null = hit?.surface === 'side' ? { tier: hit.tier, side: hit.side } : null;
  overlay.hover(level, hit ? { spot: hit.spot, wall: face } : null);
  if (readout) readout.textContent = !hit ? '' : face ? `Wall of terrace ${face.tier + 1}` : hit.spot ? spotText(hit.spot) : 'Summit';
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  aimRay(event);
  const panning = event.button === 1 || event.button === 2 || spaceHeld;
  const grabbed = !panning && event.button === 0 && !event.shiftKey ? (probe().pieces[0] ?? null) : null;
  drag = { mode: panning ? 'pan' : 'press', x: event.clientX, y: event.clientY, travel: 0, handle: grabbed, target: null };
  canvas.dataset.mode = panning ? 'pan' : '';
});

canvas.addEventListener('pointermove', (event) => {
  aimRay(event);
  if (!drag || !canvas.hasPointerCapture(event.pointerId)) {
    hover();
    return;
  }
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.travel += Math.hypot(dx, dy);
  if (drag.mode === 'press' && drag.travel > DRAG_START) {
    drag.mode = drag.handle ? 'move' : 'orbit';
    if (drag.handle && !sameHandle(drag.handle, selected)) selectHandle(drag.handle);
    canvas.dataset.mode = drag.mode;
  }
  if (drag.mode === 'pan') view.pan(dx, dy);
  else if (drag.mode === 'orbit') {
    if (event.shiftKey) view.tilt(dy);
    else view.orbit(dx);
  } else if (drag.mode === 'move' && drag.handle) {
    const from = handleSpot(def, drag.handle);
    const target = from ? dragTarget(drag.handle, from.ring, event.altKey) : null;
    if (!target) return;
    drag.target = target;
    marks?.preview(drag.handle, target);
    overlay.pin(level, target);
    if (readout) readout.textContent = `${handleLabel(def, drag.handle)} → ${spotText(target)}`;
  }
});

canvas.addEventListener('pointerup', (event) => {
  const done = drag;
  drag = null;
  canvas.dataset.mode = '';
  if (!done) return;
  aimRay(event);
  if (done.mode === 'move' && done.handle && done.target) {
    const before = handleSpot(def, done.handle);
    const moved = before && (before.side !== done.target.side || before.offset !== done.target.offset);
    if (moved) moveSelected(done.target);
    hover();
    return;
  }
  if (done.mode !== 'press') return;
  const { pieces, surface: hit } = probe();
  if (pieces.length) {
    // Clicking the selected piece again steps to the next one stacked under the cursor.
    const at = pieces.findIndex((handle) => sameHandle(handle, selected));
    selectHandle(at >= 0 ? pieces[(at + 1) % pieces.length] : pieces[0]);
  } else if (hit) selectSurface(hit);
  else {
    clearSelection();
    afterSelect('Nothing selected');
  }
});

canvas.addEventListener('pointerleave', () => {
  if (drag) return;
  hovered = null;
  overlay.hover(level, null);
  marks?.highlight(null, selected);
  if (readout) readout.textContent = '';
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  aimRay(event);
  const lines = event.deltaMode === 1 ? 16 : 1;
  // Trackpad pinches arrive as ctrl+wheel with small deltas, so they get a stronger response.
  const speed = event.ctrlKey ? 0.01 : 0.0015;
  view.zoomAt(Math.exp(-event.deltaY * lines * speed), ndc);
}, { passive: false });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// ---------------------------------------------------------------- keys

window.addEventListener('keydown', (event) => {
  if (isTyping(event.target)) return;
  const meta = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (meta && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (meta && key === 'y') {
    event.preventDefault();
    redo();
  } else if (meta && key === 's') {
    event.preventDefault();
    void persist(def);
  } else if (meta) return;
  else if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld = true;
    canvas.dataset.mode = 'pan';
  } else if (key === 'escape') {
    pending = null;
    clearSelection();
    afterSelect('Nothing selected');
  } else if (key === 'delete' || key === 'backspace') removeSelected();
  else if (key === 'arrowleft' && selected) nudge(-1);
  else if (key === 'arrowright' && selected) nudge(1);
  else if (key === '[') resize(-1);
  else if (key === ']') resize(1);
  else if (key === 'q') view.turn(-1);
  else if (key === 'e') view.turn(1);
  else if (key === 'f') view.frame(level);
  else if (key === 'w' || key === 'arrowup') view.pan(0, 60);
  else if (key === 's' || key === 'arrowdown') view.pan(0, -60);
  else if (key === 'a' || key === 'arrowleft') view.pan(60, 0);
  else if (key === 'd' || key === 'arrowright') view.pan(-60, 0);
  else return;
  if (!meta && key !== ' ') event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  spaceHeld = false;
  if (!drag) canvas.dataset.mode = '';
});

window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});

loadLevel(index);
if (import.meta.env.DEV) Object.assign(window, { __editor: { stage, overlay } });
requestAnimationFrame(function frame() {
  overlay.fitZoom(stage.camera.zoom);
  stage.render();
  requestAnimationFrame(frame);
});
