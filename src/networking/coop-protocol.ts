import type { ClientMessage, PlayerInput, Snapshot } from '../simulation/protocol';
import type { WorldSave } from '../save/format';
import type { EditOperation } from '../world/types';
export const COOP_PROTOCOL = 1;
export const MAX_COOP_PLAYERS = 4;
export type CoopAction = Extract<ClientMessage, { type: 'action' | 'game-action' }>;
export type CoopClientPacket =
 | { type: 'hello'; protocol: number; playerId: string }
 | { type: 'input'; input: PlayerInput; sequence: number }
 | { type: 'action'; commandId: string; message: CoopAction }
 | { type: 'resync' } | { type: 'ping' };
export type CoopServerPacket =
 | { type: 'welcome'; protocol: number; epoch: string; playerId: string; save: WorldSave; state: Snapshot }
 | { type: 'frame'; epoch: string; state: Snapshot; editBase: number; edits: EditOperation[] }
 | { type: 'ack'; commandId: string; accepted: boolean; message: string }
 | { type: 'notice'; message: string } | { type: 'pong' };
