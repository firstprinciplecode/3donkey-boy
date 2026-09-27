import * as THREE from 'three';
import { COLORS, RAINBOW } from '../config';
import type { ItemType, Level, Spot } from '../level';
import { box } from '../voxel';
import { createOneUpToken } from './token';

export const ITEM_RADIUS = 0.45;

function makeGem(color: number): THREE.Group {
  const g = new THREE.Group();
  const cube = box(0.36, 0.36, 0.36, color, 0, 0, 0, { emissive: color });
  cube.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  g.add(cube);
  return g;
}

function makeHotdog(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.7, 0.18, 0.3, COLORS.tan, 0, -0.05, 0),
    box(0.84, 0.14, 0.18, COLORS.red, 0, 0.07, 0),
    box(0.6, 0.03, 0.08, COLORS.yellow, 0, 0.15, 0),
  );
  return g;
}

function makeHammer(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.1, 0.8, 0.1, COLORS.brown, 0, -0.1, 0), box(0.5, 0.3, 0.3, COLORS.charcoal, 0, 0.35, 0));
  g.rotation.z = 0.4;
  return g;
}

function makeKey(): THREE.Group {
  const g = new THREE.Group();
  const gold = { emissive: COLORS.yellow };
  g.add(
    box(0.36, 0.36, 0.1, COLORS.yellow, 0, 0.22, 0, gold),
    box(0.14, 0.14, 0.12, COLORS.black, 0, 0.22, 0),
    box(0.1, 0.5, 0.1, COLORS.yellow, 0, -0.18, 0, gold),
    box(0.18, 0.08, 0.1, COLORS.yellow, 0.1, -0.3, 0, gold),
    box(0.14, 0.08, 0.1, COLORS.yellow, 0.08, -0.14, 0, gold),
  );
  return g;
}

function makeMesh(type: ItemType, colorIndex: number): THREE.Group {
  switch (type) {
    case 'gem':
      return makeGem(RAINBOW[colorIndex % RAINBOW.length]);
    case 'hotdog':
      return makeHotdog();
    case 'hammer':
      return makeHammer();
    case 'key':
      return makeKey();
    default:
      return createOneUpToken(0.42);
  }
}

export class Item {
  readonly group: THREE.Group;
  /** Resting centre in world space (the mesh bobs around it). */
  readonly position: THREE.Vector3;
  readonly type: ItemType;
  collected = false;
  private t = Math.random() * 6;

  constructor(level: Level, type: ItemType, spot: Spot, colorIndex: number) {
    this.type = type;
    const p = level.ringPoint(spot.ring, level.spotS(spot));
    this.position = new THREE.Vector3(p.x, level.tierTop(spot.ring) + 0.8, p.z);
    this.group = makeMesh(type, colorIndex);
    this.group.position.copy(this.position);
  }

  animate(dt: number): void {
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 2.6) * 0.12;
    this.group.rotation.y += dt * (this.type === 'gem' ? 2.2 : 1.3);
  }
}
