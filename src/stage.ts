import * as THREE from 'three';
import { CAMERA } from './config';
import { Grade } from './grade';
import { LIGHTING, type Lighting } from './timeOfDay';
import { damp } from './utils';

export interface CameraGoal {
  focus: THREE.Vector3;
  /** Orbit angle around the pyramid's vertical axis (0 = looking at the south face). Applied as-is; callers ease it. */
  azimuth: number;
  /** Angle from straight down, in radians (π/2 = level). */
  polar: number;
  zoom: number;
  distance: number;
}

const SHAKE_MAX = 0.35;
const SHAKE_DECAY = 1.8;
const SHAKE_FREQ = 38;
/** Once the camera is this close it snaps, so a resting view is the same picture every frame. */
const REST = 1e-4;

function rest(current: number, target: number, lambda: number, dt: number): number {
  if (Math.abs(target - current) <= REST) return target;
  const next = damp(current, target, lambda, dt);
  return Math.abs(target - next) <= REST ? target : next;
}

/** Renderer, lights and an orthographic camera that orbits the pyramid. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 300);
  private readonly focus = new THREE.Vector3(0, 8, 0);
  private readonly offset = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private polar = THREE.MathUtils.degToRad(CAMERA.showcasePolarDeg);
  private azimuth = 0;
  private zoom: number = CAMERA.showcaseZoom;
  private distance: number = CAMERA.showcaseDistance;
  private width = 1;
  private height = 1;
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private trauma = 0;
  private shakeClock = 0;
  /** 0 disables screen shake (reduced motion). */
  shakeScale = 1;
  private readonly grade: Grade;

  constructor(container: HTMLElement) {
    const dpr = window.devicePixelRatio || 1;
    // Retina pixels already soften edges, so skip MSAA there and stay under 2×.
    // The scene is drawn into an offscreen target, so MSAA lives on that target.
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.grade = new Grade(dpr <= 1 ? 4 : 0);
    this.grade.enabled = !new URLSearchParams(location.search).has('raw');
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    // The sun and the pyramid stay put during a round, so the map is redrawn only when lighting changes.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    container.appendChild(this.renderer.domElement);

    const { hemi, sun } = this;
    this.setLighting(LIGHTING.day);
    sun.target.position.set(0, 8, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, sun, sun.target);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.applyCamera();
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const aspect = this.width / this.height;
    const halfH = Math.max(CAMERA.minHalfHeight, CAMERA.minHalfWidth / aspect);
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    const buffer = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(buffer);
    this.grade.setSize(buffer.x, buffer.y);
  }

  setLighting(l: Lighting): void {
    this.hemi.color.setHex(l.skyColor);
    this.hemi.groundColor.setHex(l.groundColor);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.sun.position.set(...l.sunPosition);
    this.renderer.shadowMap.needsUpdate = true;
    // Night already carries the blue. The poster grade is for the paper-daylight pictures.
    this.grade.print = l.glow && l.sunIntensity < 1.5 ? 0.35 : l.glow ? 0.7 : 1;
  }

  follow(goal: CameraGoal, dt: number): void {
    const k = 4;
    this.focus.set(
      rest(this.focus.x, goal.focus.x, k, dt),
      rest(this.focus.y, goal.focus.y, k, dt),
      rest(this.focus.z, goal.focus.z, k, dt),
    );
    this.azimuth = goal.azimuth;
    this.polar = rest(this.polar, goal.polar, 3, dt);
    this.zoom = rest(this.zoom, goal.zoom, 3, dt);
    this.distance = rest(this.distance, goal.distance, 3, dt);
    this.settle(dt);
  }

  /** Adds screen shake; `amount` stacks up to 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Decays the shake and re-places the camera without moving its goal (used during hit-stop too). */
  settle(dt: number): void {
    this.shakeClock += dt;
    this.trauma = Math.max(0, this.trauma - dt * SHAKE_DECAY);
    this.applyCamera();
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } {
    this.projected.set(x, y, z).project(this.camera);
    return {
      x: ((this.projected.x + 1) / 2) * this.width,
      y: ((1 - this.projected.y) / 2) * this.height,
    };
  }

  render(): void {
    if (this.grade.enabled) this.grade.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  private applyCamera(): void {
    this.offset.setFromSphericalCoords(this.distance, this.polar, this.azimuth);
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
    const jolt = this.trauma * this.trauma * this.shakeScale * SHAKE_MAX;
    if (jolt > 1e-4) {
      // Slide within the view plane only, so the orthographic framing never tilts.
      const t = this.shakeClock * SHAKE_FREQ;
      this.camera.updateMatrixWorld();
      this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.camera.position
        .addScaledVector(this.right, jolt * Math.sin(t * 1.3 + 0.7) * Math.cos(t * 0.6))
        .addScaledVector(this.up, jolt * Math.sin(t * 1.7) * Math.cos(t * 0.9 + 1.1));
    }
    if (this.camera.zoom !== this.zoom) {
      this.camera.zoom = this.zoom;
      this.camera.updateProjectionMatrix();
    }
  }
}
