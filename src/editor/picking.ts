import type * as THREE from 'three';
import type { Level } from '../level';
import type { SpotDef } from '../levels/types';
import { spotOnRing, type Surface } from './level-edit';

export interface SurfaceHit {
  tier: number;
  surface: Surface;
  /** Which side of the pyramid the hit is on, 0 south to 3 west. */
  side: number;
  /** The walkway spot on that tier, or null for the summit. */
  spot: SpotDef | null;
  t: number;
}

const FACES = [
  { axis: 'z', sign: 1, side: 0 },
  { axis: 'x', sign: 1, side: 1 },
  { axis: 'z', sign: -1, side: 2 },
  { axis: 'x', sign: -1, side: 3 },
] as const;

const EDGE = 0.02;

/** Ray-casts the stepped pyramid analytically: every terrace floor and every outer wall. */
export function hitSurface(level: Level, ray: THREE.Ray, snap: number): SurfaceHit | null {
  let best: SurfaceHit | null = null;
  const consider = (t: number, tier: number, surface: Surface, x: number, z: number, side: number) => {
    if (t <= 0.05 || (best && t >= best.t)) return;
    const spot = tier < level.ringCount ? spotOnRing(tier, x, z, snap) : null;
    best = { t, tier, surface, side: spot ? spot.side : side, spot };
  };
  for (let tier = 0; tier <= level.summitTier; tier++) {
    const half = level.tierHalf(tier);
    const top = level.tierTop(tier);
    if (Math.abs(ray.direction.y) > 1e-5) {
      const t = (top - ray.origin.y) / ray.direction.y;
      const x = ray.origin.x + ray.direction.x * t;
      const z = ray.origin.z + ray.direction.z * t;
      const inner = tier < level.summitTier ? level.tierHalf(tier + 1) : 0;
      const cheb = Math.max(Math.abs(x), Math.abs(z));
      if (cheb >= inner - EDGE && cheb <= half + EDGE) consider(t, tier, 'top', x, z, sideOf(x, z));
    }
    const bottom = tier === 0 ? level.baseBottom : level.tierTop(tier - 1);
    for (const face of FACES) {
      const dir = face.axis === 'z' ? ray.direction.z : ray.direction.x;
      if (Math.abs(dir) < 1e-5 || face.sign * dir >= 0) continue;
      const origin = face.axis === 'z' ? ray.origin.z : ray.origin.x;
      const t = (face.sign * half - origin) / dir;
      const x = ray.origin.x + ray.direction.x * t;
      const y = ray.origin.y + ray.direction.y * t;
      const z = ray.origin.z + ray.direction.z * t;
      if (y < bottom - EDGE || y > top + EDGE) continue;
      const along = face.axis === 'z' ? Math.abs(x) : Math.abs(z);
      if (along > half + EDGE) continue;
      consider(t, tier, 'side', x, z, face.side);
    }
  }
  return best;
}

function sideOf(x: number, z: number): number {
  if (z >= Math.abs(x)) return 0;
  if (x >= Math.abs(z)) return 1;
  if (-z >= Math.abs(x)) return 2;
  return 3;
}
