import { describe, expect, it } from 'vitest';
import { MAX_FLUID_CELLS, type FluidCell } from '../../src/fluid/fluid';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../src/fluid/surface';
import { WaterMeshingController, type WaterMeshingWorker } from '../../src/rendering/water/controller';
import { packWaterCells, unpackWaterCells, WATER_CELL_STRIDE, WaterSurfaceMesher } from '../../src/rendering/water/mesher';
import { waterBuffersTransferables, type WaterMeshRequest, type WaterMeshResponse, type WaterMeshResult } from '../../src/rendering/water/protocol';

const cell = (x = 0): FluidCell => ({ x, y: 2, z: 0, volume: .1, size: .5, bottom: .01 });
function build(cells: FluidCell[], mesher = new WaterSurfaceMesher(), recycle?: WaterMeshResult): WaterMeshResult {
  return mesher.build({ type: 'mesh', epoch: 0, revision: 1, cells: packWaterCells(cells), recycle });
}
function equalSurface(cells: FluidCell[]): WaterMeshResult {
  const positions = new Float32Array(cells.length * 36 * 3), normals = new Float32Array(positions.length), colors = new Float32Array(positions.length);
  const originalCells = structuredClone(cells);
  const count = waterSurface(cells, positions, normals, colors), result = build(cells);
  expect(result.count).toBe(count);
  expect(result.positions).toEqual(positions.slice(0, count * 3));
  expect(result.normals).toEqual(normals.slice(0, count * 3));
  expect(result.colors).toEqual(colors.slice(0, count * 3));
  expect(result.positions.buffer.byteLength).toBe(count * 3 * 4);
  expect(result.normals.buffer.byteLength).toBe(count * 3 * 4);
  expect(result.colors.buffer.byteLength).toBe(count * 3 * 4);
  expect(cells).toEqual(originalCells);
  return result;
}

