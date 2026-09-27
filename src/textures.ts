import * as THREE from 'three';
import { RAINBOW } from './config';

const FONT = '"Arial Rounded MT Bold", "SF Pro Rounded", ui-rounded, system-ui, sans-serif';

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function makeOneUpTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(256, 256);
  g.fillStyle = '#8cc63f';
  g.beginPath();
  g.arc(128, 128, 126, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = '#4f8d1c';
  g.beginPath();
  g.arc(128, 128, 116, 0, Math.PI * 2);
  g.stroke();
  g.font = `bold 88px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#1b1b22';
  g.strokeText('1-up', 128, 134);
  g.fillStyle = '#fff8e0';
  g.fillText('1-up', 128, 134);
  return toTexture(c);
}

/** Rainbow bands wrap around the barrel so the roll is readable. */
export function makeBarrelSideTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(256, 32);
  const w = c.width / RAINBOW.length;
  RAINBOW.forEach((color, i) => {
    g.fillStyle = hex(color);
    g.fillRect(i * w, 0, w + 1, c.height);
  });
  g.fillStyle = 'rgba(27,27,34,0.85)';
  g.fillRect(0, 0, c.width, 4);
  g.fillRect(0, c.height - 4, c.width, 4);
  return toTexture(c);
}

/** One chevron pointing +u; repeated along the belt and scrolled to show the push direction. */
export function makeConveyorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(64, 64);
  g.fillStyle = '#2e2e38';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ffd23a';
  g.lineWidth = 12;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(18, 8);
  g.lineTo(42, 32);
  g.lineTo(18, 56);
  g.stroke();
  const tex = toTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Falling-stream texture that tiles vertically: rainbow columns or cyan water, with pale streaks
 * that read as motion when the texture scrolls.
 */
export function makeCascadeTexture(kind: 'rainbow' | 'water'): THREE.CanvasTexture {
  const [c, g] = canvas2d(112, 128);
  const columns = kind === 'rainbow' ? RAINBOW : [0x3fd6ff, 0x6fe0da, 0x2fb8f0, 0x6fe0da];
  const w = c.width / columns.length;
  columns.forEach((color, i) => {
    g.fillStyle = hex(color);
    g.fillRect(i * w, 0, w + 1, c.height);
  });
  let seed = kind === 'rainbow' ? 7 : 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    const len = 10 + rnd() * 26;
    g.fillRect(x, y, 3, len);
    if (y + len > c.height) g.fillRect(x, y - c.height, 3, len);
  }
  const tex = toTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Vertical alpha ramp (opaque at the top) for the tail of a cascade falling into the void. */
export function makeFadeTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(4, 64);
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Pie wedges on the caps: the caps face the camera, so they carry the spin. */
export function makeBarrelCapTexture(): THREE.CanvasTexture {
  const [c, g] = canvas2d(128, 128);
  const slices = 8;
  for (let i = 0; i < slices; i++) {
    g.fillStyle = i % 2 ? '#f4f1e6' : hex(RAINBOW[(i / 2) % RAINBOW.length | 0]);
    g.beginPath();
    g.moveTo(64, 64);
    g.arc(64, 64, 64, (i / slices) * Math.PI * 2, ((i + 1) / slices) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 10;
  g.strokeStyle = '#1b1b22';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#1b1b22';
  g.beginPath();
  g.arc(64, 64, 12, 0, Math.PI * 2);
  g.fill();
  return toTexture(c);
}
