import { simplifyBrick } from './lod';
import { biomeAt } from '../content/catalog';
import { meadow } from '../content/biomes';
import type { SdfWorld } from './density';
import { BRICK_SIZE, type Brick, type MeshData, type Vec3 } from './types';

const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
export function meshBrick(world: SdfWorld, brick: Brick): MeshData {
  const started = performance.now();
  const n = BRICK_SIZE / brick.step, side = n + 1;
  const values = new Float32Array(side ** 3);
  const point = (x: number, y: number, z: number): Vec3 => ({ x: brick.origin.x + x * brick.step, y: brick.origin.y + y * brick.step, z: brick.origin.z + z * brick.step });
  const index = (x: number, y: number, z: number) => x + side * (y + side * z);
  for (let z = 0; z <= n; z++) for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) values[index(x, y, z)] = world.density(point(x, y, z));
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const edges = new Map<string, number>();
  const gradient: Vec3 = { x: 0, y: 0, z: 0 };
  function vertex(a: number, b: number): number {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = edges.get(key); if (cached !== undefined) return cached;
    const decode = (i: number) => point(i % side, Math.floor(i / side) % side, Math.floor(i / side ** 2));
    const start = decode(a), q = decode(b), p = { ...start };
    let low = 0, high = 1, da = values[a], db = values[b];
    for (let refinement = 0; refinement < 4; refinement++) {
      const t = low + (high - low) * da / (da - db);
      p.x = start.x + (q.x - start.x) * t;
      p.y = start.y + (q.y - start.y) * t;
      p.z = start.z + (q.z - start.z) * t;
      const d = world.density(p);
      if (Math.abs(d) < 0.00001) break;
      if ((d < 0) === (da < 0)) { low = t; da = d; }
      else { high = t; db = d; }
    }
    world.normal(p, gradient);
    const id = positions.length / 3;
    positions.push(p.x, p.y, p.z); normals.push(gradient.x, gradient.y, gradient.z);
    const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    const grass = smooth((gradient.y - 0.4) / 0.4), stone = smooth((p.y + 0.5) / 2);
    for (let channel = 0; channel < 3; channel++) {
      const base = meadow.soil[channel] + (meadow.stone[channel] - meadow.soil[channel]) * stone;
      colors.push(base + (meadow.grass[channel] - base) * grass);
    }
    const biome = biomeAt(p.x, p.z), tint = biome.grass.match(/[a-f0-9]{2}/gi)!.map(c => parseInt(c, 16) / 255);
    if (world.generator!==3&&biome.tier > 1) for (let axis = 0; axis < 3; axis++) colors[id * 3 + axis] = colors[id * 3 + axis] * 0.55 + tint[axis] * 0.45;
    edges.set(key, id); return id;
  }
  function triangle(a: number, b: number, c: number) {
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * nx + ny * ny + nz * nz < 1e-12) return;
    const dot = nx * normals[a * 3] + ny * normals[a * 3 + 1] + nz * normals[a * 3 + 2];
    indices.push(a, dot >= 0 ? b : c, dot >= 0 ? c : b);
  }
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ids = corners.map(c => index(x + c[0], y + c[1], z + c[2]));
    const negative = ids.filter(i => values[i] < 0).length;
    if (negative === 0 || negative === 8) continue;
    for (const tet of tetrahedra) {
      const solid = tet.map(i => ids[i]).filter(i => values[i] < 0), air = tet.map(i => ids[i]).filter(i => values[i] >= 0);
      if (solid.length === 1) triangle(vertex(solid[0], air[0]), vertex(solid[0], air[1]), vertex(solid[0], air[2]));
      else if (solid.length === 3) triangle(vertex(air[0], solid[0]), vertex(air[0], solid[1]), vertex(air[0], solid[2]));
      else if (solid.length === 2) {
        const a = vertex(solid[0], air[0]), b = vertex(solid[0], air[1]), c = vertex(solid[1], air[0]), d = vertex(solid[1], air[1]);
        triangle(a, b, c); triangle(b, d, c);
      }
    }
  }
  const mesh: MeshData = { id: brick.id, positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices), milliseconds: performance.now() - started };
  mesh.coarse = simplifyBrick(mesh, brick); mesh.milliseconds = performance.now() - started; return mesh;
}

