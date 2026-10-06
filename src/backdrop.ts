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

/** Background layer: stars behind the canvas (the 3D scenery does the rest). */
export function createBackdrop(root: HTMLElement): void {
  root.append(stars());
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

/** Foreground layer: snow, leaves or embers, depending on the level. */
export function createForeground(root: HTMLElement): void {
  root.append(weather());
}
