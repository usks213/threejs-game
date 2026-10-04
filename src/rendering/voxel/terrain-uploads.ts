import * as THREE from 'three';

export interface TerrainUploadStats {
  /** CPU time submitting buffer uploads, not GPU completion time. */
  uploadSubmissionMs: number;
  bytes: number;
  count: number;
  warmed: boolean;
}

/** Submit every admitted LOD's buffers before visibility can defer them to a later frame. */
export class TerrainUploads {
  readonly stats: TerrainUploadStats = { uploadSubmissionMs: 0, bytes: 0, count: 0, warmed: false };
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2);
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  private readonly material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, toneMapped: false });
  private readonly placeholder = new THREE.BufferGeometry();
  private readonly proxies: THREE.Mesh[] = [];

  constructor() {
    this.placeholder.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.placeholder.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
    this.placeholder.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  }

  beginFrame(): void { this.stats.uploadSubmissionMs = 0; this.stats.bytes = 0; this.stats.count = 0; }

  /** Optional startup warm-up keeps the tiny, shared upload shader out of movement frames. */
  warm(renderer: THREE.WebGLRenderer): void {
    if (!this.stats.warmed) this.render(renderer, [this.placeholder]);
  }

  submit(renderer: THREE.WebGLRenderer, geometries: readonly THREE.BufferGeometry[]): void {
    if (!geometries.length) return;
    const started = performance.now();
    this.render(renderer, geometries);
    this.stats.uploadSubmissionMs += performance.now() - started;
    this.stats.count += geometries.length;
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes)) this.stats.bytes += attribute.array.byteLength;
      this.stats.bytes += geometry.index?.array.byteLength ?? 0;
    }
  }

  private render(renderer: THREE.WebGLRenderer, geometries: readonly THREE.BufferGeometry[]): void {
    const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const autoClear = renderer.autoClear, shadows = renderer.shadowMap.enabled, xr = renderer.xr.enabled;
    const autoReset = renderer.info.autoReset;
    const ranges = geometries.map(geometry => ({ ...geometry.drawRange }));
    try {
      for (let i = 0; i < geometries.length; i++) {
        let proxy = this.proxies[i];
        if (!proxy) {
          proxy = new THREE.Mesh(this.placeholder, this.material);
          proxy.frustumCulled = false; proxy.matrixAutoUpdate = false;
          this.proxies.push(proxy);
        }
        proxy.geometry = geometries[i];
        // Three r180 updates ALL attributes in WebGLObjects, including shader-unused
        // normal/color. A zero-count draw still reaches WebGLBindingStates.setup,
        // which uploads the index too, without shading any terrain triangles.
        geometries[i].setDrawRange(0, 0);
        this.scene.add(proxy);
      }
      renderer.autoClear = false; renderer.shadowMap.enabled = false; renderer.xr.enabled = false;
      renderer.info.autoReset = false;
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
      this.stats.warmed = true;
    } finally {
      for (let i = 0; i < geometries.length; i++) {
        geometries[i].setDrawRange(ranges[i].start, ranges[i].count);
        const proxy = this.proxies[i];
        if (proxy) { this.scene.remove(proxy); proxy.geometry = this.placeholder; }
      }
      renderer.setRenderTarget(target, face, mip);
      renderer.autoClear = autoClear; renderer.shadowMap.enabled = shadows; renderer.xr.enabled = xr;
      renderer.info.autoReset = autoReset;
    }
  }

  dispose(): void {
    this.scene.clear(); this.proxies.length = 0;
    this.placeholder.dispose(); this.material.dispose(); this.target.dispose();
  }
}
