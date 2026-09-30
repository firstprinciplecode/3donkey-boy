import * as THREE from 'three';

/**
 * One full-screen pass that pushes the 3D picture a step toward the poster: a little more
 * contrast and candy saturation. It does not lift the blacks or roll off the highlights,
 * which is what made the first try look milky. Empty pixels stay transparent so the HTML
 * sky shows through.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uPrint;
varying vec2 vUv;

vec3 grade(vec3 c) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, 1.0 + 0.14 * uPrint);
  c = (c - vec3(0.5)) * (1.0 + 0.1 * uPrint) + vec3(0.5);
  return max(c, vec3(0.0));
}

void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  gl_FragColor = vec4(grade(src.rgb), src.a);
  #include <colorspace_fragment>
  #include <premultiplied_alpha_fragment>
}
`;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class Grade {
  /** 1 is the full poster grade. Night turns it down so the blue scene stays blue. */
  print = 1;
  enabled = true;

  private readonly target: THREE.WebGLRenderTarget;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly printUniform = { value: 1 };

  constructor(samples: number) {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
    });
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.magFilter = THREE.NearestFilter;
    this.target.texture.generateMipmaps = false;
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 3, 0, -1, -1, 0, 3, -1, 0]), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 2, 0, 0, 2, 0]), 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uPrint: this.printUniform,
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
    });

    this.quad = new THREE.Mesh(geometry, material);
    this.quad.frustumCulled = false;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, width), Math.max(1, height));
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.printUniform.value = this.print;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quad, this.camera);
  }
}
