import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BARREL, COLORS, SNOWBALL } from '../config';
import type { ProjectileLook } from '../levels/skins';
import { makeBarrelCapTexture, makeBarrelSideTexture } from '../textures';

const R = BARREL.radius;
export const BARREL_LENGTH = 0.8;

/**
 * How each skin's thrown projectile looks and behaves. Every mesh is built at radius BARREL.radius;
 * the manager scales it to the live radius. Physics, chutes and ladders are shared.
 */
export interface ProjectileSpec {
  /** Starting radius as a multiple of BARREL.radius. */
  scale: number;
  /** Rolling speed multiplier. */
  speed: number;
  /** Grows while rolling along a ring. */
  grow?: { maxScale: number; distance: number };
  /** Bounces while rolling: arc height, and ring distance covered per bounce. */
  hop?: { height: number; every: number };
  /** Breaks into two smaller halves rolling opposite ways when it drops onto a lower ring. */
  splits?: { scale: number };
  /** Leaves a burning patch where it lands on a lower ring. */
  scorch?: { life: number };
  /** Smash particle colours. */
  burst: readonly number[];
  /** Pile beside the boss stands the pieces on end (barrels) rather than stacking balls. */
  upright?: boolean;
  mesh(): THREE.Mesh;
  /** Called each time a pooled mesh is thrown again. */
  respawn?(mesh: THREE.Mesh): void;
}

let barrelAssets: { geometry: THREE.CylinderGeometry; materials: THREE.Material[] } | null = null;

export function createBarrelMesh(): THREE.Mesh {
  if (!barrelAssets) {
    const geometry = new THREE.CylinderGeometry(R, R, BARREL_LENGTH, 16);
    geometry.rotateX(Math.PI / 2);
    const side = new THREE.MeshLambertMaterial({ map: makeBarrelSideTexture() });
    const cap = new THREE.MeshLambertMaterial({ map: makeBarrelCapTexture() });
    barrelAssets = { geometry, materials: [side, cap, cap] };
  }
  const mesh = new THREE.Mesh(barrelAssets.geometry, barrelAssets.materials);
  mesh.receiveShadow = true;
  return mesh;
}

/** Deterministic 0..1 noise so shared geometry looks the same every load. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintFaces(geometry: THREE.BufferGeometry, shades: readonly number[]): void {
  const colors: number[] = [];
  const c = new THREE.Color();
  const faces = geometry.attributes.position.count / 3;
  for (let f = 0; f < faces; f++) {
    c.setHex(shades[(f * 7 + (f >> 2)) % shades.length]);
    for (let v = 0; v < 3; v++) colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/**
 * Low-poly ball with a scatter of shaded faces so the tumble reads. `jitter` roughens it into a rock;
 * vertices move by a hash of their position, so shared corners stay together and it stays closed.
 */
function faceted(detail: number, shades: readonly number[], jitter = 0, squashY = 1): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(R, detail).toNonIndexed();
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (hash(Math.round(v.x * 97) * 3 + Math.round(v.y * 89) * 7 + Math.round(v.z * 83) * 13) - 0.5) * 2 * jitter;
    v.multiplyScalar(k);
    v.y *= squashY;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  paintFaces(geometry, shades);
  return geometry;
}

const flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function cached(build: () => THREE.BufferGeometry): () => THREE.Mesh {
  let geometry: THREE.BufferGeometry | null = null;
  return () => {
    geometry ??= build();
    const mesh = new THREE.Mesh(geometry, flat);
    mesh.receiveShadow = true;
    return mesh;
  };
}

function coloured(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A scribble of dry twigs crossing the centre at random angles. */
function tumbleweedGeometry(): THREE.BufferGeometry {
  const twigs: THREE.BufferGeometry[] = [];
  const shades = [COLORS.tan, COLORS.sand, COLORS.brown, 0xb08d57];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 28; i++) {
    const len = R * (1.6 + hash(i) * 0.4);
    const twig = new THREE.BoxGeometry(0.06, 0.06, len);
    e.set(hash(i + 20) * Math.PI, hash(i + 40) * Math.PI * 2, hash(i + 60) * Math.PI);
    twig.applyQuaternion(q.setFromEuler(e));
    twig.translate((hash(i + 80) - 0.5) * 0.2, (hash(i + 90) - 0.5) * 0.2, (hash(i + 99) - 0.5) * 0.2);
    twigs.push(coloured(twig, shades[i % shades.length]));
  }
  return mergeGeometries(twigs) ?? new THREE.BufferGeometry();
}

