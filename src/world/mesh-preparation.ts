import { BRICK_SIZE, type Brick, type MeshData, type Vec3 } from './types';

/** Preserve the old deterministic grass placement, but scan vertices off the rendering thread. */
export function grassSamples(mesh: MeshData): Float32Array {
  const points: number[] = [], seen = new Set<string>();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (mesh.normals[i + 1] < .82 || mesh.colors[i + 1] < mesh.colors[i] * 1.07) continue;
    const x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
    const key = `${Math.floor(x * 1.4)},${Math.floor(y)},${Math.floor(z * 1.4)}`;
    if (seen.has(key)) continue;
    seen.add(key); points.push(x, y - .035, z);
  }
  return new Float32Array(points);
}
function localize(mesh: MeshData, origin: Vec3): void {
  mesh.origin = { ...origin };
  let radiusSquared = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    mesh.positions[i] -= origin.x; mesh.positions[i + 1] -= origin.y; mesh.positions[i + 2] -= origin.z;
    radiusSquared = Math.max(radiusSquared, mesh.positions[i] ** 2 + mesh.positions[i + 1] ** 2 + mesh.positions[i + 2] ** 2);
  }
  // Centered on the brick; a conservative sphere avoids a second vertex scan on the main thread.
  mesh.bounds = { center: { x: 0, y: 0, z: 0 }, radius: Math.sqrt(radiusSquared) };
  if (mesh.coarse) localize(mesh.coarse, origin);
}
export function prepareTerrainMesh(mesh: MeshData, brick: Brick): MeshData {
  mesh.grass = grassSamples(mesh);
  localize(mesh, { x: brick.origin.x + BRICK_SIZE / 2, y: brick.origin.y + BRICK_SIZE / 2, z: brick.origin.z + BRICK_SIZE / 2 });
  return mesh;
}
/** Both worker hops transfer ownership, including coarse LOD and grass buffers. */
export function meshTransferables(meshes: readonly MeshData[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const collect = (mesh: MeshData) => {
    for (const array of [mesh.positions, mesh.normals, mesh.colors, mesh.indices, mesh.grass, mesh.field?.density]) if (array) buffers.add(array.buffer as ArrayBuffer);
    if (mesh.coarse) collect(mesh.coarse);
  };
  meshes.forEach(collect);
  return [...buffers];
}
