import * as THREE from 'three';
import { COLORS } from '../config';
import { sideYaw, squarePoint, type Level } from '../level';
import type { SpotDef } from '../levels/types';
import { handleKey, handleSpot, handleWidth, listHandles, sameHandle, type Handle } from './pieces';

const COLOR: Record<string, number> = {
  gem: COLORS.yellow,
  hotdog: COLORS.pink,
  oneup: COLORS.grass,
  hammer: COLORS.orange,
  key: COLORS.pink,
  relic: COLORS.gold,
  'letter-1': COLORS.cyan,
  'letter-u': COLORS.cyan,
  'letter-p': COLORS.cyan,
  ladder: COLORS.yellow,
  chute: COLORS.blue,
  start: COLORS.lime,
  drum: COLORS.purple,
  pit: COLORS.red,
  crumble: COLORS.sand,
  conveyor: COLORS.grey,
  platform: COLORS.teal,
  ice: COLORS.ice,
  spring: COLORS.yellow,
  vine: COLORS.leaf,
  jet: COLORS.lava,
  drop: COLORS.ice,
  switch: COLORS.red,
  patrol: COLORS.cyan,
  crawler: COLORS.orange,
  totem: COLORS.cream,
};

const TALL: Record<string, number> = { spring: 0.2, vine: 0.9, jet: 0.25, drop: 0.7, switch: 0.35, patrol: 0.8, crawler: 0.8, totem: 0.8, start: 1, drum: 0.8 };

interface Entry {
  handle: Handle;
  root: THREE.Group;
  material: THREE.MeshLambertMaterial;
  edges: THREE.LineSegments;
}

const PICK_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: COLORS.charcoal, depthTest: false, transparent: true });
const HOVER_EDGE = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });

/** Editor-only markers for every piece, each with a generous invisible hit box for picking and dragging. */
export class Marks {
  readonly group = new THREE.Group();
  private readonly entries: Entry[] = [];
  private readonly picks: THREE.Mesh[] = [];
  private readonly level: Level;

  constructor(level: Level) {
    this.level = level;
    for (const handle of listHandles(level.def)) this.add(handle);
  }

  /** Pieces under the ray, nearest first, skipping any hidden behind a floor or wall at distance `before`. */
  pick(raycaster: THREE.Raycaster, before = Infinity): Handle[] {
    return raycaster
      .intersectObjects(this.picks, false)
      .filter((hit) => hit.distance <= before + 0.6)
      .map((hit) => (hit.object.userData.entry as Entry).handle);
  }

  highlight(hover: Handle | null, selected: Handle | null): void {
    for (const entry of this.entries) {
      const isSelected = sameHandle(entry.handle, selected);
      const isHover = sameHandle(entry.handle, hover);
      entry.material.emissive.setHex(isSelected ? 0x777777 : isHover ? 0x444444 : 0x000000);
      entry.edges.visible = isSelected || isHover;
      entry.edges.material = isSelected ? EDGE_MATERIAL : HOVER_EDGE;
    }
  }

  /** Shows a piece at `spot` while it is dragged, before the move is committed. */
  preview(handle: Handle, spot: SpotDef): void {
    const entry = this.entries.find((candidate) => sameHandle(candidate.handle, handle));
    if (entry) this.place(entry.root, spot);
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose();
    });
    for (const entry of this.entries) entry.material.dispose();
  }

  private add(handle: Handle): void {
    const spot = handleSpot(this.level.def, handle);
    if (!spot) return;
    const kind = handle.piece.kind === 'item' ? this.level.def.items[handle.piece.index].type : handle.piece.kind;
    const material = new THREE.MeshLambertMaterial({ color: COLOR[kind] ?? COLORS.yellow });
    const root = new THREE.Group();
    root.name = handleKey(handle);
    const { body, pick } = this.shape(handle, spot, kind);
    const visible = new THREE.Mesh(body.geometry, material);
    visible.position.copy(body.position);
    visible.renderOrder = 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), EDGE_MATERIAL);
    edges.position.copy(body.position);
    edges.renderOrder = 3;
    edges.visible = false;
    const entry: Entry = { handle, root, material, edges };
    const hitBox = new THREE.Mesh(pick.geometry, PICK_MATERIAL);
    hitBox.position.copy(pick.position);
    hitBox.userData.entry = entry;
    root.add(visible, edges, hitBox);
    this.place(root, spot);
    this.entries.push(entry);
    this.picks.push(hitBox);
    this.group.add(root);
  }

  private place(root: THREE.Group, spot: SpotDef): void {
    const at = squarePoint(this.level.ringRadius(spot.ring), spot.side, spot.offset);
    root.position.set(at.x, this.level.tierTop(spot.ring), at.z);
    root.rotation.y = sideYaw(spot.side);
    root.updateMatrixWorld(true);
  }

  /** Local frame: x runs along the walkway, z points outward, y is up from the terrace floor. */
  private shape(handle: Handle, spot: SpotDef, kind: string): { body: Part; pick: Part } {
    const level = this.level;
    const depth = level.def.terraceDepth;
    const width = handleWidth(level.def, handle);
    if (width > 0) {
      return {
        body: part(width - 0.1, 0.08, depth * 0.7, 0, 0.06, 0),
        pick: part(width, 0.5, depth * 0.85, 0, 0.25, 0),
      };
    }
    if (kind === 'ladder') {
      const inner = level.tierHalf(spot.ring + 1) - level.ringRadius(spot.ring);
      const height = level.tierTop(spot.ring + 1) - level.tierTop(spot.ring);
      return {
        body: part(1, 0.1, 0.6, 0, 0.06, inner + 0.5),
        pick: part(1.4, height + 0.3, 0.6 - inner, 0, height / 2, (inner + 0.6) / 2),
      };
    }
    if (kind === 'chute') {
      const outer = level.tierHalf(spot.ring) - level.ringRadius(spot.ring);
      const drop = level.def.tierHeight;
      return {
        body: part(1, 0.1, 0.6, 0, 0.06, outer - 0.35),
        pick: part(1.4, drop + 0.6, outer + 0.9, 0, 0.3 - drop / 2, (outer + 0.5) / 2),
      };
    }
    const tall = TALL[kind] ?? 0.45;
    return {
      body: part(0.5, tall, 0.5, 0, tall / 2 + 0.15, 0),
      pick: part(1, Math.max(1.2, tall + 0.6), 1, 0, Math.max(1.2, tall + 0.6) / 2, 0),
    };
  }
}

interface Part {
  geometry: THREE.BoxGeometry;
  position: THREE.Vector3;
}

function part(w: number, h: number, d: number, x: number, y: number, z: number): Part {
  return { geometry: new THREE.BoxGeometry(w, h, d), position: new THREE.Vector3(x, y, z) };
}
