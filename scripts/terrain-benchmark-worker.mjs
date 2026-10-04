import { parentPort, workerData, Worker } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';

const { TerrainRuntime } = await tsImport('../src/world/terrain-runtime.ts', import.meta.url);
const { meshTransferables } = await tsImport('../src/world/mesh-preparation.ts', import.meta.url);
if (workerData.mode === 'mesher') {
  const runtime = new TerrainRuntime();
  parentPort.on('message', message => {
    const result = runtime.handle(message);
    if (result) parentPort.postMessage(result, meshTransferables([result.mesh]));
    else if (message.type === 'init') parentPort.postMessage({ type: 'initialized' });
  });
} else {
  const { GameSimulation } = await tsImport('../src/simulation/game-simulation.ts', import.meta.url);
  const { meshBrick } = await tsImport('../src/world/mesher.ts', import.meta.url);
  const sim = new GameSimulation({ version: 1, generator: 3, seed: 7319, player: { x: 0, y: 3, z: 8 }, edits: [], fluids: [], bodies: [] });
  const jobs = Array.from({ length: workerData.bricks }, (_, i) => {
    const x = (i % 10 - 5) * 8, z = (Math.floor(i / 10) % 10 - 5) * 8;
    const y = Math.floor(i / 100) * 8 - (workerData.bricks > 100 ? 16 : 0);
    return { epoch: 1, version: i + 1, editCount: 0, brick: { id: `${x / 8},${y / 8},${z / 8}`, origin: { x, y, z }, step: .5 } };
  });
  let worker;
  const send = message => new Promise((resolve, reject) => {
    const error = error => { worker.off('message', result); reject(error); };
    const result = value => { worker.off('error', error); resolve(value); };
    worker.once('message', result); worker.once('error', error); worker.postMessage(message);
  });
  if (workerData.mode === 'isolated') {
    worker = new Worker(new URL(import.meta.url), { workerData: { mode: 'mesher' } });
    await send({ type: 'init', epoch: 1, bounds: sim.world.bounds, generator: sim.world.generator, edits: [] });
    for (const job of jobs.slice(0, 4)) await send({ type: 'mesh', job });
  } else for (const job of jobs.slice(0, 4)) meshBrick(sim.world, job.brick);
  // Warm the exact simulation separately; neither scenario has cold simulation startup in its timing.
  const idle = { x: 0, z: 0, jump: false };
  for (let i = 0; i < 3; i++) sim.step(idle);
  const tickGaps = [], tickCosts = [], heartbeatDelays = [], tickPeriod = 1000 / 30;
  let previousTick = performance.now(), previousHeartbeat = previousTick, simulatedTicks = 0, triangles = 0;
  const heartbeat = setInterval(() => {
    const now = performance.now(); heartbeatDelays.push(Math.max(0, now - previousHeartbeat - 10)); previousHeartbeat = now;
  }, 10);
  const timer = setInterval(() => {
    const now = performance.now(); tickGaps.push(now - previousTick); previousTick = now;
    sim.step(idle); simulatedTicks++; tickCosts.push(performance.now() - now);
  }, tickPeriod);
  const started = performance.now();
  if (worker) {
    for (const job of jobs) { const result = await send({ type: 'mesh', job }); triangles += result.mesh.indices.length / 3; }
  } else {
    let index = 0;
    await new Promise(resolve => {
      const pump = () => {
        const began = performance.now();
        while (index < jobs.length && performance.now() - began < 8) triangles += meshBrick(sim.world, jobs[index++].brick).indices.length / 3;
        if (index < jobs.length) setTimeout(pump, 0); else resolve();
      };
      setTimeout(pump, 0);
    });
  }
  const workloadMs = performance.now() - started;
  // Capture the timer scheduled during the final non-preemptible mesh, too.
  await new Promise(resolve => setTimeout(resolve, tickPeriod + 1));
  clearInterval(timer); clearInterval(heartbeat); if (worker) await worker.terminate();
  const rounded = value => Math.round(value * 100) / 100;
  const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;
  parentPort.postMessage({ mode: workerData.mode, bricks: jobs.length, sampleStepMeters: .5, triangles, workloadMs: rounded(workloadMs), simulatedTicks,
    maxSimulationTickGapMs: rounded(Math.max(0, ...tickGaps)), p95SimulationTickGapMs: rounded(percentile(tickGaps, .95)),
    p95SimulationStepMs: rounded(percentile(tickCosts, .95)), maxHeartbeatDelayMs: rounded(Math.max(0, ...heartbeatDelays)),
    p95HeartbeatDelayMs: rounded(percentile(heartbeatDelays, .95)),
  });
}
