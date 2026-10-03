import { BRICK_SIZE, type Brick, type MeshData } from './types';
// Interior vertex clusters simplify far terrain while the exact border stays shared.
export function simplifyBrick(mesh: MeshData, brick: Brick): MeshData {
 const groups = new Map<string, number>(), records: { position: number[]; normal: number[]; color: number[]; count: number }[] = [], remap = new Uint32Array(mesh.positions.length / 3);
 for (let i = 0; i < remap.length; i++) {
  const p = Array.from(mesh.positions.subarray(i * 3, i * 3 + 3)), local = [p[0] - brick.origin.x, p[1] - brick.origin.y, p[2] - brick.origin.z];
  const border = local.some(v => v < 0.001 || v > BRICK_SIZE - 0.001), key = border ? 'v' + i : local.map(v => Math.floor(v / 2)).join(',');
  let id = groups.get(key); if (id === undefined) { id = records.length; groups.set(key, id); records.push({ position: [0, 0, 0], normal: [0, 0, 0], color: [0, 0, 0], count: 0 }); }
  const r = records[id]; r.count++; remap[i] = id;
  for (let axis = 0; axis < 3; axis++) { r.position[axis] += p[axis]; r.normal[axis] += mesh.normals[i * 3 + axis]; r.color[axis] += mesh.colors[i * 3 + axis]; }
 }
 const positions = new Float32Array(records.length * 3), normals = new Float32Array(positions.length), colors = new Float32Array(positions.length), indices: number[] = [];
 records.forEach((r, id) => { const length = Math.hypot(...r.normal) || 1; for (let axis = 0; axis < 3; axis++) { positions[id * 3 + axis] = r.position[axis] / r.count; normals[id * 3 + axis] = r.normal[axis] / length; colors[id * 3 + axis] = r.color[axis] / r.count; } });
 for (let i = 0; i < mesh.indices.length; i += 3) { const a = remap[mesh.indices[i]], b = remap[mesh.indices[i + 1]], c = remap[mesh.indices[i + 2]]; if (a !== b && b !== c && a !== c) indices.push(a, b, c); }
 return { id: mesh.id, positions, normals, colors, indices: new Uint32Array(indices), milliseconds: 0 };
}
