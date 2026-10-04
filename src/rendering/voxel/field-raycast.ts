import * as THREE from 'three';
import type { FieldData } from '../../world/field-data';

/** Fixed work bound. Density values are NOT valid sphere-tracing distances. */
export const FIELD_MAX_STEPS = 96;
export const FIELD_REFINEMENT_STEPS = 5;
const AXES = ['x', 'y', 'z'] as const;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Same x-fastest, clamped trilinear reconstruction as the GPU texture. */
export function sampleField(data: FieldData, x: number, y: number, z: number): number {
  const n = data.size, last = n - 1;
  const gx = Math.max(0, Math.min(last, (x - data.origin.x) / data.step));
  const gy = Math.max(0, Math.min(last, (y - data.origin.y) / data.step));
  const gz = Math.max(0, Math.min(last, (z - data.origin.z) / data.step));
  const ix = Math.min(last - 1, Math.floor(gx)), iy = Math.min(last - 1, Math.floor(gy)), iz = Math.min(last - 1, Math.floor(gz));
  const tx = gx - ix, ty = gy - iy, tz = gz - iz, i = ix + n * (iy + n * iz), d = data.density;
  return mix(mix(mix(d[i], d[i + 1], tx), mix(d[i + n], d[i + n + 1], tx), ty),
    mix(mix(d[i + n * n], d[i + n * n + 1], tx), mix(d[i + n * n + n], d[i + n * n + n + 1], tx), ty), tz);
}

/** Finite ray/AABB interval; handles parallel rays and an origin inside a brick. */
export function fieldRayInterval(ray: THREE.Ray, data: FieldData, near: number, far: number): [number, number] | null {
  if (!Number.isFinite(near) || !Number.isFinite(far) || near < 0 || far < near || ray.direction.lengthSq() < 1e-12) return null;
  const extent = (data.size - 1) * data.step;
  let enter = near, exit = far;
  for (const axis of AXES) {
    const origin = ray.origin[axis], direction = ray.direction[axis], min = data.origin[axis], max = min + extent;
    if (!Number.isFinite(origin) || !Number.isFinite(direction)) return null;
    if (Math.abs(direction) < 1e-8) { if (origin < min || origin > max) return null; continue; }
    const a = (min - origin) / direction, b = (max - origin) / direction;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (exit < enter) return null;
  }
  return [enter, exit];
}

export function fieldNormal(data: FieldData, point: THREE.Vector3): THREE.Vector3 {
  const h = data.step * .5, { x, y, z } = point, extent = (data.size - 1) * data.step;
  const width = (value: number, lower: number) => Math.min(value + h, lower + extent) - Math.max(value - h, lower);
  // Positive is air, so the increasing-density gradient points out of solid.
  const normal = new THREE.Vector3(
    (sampleField(data, x + h, y, z) - sampleField(data, x - h, y, z)) / Math.max(1e-8, width(x, data.origin.x)),
    (sampleField(data, x, y + h, z) - sampleField(data, x, y - h, z)) / Math.max(1e-8, width(y, data.origin.y)),
    (sampleField(data, x, y, z + h) - sampleField(data, x, y, z - h)) / Math.max(1e-8, width(z, data.origin.z)));
  return normal.lengthSq() > 1e-12 ? normal.normalize() : normal.set(0, 1, 0);
}

/** Finds a sign crossing, never treating a solid brick boundary as a surface. */
export function intersectFieldRay(ray: THREE.Ray, data: FieldData, interval: readonly [number, number]): number | null {
  const [enter, exit] = interval, sample = (t: number) => sampleField(data,
    ray.origin.x + ray.direction.x * t, ray.origin.y + ray.direction.y * t, ray.origin.z + ray.direction.z * t);
  const count = Math.min(FIELD_MAX_STEPS, Math.max(1, Math.ceil((exit - enter) / (data.step * .5))));
  let previousT = enter, previous = sample(enter);
  if (Math.abs(previous) < 1e-6) return enter;
  for (let i = 1; i <= count; i++) {
    const t = mix(enter, exit, i / count), density = sample(t);
    if (Math.abs(density) < 1e-6) return t;
    if ((previous < 0) !== (density < 0)) {
      let low = previousT, high = t, lowDensity = previous, highDensity = density;
      for (let j = 0; j < FIELD_REFINEMENT_STEPS; j++) {
        const mid = (low + high) * .5, middle = sample(mid);
        if ((middle < 0) === (lowDensity < 0)) { low = mid; lowDensity = middle; }
        else { high = mid; highDensity = middle; }
      }
      const weight = Math.abs(lowDensity) / (Math.abs(lowDensity) + Math.abs(highDensity));
      return mix(low, high, weight);
    }
    previousT = t; previous = density;
  }
  return null;
}
