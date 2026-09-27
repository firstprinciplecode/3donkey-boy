import * as THREE from 'three';
import { COLORS } from '../config';
import { makeOneUpTexture } from '../textures';
import { material } from '../voxel';

let faceMaterial: THREE.MeshLambertMaterial | null = null;

/** Green "1-up" coin from the poster. Both faces read correctly while spinning. */
export function createOneUpToken(radius: number): THREE.Group {
  faceMaterial ??= new THREE.MeshLambertMaterial({ map: makeOneUpTexture() });
  const depth = radius * 0.3;
  const group = new THREE.Group();

  const rimGeo = new THREE.CylinderGeometry(radius, radius, depth, 28);
  rimGeo.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, material(COLORS.grassDark));
  rim.receiveShadow = true;

  const faceGeo = new THREE.CircleGeometry(radius * 0.98, 28);
  const front = new THREE.Mesh(faceGeo, faceMaterial);
  front.position.z = depth / 2 + 0.005;
  const back = new THREE.Mesh(faceGeo, faceMaterial);
  back.rotation.y = Math.PI;
  back.position.z = -depth / 2 - 0.005;

  group.add(rim, front, back);
  return group;
}
