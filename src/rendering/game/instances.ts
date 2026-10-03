import * as THREE from 'three';

/** A reusable draw batch. Geometry/material ownership stays with the caller. */
export class Instances {
  private mesh: THREE.InstancedMesh;
  private capacity = 64;
  private count = 0;

  constructor(private readonly scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  begin(): void { this.count = 0; }

  add(matrix: THREE.Matrix4): void {
    if (this.count === this.capacity) {
      this.capacity *= 2;
      const next = new THREE.InstancedMesh(this.mesh.geometry, this.mesh.material, this.capacity);
      next.frustumCulled = false;
      next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      (next.instanceMatrix.array as Float32Array).set(this.mesh.instanceMatrix.array);
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = next;
      this.scene.add(next);
    }
    this.mesh.setMatrixAt(this.count++, matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.clearUpdateRanges();
    if (this.count) this.mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void { this.scene.remove(this.mesh); this.mesh.dispose(); }
}
