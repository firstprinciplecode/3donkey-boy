import * as THREE from 'three';
import { COLORS, HAZARDS } from './config';
import { sideYaw, squarePoint, type Level } from './level';
import { SKINS, type DropLook } from './levels/skins';
import type { JetDef, SpotDef } from './levels/types';
import { box, cone } from './voxel';

export interface Danger {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface HazardEvents {
  /** A drop started shaking loose. */
  cracked: boolean;
  /** Where drops hit the floor this step, with the colours to burst. */
  shattered: { at: THREE.Vector3; colors: readonly number[] }[];
  /** Jets that erupted this step. */
  erupted: THREE.Vector3[];
}

interface Jet {
  def: JetDef;
  ring: number;
  s: number;
  base: THREE.Vector3;
  flame: THREE.Group;
  vent: THREE.Mesh;
  active: boolean;
}

interface Drop {
  ring: number;
  s: number;
  hangY: number;
  floorY: number;
  holder: THREE.Group;
  bob: THREE.Group;
  state: 'hang' | 'shake' | 'fall' | 'gone';
  t: number;
  vy: number;
}

/** How far each drop model reaches below its hanging point. */
const REACH: Record<DropLook, number> = { icicle: 0.9, acorn: 0.35, spike: 0.8, lavarock: 0.35 };

const SHARDS: Record<DropLook, readonly number[]> = {
  icicle: [COLORS.ice, COLORS.snow, COLORS.iceDark],
  acorn: [COLORS.brown, COLORS.tan, COLORS.orange],
  spike: [COLORS.stone, COLORS.sandstone, COLORS.stoneDark],
  lavarock: [COLORS.lava, COLORS.orange, COLORS.basalt],
};

/** Timed fire jets and drops that fall when you walk underneath. Reported as `dangers` each step. */
export class Hazards {
  readonly group = new THREE.Group();
  readonly dangers: Danger[] = [];
  private readonly level: Level;
  private readonly look: DropLook;
  private readonly jets: Jet[] = [];
  private readonly drops: Drop[] = [];
  private clock = 0;

  constructor(level: Level) {
    this.level = level;
    this.look = SKINS[level.def.skin].drop;
    (level.def.jets ?? []).forEach((j) => this.addJet(j));
    (level.def.drops ?? []).forEach((d) => this.addDrop(d));
    this.reset();
  }

  reset(): void {
    this.clock = 0;
    for (const j of this.jets) {
      j.active = false;
      j.flame.scale.set(1, 0.001, 1);
    }
    for (const d of this.drops) this.hang(d);
    this.dangers.length = 0;
  }

  update(dt: number, player: { ring: number; s: number }): HazardEvents {
    this.clock += dt;
    const events: HazardEvents = { cracked: false, shattered: [], erupted: [] };
    this.dangers.length = 0;
    this.updateJets(dt, events);
    this.updateDrops(dt, player, events);
    return events;
  }

  private updateJets(dt: number, events: HazardEvents): void {
    const { jetWarn, jetBurst, jetHeight } = HAZARDS;
    for (const j of this.jets) {
      const period = j.def.period;
      const c = (((this.clock + (j.def.phase ?? 0)) % period) + period) % period;
      const burstAt = period - jetBurst;
      const warning = c > burstAt - jetWarn && c <= burstAt;
      const active = c > burstAt;
      if (active && !j.active) events.erupted.push(j.base);
      j.active = active;

      const target = active ? 1 : warning ? 0.12 : 0.001;
      const k = 1 - Math.exp(-(active ? 26 : 12) * dt);
      const sy = j.flame.scale.y + (target - j.flame.scale.y) * k;
      const flicker = active ? 1 + Math.sin(this.clock * 40 + j.s) * 0.08 : 1;
      j.flame.scale.set(flicker, sy, flicker);
      j.vent.position.y = 0.05 + (warning ? Math.sin(this.clock * 60) * 0.02 : 0);

      if (active && sy > 0.5) {
        for (let h = 0.5; h < jetHeight * sy; h += 0.8) this.dangers.push({ x: j.base.x, y: j.base.y + h, z: j.base.z, r: 0.42 });
      }
    }
  }

  private updateDrops(dt: number, player: { ring: number; s: number }, events: HazardEvents): void {
    const L = this.level;
    for (const d of this.drops) {
      d.t += dt;
      if (d.state === 'hang') {
        d.bob.scale.setScalar(Math.min(1, d.t / 0.5));
        if (player.ring === d.ring && L.ringDistance(d.ring, player.s, d.s) < HAZARDS.dropTrigger && d.t > 0.5) {
          d.state = 'shake';
          d.t = 0;
          events.cracked = true;
        }
      } else if (d.state === 'shake') {
        d.bob.position.x = Math.sin(d.t * 70) * 0.05;
        if (d.t >= HAZARDS.dropShake) {
          d.state = 'fall';
          d.t = 0;
          d.vy = 0;
          d.bob.position.x = 0;
        }
      } else if (d.state === 'fall') {
        d.vy += HAZARDS.dropGravity * dt;
        d.bob.position.y += d.vy * dt;
        const reach = REACH[this.look];
        const h = d.holder.position;
        const world = new THREE.Vector3(h.x, h.y + d.bob.position.y - reach / 2, h.z);
        this.dangers.push({ x: world.x, y: world.y, z: world.z, r: HAZARDS.dropRadius });
        if (d.holder.position.y + d.bob.position.y - reach <= d.floorY) {
          events.shattered.push({ at: world, colors: SHARDS[this.look] });
          d.state = 'gone';
          d.t = 0;
          d.bob.visible = false;
        }
      } else if (d.t >= HAZARDS.dropRespawn) {
        this.hang(d);
      }
    }
  }

