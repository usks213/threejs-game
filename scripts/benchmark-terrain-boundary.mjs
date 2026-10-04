/** Node meshing/transfer counts, NOT GPU timing or mobile FPS. */
import { cpus } from 'node:os';
import { tsImport } from 'tsx/esm/api';
const { TerrainRuntime } = await tsImport('../src/world/terrain-runtime.ts', import.meta.url);
const { TerrainScheduler } = await tsImport('../src/world/terrain-scheduler.ts', import.meta.url);
const { visibleBricks, withinTerrainRetention } = await tsImport('../src/world/streaming.ts', import.meta.url);
const { meshTransferables } = await tsImport('../src/world/mesh-preparation.ts', import.meta.url);
const { WORLD } = await tsImport('../src/world/types.ts', import.meta.url);
const rounds = 6;
function measure(reuse) {
  const runtime = reuse ? new TerrainRuntime() : new TerrainRuntime({ bytes: 0, entries: 0 });
  const scheduler = new TerrainScheduler(); scheduler.reset();
  runtime.handle({ type: 'init', epoch: scheduler.epoch, bounds: WORLD, generator: 3, edits: [] });
  const residents = new Map();
  function move(x) {
    const focus = { x, y: 4, z: 8 }, visible = visibleBricks(focus);
    const removed = scheduler.setVisible(visible, focus, reuse ? brick => withinTerrainRetention(brick, focus) : undefined);
    for (const id of removed) residents.delete(id);
    let jobs = 0, transferredBytes = 0, next;
    const started = performance.now();
    while ((next = scheduler.next(0))) {
      const result = runtime.handle({ type: 'mesh', job: next });
      const buffers = meshTransferables([result.mesh]);
      const bytes = buffers.reduce((n, buffer) => n + buffer.byteLength, 0);
      const firstHop = structuredClone(result, { transfer: buffers });
      const received = structuredClone(firstHop, { transfer: meshTransferables([firstHop.mesh]) });
      scheduler.complete(received.job, bytes);
      residents.set(received.mesh.id, { bytes, triangles: received.mesh.indices.length / 3 });
      jobs++; transferredBytes += bytes;
    }
    const active = [...visible.keys()].map(id => residents.get(id));
    if (active.some(value => !value)) throw new Error('Missing demanded terrain');
    return { x, jobs, transferredBytes, removed: removed.length, residentBricks: scheduler.size,
      activeTriangles: active.reduce((n, value) => n + value.triangles, 0),
      elapsedMs: Math.round((performance.now() - started) * 100) / 100 };
  }
  const warmup = move(15.75), crossings = Array.from({ length: rounds }, (_, i) => move(i % 2 === 0 ? 16.25 : 15.75));
  const summarize = (entries) => entries.reduce((sum, entry) => ({ jobs: sum.jobs + entry.jobs, transferredBytes: sum.transferredBytes + entry.transferredBytes, elapsedMs: sum.elapsedMs + entry.elapsedMs }), { jobs: 0, transferredBytes: 0, elapsedMs: 0 });
  return { mode: reuse ? 'retention-and-cache' : 'prior-no-retention-or-cache', warmup, crossings, crossingTotals: summarize(crossings), cache: runtime.cacheStats };
}
const before = measure(false), after = measure(true);
for (let i = 0; i < rounds; i++) if (before.crossings[i].activeTriangles !== after.crossings[i].activeTriangles) throw new Error('Terrain changed');
console.log(JSON.stringify({ environment: { node: process.version, cpu: cpus()[0]?.model },
  methodology: 'Generator 3 and original 0.5 m extraction, seed 7319. Warm 800-brick demand at x=15.75, z=8; cross x=16 boundary by 0.5 m six times. Drain real jobs per crossing and transfer every prepared fine/coarse/grass buffer through both simulated worker hops. transferredBytes counts mesh payload per hop; both hops transfer that amount. Geometry counts checked equal for demanded terrain. Compare prior no-cache/no-retention behavior against bounded hidden-resident halo and cache. Timed CPU wall time covers demand drain, meshing/copy/transfers; it excludes visibility calculation, browser, GPU and simulation. This is not device FPS.',
  before, after }, null, 2));
