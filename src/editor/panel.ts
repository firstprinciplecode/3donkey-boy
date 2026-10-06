import type { LevelDef, SpotDef } from '../levels/types';
import { levelTitle } from '../utils';
import { PATTERNS, sideName, spotText, terraceView, type Surface, type Tool } from './level-edit';
import { swatchGroups } from './palette';
import { handleKey, handleLabel, handleSpot, handleWidth, type Handle } from './pieces';

const TOOL_GROUPS: readonly { title: string; tools: readonly [Tool, string][] }[] = [
  { title: 'Route', tools: [['ladder', 'Ladder'], ['chute', 'Chute'], ['start', 'Start'], ['drum', 'Drum']] },
  { title: 'Floor', tools: [['pit', 'Pit'], ['crumble', 'Crumble'], ['conveyor', 'Conveyor'], ['platform', 'Platform'], ['ice', 'Ice']] },
  { title: 'Hazards', tools: [['spring', 'Spring'], ['vine', 'Vine'], ['jet', 'Jet'], ['drop', 'Drop']] },
  {
    title: 'Pickups',
    tools: [['gem', 'Gem'], ['hotdog', 'Hotdog'], ['oneup', '1-up'], ['hammer', 'Hammer'], ['key', 'Key'], ['relic', 'Relic'], ['letter-1', '1'], ['letter-u', 'U'], ['letter-p', 'P']],
  },
];

export const SNAPS: readonly number[] = [1, 0.5, 0.25];

export interface PanelState {
  def: LevelDef;
  index: number;
  levels: readonly LevelDef[];
  tier: number;
  spot: SpotDef | null;
  wall: { tier: number; side: number } | null;
  /** Neon look on the selected wall face, or null when it has none. */
  neonLook: 0 | 1 | null;
  selected: Handle | null;
  here: readonly Handle[];
  pending: boolean;
  surface: Surface;
  slot: number;
  snap: number;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  note: string;
  open: ReadonlySet<string>;
}

export function panelMarkup(state: PanelState): string {
  const place = state.spot ? section(state, 'place', 'Place here', placeBody(state)) : '';
  const paint = section(state, 'terrace', `Terrace ${state.tier + 1} paint`, terraceBody(state), !!state.wall);
  // A selected wall is edited in the paint section, right next to its colours.
  const selection = state.wall ? '' : section(state, 'selection', selectionTitle(state), selectionBody(state));
  return `
    <header class="bar">
      <h1>Level editor</h1>
      <a href="/?level=${state.index}" target="_blank" rel="noopener">Play</a>
      <span class="grow"></span>
      <button type="button" data-act="undo" title="Undo (⌘Z)" ${state.canUndo ? '' : 'disabled'}>Undo</button>
      <button type="button" data-act="redo" title="Redo (⇧⌘Z)" ${state.canRedo ? '' : 'disabled'}>Redo</button>
      <button type="button" class="primary" data-act="save" title="Save (⌘S)" ${state.dirty ? '' : 'disabled'}>Save</button>
    </header>
    <p id="status" class="status">${escape(state.note)}</p>
    <select data-act="level" aria-label="Level">${levelOptions(state)}</select>
    ${selection}
    ${state.wall ? paint : place}
    ${state.wall ? place : paint}
    ${section(state, 'view', 'Grid, view and keys', viewBody(state))}
    <footer><button type="button" class="ghost" data-act="revert">Revert level to original</button></footer>`;
}

function section(state: PanelState, id: string, title: string, body: string, forceOpen = false): string {
  return `<details data-section="${id}" ${forceOpen || state.open.has(id) ? 'open' : ''}><summary>${title}</summary><div class="body">${body}</div></details>`;
}

function levelOptions(state: PanelState): string {
  return state.levels
    .map((entry, i) => `<option value="${i}" ${i === state.index ? 'selected' : ''}>${i + 1}. ${levelTitle(entry.name)}</option>`)
    .join('');
}

function selectionTitle(state: PanelState): string {
  if (state.selected) return handleLabel(state.def, state.selected);
  if (state.spot) return 'Walkway spot';
  return 'Selection';
}

