import type { FieldData } from '../../world/field-data';
import type { Vec3 } from '../../world/types';

export interface FieldSurfaceBounds { min: Vec3; max: Vec3 }

/**
 * Trilinear interpolation stays inside the range of its eight corner values.
 * Only cells whose range contains zero can contain a surface. Enclose all of
 * them, including caves/overhangs, instead of marching the full 8 m brick.
 * The margin includes the shader's zero tolerance and R16F subnormal rounding.
 * These are rendering bounds only; the authoritative density remains intact.
 */
export function fieldSurfaceBounds(data: FieldData): FieldSurfaceBounds | null {
  const n = data.size, last = n - 1, layer = n * n, d = data.density;
  const epsilon = 1e-6 + 2 ** -25;
  let minX = last, minY = last, minZ = last, maxX = 0, maxY = 0, maxZ = 0;
  for (let z = 0; z < last; z++) for (let y = 0; y < last; y++) for (let x = 0; x < last; x++) {
    const i = x + n * y + layer * z;
    const low = Math.min(d[i], d[i + 1], d[i + n], d[i + n + 1], d[i + layer], d[i + layer + 1], d[i + layer + n], d[i + layer + n + 1]);
    if (low > epsilon) continue;
    const high = Math.max(d[i], d[i + 1], d[i + n], d[i + n + 1], d[i + layer], d[i + layer + 1], d[i + layer + n], d[i + layer + n + 1]);
    if (high < -epsilon) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1); maxZ = Math.max(maxZ, z + 1);
  }
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) return null;
  const { origin: o, step: s } = data;
  return {
    min: { x: o.x + minX * s, y: o.y + minY * s, z: o.z + minZ * s },
    max: { x: o.x + maxX * s, y: o.y + maxY * s, z: o.z + maxZ * s },
  };
}
