import type {SnapshotDelta} from './snapshot-wire';
import type {CompactFluidDelta} from './compact-fluid';
import type {FluidDelta} from './fluid-wire';
import type {RoomAccessView,RoomAdminCommand} from './room-access';
import type { ClientMessage, PlayerInput, Snapshot } from '../simulation/protocol';
import type { WorldSave } from '../save/format';
import type { EditOperation } from '../world/types';
export const COOP_PROTOCOL = 7;
export const MAX_COOP_PLAYERS = 4;
export type CoopAction = Extract<ClientMessage, { type: 'action' | 'game-action' }>;
export type CoopClientPacket =
 | ({type:'room-admin'} & RoomAdminCommand)
 | {type:'delivery';token:string}
 | { type: 'hello'; protocol: number; resumeKey: string }
 | { type: 'input'; input: PlayerInput; sequence: number }
 | { type: 'action'; commandId: string; message: CoopAction }
 | { type: 'export'; requestId:string } | { type: 'resync' } | { type: 'ping' };
export type CoopServerPacket =
 | {type:'room-access';access:RoomAccessView}
 | {type:'export';requestId:string;save:WorldSave}
 | { type: 'welcome'; protocol: number; epoch: string; playerId: string; save: WorldSave; state: Snapshot }
 | { type: 'frame'; epoch: string; state: Snapshot; water?:FluidDelta; editBase: number; edits: EditOperation[] }
 | { type: 'ack'; kind?:'room-admin'; commandId: string; accepted: boolean; message: string }
 | { type: 'notice'; message: string } | { type: 'pong' };

/** Transport packets are decoded before reaching the simulation/UI. */
export type CoopWireServerPacket=(Exclude<CoopServerPacket,{type:'frame'}>|{type:'delta';epoch:string;tick:number;state:SnapshotDelta;water:CompactFluidDelta;editBase:number;edits:EditOperation[]})&{delivery?:string};