function selectionBody(state: PanelState): string {
  const { def, selected } = state;
  if (selected) {
    const spot = handleSpot(def, selected);
    const width = handleWidth(def, selected);
    const step = width > 0 ? 1 : state.snap;
    const fixed = selected.piece.kind === 'start' || selected.piece.kind === 'drum';
    return `
      <p class="where">${spot ? spotText(spot) : ''}</p>
      <div class="field">
        <label>Offset <input type="number" data-act="offset" step="${step}" value="${spot?.offset ?? 0}"></label>
        <button type="button" data-act="nudge" data-dir="-1" title="Nudge left (←)">◀</button>
        <button type="button" data-act="nudge" data-dir="1" title="Nudge right (→)">▶</button>
      </div>
      <div class="field">
        <span>Terrace</span>
        <button type="button" data-act="ring" data-dir="-1" title="Move down a terrace">Down</button>
        <button type="button" data-act="ring" data-dir="1" title="Move up a terrace">Up</button>
      </div>
      ${width > 0 ? spanTools(state, width) : ''}
      ${selected.piece.kind === 'ladder' ? lockTools(state, selected.piece.index) : ''}
      <div class="row">
        ${fixed ? '<p class="hint">Start and drum can be moved but not removed.</p>' : '<button type="button" class="danger" data-act="remove" title="Delete">Remove</button>'}
        <button type="button" data-act="deselect" title="Esc">Done</button>
      </div>
      <p class="hint">Drag the piece on the map to move it. Hold Alt while dragging to skip snapping.</p>`;
  }
  if (state.spot) {
    const list = state.here
      .map((handle) => `<li><button type="button" class="link" data-act="pick" data-key="${handleKey(handle)}">${handleLabel(def, handle)}</button></li>`)
      .join('');
    return `
      <p class="where">${spotText(state.spot)}</p>
      ${list ? `<p class="hint">Pieces here</p><ul class="here">${list}</ul>` : '<p class="hint">Nothing here yet. Place something below.</p>'}`;
  }
  return '<p class="hint">Click a piece to select it, or click a walkway or wall. The summit floor can only be painted.</p>';
}

function spanTools(state: PanelState, width: number): string {
  const conveyor = state.selected?.piece.kind === 'conveyor';
  return `
    <div class="field">
      <span>Width ${width}</span>
      <button type="button" data-act="width" data-dir="-1" title="Narrower ([)">−</button>
      <button type="button" data-act="width" data-dir="1" title="Wider (])">+</button>
      ${conveyor ? '<button type="button" data-act="flip">Flip direction</button>' : ''}
    </div>`;
}

function lockTools(state: PanelState, ladder: number): string {
  const current = state.def.locks.find((lock) => lock.ladder === ladder)?.kind ?? 'none';
  const option = (kind: string, text: string) =>
    `<button type="button" data-act="lock" data-lock="${kind}" data-ladder="${ladder}" aria-pressed="${current === kind}">${text}</button>`;
  return `
    <p class="hint">Lock</p>
    <div class="row">${option('none', 'None')}${option('key', 'Key')}${option('relics', 'Relics')}${option('switch', 'Switch here')}</div>`;
}

function placeBody(state: PanelState): string {
  const groups = TOOL_GROUPS.map((group) => `
    <p class="group">${group.title}</p>
    <div class="grid">${group.tools.map(([tool, text]) => `<button type="button" data-act="place" data-tool="${tool}">${text}</button>`).join('')}</div>`).join('');
  return `
    ${groups}
    <p class="group">Enemies</p>
    <div class="grid">
      <button type="button" data-act="from" data-patrol="patrols">Ghost from</button>
      <button type="button" data-act="from" data-patrol="crawlers">Monster from</button>
      <button type="button" data-act="from" data-patrol="totems">Totem from</button>
      <button type="button" class="primary" data-act="to" ${state.pending ? '' : 'disabled'}>…to here</button>
    </div>
    <p class="hint">Trees, carts and fences come from the theme, so they are not placed one by one.</p>`;
}

