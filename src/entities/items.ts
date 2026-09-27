import * as THREE from 'three';
import { COLORS, ORBS, RAINBOW } from '../config';
import { sideYaw, type ItemType, type Level, type Spot } from '../level';
import { SKINS, type RelicLook } from '../levels/skins';
import { GLYPH_H, GLYPH_W, glyphCells } from '../pixelFont';
import { ball, box } from '../voxel';
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

function makeRelic(look: RelicLook): THREE.Group {
  const g = new THREE.Group();
  const glow = (c: number) => ({ emissive: c });
  if (look === 'pumpkin') {
    g.add(
      box(0.6, 0.46, 0.5, COLORS.orange, 0, 0, 0, glow(COLORS.orange)),
      box(0.42, 0.42, 0.6, COLORS.maple, 0, 0, 0),
      box(0.1, 0.16, 0.1, COLORS.leafDark, 0, 0.3, 0),
      box(0.1, 0.08, 0.04, COLORS.yellow, -0.12, 0.06, 0.31, glow(COLORS.yellow)),
      box(0.1, 0.08, 0.04, COLORS.yellow, 0.12, 0.06, 0.31, glow(COLORS.yellow)),
      box(0.26, 0.06, 0.04, COLORS.yellow, 0, -0.1, 0.31, glow(COLORS.yellow)),
    );
  } else if (look === 'present') {
    g.add(
      box(0.5, 0.44, 0.5, COLORS.red, 0, 0, 0, glow(COLORS.red)),
      box(0.1, 0.46, 0.52, COLORS.yellow, 0, 0, 0),
      box(0.52, 0.46, 0.1, COLORS.yellow, 0, 0, 0),
      box(0.3, 0.12, 0.12, COLORS.yellow, -0.1, 0.28, 0),
      box(0.3, 0.12, 0.12, COLORS.yellow, 0.1, 0.28, 0),
    );
  } else {
    g.add(
      box(0.44, 0.1, 0.34, COLORS.gold, 0, -0.3, 0, glow(COLORS.gold)),
      box(0.3, 0.42, 0.26, COLORS.gold, 0, -0.04, 0, glow(COLORS.gold)),
      box(0.36, 0.26, 0.3, COLORS.gold, 0, 0.3, 0, glow(COLORS.gold)),
      box(0.08, 0.08, 0.04, COLORS.teal, -0.08, 0.32, 0.16),
      box(0.08, 0.08, 0.04, COLORS.teal, 0.08, 0.32, 0.16),
      box(0.12, 0.08, 0.3, COLORS.teal, 0, 0.47, 0),
    );
  }
  return g;
}

export const LETTER_CHARS: Partial<Record<ItemType, string>> = { 'letter-1': '1', 'letter-u': 'U', 'letter-p': 'P' };
const ORB_COLORS = [COLORS.red, COLORS.yellow, COLORS.orange, COLORS.teal, COLORS.pink];

/** Chunky yellow block letter with an orange extruded back, like the poster's 1-U-P. */
export function makeLetter(ch: string, cell = 0.13): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const ox = (-GLYPH_W / 2 + 0.5) * cell;
  const oy = (-GLYPH_H / 2 + 0.5) * cell;
  for (const [cx, cy] of glyphCells(ch)) {
    const x = ox + cx * cell;
    const y = oy + cy * cell;
    face.add(
      box(cell, cell, cell * 0.8, COLORS.yellow, x, y, cell * 0.2, { emissive: COLORS.yellow }),
      box(cell, cell, cell * 0.8, COLORS.orange, x + cell * 0.25, y - cell * 0.25, -cell * 0.45),
    );
  }
  g.add(face);
  return g;
}

function makeOrb(colorIndex: number): THREE.Group {
  const g = new THREE.Group();
  const color = ORB_COLORS[colorIndex % ORB_COLORS.length];
  g.add(
    ball(ORBS.radius, color, 0, 0, 0, { emissive: color }),
    ball(ORBS.radius * 0.28, COLORS.cream, -ORBS.radius * 0.38, ORBS.radius * 0.4, ORBS.radius * 0.62, { emissive: COLORS.cream }),
  );
  return g;
}

function makeMesh(type: ItemType, colorIndex: number, relic: RelicLook): THREE.Group {
  const ch = LETTER_CHARS[type];
  if (ch) return makeLetter(ch);
  switch (type) {
    case 'orb':
      return makeOrb(colorIndex);
    case 'relic':
      return makeRelic(relic);
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
    const lift = type === 'orb' ? ORBS.height : 0.8;
    this.position = new THREE.Vector3(p.x, level.tierTop(spot.ring) + lift, p.z);
    this.group = makeMesh(type, colorIndex, SKINS[level.def.skin].relic.look);
    this.group.position.copy(this.position);
    if (LETTER_CHARS[type]) this.group.rotation.y = sideYaw(spot.side);
    this.baseYaw = this.group.rotation.y;
  }

  private readonly baseYaw: number;

  animate(dt: number): void {
    this.t += dt;
    this.group.position.y = this.position.y + Math.sin(this.t * 2.6) * 0.12;
    if (LETTER_CHARS[this.type]) this.group.rotation.y = this.baseYaw + Math.sin(this.t * 1.8) * 0.5;
    else if (this.type === 'orb') this.group.scale.setScalar(1 + Math.sin(this.t * 4) * 0.06);
    else this.group.rotation.y += dt * (this.type === 'gem' ? 2.2 : 1.3);
  }
}
