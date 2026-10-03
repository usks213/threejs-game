import type { AdventureSnapshot, GameAction } from '../game/types';
import type { MeshData, Vec3, EditKind } from '../world/types';
import type { FluidCell } from '../fluid/fluid';
import type { SphereBody } from '../physics/sphere';
import type { WorldSave } from '../save/format';
export interface PlayerState extends Vec3 { heading: number; vy: number; grounded: boolean }
export interface PlayerInput { x: number; z: number; jump: boolean }
export type Tool = EditKind | 'water' | 'rock';
export interface PlayerAppearance { equipment: string; attack: number; guarding: boolean; dodging: boolean; shield: boolean }
export interface Snapshot {
  ack?: number; peers?: { id: string; player: PlayerState; appearance?: PlayerAppearance }[]; tick: number; adventure: AdventureSnapshot; player: PlayerState; edits: number; fluids: FluidCell[]; bodies: SphereBody[];
  metrics: { tickMs: number; fluidMs: number; physicsMs: number; jumpHeight: number; meshMs: number; editMs: number; bricks: number; pending: number; triangles: number };
}
export type ClientMessage = { type: 'replica-input'; input: PlayerInput; sequence: number } | { type: 'peer-join'; peer: string } | { type: 'peer-leave'; peer: string } | { type: 'peer-input'; peer: string; input: PlayerInput; sequence: number } | { type: 'peer-action'; peer: string; message: ClientMessage } | { type: 'replica-init'; save: WorldSave } | { type: 'replica-state'; state: Snapshot; edits: import('../world/types').EditOperation[] } | { type: 'game-action'; action: GameAction; id?: string; target?: Vec3; aim: Vec3 } | { type: 'init'; save: WorldSave | null } | { type: 'input'; input: PlayerInput } | { type: 'action'; tool: Tool; target: Vec3 } | { type: 'reset-player' } | { type: 'save' } | { type: 'pause'; paused: boolean };
export type WorkerMessage = { type: 'peer-welcome'; peer: string; save: WorldSave; state: Snapshot } | { type: 'peer-frame'; peer: string; state: Snapshot; editBase?: number; edits: import('../world/types').EditOperation[] } | { type: 'snapshot'; state: Snapshot } | { type: 'mesh'; mesh: MeshData } | { type: 'mesh-batch'; meshes: MeshData[] } | { type: 'remove'; ids: string[] } | { type: 'ready' } | { type: 'save'; save: WorldSave } | { type: 'notice'; message: string } | { type: 'error'; message: string };

