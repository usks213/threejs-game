import type { MeshData, Vec3, EditKind } from '../world/types';
import type { FluidCell } from '../fluid/fluid';
import type { SphereBody } from '../physics/sphere';
import type { WorldSave } from '../save/format';
export interface PlayerState extends Vec3 { heading: number; vy: number; grounded: boolean }
export interface PlayerInput { x: number; z: number; jump: boolean }
export type Tool = EditKind | 'water' | 'rock';
export interface Snapshot {
  tick: number; player: PlayerState; edits: number; fluids: FluidCell[]; bodies: SphereBody[];
  metrics: { tickMs: number; fluidMs: number; physicsMs: number; meshMs: number; editMs: number; bricks: number; pending: number; triangles: number };
}
export type ClientMessage = { type: 'init'; save: WorldSave | null } | { type: 'input'; input: PlayerInput } | { type: 'action'; tool: Tool; target: Vec3 } | { type: 'reset-player' } | { type: 'save' } | { type: 'pause'; paused: boolean };
export type WorkerMessage = { type: 'snapshot'; state: Snapshot } | { type: 'mesh'; mesh: MeshData } | { type: 'remove'; ids: string[] } | { type: 'ready' } | { type: 'save'; save: WorldSave } | { type: 'notice'; message: string } | { type: 'error'; message: string };