function terraceBody(state: PanelState): string {
  const terrace = terraceView(state.def, state.tier);
  const patterns = PATTERNS.map((pattern) =>
    `<button type="button" data-act="pattern" data-pattern="${pattern}" aria-pressed="${(terrace.pattern ?? 'checker') === pattern}">${capital(pattern)}</button>`,
  ).join('');
  const slots = (surface: Surface, count: number) => Array.from({ length: count }, (_, n) => {
    const colors = terrace[surface];
    const color = colors[n] ?? colors[0];
    const pressed = state.surface === surface && state.slot === n;
    return `<button type="button" class="slot" data-act="slot" data-surface="${surface}" data-slot="${n}" aria-pressed="${pressed}" style="background:${hex(color)}" title="${surface === 'top' ? 'Floor' : 'Wall'} colour ${n + 1}"></button>`;
  }).join('');
  const groups = swatchGroups(state.def).map((group) => `
    <p class="group">${group.title}</p>
    <div class="swatches">${group.colors.map((color) => `<button type="button" class="swatch" data-act="swatch" data-color="${color}" style="background:${hex(color)}" title="${hex(color)}"></button>`).join('')}</div>`).join('');
  const walls = state.tier === 0
    ? '<p class="hint">The bottom wall uses the theme base bands, so its colours are not editable.</p>'
    : `<div class="slots"><span>Wall</span>${slots('side', 2)}</div>`;
  return `
    <div class="row">${patterns}</div>
    <div class="slots"><span>Floor</span>${slots('top', 3)}</div>
    ${walls}
    ${state.wall ? wallBlock(state, state.wall) : ''}
    <p class="hint">Pick a slot, then a colour.</p>
    ${groups}`;
}

/** The selected wall face: which side it is, and its neon stripes. */
function wallBlock(state: PanelState, wall: { tier: number; side: number }): string {
  const face = `<p class="where"><strong>${capital(sideName(wall.side))} wall selected.</strong></p>`;
  if (wall.tier === 0) return `<div class="picked">${face}</div>`;
  const neon = (look: 'none' | 0 | 1, text: string) =>
    `<button type="button" data-act="neon" data-look="${look}" aria-pressed="${(state.neonLook ?? 'none') === look}">${text}</button>`;
  return `
    <div class="picked">
      ${face}
      <div class="field"><span>Neon stripes</span>${neon('none', 'None')}${neon(0, 'Pink')}${neon(1, 'Sunset')}</div>
      ${state.neonLook !== null ? '<p class="hint">Neon stripes cover this face, so the wall colours do not show on it.</p>' : ''}
    </div>`;
}

function viewBody(state: PanelState): string {
  const snaps = SNAPS.map((snap) => `<button type="button" data-act="snap" data-snap="${snap}" aria-pressed="${state.snap === snap}">${snap}</button>`).join('');
  return `
    <div class="field"><span>Snap</span>${snaps}</div>
    <div class="row">
      <button type="button" data-act="turn" data-dir="-1" title="Q">Turn ⟲</button>
      <button type="button" data-act="turn" data-dir="1" title="E">Turn ⟳</button>
      <button type="button" data-act="home" title="F">Reset view</button>
    </div>
    <dl class="keys">
      <dt>Drag</dt><dd>spin</dd>
      <dt>Shift + drag</dt><dd>tilt</dd>
      <dt>Right drag, Space + drag</dt><dd>pan</dd>
      <dt>Scroll, pinch</dt><dd>zoom at cursor</dd>
      <dt>W A S D</dt><dd>pan</dd>
      <dt>Q / E</dt><dd>quarter turn</dd>
      <dt>F</dt><dd>reset view</dd>
      <dt>← →</dt><dd>nudge selection</dd>
      <dt>[ ]</dt><dd>span width</dd>
      <dt>Delete</dt><dd>remove selection</dd>
      <dt>⌘Z, ⇧⌘Z</dt><dd>undo, redo</dd>
    </dl>`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
