import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { Instances } from './instances';

export function createResources(scene: THREE.Scene) {
  const geometry = [new THREE.CylinderGeometry(0.15, 0.26, 2.8, 6), new THREE.ConeGeometry(1.1, 2.6, 6), new THREE.IcosahedronGeometry(0.5, 0)];
  const definitions: [string, number, string][] = [
    ['trunk', 0, '#775d43'], ['crown', 1, '#5c814f'], ['bush', 2, '#56714d'], ['berry', 2, '#cc896e'],
    ['stone', 2, '#a8a796'], ['copper', 2, '#b99466'], ['iron', 2, '#809199'], ['crystal', 2, '#b0dce1'], ['aether', 2, '#b08ad0'],
  ];
  const materials: THREE.Material[] = [];
  const batches = new Map(definitions.map(([id, shape, color]) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: shape === 2 ? 0.75 : 1, flatShading: true });
    materials.push(material);
    return [id, new Instances(scene, geometry[shape], material)];
  }));
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  function part(id: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz));
    batches.get(id)?.add(matrix);
  }
  return {
    update(state: AdventureSnapshot): void {
      for (const batch of batches.values()) batch.begin();
      for (const n of state.resources) {
        if (n.ready > state.seconds) continue;
        rotation.setFromAxisAngle(axis, n.id * 2.399);
        if (n.kind === 'wood') {
          const height = 0.85 + (n.id % 7) * 0.05;
          part('trunk', n.x, n.y + 1.4 * height, n.z, 1, height, 1);
          part('crown', n.x, n.y + 2.8 * height, n.z, 1, height, 1);
          part('crown', n.x, n.y + 3.6 * height, n.z, 0.7, height * 0.8, 0.7);
        } else if (n.kind === 'berry') {
          part('bush', n.x, n.y + 0.45, n.z, 1.4, 1.1, 1.4);
          part('berry', n.x + 0.2, n.y + 0.8, n.z + 0.2, 0.3, 0.3, 0.3);
        } else {
          const crystal = n.kind === 'crystal' || n.kind === 'aether';
          part(n.kind, n.x, n.y + (crystal ? 0.8 : 0.4), n.z, crystal ? 0.9 : 1.5, crystal ? 2.1 : 1.5, crystal ? 0.9 : 1.5);
        }
      }
      for (const batch of batches.values()) batch.end();
    },
    dispose(): void {
      for (const batch of batches.values()) batch.dispose();
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