function pumpkinGeometry(): THREE.BufferGeometry {
  const body = faceted(1, [COLORS.orange, COLORS.orange, COLORS.maple, 0xf59a3c], 0, 0.82);
  const stem = coloured(new THREE.BoxGeometry(0.1, 0.18, 0.1).translate(0, R * 0.82 + 0.06, 0), COLORS.leaf);
  const leaf = coloured(new THREE.BoxGeometry(0.16, 0.03, 0.08).translate(0.1, R * 0.82 + 0.02, 0), COLORS.grassDark);
  return mergeGeometries([body, stem, leaf]) ?? body;
}

const GUMBALL_COLORS = [COLORS.pink, COLORS.cyan, COLORS.yellow, COLORS.purple, COLORS.red, COLORS.teal];
const gumballMaterials = GUMBALL_COLORS.map((color) => new THREE.MeshLambertMaterial({ color }));
let gumballGeometry: THREE.BufferGeometry | null = null;

function randomGumball(mesh: THREE.Mesh): void {
  mesh.material = gumballMaterials[Math.floor(Math.random() * gumballMaterials.length)];
}

export const PROJECTILES: Record<ProjectileLook, ProjectileSpec> = {
  barrel: {
    scale: 1,
    speed: 1,
    burst: [COLORS.cream, COLORS.yellow, COLORS.orange],
    upright: true,
    mesh: createBarrelMesh,
  },
  snowball: {
    scale: 1,
    speed: 1,
    grow: { maxScale: SNOWBALL.maxScale, distance: SNOWBALL.growDistance },
    burst: [COLORS.snow, COLORS.snowShade, COLORS.ice],
    mesh: cached(() => faceted(1, [COLORS.snow, COLORS.snow, COLORS.ice, COLORS.iceDark])),
  },
  tumbleweed: {
    scale: 1.1,
    speed: 1.05,
    hop: { height: 0.55, every: 2.8 },
    burst: [COLORS.tan, COLORS.sand, COLORS.brown],
    mesh: cached(tumbleweedGeometry),
  },
  pumpkin: {
    scale: 1.15,
    speed: 0.95,
    splits: { scale: 0.75 },
    burst: [COLORS.orange, COLORS.maple, COLORS.yellow],
    mesh: cached(pumpkinGeometry),
  },
  lavarock: {
    scale: 1,
    speed: 1,
    scorch: { life: 3 },
    burst: [COLORS.lava, COLORS.orange, COLORS.basalt],
    mesh: cached(() => faceted(1, [COLORS.basalt, COLORS.lava, COLORS.basaltDark, COLORS.orange, COLORS.basalt], 0.2)),
  },
  boulder: {
    // Slower makes it harder to clear (longer under you): 1.6x at 0.8 left a 116 ms window, this ~280 ms.
    scale: 1.45,
    speed: 0.9,
    burst: [COLORS.sandstone, COLORS.sandstoneDark, COLORS.tan],
    mesh: cached(() => faceted(1, [COLORS.sandstone, COLORS.sandstoneDark, COLORS.sand, 0xa97c45], 0.1)),
  },
  gumball: {
    scale: 1,
    speed: 1,
    burst: [COLORS.pink, COLORS.cyan, COLORS.yellow],
    mesh: () => {
      gumballGeometry ??= new THREE.IcosahedronGeometry(R, 2);
      const mesh = new THREE.Mesh(gumballGeometry, gumballMaterials[0]);
      randomGumball(mesh);
      mesh.receiveShadow = true;
      return mesh;
    },
    respawn: randomGumball,
  },
};

/** Ammo stacked beside the boss: upright barrels, or a pyramid of balls. */
export function createProjectilePile(x: number, y: number, z: number, look: ProjectileLook): THREE.Group {
  const spec = PROJECTILES[look];
  const pile = new THREE.Group();
  const r = R * Math.min(spec.scale, 1.2);
  const spots: [number, number][] = spec.upright
    ? [
        [-0.45, BARREL_LENGTH / 2],
        [0.45, BARREL_LENGTH / 2],
        [0, BARREL_LENGTH * 1.5],
      ]
    : [
        [-r * 1.07, r],
        [r * 1.07, r],
        [0, r * 2.5],
      ];
  for (const [dx, dy] of spots) {
    const m = spec.mesh();
    m.scale.setScalar(r / R);
    if (spec.upright) m.rotation.x = Math.PI / 2;
    m.position.set(x + dx, y + dy, z);
    pile.add(m);
  }
  return pile;
}
