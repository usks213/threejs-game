import { BRICK_SIZE, CHUNK_SIZE, WORLD, brickId, type Brick, type Vec3, type WorldBounds } from './types';
export function visibleBricks(position: Vec3, bounds: WorldBounds = WORLD): Map<string, Brick> {
  const result = new Map<string, Brick>();
  const cx = Math.floor(position.x / CHUNK_SIZE), cz = Math.floor(position.z / CHUNK_SIZE);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const step = Math.abs(dx) <= 1 && Math.abs(dz) <= 1 ? 1 : 2;
    for (let bx = 0; bx < 2; bx++) for (let bz = 0; bz < 2; bz++) {
      const x = (cx + dx) * CHUNK_SIZE + bx * BRICK_SIZE, z = (cz + dz) * CHUNK_SIZE + bz * BRICK_SIZE;
      if (x < bounds.minX || x + BRICK_SIZE > bounds.maxX || z < bounds.minZ || z + BRICK_SIZE > bounds.maxZ) continue;
      for (let y = bounds.minY; y < bounds.maxY; y += BRICK_SIZE) {
        if (y < bounds.minY || y + BRICK_SIZE > bounds.maxY) continue;
        const id = brickId(x / BRICK_SIZE, y / BRICK_SIZE, z / BRICK_SIZE);
        result.set(id, { id, origin: { x, y, z }, step });
      }
    }
  }
  return result;
}
