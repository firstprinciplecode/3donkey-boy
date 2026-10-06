import * as THREE from 'three';
import { COLORS } from '../config';
import { sideYaw, squarePoint, type Level } from '../level';
import type { SpotDef } from '../levels/types';

export interface WallFace {
  tier: number;
  side: number;
}

/**
 * Editor highlights: a cursor tile on the walkway, a tinted and outlined wall face, and a pin that
 * floats over the selected piece. Pin and outlines draw on top of everything so they never get lost.
 */
export class Overlay {
  readonly group = new THREE.Group();
  private readonly hoverTile = tile(0.35);
  private readonly selectTile = tile(0.85);
  private readonly hoverWall = wall(0.22, 0xffffff);
  private readonly selectWall = wall(0.45, COLORS.charcoal);
  private readonly pinMark = pin();

  constructor() {
    this.group.add(this.hoverTile, this.selectTile, this.hoverWall, this.selectWall, this.pinMark);
    for (const child of this.group.children) child.visible = false;
  }

  hover(level: Level, target: { spot: SpotDef | null; wall: WallFace | null } | null): void {
    showTile(this.hoverTile, level, target?.wall ? null : (target?.spot ?? null));
    showWall(this.hoverWall, level, target?.wall ?? null);
  }

  select(level: Level, selection: { tile: SpotDef | null; wall: WallFace | null; pin: SpotDef | null }): void {
    showTile(this.selectTile, level, selection.wall ? null : selection.tile);
    showWall(this.selectWall, level, selection.wall);
    this.pin(level, selection.pin);
  }

  /** Keeps the pin a readable size on screen at any zoom. */
  fitZoom(zoom: number): void {
    this.pinMark.scale.setScalar(THREE.MathUtils.clamp(0.6 / zoom, 0.8, 3));
  }

  pin(level: Level, spot: SpotDef | null): void {
    this.pinMark.visible = !!spot;
    if (!spot) return;
    const at = squarePoint(level.ringRadius(spot.ring), spot.side, spot.offset);
    this.pinMark.position.set(at.x, level.tierTop(spot.ring) + 2, at.z);
  }
}

function tile(opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.12, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.yellow, transparent: true, opacity, depthWrite: false }),
  );
  mesh.renderOrder = 1;
  return mesh;
}

function wall(opacity: number, line: number): THREE.Group {
  const plane = new THREE.PlaneGeometry(1, 1);
  const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: COLORS.yellow, transparent: true, opacity, depthWrite: false }));
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(plane),
    new THREE.LineBasicMaterial({ color: line, depthTest: false, transparent: true }),
  );
  fill.renderOrder = 1;
  outline.renderOrder = 4;
  const group = new THREE.Group();
  group.add(fill, outline);
  return group;
}

function pin(): THREE.Group {
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.8, 4),
    new THREE.MeshBasicMaterial({ color: COLORS.yellow, depthTest: false, transparent: true }),
  );
  head.rotation.x = Math.PI;
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(head.geometry),
    new THREE.LineBasicMaterial({ color: COLORS.charcoal, depthTest: false, transparent: true }),
  );
  rim.rotation.x = Math.PI;
  head.renderOrder = 5;
  rim.renderOrder = 6;
  const group = new THREE.Group();
  group.add(head, rim);
  return group;
}

function showTile(mesh: THREE.Mesh, level: Level, spot: SpotDef | null): void {
  mesh.visible = !!spot;
  if (!spot) return;
  const at = squarePoint(level.ringRadius(spot.ring), spot.side, spot.offset);
  mesh.position.set(at.x, level.tierTop(spot.ring) + 0.07, at.z);
  mesh.rotation.y = sideYaw(spot.side);
  mesh.scale.set(1, 1, level.def.terraceDepth * 0.9);
}

function showWall(group: THREE.Group, level: Level, face: WallFace | null): void {
  group.visible = !!face;
  if (!face) return;
  const half = level.tierHalf(face.tier);
  const top = level.tierTop(face.tier);
  const bottom = face.tier === 0 ? level.baseBottom : level.tierTop(face.tier - 1);
  const at = squarePoint(half + 0.03, face.side, 0);
  group.position.set(at.x, (top + bottom) / 2, at.z);
  group.rotation.y = sideYaw(face.side);
  group.scale.set(half * 2, top - bottom, 1);
}