  private hang(d: Drop): void {
    d.state = 'hang';
    d.t = 0;
    d.vy = 0;
    d.bob.visible = true;
    d.bob.position.set(0, d.hangY - d.holder.position.y, 0);
    d.bob.scale.setScalar(0.001);
  }

  private addJet(def: JetDef): void {
    const L = this.level;
    const r = L.ringRadius(def.ring);
    const p = squarePoint(r, def.side, def.offset);
    const y = L.tierTop(def.ring);
    const g = new THREE.Group();
    g.position.set(p.x, y, p.z);
    g.rotation.y = sideYaw(def.side);
    const { vent, grille, flame } = jetParts();
    g.add(vent, ...grille, flame);
    this.group.add(g);
    this.jets.push({ def, ring: def.ring, s: L.spotS(def), base: new THREE.Vector3(p.x, y, p.z), flame, vent, active: false });
  }

  private addDrop(def: SpotDef): void {
    const L = this.level;
    const depth = L.def.terraceDepth;
    const r = L.ringRadius(def.ring);
    const p = squarePoint(r, def.side, def.offset);
    const floorY = L.tierTop(def.ring);
    const ledgeY = L.tierTop(def.ring + 1);
    const holder = new THREE.Group();
    holder.position.set(p.x, ledgeY, p.z);
    holder.rotation.y = sideYaw(def.side);
    holder.add(...ledgeParts(this.look, depth));
    const bob = new THREE.Group();
    bob.add(...dropParts(this.look));
    holder.add(bob);
    this.group.add(holder);
    this.drops.push({ ring: def.ring, s: L.spotS(def), hangY: ledgeY - 0.35, floorY, holder, bob, state: 'hang', t: 0, vy: 0 });
  }
}

/** Vent grate plus a full-height flame column. */
export function jetParts(): { vent: THREE.Mesh; grille: THREE.Mesh[]; flame: THREE.Group } {
  const vent = box(1, 0.1, 1, COLORS.charcoal, 0, 0.05, 0);
  const grille = [box(0.7, 0.02, 0.12, COLORS.black, 0, 0.11, -0.2), box(0.7, 0.02, 0.12, COLORS.black, 0, 0.11, 0.2)];
  const flame = new THREE.Group();
  const h = HAZARDS.jetHeight;
  flame.add(
    box(0.7, h * 0.4, 0.7, COLORS.red, 0, h * 0.2, 0, { emissive: COLORS.red }),
    box(0.52, h * 0.35, 0.52, COLORS.orange, 0, h * 0.575, 0, { emissive: COLORS.orange }),
    box(0.32, h * 0.25, 0.32, COLORS.yellow, 0, h * 0.875, 0, { emissive: COLORS.yellow }),
  );
  return { vent, grille, flame };
}

/** Bracket sticking out from the lip of the tier above, over the walkway. Local +z is outward. */
export function ledgeParts(look: DropLook, depth: number): THREE.Object3D[] {
  const len = depth / 2 + 0.5;
  const z = -depth / 2 + len / 2;
  switch (look) {
    case 'icicle':
      return [box(1.2, 0.18, len, COLORS.snow, 0, -0.09, z), box(1.3, 0.08, len + 0.1, COLORS.snowShade, 0, -0.2, z)];
    case 'acorn':
      return [
        box(0.22, 0.2, len, COLORS.brown, 0, -0.1, z),
        box(0.9, 0.3, 0.9, COLORS.maple, 0, 0.05, 0.1),
        box(0.6, 0.25, 0.6, COLORS.orange, 0.2, 0.2, -0.1),
      ];
    case 'spike':
      return [box(1.2, 0.22, len, COLORS.sandstoneDark, 0, -0.11, z), box(0.3, 0.1, 0.3, COLORS.gold, 0, 0.02, z)];
    default:
      return [box(1.1, 0.24, len, COLORS.basalt, 0, -0.12, z), box(0.4, 0.06, 0.4, COLORS.lava, 0, -0.26, 0, { emissive: COLORS.lava })];
  }
}

/** The falling part, hanging from its origin. */
export function dropParts(look: DropLook): THREE.Object3D[] {
  switch (look) {
    case 'icicle': {
      const a = cone(0.2, 0.9, COLORS.ice, 0, -0.9, 0);
      const b = cone(0.12, 0.55, COLORS.iceDark, 0.24, -0.55, 0.08);
      a.rotation.x = Math.PI;
      b.rotation.x = Math.PI;
      return [a, b];
    }
    case 'acorn':
      return [
        box(0.34, 0.14, 0.34, COLORS.brown, 0, 0.02, 0),
        box(0.28, 0.3, 0.28, COLORS.tan, 0, -0.2, 0),
        box(0.06, 0.1, 0.06, COLORS.brown, 0, 0.12, 0),
      ];
    case 'spike': {
      const s = cone(0.22, 0.8, COLORS.stone, 0, -0.8, 0);
      s.rotation.x = Math.PI;
      return [s];
    }
    default:
      return [
        box(0.46, 0.4, 0.42, COLORS.basalt, 0, -0.15, 0),
        box(0.22, 0.2, 0.44, COLORS.lava, 0.1, -0.1, 0, { emissive: COLORS.lava }),
      ];
  }
}
