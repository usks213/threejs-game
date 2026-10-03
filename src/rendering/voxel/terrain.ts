import * as THREE from 'three';
import type { MeshData } from '../../world/types';
export function createTerrain(scene: THREE.Scene) {
  const meshes = new Map<string, THREE.Mesh>();
  const raycastMeshes: THREE.Mesh[] = [];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const remove = (id: string) => { const mesh = meshes.get(id); if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); meshes.delete(id); raycastMeshes.splice(raycastMeshes.indexOf(mesh), 1); } };
  return {
    update(data: MeshData) {
      remove(data.id); if (!data.indices.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material); scene.add(mesh); meshes.set(data.id, mesh); raycastMeshes.push(mesh);
    },
    remove(ids: string[]) { ids.forEach(remove); },
    raycast(raycaster: THREE.Raycaster) { return raycaster.intersectObjects(raycastMeshes, false)[0]; },
    dispose() { [...meshes.keys()].forEach(remove); material.dispose(); },
  };
}
