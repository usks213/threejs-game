import { landscapeHeight, meadowsHeight, terrainHeight } from './density';
import { BRICK_SIZE, WORLD, brickId, type Brick, type FieldLod, type Vec3, type WorldBounds } from './types';

/** Horizontal demand is stable for each 8 m cell; the renderer never owns world data. */
export const DIRECT_FIELD_RANGES = { fine: 24, medium: 48, far: 80, retention: 96, nearVertical: 16 } as const;
const AXES = ['x', 'y', 'z'] as const;
function center(position: Vec3): Vec3 {
  return { x: Math.floor(position.x / BRICK_SIZE) * BRICK_SIZE + 4, y: Math.floor(position.y / BRICK_SIZE) * BRICK_SIZE + 4, z: Math.floor(position.z / BRICK_SIZE) * BRICK_SIZE + 4 };
}
function columnStep(x: number, z: number, focus: Vec3): number {
  const squared = (x + 4 - focus.x) ** 2 + (z + 4 - focus.z) ** 2;
  return squared <= DIRECT_FIELD_RANGES.fine ** 2 ? .5 : squared <= DIRECT_FIELD_RANGES.medium ** 2 ? 1 : 2;
}
/** A face is shared by two grids, an edge by four. Corners always use the exact field. */
function boundaryLod(origin: Vec3, step: number, focus: Vec3): FieldLod | undefined {
  const neighbor = (offset: Vec3) => columnStep(origin.x + offset.x * BRICK_SIZE, origin.z + offset.z * BRICK_SIZE, focus);
  const faces: number[] = [], edges: number[] = [];
  for (const axis of AXES) for (const direction of [-1, 1]) {
    const offset = { x: 0, y: 0, z: 0 }; offset[axis] = direction;
    faces.push(Math.max(step, neighbor(offset)));
  }
  for (const axis of AXES) {
    const other = AXES.filter(value => value !== axis);
    for (const first of [-1, 1]) for (const second of [-1, 1]) {
      const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
      a[other[0]] = first; b[other[1]] = second;
      edges.push(Math.max(step, neighbor(a), neighbor(b), neighbor({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })));
    }
  }
  return faces.some(value => value > step) || edges.some(value => value > step) ? { faces, edges } : undefined;
}

/**
 * Near terrain follows the player's full 3D position (including caves). Distant
 * columns cover the generator's surface band, plus its elevated legacy islands.
 * This is a bounded visual demand set, never a deletion/filter of saved edits.
 */
export function directVisibleBricks(position: Vec3, bounds: WorldBounds = WORLD, generator: 1 | 2 | 3 = 3): Map<string, Brick> {
  const result = new Map<string, Brick>(), focus = center(position);
  const height = generator === 3 ? meadowsHeight : generator === 2 ? landscapeHeight : terrainHeight;
  const radius = DIRECT_FIELD_RANGES.far, distance = Math.ceil(radius / BRICK_SIZE);
  for (let dx = -distance; dx <= distance; dx++) for (let dz = -distance; dz <= distance; dz++) {
    if ((dx * BRICK_SIZE) ** 2 + (dz * BRICK_SIZE) ** 2 > radius ** 2) continue;
    const x = focus.x - 4 + dx * BRICK_SIZE, z = focus.z - 4 + dz * BRICK_SIZE;
    if (x < bounds.minX || x + BRICK_SIZE > bounds.maxX || z < bounds.minZ || z + BRICK_SIZE > bounds.maxZ) continue;
    const step = columnStep(x, z, focus), heights: number[] = [];
    // Include both sides of generator/biome boundaries rather than assuming a flat center height.
    for (const sx of [0, 4, 8]) for (const sz of [0, 4, 8]) heights.push(height(x + sx, z + sz, bounds.seed));
    const low = Math.min(...heights) - BRICK_SIZE, high = Math.max(...heights) + BRICK_SIZE;
    const ys = new Set<number>();
    const addBand = (min: number, max: number) => {
      for (let y = bounds.minY; y + BRICK_SIZE <= bounds.maxY; y += BRICK_SIZE) if (y <= max && y + BRICK_SIZE >= min) ys.add(y);
    };
    addBand(low, high);
    if (step === .5) addBand(focus.y - DIRECT_FIELD_RANGES.nearVertical, focus.y + DIRECT_FIELD_RANGES.nearVertical);
    // Older generators have genuine suspended SDF terrain, not a height-map-only world.
    if (generator !== 3 && x <= 20 && x + BRICK_SIZE >= 6 && z <= -11 && z + BRICK_SIZE >= -23) addBand(12, 18);
    if (generator === 2 && x < -40 && z + BRICK_SIZE > 40) addBand(12, 24);
    const fieldLod = boundaryLod({ x, y: 0, z }, step, focus);
    for (const y of ys) {
      const id = brickId(x / BRICK_SIZE, y / BRICK_SIZE, z / BRICK_SIZE);
      result.set(id, { id, origin: { x, y, z }, step, ...(fieldLod ? { fieldLod } : {}) });
    }
  }
  return result;
}

/** Completed extra residents are still bounded by TerrainScheduler's entry/byte budgets. */
export function withinDirectFieldRetention(brick: Brick, position: Vec3): boolean {
  const focus = center(position);
  return (brick.origin.x + 4 - focus.x) ** 2 + (brick.origin.z + 4 - focus.z) ** 2 <= DIRECT_FIELD_RANGES.retention ** 2;
}
