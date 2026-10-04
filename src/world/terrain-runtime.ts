import { sampleFieldBrick, sameFieldLod } from './field-data';
import { SdfWorld } from './density';
import { meshTransferables, prepareTerrainMesh } from './mesh-preparation';
import { meshBrick } from './mesher';
import type { TerrainRequest, TerrainResponse } from './terrain-protocol';
import type { Brick, MeshData } from './types';

interface CachedMesh { brick: Brick; mesh: MeshData; bytes: number }
export interface TerrainCacheLimits { bytes: number; entries: number }
const DEFAULT_CACHE: TerrainCacheLimits = { bytes: 32 * 1024 * 1024, entries: 2048 };
function copyMesh(mesh: MeshData): MeshData {
  return { ...mesh, field:mesh.field&&{...mesh.field,origin:{...mesh.field.origin},density:mesh.field.density.slice()},positions: mesh.positions.slice(), normals: mesh.normals.slice(), colors: mesh.colors.slice(), indices: mesh.indices.slice(),
    origin: mesh.origin && { ...mesh.origin }, bounds: mesh.bounds && { center: { ...mesh.bounds.center }, radius: mesh.bounds.radius },
    grass: mesh.grass?.slice(), coarse: mesh.coarse && copyMesh(mesh.coarse) };
}
function sameBrick(a: Brick, b: Brick): boolean {
  return a.step === b.step && a.origin.x === b.origin.x && a.origin.y === b.origin.y && a.origin.z === b.origin.z && sameFieldLod(a.fieldLod, b.fieldLod);
}

/** Stateful, DOM-free meshing endpoint, also exercised by the Node responsiveness benchmark. */
export class TerrainRuntime {
  private world: SdfWorld | null = null;
  private epoch = 0;
  private direct=false;
  private readonly cache = new Map<string, CachedMesh>();
  private cacheBytes = 0;
  private hits = 0;
  private misses = 0;
  constructor(private readonly cacheLimits: TerrainCacheLimits = DEFAULT_CACHE) {}
  get cacheStats(): { entries: number; bytes: number; hits: number; misses: number } {
    return { entries: this.cache.size, bytes: this.cacheBytes, hits: this.hits, misses: this.misses };
  }
  private evict(id: string): void {
    const previous = this.cache.get(id);
    if (previous) { this.cacheBytes -= previous.bytes; this.cache.delete(id); }
  }
  handle(message: TerrainRequest): TerrainResponse | null {
    if (message.type === 'init') {
      this.epoch = message.epoch;this.direct=!!message.direct;
      this.cache.clear(); this.cacheBytes = 0; this.hits = 0; this.misses = 0;
      this.world = new SdfWorld(message.bounds, message.generator);
      for (const edit of message.edits) this.world.apply(edit);
      return null;
    }
    const epoch = message.type === 'mesh' ? message.job.epoch : message.epoch;
    if (!this.world || epoch !== this.epoch) return null;
    if (message.type === 'edits') {
      if (message.base !== this.world.edits.length) throw new Error('Terrain edit stream is out of sequence');
      for (const edit of message.edits) for (const id of this.world.apply(edit)) this.evict(id);
      return null;
    }
    if (message.job.editCount !== this.world.edits.length) throw new Error('Terrain job has an outdated world revision');
    const started = performance.now();
    const brick = message.job.brick, cached = this.cache.get(brick.id);
    let mesh: MeshData;
    if (cached && sameBrick(cached.brick, brick)) {
      this.hits++;
      this.cache.delete(brick.id); this.cache.set(brick.id, cached);
      // Both worker hops transfer/detach buffers. Only private copies leave this worker.
      mesh = copyMesh(cached.mesh);
    } else {
      this.misses++;
      this.evict(brick.id);
      mesh = this.direct?sampleFieldBrick(this.world,brick):prepareTerrainMesh(meshBrick(this.world, brick), brick);
      const bytes = meshTransferables([mesh]).reduce((sum, buffer) => sum + buffer.byteLength, 0);
      if (this.cacheLimits.entries > 0 && bytes <= this.cacheLimits.bytes) {
        while (this.cache.size && (this.cache.size >= this.cacheLimits.entries || this.cacheBytes + bytes > this.cacheLimits.bytes)) this.evict(this.cache.keys().next().value!);
        this.cache.set(brick.id, { brick: { ...brick, origin: { ...brick.origin }, fieldLod: brick.fieldLod && { faces: [...brick.fieldLod.faces], edges: [...brick.fieldLod.edges] } }, mesh: copyMesh(mesh), bytes });
        this.cacheBytes += bytes;
      }
    }
    mesh.milliseconds = performance.now() - started;
    return { type: 'mesh', job: message.job, mesh };
  }
}
