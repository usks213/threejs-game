import { createTerrainMaterial } from './material';
import * as THREE from 'three';
import type { MeshData } from '../../world/types';
export function createTerrain(scene: THREE.Scene) {
 const meshes = new Map<string, THREE.LOD>(), raycastMeshes: THREE.Mesh[] = [];
 const surface = createTerrainMaterial(), material = surface.material;
 const remove = (id: string) => { const group = meshes.get(id); if (!group) return; scene.remove(group); group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const index = raycastMeshes.indexOf(o); if (index >= 0) raycastMeshes.splice(index, 1); } }); meshes.delete(id); };
 const mesh = (data: MeshData, origin: THREE.Vector3) => {
  const geometry = new THREE.BufferGeometry(), positions = data.positions.slice();
  for (let i = 0; i < positions.length; i += 3) { positions[i] -= origin.x; positions[i + 1] -= origin.y; positions[i + 2] -= origin.z; }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3)); geometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
 };
 return {
  update(data: MeshData) { remove(data.id); if (!data.indices.length) return;
   const values = data.id.split(',').map(Number), origin = new THREE.Vector3(values[0] * 8 + 4, values[1] * 8 + 4, values[2] * 8 + 4), lod = new THREE.LOD(); lod.position.copy(origin);
   const fine = mesh(data, origin); lod.addLevel(fine, 0); raycastMeshes.push(fine);
   if (data.coarse?.indices.length) lod.addLevel(mesh(data.coarse, origin), 28, 0.1);
   scene.add(lod); meshes.set(data.id, lod); lod.updateMatrixWorld(true);
  },
  remove(ids: string[]) { ids.forEach(remove); },
  raycast(raycaster: THREE.Raycaster) { return raycaster.intersectObjects(raycastMeshes, false)[0]; },
  dispose() { [...meshes.keys()].forEach(remove); surface.dispose(); },
 };
}

