import * as THREE from 'three';
import type { Snapshot } from '../../simulation/protocol';
import { Instances } from './instances';

export function createBodies(scene: THREE.Scene) {
  const geometry = [new THREE.IcosahedronGeometry(0.55, 1), new THREE.CylinderGeometry(0.23, 0.27, 1.1, 7), new THREE.BoxGeometry(0.72, 0.6, 0.72)];
  geometry[1].rotateZ(Math.PI / 2);
  const materials = ['#8f9287', '#826044', '#9b917c'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  const batches = geometry.map((g, i) => new Instances(scene, g, materials[i]));
  const views = new Map<number, { x: number; z: number; rx: number; rz: number; tick: number }>();
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1), position = new THREE.Vector3(), roll = new THREE.Euler();
  let revision = 0;
  return {
    update(state: Snapshot): void {
      revision++;
      batches.forEach(batch => batch.begin());
      for (const b of state.bodies) {
        const p = b.position;
        let view = views.get(b.id);
        if (!view) { view = { x: p.x, z: p.z, rx: 0, rz: 0, tick: revision }; views.set(b.id, view); }
        view.rx += (p.z - view.z) / b.radius; view.rz -= (p.x - view.x) / b.radius;
        view.x = p.x; view.z = p.z; view.tick = revision;
        rotation.setFromEuler(roll.set(view.rx, b.id * 2.399, view.rz));
        matrix.compose(position.set(p.x, p.y, p.z), rotation, scale);
        batches[b.kind === 'wood' ? 1 : b.kind === 'debris' ? 2 : 0].add(matrix);
      }
      for (const [id, view] of views) if (view.tick !== revision) views.delete(id);
      batches.forEach(batch => batch.end());
    },
    dispose(): void { batches.forEach(batch => batch.dispose()); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
