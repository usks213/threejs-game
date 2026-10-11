import type { TerrainJob } from './terrain-scheduler';
import type { EditOperation, MeshData, WorldBounds } from './types';

export type TerrainRequest =
  | { type: 'init'; direct?:boolean; epoch: number; bounds: WorldBounds; generator: 1 | 2 | 3 | 4; edits: EditOperation[] }
  | { type: 'edits'; epoch: number; base: number; edits: EditOperation[] }
  | { type: 'mesh'; job: TerrainJob };
export type TerrainResponse =
  | { type: 'mesh'; job: TerrainJob; mesh: MeshData }
  | { type: 'error'; epoch: number; message: string };
