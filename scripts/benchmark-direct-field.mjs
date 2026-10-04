/** CPU sampling comparison only, NOT GPU upload, Android frame time or device FPS.
 * Run: node scripts/benchmark-direct-field.mjs [repeats=3]
 */
import { cpus } from 'node:os';
import { tsImport } from 'tsx/esm/api';
const { SdfWorld } = await tsImport('../src/world/density.ts', import.meta.url);
const { sampleFieldBrick } = await tsImport('../src/world/field-data.ts', import.meta.url);
const { directVisibleBricks, DIRECT_FIELD_RANGES } = await tsImport('../src/world/field-streaming.ts', import.meta.url);
const { WORLD } = await tsImport('../src/world/types.ts', import.meta.url);
const repeats = Number(process.argv[2] ?? 3);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) throw new Error('Use 1–20 repeats');
const focus = { x: 4, y: 4, z: 4 }, planning = performance.now();
const adaptive = [...directVisibleBricks(focus, WORLD, 3).values()];
const planningMs = performance.now() - planning;
const uniform = adaptive.map(({ fieldLod: _transition, ...brick }) => ({ ...brick, step: .5 }));
const round = value => Math.round(value * 100) / 100;
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;
function measure(bricks) {
  const world = new SdfWorld(WORLD, 3);
  // Same JIT/height-cache warmup in each scenario; world construction is excluded.
  for (const brick of uniform.slice(0, 4)) sampleFieldBrick(world, brick);
  const costs = [], start = performance.now(); let samples = 0, bytes = 0, triangles = 0;
  for (const brick of bricks) {
    const result = sampleFieldBrick(world, brick);
    costs.push(result.milliseconds); samples += result.field.density.length;
    bytes += result.field.density.byteLength; triangles += result.indices.length / 3;
  }
  return { samplingMs: performance.now() - start, samples, float32TransferBytes: bytes, surfaceTriangles: triangles,
    p95BrickMs: percentile(costs, .95), maxBrickMs: Math.max(...costs) };
}
const results = { uniform: [], adaptive: [] };
// Alternate ordering to avoid consistently assigning cold-process overhead to one mode.
for (let repetition = 0; repetition < repeats; repetition++) for (const mode of repetition % 2 ? ['adaptive', 'uniform'] : ['uniform', 'adaptive']) results[mode].push(measure(mode === 'adaptive' ? adaptive : uniform));
const summarize = values => ({ ...Object.fromEntries(['samplingMs', 'p95BrickMs', 'maxBrickMs'].map(key => [key, round(percentile(values.map(value => value[key]), .5))])), samples: values[0].samples, float32TransferBytes: values[0].float32TransferBytes, surfaceTriangles: values[0].surfaceTriangles });
const baseline = summarize(results.uniform), lod = summarize(results.adaptive);
console.log(JSON.stringify({
  environment: { node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  methodology: 'Identical generator-3 seed, same 8m brick IDs and full requested 80m extent/vertical demand. Compare all-0.5m sampling against 0.5/1/2m sampling including shared-face/edge transitions. Fresh authoritative worlds, four equal warmup bricks, alternating mode order. Median of independent runs. This is Node CPU sampling, not browser GPU upload, frame pacing or actual device FPS.',
  repeats, bounds: WORLD, focus, rangesMeters: DIRECT_FIELD_RANGES, bricks: adaptive.length,
  bricksByStep: Object.fromEntries([.5, 1, 2].map(step => [step, adaptive.filter(brick => brick.step === step).length])),
  planningMs: round(planningMs), uniform: baseline, adaptive: lod,
  sampleReductionPercent: round(100 * (1 - lod.samples / baseline.samples)),
  transferReductionPercent: round(100 * (1 - lod.float32TransferBytes / baseline.float32TransferBytes)),
  samplingSpeedup: round(baseline.samplingMs / lod.samplingMs),
}, null, 2));
