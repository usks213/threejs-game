import { MAX_FLUID_CELLS, type FluidCell } from './fluid';
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const WATER_VERTEX_CAPACITY = MAX_FLUID_CELLS * 6 * 6;
// Only the external boundary is rendered; neighboring cells no longer draw overlapping boxes.
export function waterSurface(cells: FluidCell[], positions: Float32Array, normals: Float32Array): number {
  const map = new Map(cells.map(c => [key(c.x, c.y, c.z), c]));
  let count = 0;
  const face = (corners: number[][], nx: number, ny: number, nz: number) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.set(corners[i], count * 3); normals.set([nx, ny, nz], count * 3); count++;
    }
  };
  for (const c of cells) {
    const { x, y, z } = c, bottom = y + (c.bottom ?? 0), top = y + Math.min(1, (c.bottom ?? 0) + c.volume);
    if (top - bottom < 0.0001) continue;
    if (top < y + 0.999 || !map.has(key(x, y + 1, z))) face([[x, top, z], [x, top, z + 1], [x + 1, top, z + 1], [x + 1, top, z]], 0, 1, 0);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = map.get(key(x + dx, y, z + dz));
      const low = Math.max(bottom, neighbor ? y + Math.min(1, (neighbor.bottom ?? 0) + neighbor.volume) : bottom);
      if (top - low < 0.0001) continue;
      if (dx === 1) face([[x + 1, low, z], [x + 1, top, z], [x + 1, top, z + 1], [x + 1, low, z + 1]], 1, 0, 0);
      if (dx === -1) face([[x, low, z + 1], [x, top, z + 1], [x, top, z], [x, low, z]], -1, 0, 0);
      if (dz === 1) face([[x + 1, low, z + 1], [x + 1, top, z + 1], [x, top, z + 1], [x, low, z + 1]], 0, 0, 1);
      if (dz === -1) face([[x, low, z], [x, top, z], [x + 1, top, z], [x + 1, low, z]], 0, 0, -1);
    }
    if (!map.has(key(x, y - 1, z))) face([[x, bottom, z + 1], [x, bottom, z], [x + 1, bottom, z], [x + 1, bottom, z + 1]], 0, -1, 0);
  }
  return count;
}
