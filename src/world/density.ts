import { BRICK_SIZE, MAX_EDITS, WORLD, brickId, insideBounds, type EditOperation, type Vec3, type WorldBounds } from './types';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const hash = (a: number, b: number) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
  const fx = x - ix, fz = z - iz;
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), fx * fx * (3 - 2 * fx)), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx * fx * (3 - 2 * fx)), fz * fz * (3 - 2 * fz));
}
export function terrainHeight(x: number, z: number, seed = WORLD.seed): number {
  return 2 + (noise(x / 35, z / 35, seed) - 0.5) * 6 + (noise(x / 11, z / 11, seed + 1) - 0.5) * 1.2;
}
function cave(p: Vec3): number {
  // Rounded tunnel opens on a hillside; the density remains fully 3D.
  const x = Math.max(-16, Math.min(-4, p.x));
  return Math.hypot(p.x - x, p.y + 0.2, p.z + 9) - 2.7;
}
function island(p: Vec3): number {
  return (Math.hypot((p.x - 13) / 1.7, (p.y - 15) / 0.65, (p.z + 17) / 1.3) - 4) * 0.65;
}
export class SdfWorld {
  readonly edits: EditOperation[] = [];
  private readonly index = new Map<string, EditOperation[]>();
  constructor(readonly bounds: WorldBounds = { ...WORLD }) {}
  density(p: Vec3): number {
    if (!insideBounds(p, this.bounds)) return 100;
    let d = Math.min(Math.max(p.y - terrainHeight(p.x, p.z, this.bounds.seed), -cave(p)), island(p));
    const entries = this.index.get(brickId(Math.floor(p.x / BRICK_SIZE), Math.floor(p.y / BRICK_SIZE), Math.floor(p.z / BRICK_SIZE)));
    if (entries) for (const e of entries) {
      const sphere = Math.hypot(p.x - e.position.x, p.y - e.position.y, p.z - e.position.z) - e.radius;
      d = e.kind === 'dig' ? Math.max(d, -sphere) : Math.min(d, sphere);
    }
    return d;
  }
  affectedBricks(e: EditOperation): string[] {
    const ids: string[] = [];
    // One sample of padding updates shared boundaries and normal gradients.
    const r = e.radius + 1;
    for (let x = Math.floor((e.position.x - r) / BRICK_SIZE); x <= Math.floor((e.position.x + r) / BRICK_SIZE); x++)
      for (let y = Math.floor((e.position.y - r) / BRICK_SIZE); y <= Math.floor((e.position.y + r) / BRICK_SIZE); y++)
        for (let z = Math.floor((e.position.z - r) / BRICK_SIZE); z <= Math.floor((e.position.z + r) / BRICK_SIZE); z++) ids.push(brickId(x, y, z));
    return ids;
  }
  apply(e: EditOperation): string[] {
    if (this.edits.length >= MAX_EDITS || !Number.isSafeInteger(e.id) || e.id !== this.edits.length + 1 || !Number.isSafeInteger(e.tick) || e.tick < 0 || e.tick > 1000000000000 || (e.kind !== 'dig' && e.kind !== 'add') || e.material !== 'stone' || !Number.isFinite(e.radius) || e.radius < 0.75 || e.radius > 2.5 || !insideBounds(e.position, this.bounds, e.radius)) throw new Error('地形編集の範囲または上限が不正です');
    const operation: EditOperation = { ...e, position: { ...e.position } };
    this.edits.push(operation);
    const affected = this.affectedBricks(operation);
    for (const id of affected) { const list = this.index.get(id) ?? []; list.push(operation); this.index.set(id, list); }
    return affected;
  }
  private gradient(p: Vec3, out: Vec3): number {
    const h = 0.02;
    out.x = this.density({ x: p.x + h, y: p.y, z: p.z }) - this.density({ x: p.x - h, y: p.y, z: p.z });
    out.y = this.density({ x: p.x, y: p.y + h, z: p.z }) - this.density({ x: p.x, y: p.y - h, z: p.z });
    out.z = this.density({ x: p.x, y: p.y, z: p.z + h }) - this.density({ x: p.x, y: p.y, z: p.z - h });
    const length = Math.hypot(out.x, out.y, out.z);
    if (length < 0.00001) { out.x = 0; out.y = 1; out.z = 0; return 1; }
    out.x /= length; out.y /= length; out.z /= length;
    return length / (2 * h);
  }
  normal(p: Vec3, out: Vec3): Vec3 {
    this.gradient(p, out);
    return out;
  }
  surfaceDistance(p: Vec3, normal: Vec3): number {
    // The terrain density is an implicit field, not an exact Euclidean SDF.
    // Normalize its slope before using it as a collision distance.
    const density = this.density(p);
    const slope = this.gradient(p, normal);
    // At CSG creases, central differences can average opposing gradients.
    // Never overestimate free space because that averaged gradient is small.
    return density / Math.max(density >= 0 ? 1 : 0.25, slope);
  }
}