class FakeWorker implements WaterMeshingWorker {
  onmessage: WaterMeshingWorker['onmessage'] = null;
  onerror: WaterMeshingWorker['onerror'] = null;
  onmessageerror: WaterMeshingWorker['onmessageerror'] = null;
  readonly requests: WaterMeshRequest[] = [];
  readonly transferBytes: number[] = [];
  terminated = false;
  private mesher = new WaterSurfaceMesher();
  postMessage(request: WaterMeshRequest, transfer: Transferable[]): void {
    this.transferBytes.push(transfer.reduce<number>((n, value) => n + (value as ArrayBuffer).byteLength, 0));
    this.requests.push(structuredClone(request, { transfer }));
  }
  terminate(): void { this.terminated = true; }
  finish(index = this.requests.length - 1): WaterMeshResult {
    const result = this.mesher.build(this.requests[index]);
    this.emit(result);
    return result;
  }
  emit(result: WaterMeshResponse): void {
    const transferred = structuredClone(result, { transfer: result.type === 'mesh'
      ? [result.cells.buffer as ArrayBuffer, ...waterBuffersTransferables(result)] : [] });
    this.onmessage?.({ data: transferred } as MessageEvent<WaterMeshResponse>);
  }
}
function controlled() {
  const workers: FakeWorker[] = [];
  const controller = new WaterMeshingController(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  return { controller, workers };
}

describe('water surface worker data', () => {
  it('preserves legacy sizes, fractions, frozen boundaries, stacked columns, gaps and corner smoothing exactly', () => {
    equalSurface([
      { x: 0, y: 0, z: 0, volume: .99999998, vx: 1.2, vz: -.4 },
      { x: 0, y: 1, z: 0, volume: .1234567890123, bottom: .012345678912 },
      { x: 1, y: 0, z: 0, volume: .99999998 },
      { x: 0, y: 3, z: 0, volume: .5 },
      { x: 0, y: 4, z: 0, volume: .1, frozen: true },
      { x: 4, y: -.5, z: 5, size: .5, volume: .08, bottom: .0123456789 },
      { x: 4.5, y: -.5, z: 5, size: .5, volume: .095 },
      { x: 4, y: -.5, z: 5.5, size: .5, volume: .125, frozen: true },
      { x: -5, y: 0, z: -5, volume: .00001 },
    ]);
  });
  it('preserves an entire 8192-cell connected river without transferring full-capacity geometry', () => {
    const cells = Array.from({ length: MAX_FLUID_CELLS }, (_, i) => ({
      x: (i % 128) * .5, y: 2, z: Math.floor(i / 128) * .5, size: .5, volume: .11 + (i % 3) * .003,
    }));
    const result = equalSurface(cells);
    const fullCapacity = WATER_VERTEX_CAPACITY * 3 * 4 * 3;
    expect(result.allocatedBytes).toBe(result.count * 3 * 4 * 3);
    expect(result.allocatedBytes).toBeLessThan(fullCapacity / 2);
  });
  it('handles empty water and reuses exact-size returned output buffers safely', () => {
    equalSurface([]);
    const mesher = new WaterSurfaceMesher(), first = build([cell()], mesher);
    const firstPositions = first.positions;
    const result = build([cell(1)], mesher, first);
    expect(result.positions).toBe(firstPositions);
    expect(result.allocatedBytes).toBe(0);
    expect(result.reusedBytes).toBe(result.count * 3 * 4 * 3);
    const resized = build([cell(1), cell(4)], mesher, result);
    expect(resized.positions.length).toBe(resized.count * 3);
    expect(resized.positions).not.toBe(result.positions);
  });
  it('packs Float64 source values without changing fluid volume or copying unused velocity fields', () => {
    const source = [{ ...cell(), volume: .123456789123456, bottom: .0012345678912345, vx: 8, vz: -3 }];
    const packed = packWaterCells(source);
    expect(packed.byteLength).toBe(WATER_CELL_STRIDE * 8);
    expect(unpackWaterCells(packed)[0].volume).toBe(source[0].volume);
    expect(unpackWaterCells(packed)[0].bottom).toBe(source[0].bottom);
    expect(packWaterCells(source, packed)).toBe(packed);
    expect(() => packWaterCells(Array.from({ length: MAX_FLUID_CELLS + 1 }, () => cell()))).toThrow('budget');
    expect(() => unpackWaterCells(new Float64Array(1))).toThrow('Invalid');
  });
});

describe('bounded asynchronous water pipeline', () => {
  it('submits once per fluid revision and makes no geometry change before explicit render preparation', () => {
    const { controller, workers } = controlled(), worker = workers[0];
    let applied = 0;
    controller.request([cell()], 0);
    controller.request([cell(1)], 0);
    expect(worker.requests).toHaveLength(1);
    expect(controller.prepare(() => { applied++; })).toBe(false);
    const workerResult = worker.finish();
    expect(workerResult.positions.buffer.byteLength).toBe(0); // transferred away from the worker
    expect(controller.stats.ready).toBe(1);
    expect(applied).toBe(0);
    expect(controller.prepare(result => {
      applied++; expect(result.count).toBe(36); expect(result.positions.length).toBe(108);
    })).toBe(true);
    expect(controller.stats.appliedRevision).toBe(0);
    expect(controller.prepare(() => { applied++; })).toBe(false);
    expect(applied).toBe(1);
  });
  it('keeps one active plus the latest reference and displays progress even when the worker is slower than snapshots', () => {
    const { controller, workers } = controlled(), worker = workers[0], applied: number[] = [];
    controller.request([cell()], 1);
    for (let revision = 2; revision <= 100; revision++) controller.request([cell(revision)], revision);
    expect(worker.requests).toHaveLength(1);
    expect(controller.stats).toMatchObject({ inFlight: 1, queued: 1, ready: 0, pending: 2, superseded: 98 });
    worker.finish();
    expect(controller.stats).toMatchObject({ inFlight: 0, queued: 1, ready: 1, pending: 2 });
    for (let revision = 101; revision <= 120; revision++) controller.request([cell(revision)], revision);
    expect(worker.requests).toHaveLength(1); // no hidden/menu-frame CPU churn
    controller.prepare(result => { applied.push(result.revision); });
    expect(applied).toEqual([1]); // active completion remains useful, despite a newer queued snapshot
    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1].revision).toBe(120);
    expect(unpackWaterCells(worker.requests[1].cells)[0].x).toBe(120);
    expect(controller.stats.pending).toBe(1);
    worker.finish(); controller.prepare(result => { applied.push(result.revision); });
    expect(applied).toEqual([1, 120]);
    expect(controller.stats.pending).toBe(0);
  });
  it('returns only used buffers and reuses them after the GPU attribute copy, with real ownership detachment', () => {
    const { controller, workers } = controlled(), worker = workers[0];
    controller.request([cell()], 0); worker.finish();
    let retained!: Float32Array;
    const gpuPositions = new Float32Array(WATER_VERTEX_CAPACITY * 3);
    controller.prepare(result => { gpuPositions.set(result.positions); retained = result.positions; });
    const previousGPU = gpuPositions.slice(0, 108);
    expect(retained.byteLength).toBe(108 * 4);
    controller.request([cell(1)], 1);
    expect(retained.byteLength).toBe(0);
    expect(gpuPositions.slice(0, 108)).toEqual(previousGPU);
    expect(worker.requests[1].recycle?.positions.byteLength).toBe(108 * 4);
    expect(worker.transferBytes[1]).toBe(WATER_CELL_STRIDE * 8 + 108 * 4 * 3);
    worker.finish();
    expect(controller.stats).toMatchObject({ allocatedBytes: 0, reusedBytes: 108 * 4 * 3 });
    controller.prepare(result => { gpuPositions.set(result.positions); });
    expect(gpuPositions.slice(0, 108)).not.toEqual(previousGPU);
  });
  it('ignores old epochs, out-of-order results, duplicates and callbacks after reset or disposal', () => {
    const { controller, workers } = controlled(), original = workers[0];
    controller.request([cell()], 5);
    const oldHandler = original.onmessage!;
    const oldResult = new WaterSurfaceMesher().build(original.requests[0]);
    controller.reset();
    expect(original.terminated).toBe(true);
    const current = workers[1];
    controller.request([cell(2)], 5);
    oldHandler({ data: oldResult } as MessageEvent<WaterMeshResponse>);
    current.onmessage!({ data: oldResult } as MessageEvent<WaterMeshResponse>);
    expect(controller.stats).toMatchObject({ inFlight: 1, ready: 0, ignored: 1 });
    current.emit({ ...build([cell()]), epoch: 1, revision: 4 });
    expect(controller.stats.ignored).toBe(2);
    current.finish();
    controller.prepare(() => undefined);
    current.emit({ ...build([cell()]), epoch: 1, revision: 5 });
    expect(controller.stats).toMatchObject({ pending: 0, applied: 1, ignored: 3 });
    const disposedHandler = current.onmessage!;
    controller.dispose(); controller.dispose(); controller.reset(); controller.request([cell()], 6);
    disposedHandler({ data: { ...build([cell()]), epoch: 1, revision: 6 } } as MessageEvent<WaterMeshResponse>);
    expect(current.terminated).toBe(true);
    expect(controller.stats.pending).toBe(0);
    expect(workers).toHaveLength(2);
  });
  it('cancels an unconsumed result and queued snapshot on init, including tick regression', () => {
    const { controller, workers } = controlled();
    controller.request([cell()], 100); workers[0].finish(); controller.request([cell(1)], 101);
    controller.request([cell(2)], 0);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].requests).toHaveLength(1);
    expect(workers[1].requests[0]).toMatchObject({ epoch: 1, revision: 0 });
    expect(controller.stats).toMatchObject({ pending: 1, ready: 0, queued: 0, appliedRevision: -1 });
    workers[1].finish(); const applied: number[] = []; controller.prepare(result => { applied.push(result.revision); });
    expect(applied).toEqual([0]);
  });
  it('reports creation, dispatch, computation and message decoding failures without falling back to main-thread meshing', () => {
    const failed = new WaterMeshingController(() => { throw new Error('creation blocked'); });
    expect(failed.stats.error).toBe('creation blocked');
    const { controller, workers } = controlled();
    controller.request([cell()], 1);
    workers[0].emit({ type: 'error', epoch: 0, revision: 1, message: 'computation failed' });
    expect(controller.stats).toMatchObject({ error: 'computation failed', pending: 0 });
    expect(workers[0].terminated).toBe(true);
    controller.reset(); workers[1].onmessageerror?.({} as MessageEvent);
    expect(controller.stats.error).toContain('decoded');
    controller.reset(); workers[2].onerror?.({ message: 'worker crashed' } as ErrorEvent);
    expect(controller.stats.error).toBe('worker crashed');
    controller.reset(); workers[3].postMessage = () => { throw new Error('transfer failed'); };
    controller.request([cell()], 2);
    expect(controller.stats).toMatchObject({ error: 'transfer failed', pending: 0 });
  });
});
