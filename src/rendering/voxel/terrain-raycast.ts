import * as THREE from 'three';

const AXES = ['x', 'y', 'z'] as const;

export interface TerrainRaycastEntry { mesh: THREE.Mesh; bounds: THREE.Box3; active?: boolean }

/** Finite segment/box broad phase, including rays starting inside or on a brick. */
export function rayBoxEntry(ray: THREE.Ray, box: THREE.Box3, near: number, far: number): number | null {
  let enter = near, exit = far;
  for (const axis of AXES) {
    const origin = ray.origin[axis], direction = ray.direction[axis];
    if (!Number.isFinite(origin) || !Number.isFinite(direction)) return null;
    if (direction === 0) { if (origin < box.min[axis] || origin > box.max[axis]) return null; continue; }
    const a = (box.min[axis] - origin) / direction, b = (box.max[axis] - origin) / direction;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (exit < enter) return null;
  }
  return enter <= exit ? enter : null;
}

export class TerrainRaycasts {
  private readonly hits: THREE.Intersection[] = [];
  readonly stats = { boxes: 0, candidates: 0 };

  nearest(raycaster: THREE.Raycaster, entries: Iterable<TerrainRaycastEntry>, maxDistance = 32): THREE.Intersection | undefined {
    const originalFar = raycaster.far;
    let nearest: THREE.Intersection | undefined;
    this.stats.boxes = 0; this.stats.candidates = 0;
    raycaster.far = Math.min(originalFar, maxDistance);
    try {
      if (!Number.isFinite(raycaster.far) || !Number.isFinite(raycaster.near) || raycaster.far < raycaster.near) return;
      for (const entry of entries) {
        if (entry.active === false) continue;
        this.stats.boxes++;
        if (rayBoxEntry(raycaster.ray, entry.bounds, raycaster.near, raycaster.far) === null) continue;
        this.stats.candidates++; this.hits.length = 0;
        raycaster.intersectObject(entry.mesh, false, this.hits);
        const hit = this.hits[0];
        if (hit && (!nearest || hit.distance < nearest.distance)) { nearest = hit; raycaster.far = hit.distance; }
      }
      return nearest;
    } finally { raycaster.far = originalFar; this.hits.length = 0; }
  }
}
