import { MAX_FLUID_CELLS, type FluidCell } from '../../fluid/fluid';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../fluid/surface';
import type { WaterBuffers, WaterMeshRequest, WaterMeshResult } from './protocol';

export const WATER_CELL_STRIDE = 7;
/** Packing is done only when a worker credit is available, never for superseded queued snapshots. */
export function packWaterCells(cells: readonly FluidCell[], reusable?: Float64Array): Float64Array {
  if (cells.length > MAX_FLUID_CELLS) throw new Error('Water snapshot exceeds the visible cell budget.');
  const values = reusable?.length === cells.length * WATER_CELL_STRIDE
    ? reusable : new Float64Array(cells.length * WATER_CELL_STRIDE);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i], at = i * WATER_CELL_STRIDE;
    values[at] = cell.x; values[at + 1] = cell.y; values[at + 2] = cell.z;
    values[at + 3] = cell.volume; values[at + 4] = cell.size ?? 1;
    values[at + 5] = cell.bottom ?? 0; values[at + 6] = cell.frozen ? 1 : 0;
  }
  return values;
}
export function unpackWaterCells(values: Float64Array): FluidCell[] {
  if (values.length % WATER_CELL_STRIDE || values.length > MAX_FLUID_CELLS * WATER_CELL_STRIDE) {
    throw new Error('Invalid water meshing input.');
  }
  const cells: FluidCell[] = [];
  for (let i = 0; i < values.length; i += WATER_CELL_STRIDE) {
    cells.push({ x: values[i], y: values[i + 1], z: values[i + 2], volume: values[i + 3],
      size: values[i + 4], bottom: values[i + 5], frozen: Boolean(values[i + 6]) });
  }
  return cells;
}

/** Worker-owned scratch never crosses a thread. Only the used vertex ranges are transferred. */
export class WaterSurfaceMesher {
  private scratch: WaterBuffers = { positions: new Float32Array(0), normals: new Float32Array(0), colors: new Float32Array(0) };
  build(request: WaterMeshRequest): WaterMeshResult {
    const started = performance.now(), cells = unpackWaterCells(request.cells), required = cells.length * 36 * 3;
    if (this.scratch.positions.length < required) {
      const capacity = Math.min(WATER_VERTEX_CAPACITY * 3, Math.max(required, this.scratch.positions.length * 2));
      this.scratch = { positions: new Float32Array(capacity), normals: new Float32Array(capacity), colors: new Float32Array(capacity) };
    }
    const count = waterSurface(cells, this.scratch.positions, this.scratch.normals, this.scratch.colors), length = count * 3;
    let allocatedBytes = 0, reusedBytes = 0;
    const used = (source: Float32Array, recycled?: Float32Array) => {
      const reuse = recycled?.length === length && recycled.byteOffset === 0 && recycled.buffer.byteLength === length * 4;
      const output = reuse ? recycled : new Float32Array(length);
      output.set(source.subarray(0, length));
      if (reuse) reusedBytes += output.byteLength; else allocatedBytes += output.byteLength;
      return output;
    };
    const positions = used(this.scratch.positions, request.recycle?.positions);
    const normals = used(this.scratch.normals, request.recycle?.normals);
    const colors = used(this.scratch.colors, request.recycle?.colors);
    return { type: 'mesh', epoch: request.epoch, revision: request.revision, cells: request.cells,
      count, positions, normals, colors, milliseconds: performance.now() - started, allocatedBytes, reusedBytes };
  }
}
