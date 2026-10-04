import { BUILDINGS } from '../../content/catalog';
import { TREE_KINDS } from '../../content/meadows/data';
import type { AdventureSave } from '../types';
import type { Vec3 } from '../../world/types';
import { buildingPose, buildingVoxels, localPoint, rayVoxel, treeVoxels } from '../voxel/model';

/** Contact uses the same surviving wall/tree voxels as rendering, and the actual struck height. */
export function clearMeleeContact(state: AdventureSave, origin: Vec3, contact: Vec3, density: (point: Vec3) => number): boolean {
 const distance = Math.hypot(contact.x - origin.x, contact.y - origin.y, contact.z - origin.z);
 if (distance < .01) return true;
 const direction = { x: (contact.x - origin.x) / distance, y: (contact.y - origin.y) / distance, z: (contact.z - origin.z) / distance };
 const blocked = (hit: number | null) => hit !== null && hit < distance - .02;
 for (let d = .05; d < distance; d += .1) {
  if (density({ x: origin.x + direction.x * d, y: origin.y + direction.y * d, z: origin.z + direction.z * d }) < 0) return false;
 }
 for (const piece of state.buildings) {
  if (Math.hypot(piece.x - origin.x, piece.z - origin.z) > distance + 5 || !BUILDINGS.some(def => def.id === piece.definition)) continue;
  const pose = buildingPose(piece);
  if (blocked(rayVoxel(buildingVoxels(piece.definition), localPoint(origin, pose, pose.rotation), localPoint(direction, { x: 0, y: 0, z: 0 }, pose.rotation), piece.removed, distance))) return false;
 }
 for (const tree of state.resources) {
  if (tree.ready > state.seconds || !TREE_KINDS.has(tree.kind) || Math.hypot(tree.x - origin.x, tree.z - origin.z) > distance + 2.5) continue;
  if (blocked(rayVoxel(treeVoxels(tree.kind, tree.id), localPoint(origin, tree), direction, tree.removed, distance))) return false;
 }
 return true;
}
