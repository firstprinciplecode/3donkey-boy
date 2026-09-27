import * as THREE from 'three';
import { CAMERA } from './config';
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

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xa9c79a, 1.6);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-25, 60, 35);
    sun.target.position.set(0, 8, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
  }

  follow(goal: CameraGoal, dt: number): void {
    const k = 4;
    this.focus.set(
      damp(this.focus.x, goal.focus.x, k, dt),
      damp(this.focus.y, goal.focus.y, k, dt),
      damp(this.focus.z, goal.focus.z, k, dt),
    );
    this.azimuth = goal.azimuth;
    this.polar = damp(this.polar, goal.polar, 3, dt);
    this.zoom = damp(this.zoom, goal.zoom, 3, dt);
    this.distance = damp(this.distance, goal.distance, 3, dt);
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
    this.renderer.render(this.scene, this.camera);
  }

  private applyCamera(): void {
    this.offset.setFromSphericalCoords(this.distance, this.polar, this.azimuth);
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus);
    if (this.camera.zoom !== this.zoom) {
      this.camera.zoom = this.zoom;
      this.camera.updateProjectionMatrix();
    }
  }
}
