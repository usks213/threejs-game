import type {SparseWaterField} from './sparse-field';
export interface WaterBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
}
export interface WaterMeshRequest {
  type: 'mesh';
  sdf?: boolean;
  epoch: number;
  revision: number;
  // Seven Float64 values per cell preserve the original JS-number surface calculation.
  cells: Float64Array;
  recycle?: WaterBuffers;
}
export interface WaterMeshResult extends WaterBuffers {
  field?: SparseWaterField;
  type: 'mesh';
  epoch: number;
  revision: number;
  cells: Float64Array;
  count: number;
  milliseconds: number;
  allocatedBytes: number;
  reusedBytes: number;
}
export type WaterMeshResponse = WaterMeshResult | {
  type: 'error'; epoch: number; revision: number; message: string;
};
export function waterBuffersTransferables(buffers: WaterBuffers): ArrayBuffer[] {
  return [buffers.positions.buffer, buffers.normals.buffer, buffers.colors.buffer] as ArrayBuffer[];
}
