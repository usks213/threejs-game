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
    const p = decode(a), q = decode(b), t = values[a] / (values[a] - values[b]);
    p.x += (q.x - p.x) * t; p.y += (q.y - p.y) * t; p.z += (q.z - p.z) * t;
    world.normal(p, gradient);
    const id = positions.length / 3;
    positions.push(p.x, p.y, p.z); normals.push(gradient.x, gradient.y, gradient.z);
    const palette = gradient.y > 0.6 ? meadow.grass : p.y > 1 ? meadow.stone : meadow.soil;
    colors.push(...palette); edges.set(key, id); return id;
  }
  function triangle(a: number, b: number, c: number) {
    const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const dot = (ay * bz - az * by) * normals[a * 3] + (az * bx - ax * bz) * normals[a * 3 + 1] + (ax * by - ay * bx) * normals[a * 3 + 2];
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
  return { id: brick.id, positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices), milliseconds: performance.now() - started };
}
