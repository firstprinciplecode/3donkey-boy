// Static decorative SVG (no runtime data is interpolated).

const GHOST_SVG = `
<svg viewBox="0 0 22 18" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="0" width="12" height="6" fill="#6fe0da" fill-opacity=".8"/>
  <rect x="8" y="2" width="6" height="3" fill="#2e2e38"/>
  <rect x="4" y="6" width="14" height="8" fill="#1b1b22"/>
  <rect x="0" y="6" width="4" height="2" fill="#1b1b22"/><rect x="1" y="8" width="3" height="2" fill="#1b1b22"/>
  <rect x="18" y="6" width="4" height="2" fill="#1b1b22"/><rect x="18" y="8" width="3" height="2" fill="#1b1b22"/>
  <rect x="6" y="8" width="2" height="2" fill="#ff2f7a"/><rect x="14" y="8" width="2" height="2" fill="#ff2f7a"/>
  <rect x="7" y="11" width="1" height="2" fill="#f4f1e6"/><rect x="9" y="11" width="1" height="2" fill="#f4f1e6"/>
  <rect x="12" y="11" width="1" height="2" fill="#f4f1e6"/><rect x="14" y="11" width="1" height="2" fill="#f4f1e6"/>
  <rect x="5" y="14" width="1" height="2" fill="#1b1b22"/><rect x="8" y="14" width="1" height="3" fill="#1b1b22"/>
  <rect x="11" y="14" width="1" height="2" fill="#1b1b22"/><rect x="13" y="14" width="1" height="3" fill="#1b1b22"/>
  <rect x="16" y="14" width="1" height="2" fill="#1b1b22"/>
</svg>`;

function ghost(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `ghost ${className}`;
  el.innerHTML = GHOST_SVG;
  return el;
}

const STAR_COUNT = 90;

/** Twinkling stars; CSS only shows them at dusk (faint) and night. */
function stars(): HTMLDivElement {
  const layer = document.createElement('div');
  layer.className = 'stars';
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement('span');
    const size = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1.4;
    star.style.cssText = [
      `left:${(Math.random() * 100).toFixed(2)}%`,
      `top:${(Math.random() * Math.random() * 90).toFixed(2)}%`,
      `width:${size}px`,
      `height:${size}px`,
      `animation-delay:${(-Math.random() * 4).toFixed(2)}s`,
      `animation-duration:${(2 + Math.random() * 3).toFixed(2)}s`,
    ].join(';');
    layer.appendChild(star);
  }
  return layer;
}

/** Background layer: stars and far-away blurred ghosts behind the canvas (the 3D scenery does the rest). */
export function createBackdrop(root: HTMLElement): void {
  root.append(stars(), ghost('ghost--far g-a'), ghost('ghost--far g-b'));
}

const FLAKE_COUNT = 40;
const LEAVES = ['#e8612c', '#ff9a1f', '#ffd23a', '#b8471f'];

/** Snow, leaves or embers depending on the level skin; CSS decides which (or none) show. */
function weather(): HTMLDivElement {
  const layer = document.createElement('div');
  layer.className = 'weather';
  for (let i = 0; i < FLAKE_COUNT; i++) {
    const flake = document.createElement('span');
    const near = Math.random() < 0.25;
    flake.style.cssText = [
      `left:${(Math.random() * 100).toFixed(2)}%`,
      `--size:${(near ? 7 + Math.random() * 5 : 3 + Math.random() * 3).toFixed(1)}px`,
      `--blur:${near ? 2 : 0}px`,
      `--dur:${(near ? 6 + Math.random() * 4 : 10 + Math.random() * 8).toFixed(2)}s`,
      `--delay:${(-Math.random() * 18).toFixed(2)}s`,
      `--drift:${((Math.random() - 0.5) * 30).toFixed(1)}vw`,
      `--leaf:${LEAVES[i % LEAVES.length]}`,
    ].join(';');
    layer.appendChild(flake);
  }
  return layer;
}

/** Foreground layer: big out-of-focus ghosts at the edges, like the poster's depth of field. */
export function createForeground(root: HTMLElement): void {
  root.append(weather(), ghost('ghost--near g-c'), ghost('ghost--near g-d'), ghost('ghost--near g-e'));
}
