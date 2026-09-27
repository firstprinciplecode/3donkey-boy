import * as THREE from 'three';
import { mod, sideYaw, squarePoint, NORMALS, type Level } from './level';
import { makeCascadeTexture, makeFadeTexture } from './textures';

export type CascadeKind = 'rainbow' | 'water';

export interface CascadeSpot {
  side: number;
  offset: number;
  kind: CascadeKind;
  width: number;
}

/** World units per texture tile; every plane uses it so the streaks line up and flow at one speed. */
const TILE = 4;
const FLOW_SPEED = 3.2;
const TAIL = 7;
const LIP = 0.9;

/**
 * Where streams pour off the ground ring: one per side, clear of the drum and of ring-0 gaps and
 * belts. Shared with the fence builder so fences leave the lip open.
 */
export function cascadeSpots(level: Level): CascadeSpot[] {
  const def = level.def;
  const half = level.tierHalf(0);
  const busy = [
    { side: def.drum.side, offset: def.drum.offset, pad: 3 },
    ...[...def.pits, ...def.crumbles, ...def.platforms, ...def.conveyors]
      .filter((g) => g.ring === 0)
      .map((g) => ({ side: g.side, offset: g.offset, pad: g.width / 2 + 1.8 })),
  ];
  const tries = [0.35, -0.4, 0.1, -0.15, 0.6, -0.6];
  const spots: CascadeSpot[] = [];
  for (let side = 0; side < 4; side++) {
    const kind: CascadeKind = side % 2 === 0 ? 'rainbow' : 'water';
    const width = kind === 'rainbow' ? 2.1 : 1.6;
    for (let i = 0; i < tries.length; i++) {
      const offset = Math.round(tries[mod(i + side, tries.length)] * half * 2) / 2;
      if (Math.abs(offset) > half - 2.5) continue;
      if (busy.some((b) => b.side === side && Math.abs(b.offset - offset) < b.pad + width / 2)) continue;
      spots.push({ side, offset, kind, width });
      break;
    }
  }
  return spots;
}

/** Animated rainbow and water falls tumbling off the floating base into the void. */
export class Cascades {
  readonly group = new THREE.Group();
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private t = 0;

  constructor(level: Level) {
    const top = level.tierTop(0);
    const bottom = level.baseBottom;
    const half = level.tierHalf(0);
    const fade = makeFadeTexture();
    this.textures.push(fade);

    for (const spot of cascadeSpots(level)) {
      const wallH = top - bottom;
      const n = NORMALS[spot.side];
      const yaw = sideYaw(spot.side);
      const at = (v: number) => {
        const p = squarePoint(half + v, spot.side, spot.offset);
        return { x: p.x, z: p.z };
      };

      const wall = this.plane(spot, wallH);
      const w = at(0.04);
      wall.position.set(w.x, bottom + wallH / 2, w.z);
      wall.rotation.y = yaw;

      const tail = this.plane(spot, TAIL, fade);
      const t = at(0.04);
      tail.position.set(t.x, bottom - TAIL / 2, t.z);
      tail.rotation.y = yaw;

      const lip = this.plane(spot, LIP);
      const l = at(-LIP / 2);
      lip.position.set(l.x, top + 0.02, l.z);
      lip.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');

      const foam = this.plane({ ...spot, width: spot.width + 0.4 }, 0.5, undefined, 0xffffff);
      const f = at(0.06);
      foam.position.set(f.x + n.x * 0.01, top - 0.25, f.z + n.z * 0.01);
      foam.rotation.y = yaw;

      this.group.add(wall, tail, lip, foam);
    }
  }

  private plane(spot: CascadeSpot, height: number, alphaMap?: THREE.Texture, color?: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(spot.width, height);
    this.geometries.push(geometry);
    let map: THREE.Texture | null = null;
    if (color === undefined) {
      map = makeCascadeTexture(spot.kind);
      map.repeat.set(1, height / TILE);
      this.textures.push(map);
    }
    const material = new THREE.MeshBasicMaterial({
      map,
      color: color ?? 0xffffff,
      alphaMap: alphaMap ?? null,
      transparent: !!alphaMap || color !== undefined,
      opacity: color !== undefined ? 0.6 : 1,
      depthWrite: !alphaMap && color === undefined,
      side: THREE.DoubleSide,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = alphaMap ? 1 : 0;
    return mesh;
  }

  update(dt: number): void {
    this.t += dt;
    const offset = (this.t * FLOW_SPEED) / TILE;
    for (const tex of this.textures) if (tex.wrapT === THREE.RepeatWrapping) tex.offset.y = offset;
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
  }
}
