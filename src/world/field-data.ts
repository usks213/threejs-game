import { BRICK_SIZE, type Vec3, type Brick, type MeshData, type FieldLod } from './types';
import type { SdfWorld } from './density';
export interface FieldData { id: string; origin: Vec3; step: number; size: number; surface?: boolean; density: Float32Array }

/** Sampling transitions are part of a job/cache revision, even when its cell step is unchanged. */
export function sameFieldLod(a: FieldLod | undefined, b: FieldLod | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.faces.length === b.faces.length && a.edges.length === b.edges.length
    && a.faces.every((value, index) => value === b.faces[index]) && a.edges.every((value, index) => value === b.edges[index]);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * A shared face uses one bilinear lattice at the coarsest incident step. Its
 * four edges use the coarsest of all four edge-neighbors, so a third LOD at a
 * corner cannot split the face. Interior samples remain authoritative; linear
 * texture reconstruction blends each boundary correction over one fine cell.
 */
function matchBoundaries(density: Float32Array, size: number, step: number, lod: FieldLod): void {
  const valid = (value: number) => value >= step && value <= BRICK_SIZE && Number.isInteger(value / step) && Number.isInteger(BRICK_SIZE / value);
  if (lod.faces.length !== 6 || lod.edges.length !== 12 || !lod.faces.every(valid) || !lod.edges.every(valid)) throw new Error('Invalid density transition layout');
  if (![...lod.faces, ...lod.edges].some(value => value > step)) return;
  const source = density.slice(), last = size - 1;
  const raw = (p: readonly number[]) => source[p[0] + size * (p[1] + size * p[2])];
  const side = (value: number) => value === last ? 1 : 0;
  function edge(p: readonly number[], axis: number): number {
    const a = (axis + 1) % 3, b = (axis + 2) % 3, first = Math.min(a, b), second = Math.max(a, b);
    const stride = lod.edges[axis * 4 + side(p[first]) * 2 + side(p[second])] / step;
    const low = Math.min(last - stride, Math.floor(p[axis] / stride) * stride), t = (p[axis] - low) / stride;
    const q = [...p]; q[axis] = low; const lo = raw(q); q[axis] += stride;
    return mix(lo, raw(q), t);
  }
  function faceNode(p: readonly number[], a: number, b: number): number {
    if (p[a] === 0 || p[a] === last) return edge(p, b);
    if (p[b] === 0 || p[b] === last) return edge(p, a);
    return raw(p);
  }
  function boundary(p: readonly number[]): number {
    const faces: number[] = [];
    for (let axis = 0; axis < 3; axis++) if (p[axis] === 0 || p[axis] === last) faces.push(axis);
    if (faces.length === 3) return raw(p);
    if (faces.length === 2) return edge(p, 3 - faces[0] - faces[1]);
    const axis = faces[0], a = (axis + 1) % 3, b = (axis + 2) % 3;
    const stride = lod.faces[axis * 2 + side(p[axis])] / step;
    const lowA = Math.min(last - stride, Math.floor(p[a] / stride) * stride), lowB = Math.min(last - stride, Math.floor(p[b] / stride) * stride);
    const u = (p[a] - lowA) / stride, v = (p[b] - lowB) / stride, q = [...p];
    q[a] = lowA; q[b] = lowB; const aa = faceNode(q, a, b);
    q[a] += stride; const ba = faceNode(q, a, b);
    q[a] = lowA; q[b] += stride; const ab = faceNode(q, a, b);
    q[a] += stride; const bb = faceNode(q, a, b);
    return mix(mix(aa, ba, u), mix(ab, bb, u), v);
  }
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x && x < last && y && y < last && z && z < last) continue;
    density[x + size * (y + size * z)] = boundary([x, y, z]);
  }
}

/** Sample the authoritative implicit field in its worker; no surface vertices are generated. */
export function sampleFieldBrick(world: SdfWorld, brick: Brick): MeshData {
  const start = performance.now(), step = brick.step, cells = BRICK_SIZE / step;
  if (!Number.isFinite(step) || step <= 0 || !Number.isInteger(cells) || cells < 1 || cells > 32) throw new Error('Invalid density brick sampling step');
  const size = cells + 1, density = new Float32Array(size ** 3), p = { ...brick.origin };
  // Reuse the sample coordinate instead of allocating thousands of short-lived objects per job.
  for (let z = 0; z < size; z++) { p.z = brick.origin.z + z * step;
    for (let y = 0; y < size; y++) { p.y = brick.origin.y + y * step;
      for (let x = 0; x < size; x++) { p.x = brick.origin.x + x * step; density[x + size * (y + size * z)] = world.density(p); }
    }
  }
  if (brick.fieldLod) matchBoundaries(density, size, step, brick.fieldLod);
  return { id: brick.id, positions: new Float32Array(), normals: new Float32Array(), colors: new Float32Array(), indices: new Uint32Array(), milliseconds: performance.now() - start,
    field: { id: brick.id, origin: { ...brick.origin }, step, size, density, surface: density.some(value => value <= 0) && density.some(value => value >= 0) } };
}
