import * as THREE from 'three';
import { CAMERA } from '../config';
import type { Level } from '../level';
import type { Stage } from '../stage';

const YAW = THREE.MathUtils.degToRad(CAMERA.yawBiasDeg);
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

/** Orbit, tilt, pan and cursor-anchored zoom for the editor's orthographic camera. */
export class EditorView {
  private readonly focus = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private azimuth = YAW;
  private polar = THREE.MathUtils.degToRad(CAMERA.showcasePolarDeg);
  private zoom: number = CAMERA.showcaseZoom;
  private reach = 20;
  private floor = 0;
  private ceiling = 20;
  private readonly stage: Stage;

  constructor(stage: Stage) {
    this.stage = stage;
  }

  /** Frames the whole pyramid from the default angle. */
  frame(level: Level): void {
    this.reach = level.tierHalf(0);
    this.floor = level.baseBottom;
    this.ceiling = level.tierTop(level.summitTier) + 2;
    this.focus.set(0, level.tierTop(level.summitTier) * 0.42, 0);
    this.azimuth = YAW;
    this.polar = THREE.MathUtils.degToRad(CAMERA.showcasePolarDeg);
    this.zoom = Math.min(CAMERA.showcaseZoom, 7 / level.tierHalf(0));
    this.apply();
  }

  orbit(dx: number): void {
    this.azimuth -= dx * 0.008;
    this.apply();
  }

  tilt(dy: number): void {
    this.polar = THREE.MathUtils.clamp(this.polar + dy * 0.005, 0.2, 1.45);
    this.apply();
  }

  /** Quarter turns, so each side of the pyramid can be faced straight on. */
  turn(dir: 1 | -1): void {
    const quarter = Math.PI / 2;
    this.azimuth = Math.round((this.azimuth - YAW) / quarter) * quarter + YAW + dir * quarter;
    this.apply();
  }

  /** Moves the view by screen pixels, so the map follows the pointer. */
  pan(dx: number, dy: number): void {
    const perPixel = this.worldPerPixel();
    this.axes();
    this.focus.addScaledVector(this.right, -dx * perPixel).addScaledVector(this.up, dy * perPixel);
    this.clampFocus();
    this.apply();
  }

  /** Zooms by `factor` while keeping the point under `ndc` fixed on screen. */
  zoomAt(factor: number, ndc: THREE.Vector2): void {
    const camera = this.stage.camera;
    const before = 1 / this.zoom;
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const shift = before - 1 / this.zoom;
    this.axes();
    this.focus
      .addScaledVector(this.right, ndc.x * camera.right * shift)
      .addScaledVector(this.up, ndc.y * camera.top * shift);
    this.clampFocus();
    this.apply();
  }

  private worldPerPixel(): number {
    const camera = this.stage.camera;
    const width = this.stage.renderer.domElement.clientWidth || 1;
    return (camera.right - camera.left) / camera.zoom / width;
  }

  private axes(): void {
    const camera = this.stage.camera;
    camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
  }

  private clampFocus(): void {
    const reach = this.reach * 1.2;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -reach, reach);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -reach, reach);
    this.focus.y = THREE.MathUtils.clamp(this.focus.y, this.floor, this.ceiling);
  }

  private apply(): void {
    this.stage.setView({ focus: this.focus, azimuth: this.azimuth, polar: this.polar, zoom: this.zoom, distance: CAMERA.showcaseDistance });
  }
}
