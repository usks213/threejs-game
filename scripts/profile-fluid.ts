/** Run with: node --import tsx scripts/profile-fluid.ts
 * Same actual new-game + 60 ticks at spawn + 60 ticks at the river bank on both revisions.
 * No warmup samples are discarded. All update timings and cold/steady splits are reported.
 * CPU-only evidence, not browser GPU time or Android/iPhone FPS.
 */
import { GameSimulation } from '../src/simulation/game-simulation';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../src/fluid/surface';

const stats = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return { samples: values.length, mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2), p95: +sorted[Math.floor(values.length * .95)].toFixed(2), max: +sorted.at(-1)!.toFixed(2) };
};
const start = performance.now(), sim = new GameSimulation(), initializationMs = performance.now() - start;
const initialWaterVolume = [...sim.fluid.cells.values()].reduce((n, c) => n + c.volume, 0);
const results = [];
for (const location of [{ name: 'starting spawn', x: 0, z: 8 }, { name: 'river bank', x: -25, z: -10 }]) {
  Object.assign(sim.player, { x: location.x, z: location.z, y: sim.groundAt(location.x, location.z), vy: 0, grounded: true });
  const steps: number[] = [], fluid: number[] = [], snapshot: number[] = [], surface: number[] = [];
  const positions = new Float32Array(WATER_VERTEX_CAPACITY * 3), normals = new Float32Array(positions.length), colors = new Float32Array(positions.length);
  let cells = 0, vertices = 0;
  for (let i = 0; i < 60; i++) {
    let t = performance.now(); sim.step({ x: 0, z: 0, jump: false }); steps.push(performance.now() - t);
    if (sim.tick % 3 === 0) {
      fluid.push(sim.metrics.fluidMs); t = performance.now();
      const view = sim.fluid.snapshot(sim.player); snapshot.push(performance.now() - t); cells = view.length;
      t = performance.now(); vertices = waterSurface(view, positions, normals, colors); surface.push(performance.now() - t);
    }
  }
  results.push({ location: location.name, ticks: 60, waterCells: cells, waterVertices: vertices,
    simulationStepMs: stats(steps), fluidUpdateMs: stats(fluid), fluidSnapshotMs: stats(snapshot), waterSurfaceMainCPUms: stats(surface),
    firstWaterUpdateMs: +fluid[0].toFixed(2), remainingWaterUpdatesMs: stats(fluid.slice(1)),
    fluidUpdateSamplesMs: fluid.map(n => +n.toFixed(2)), fluidSnapshotSamplesMs: snapshot.map(n => +n.toFixed(2)) });
}
console.log(JSON.stringify({ initializationMs: +initializationMs.toFixed(2), totalWaterCells: sim.fluid.cells.size, initialWaterVolume,
  finalWaterVolume: [...sim.fluid.cells.values()].reduce((n, c) => n + c.volume, 0),
  method: 'Actual new-game river/actors, 60 steps at each position; all cold and steady samples included; cloud CPU, no GPU or real-device FPS', results }, null, 2));
