import * as THREE from 'three';

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCone = new THREE.ConeGeometry(0.5, 1, 10);
const materialCache = new Map<string, THREE.MeshLambertMaterial>();

export interface MatOptions {
  opacity?: number;
  emissive?: number;
}

export function material(color: number, opts: MatOptions = {}): THREE.MeshLambertMaterial {
  const opacity = opts.opacity ?? 1;
  const emissive = opts.emissive ?? 0;
  const key = `${color}|${opacity}|${emissive}`;
  let m = materialCache.get(key);
  if (!m) {
    const transparent = opacity < 1;
    m = new THREE.MeshLambertMaterial({
      color,
      transparent,
      opacity,
      depthWrite: !transparent,
      emissive,
      emissiveIntensity: emissive ? 0.35 : 0,
    });
    materialCache.set(key, m);
  }
  return m;
}

/** Centered box mesh. Don't parent children to it: its scale is the box size. */
export function box(
  sx: number,
  sy: number,
  sz: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  opts?: MatOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material(color, opts));
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = (opts?.opacity ?? 1) >= 1;
  mesh.receiveShadow = true;
  return mesh;
}

export function cone(radius: number, height: number, color: number, x = 0, yBottom = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCone, material(color));
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.position.set(x, yBottom + height / 2, z);
  mesh.castShadow = true;
  return mesh;
}

const STRIDE = 7;

/**
 * Collects static boxes/cones and bakes them into one InstancedMesh per shape,
 * so the whole world renders in a couple of draw calls.
 */
export class VoxelBuilder {
  private readonly boxes: number[] = [];
  private readonly cones: number[] = [];
  private readonly glows: number[] = [];

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): this {
    this.boxes.push(x, y, z, sx, sy, sz, color);
    return this;
  }

  /** Box that lights up (renders unlit) when built with `glowing`; a plain box otherwise. */
  glow(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): this {
    this.glows.push(x, y, z, sx, sy, sz, color);
    return this;
  }

  /** Box resting on `yBottom`. */
  block(x: number, yBottom: number, z: number, sx: number, sy: number, sz: number, color: number): this {
    return this.box(x, yBottom + sy / 2, z, sx, sy, sz, color);
  }

  cone(x: number, yBottom: number, z: number, radius: number, height: number, color: number): this {
    this.cones.push(x, yBottom + height / 2, z, radius * 2, height, radius * 2, color);
    return this;
  }

  build(glowing = false): THREE.Group {
    const group = new THREE.Group();
    const bake = (data: number[], geometry: THREE.BufferGeometry, unlit = false) => {
      const count = data.length / STRIDE;
      if (!count) return;
      const mat = unlit ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
      const mesh = new THREE.InstancedMesh(geometry, mat, count);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        dummy.position.set(data[o], data[o + 1], data[o + 2]);
        dummy.scale.set(data[o + 3], data[o + 4], data[o + 5]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setHex(data[o + 6]));
      }
      mesh.castShadow = !unlit;
      mesh.receiveShadow = !unlit;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    };
    if (glowing) {
      bake(this.boxes, unitBox);
      bake(this.glows, unitBox, true);
    } else {
      bake([...this.boxes, ...this.glows], unitBox);
    }
    bake(this.cones, unitCone);
    return group;
  }
}
