import type { FluidCell } from '../../fluid/fluid';
import { packWaterCells, WATER_CELL_STRIDE } from './mesher';
import { waterBuffersTransferables, type WaterBuffers, type WaterMeshRequest, type WaterMeshResponse, type WaterMeshResult } from './protocol';

export interface WaterMeshingWorker {
  onmessage: ((event: MessageEvent<WaterMeshResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WaterMeshRequest, transfer: Transferable[]): void;
  terminate(): void;
}
interface PendingWater { cells: readonly FluidCell[]; revision: number }
export interface WaterMeshingStats {
  epoch: number; pending: number; inFlight: number; queued: number; ready: number;
  submitted: number; applied: number; superseded: number; ignored: number; appliedRevision: number;
  cells: number; vertices: number; meshMs: number; applyMs: number; packingMs: number;
  inputBytes: number; outputBytes: number; recycledBytes: number; allocatedBytes: number; reusedBytes: number;
  error: string | null;
}

/** One active/result credit plus one latest-only snapshot reference. Nothing grows with worker latency. */
export class WaterMeshingController {
  private worker: WaterMeshingWorker | null = null;
  private active: { epoch: number; revision: number } | null = null;
  private queued: PendingWater | null = null;
  private ready: WaterMeshResult | null = null;
  private recycledCells: Float64Array | undefined;
  private recycledMesh: WaterBuffers | undefined;
  private epoch = 0;
  private revision = -1;
  private disposed = false;
  private readonly measurements = { submitted: 0, applied: 0, superseded: 0, ignored: 0, appliedRevision: -1,
    cells: 0, vertices: 0, meshMs: 0, applyMs: 0, packingMs: 0, inputBytes: 0, outputBytes: 0,
    recycledBytes: 0, allocatedBytes: 0, reusedBytes: 0, error: null as string | null };

  constructor(private readonly createWorker: () => WaterMeshingWorker) { this.start(); }
  get stats(): WaterMeshingStats {
    return { ...this.measurements, epoch: this.epoch, inFlight: Number(!!this.active), queued: Number(!!this.queued),
      ready: Number(!!this.ready), pending: Number(!!this.active) + Number(!!this.ready) + Number(!!this.queued) };
  }
  request(cells: readonly FluidCell[], revision: number): void {
    if (this.disposed || revision === this.revision) return;
    if (revision < this.revision) this.reset();
    if (!this.worker) return;
    this.revision = revision;
    if (this.queued) this.measurements.superseded++;
    this.queued = { cells, revision };
    this.dispatch();
  }
  /** Call once immediately before a rendered frame, not from every simulation/hidden-menu update. */
  prepare(apply: (result: WaterMeshResult) => void): boolean {
    if (this.disposed || !this.ready) return false;
    const result = this.ready;
    this.ready = null;
    const start = performance.now();
    apply(result);
    this.measurements.applyMs = performance.now() - start;
    this.measurements.applied++; this.measurements.appliedRevision = result.revision;
    this.measurements.cells = result.cells.length / WATER_CELL_STRIDE; this.measurements.vertices = result.count;
    // GPU attributes own copies. Returned buffers are safe to transfer back only after apply finishes.
    this.recycledCells = result.cells;
    this.recycledMesh = { positions: result.positions, normals: result.normals, colors: result.colors };
    this.dispatch();
    return true;
  }
  reset(): void {
    if (this.disposed) return;
    this.stopWorker(); this.epoch++; this.revision = -1;
    this.active = null; this.queued = null; this.ready = null;
    this.recycledCells = undefined; this.recycledMesh = undefined;
    this.measurements.appliedRevision = -1; this.measurements.cells = 0; this.measurements.vertices = 0;
    this.measurements.error = null;
    this.start();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.stopWorker(); this.active = null; this.queued = null; this.ready = null;
    this.recycledCells = undefined; this.recycledMesh = undefined;
  }
  private stopWorker(): void {
    if (!this.worker) return;
    this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null;
    this.worker.terminate(); this.worker = null;
  }
  private fail(message: string): void {
    this.measurements.error = message; this.stopWorker(); this.active = null; this.queued = null; this.ready = null;
    this.recycledCells = undefined; this.recycledMesh = undefined;
  }
  private start(): void {
    try {
      const worker = this.createWorker(); this.worker = worker;
      worker.onmessage = event => {
        if (this.disposed || this.worker !== worker) return;
        const result = event.data;
        if (!this.active || result.epoch !== this.active.epoch || result.revision !== this.active.revision) {
          this.measurements.ignored++; return;
        }
        if (result.type === 'error') { this.fail(result.message); return; }
        this.active = null; this.ready = result;
        this.measurements.meshMs = result.milliseconds;
        this.measurements.outputBytes = result.positions.byteLength + result.normals.byteLength + result.colors.byteLength;
        this.measurements.allocatedBytes = result.allocatedBytes; this.measurements.reusedBytes = result.reusedBytes;
        // Keep the single result credit until a rendered frame consumes it, then dispatch the latest input.
      };
      worker.onerror = event => { if (this.worker === worker) this.fail(event.message || 'Water meshing worker failed.'); };
      worker.onmessageerror = () => { if (this.worker === worker) this.fail('Water meshing response could not be decoded.'); };
    } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
  }
  private dispatch(): void {
    if (!this.worker || this.active || this.ready || !this.queued) return;
    const { cells, revision } = this.queued;
    try {
      const packingStart = performance.now();
      const packed = packWaterCells(cells, this.recycledCells), recycle = this.recycledMesh;
      this.measurements.packingMs = performance.now() - packingStart;
      this.recycledCells = undefined; this.recycledMesh = undefined; this.queued = null;
      this.active = { epoch: this.epoch, revision };
      this.measurements.submitted++; this.measurements.inputBytes = packed.byteLength;
      const recycled = recycle ? waterBuffersTransferables(recycle) : [];
      this.measurements.recycledBytes = recycled.reduce((total, buffer) => total + buffer.byteLength, 0);
      this.worker.postMessage({ type: 'mesh', epoch: this.epoch, revision, cells: packed, recycle },
        [packed.buffer as ArrayBuffer, ...recycled]);
    } catch (error) { this.fail(error instanceof Error ? error.message : String(error)); }
  }
}
