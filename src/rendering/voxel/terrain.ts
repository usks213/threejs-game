import { createGrass } from '../environment/grass';
import { createTerrainMaterial } from './material';
import { TerrainUploads } from './terrain-uploads';
import { TerrainRaycasts, type TerrainRaycastEntry } from './terrain-raycast';
import * as THREE from 'three';
import { BRICK_SIZE, type MeshData } from '../../world/types';

export function createTerrain(scene: THREE.Scene) {
 const meshes = new Map<string, THREE.LOD>(), raycastMeshes = new Map<string, TerrainRaycastEntry>();
 let active: ReadonlySet<string> | null = null;
 const grass = createGrass(scene), uploads = new TerrainUploads(), rays = new TerrainRaycasts();
 const adventure={value:0},surface = createTerrainMaterial(adventure), material = surface.material;
 const remove = (id: string) => {
  grass.remove(id); const group = meshes.get(id); if (!group) return;
  scene.remove(group); group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  meshes.delete(id); raycastMeshes.delete(id);
 };
 const mesh = (data: MeshData, origin: THREE.Vector3) => {
  const geometry = new THREE.BufferGeometry(), positions = data.origin ? data.positions : data.positions.slice();
  if(!data.origin)for (let i = 0; i < positions.length; i += 3) { positions[i] -= origin.x; positions[i + 1] -= origin.y; positions[i + 2] -= origin.z; }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3)); geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  if(data.bounds)geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(data.bounds.center.x,data.bounds.center.y,data.bounds.center.z),data.bounds.radius);else geometry.computeBoundingSphere();
  // Marching-tetrahedra vertices and the averaged coarse vertices stay in their
  // brick. No main-thread scan is needed for this conservative AABB.
  const half = BRICK_SIZE / 2 + .001;
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-half, -half, -half), new THREE.Vector3(half, half, half));
  const result = new THREE.Mesh(geometry, material); result.receiveShadow=true; result.castShadow=true; return result;
 };
 return {
  update(data: MeshData, renderer: THREE.WebGLRenderer) {
   if (!data.indices.length) { remove(data.id); grass.set(data); return; }
   const values = data.id.split(',').map(Number), origin = data.origin?new THREE.Vector3(data.origin.x,data.origin.y,data.origin.z):new THREE.Vector3(values[0] * BRICK_SIZE + BRICK_SIZE / 2, values[1] * BRICK_SIZE + BRICK_SIZE / 2, values[2] * BRICK_SIZE + BRICK_SIZE / 2), lod = new THREE.LOD(); lod.position.copy(origin);
   const fine = mesh(data, origin), geometries = [fine.geometry]; lod.addLevel(fine, 0);
   if (data.coarse?.indices.length) { const coarse = mesh(data.coarse, origin); lod.addLevel(coarse, 28, 0.1); geometries.push(coarse.geometry); }
   // Submission belongs inside TerrainQueue.flush's time/byte/chunk budget.
   // Publish the replacement only when ALL its LOD buffers have been submitted.
   try { uploads.submit(renderer, geometries); } catch (error) { geometries.forEach(geometry => geometry.dispose()); throw error; }
   remove(data.id); grass.set(data); lod.visible = active === null || active.has(data.id); scene.add(lod); meshes.set(data.id, lod); lod.updateMatrixWorld(true);
   raycastMeshes.set(data.id, { mesh: fine, bounds: fine.geometry.boundingBox!.clone().translate(origin), active: lod.visible });
  },
  setActive(ids: readonly string[]) {
   active = new Set(ids);
   for (const [id, lod] of meshes) { lod.visible = active.has(id); const entry = raycastMeshes.get(id); if (entry) entry.active = lod.visible; }
  },
  prepareUploads: (renderer: THREE.WebGLRenderer) => uploads.warm(renderer),
  beginUploadFrame: () => uploads.beginFrame(),
  stats: uploads.stats,
  raycastStats: rays.stats,
  ids:()=>[...meshes.keys()],has:(id:string)=>meshes.has(id),
  updateDetails(player:THREE.Vector3,seconds:number){adventure.value=scene.userData.generator===4?1:0;grass.update(player,seconds);},
  remove(ids: string[]) { ids.forEach(remove); },
  // Tools reach 7m from the player; the camera is at most 11m away. The finite
  // default leaves headroom while excluding unrelated distant terrain meshes.
  raycast(raycaster: THREE.Raycaster) { return rays.nearest(raycaster, raycastMeshes.values()); },
  dispose() { [...meshes.keys()].forEach(remove); uploads.dispose(); surface.dispose(); grass.dispose(); },
 };
}
