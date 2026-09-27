import * as THREE from 'three';
import { material, unitBox } from '../voxel';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const SIZE = 0.18;
const GRAVITY = -18;

/** Pooled voxel confetti bursts. */
export class Particles {
  readonly group = new THREE.Group();
  private readonly live: Particle[] = [];
  private readonly pool: THREE.Mesh[] = [];

  burst(x: number, y: number, z: number, colors: readonly number[], count = 14, speed = 5): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(unitBox);
      mesh.material = material(colors[i % colors.length]);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(SIZE);
      this.group.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const life = 0.6 + Math.random() * 0.5;
      this.live.push({
        mesh,
        vx: Math.cos(a) * s,
        vy: 3 + Math.random() * speed,
        vz: Math.sin(a) * s * 0.5,
        life,
        maxLife: life,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.recycle(i);
        continue;
      }
      p.vy += GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      p.mesh.scale.setScalar(SIZE * (p.life / p.maxLife));
    }
  }

  clear(): void {
    for (let i = this.live.length - 1; i >= 0; i--) this.recycle(i);
  }

  private recycle(i: number): void {
    const p = this.live[i];
    this.group.remove(p.mesh);
    this.pool.push(p.mesh);
    this.live.splice(i, 1);
  }
}
