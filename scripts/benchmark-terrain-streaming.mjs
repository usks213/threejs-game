/** Node CPU/event-loop comparison, NOT browser/GPU/mobile FPS. Run: node scripts/benchmark-terrain-streaming.mjs [bricks=64] */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';

const bricks = Number(process.argv[2] ?? 64);
if (!Number.isInteger(bricks) || bricks < 8 || bricks > 800) throw new Error('Use 8–800 bricks');
async function measure(mode) {
  const worker = new Worker(new URL('./terrain-benchmark-worker.mjs', import.meta.url), { workerData: { mode, bricks } });
  try {
    return await new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Benchmark worker exited ${code}`)); });
    });
  } finally { await worker.terminate(); }
}
const shared = await measure('shared'), isolated = await measure('isolated');
if (shared.triangles !== isolated.triangles) throw new Error('Benchmark geometry differs between scenarios');
console.log(JSON.stringify({
  environment: { node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  methodology: 'Identical generator-3, 0.5m bricks and real GameSimulation.step at 30 Hz. Empty saved fluids/bodies isolate meshing contention. Four mesh warmups, worker boot and world initialization excluded from timed workload. Shared reproduces old synchronous meshBrick inside an 8ms time-sliced loop. Isolated runs the same extraction plus LOD/grass/local-bounds preparation in one worker, transfers every typed buffer, and dispatches one brick at a time. Node event-loop timing is not device FPS, GPU upload time or full-game performance.',
  shared, isolated,
}, null, 2));
