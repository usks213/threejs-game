import { describe, expect, it } from 'vitest';
import { meshTransferables } from '../../src/world/mesh-preparation';
import { TerrainRuntime } from '../../src/world/terrain-runtime';
import { TerrainScheduler, TERRAIN_RETENTION_LIMITS, type TerrainJob } from '../../src/world/terrain-scheduler';
import { visibleBricks, withinTerrainRetention } from '../../src/world/streaming';
import { WORLD, type Brick, type EditOperation, type MeshData } from '../../src/world/types';

const brick = (x = 0, y = 0): Brick => ({ id: `${x / 8},${y / 8},0`, origin: { x, y, z: 0 }, step: .5 });
const focus = { x: 15.75, y: 4, z: 8 };
const job = (target = brick(), editCount = 0, epoch = 1): TerrainJob => ({ brick: target, epoch, version: 1, editCount });
const init = (runtime: TerrainRuntime, epoch = 1) => runtime.handle({ type: 'init', epoch, bounds: WORLD, generator: 3, edits: [] });
const mesh = (runtime: TerrainRuntime, target = brick(), editCount = 0): MeshData => {
  const response = runtime.handle({ type: 'mesh', job: job(target, editCount) });
  if (response?.type !== 'mesh') throw new Error('Expected mesh result');
  return response.mesh;
};
const bytes = (mesh: MeshData) => meshTransferables([mesh]).reduce((n, buffer) => n + buffer.byteLength, 0);
function drain(queue: TerrainScheduler, meshBytes = 1024): number {
  let count = 0, next: TerrainJob | null;
  while ((next = queue.next(0))) { queue.complete(next, meshBytes); count++; }
  return count;
}

describe('bounded terrain reuse', () => {
  it('avoids repeated jobs and uploads when crossing a 16 m boundary back and forth', () => {
    const queue = new TerrainScheduler(); queue.reset();
    queue.setVisible(visibleBricks(focus), focus); expect(drain(queue)).toBe(800);
    const counts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const position = { ...focus, x: i % 2 === 0 ? 16.25 : 15.75 };
      expect(queue.setVisible(visibleBricks(position), position, b => withinTerrainRetention(b, position))).toEqual([]);
      counts.push(drain(queue));
    }
    expect(counts).toEqual([160, 0, 0, 0, 0, 0]); expect(queue.size).toBe(960);
    const distant = { ...focus, x: 160 };
    expect(queue.setVisible(visibleBricks(distant), distant, b => withinTerrainRetention(b, distant))).toHaveLength(960);
    expect(queue.size).toBe(800);
  });
  it('bounds retained geometry bytes and entries, even with an unrestricted retention predicate', () => {
    const queue = new TerrainScheduler(); queue.reset();
    const initial = new Map(Array.from({ length: 800 }, (_, i) => { const b = brick(i * 8); return [b.id, b] as const; }));
    queue.setVisible(initial, focus); drain(queue, 0);
    queue.setVisible(new Map(), focus, () => true); expect(queue.size).toBe(TERRAIN_RETENTION_LIMITS.entries);
    queue.setVisible(initial, focus);
    queue.invalidate(queue.ids); drain(queue, 1024 * 1024);
    queue.setVisible(new Map(), focus, () => true); expect(queue.size).toBe(16);
  });
  it('drops unloaded pending or edited work and rejects its late completion, even inside the halo', () => {
    const queue = new TerrainScheduler(); queue.reset(); const target = brick();
    queue.setVisible(new Map([[target.id, target]]), focus); drain(queue);
    queue.setVisible(new Map(), focus, () => true); expect(queue.size).toBe(1);
    queue.invalidate([target.id]); const stale = queue.next(1)!;
    expect(queue.setVisible(new Map(), focus, () => true)).toEqual([target.id]);
    expect(queue.complete(stale)).toBeNull(); expect(queue.size).toBe(0);
  });
  it('keeps private cached arrays alive after both worker transfers and never aliases returned data', () => {
    const runtime = new TerrainRuntime(); init(runtime);
    const original = mesh(runtime), saved = original.positions.slice();
    const firstHop = structuredClone(original, { transfer: meshTransferables([original]) });
    const secondHop = structuredClone(firstHop, { transfer: meshTransferables([firstHop]) });
    secondHop.positions.fill(999);
    const cached = mesh(runtime); expect(cached.positions).toEqual(saved);
    expect(cached.coarse!.indices.length).toBeGreaterThan(0); expect(cached.grass!.length).toBeGreaterThan(0);
    cached.positions.fill(-999); expect(mesh(runtime).positions).toEqual(saved);
    expect(runtime.cacheStats).toMatchObject({ entries: 1, hits: 2, misses: 1 });
  });
  it('invalidates only affected edit IDs, sampling changes, and resets every cache entry on a new epoch', () => {
    const runtime = new TerrainRuntime(); init(runtime); const original = mesh(runtime).positions.slice(); mesh(runtime, brick(32));
    const edit: EditOperation = { id: 1, kind: 'dig', position: { x: 4, y: 2, z: 4 }, radius: 1, material: 'stone', tick: 0 };
    runtime.handle({ type: 'edits', epoch: 1, base: 0, edits: [edit] });
    expect(runtime.cacheStats.entries).toBe(1); mesh(runtime, brick(32), 1);
    expect(mesh(runtime, brick(), 1).positions).not.toEqual(original);
    expect(runtime.cacheStats).toMatchObject({ hits: 1, misses: 3 });
    mesh(runtime, { ...brick(), step: 1 }, 1); expect(runtime.cacheStats.misses).toBe(4);
    init(runtime, 2); expect(runtime.cacheStats).toEqual({ entries: 0, bytes: 0, hits: 0, misses: 0 });
    expect(runtime.handle({ type: 'mesh', job: job() })).toBeNull();
  });
  it('evicts by LRU entry and byte budgets without retaining oversized meshes', () => {
    const reference = new TerrainRuntime(); init(reference); const limit = bytes(mesh(reference));
    const runtime = new TerrainRuntime({ bytes: limit, entries: 2 }); init(runtime);
    mesh(runtime); mesh(runtime, brick(32)); expect(runtime.cacheStats.bytes).toBeLessThanOrEqual(limit);
    mesh(runtime, brick(0, 40)); mesh(runtime, brick(8, 40));
    mesh(runtime, brick(0, 40)); mesh(runtime, brick(16, 40));
    expect(runtime.cacheStats.entries).toBe(2); const previousMisses = runtime.cacheStats.misses;
    mesh(runtime, brick(8, 40)); expect(runtime.cacheStats.misses).toBe(previousMisses + 1);
    const tiny = new TerrainRuntime({ bytes: 1, entries: 2 }); init(tiny); mesh(tiny);
    expect(tiny.cacheStats.entries).toBe(0); expect(tiny.cacheStats.bytes).toBe(0);
  });
});
