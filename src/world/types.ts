export interface Vec3 { x: number; y: number; z: number }
export interface WorldBounds { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; seaLevel: number; seed: number }
export const WORLD: WorldBounds = { minX: -1000, maxX: 1000, minY: -16, maxY: 48, minZ: -1000, maxZ: 1000, seaLevel: 0, seed: 7319 };
export const CHUNK_SIZE = 16;
export const BRICK_SIZE = 8;
export const MAX_EDITS = 100000;
export type EditKind = 'dig' | 'add';
export interface EditOperation { id: number; kind: EditKind; position: Vec3; radius: number; material: 'stone'; shape?: 'cylinder'; surface?: 'soil'; tick: number }
export interface Brick { id: string; origin: Vec3; step: number }
export interface MeshData { field?:import('./field-data').FieldData; origin?: Vec3; bounds?: { center: Vec3; radius: number }; grass?: Float32Array; coarse?: MeshData; id: string; positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array; milliseconds: number }
export const brickId = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const finiteVec = (p: Vec3) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
export function insideBounds(p: Vec3, bounds = WORLD, margin = 0): boolean {
  return finiteVec(p) && p.x >= bounds.minX + margin && p.x <= bounds.maxX - margin && p.y >= bounds.minY + margin && p.y <= bounds.maxY - margin && p.z >= bounds.minZ + margin && p.z <= bounds.maxZ - margin;
}

