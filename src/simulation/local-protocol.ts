import type {ClientMessage,WorkerMessage,PlayerInput,PlayerState,Snapshot} from './protocol';
/** Local worker transport only. Saves and multiplayer wire messages are unchanged. */
export interface ReplicaUpdate {type:'replica-update';requestId:number;state:Snapshot;edits:import('../world/types').EditOperation[]}
export interface ReplicaApplied {type:'replica-applied';requestId:number;epoch:number;tick:number;player:PlayerState}
export interface ReplicaRejected {type:'replica-rejected';requestId:number;epoch:number;message:string}
export interface ReplicaMotion {type:'replica-motion';requestId:number;epoch:number;tick:number;sequence:number;player:PlayerState}
export type SimulationClientMessage=ReplicaUpdate|(ClientMessage&{direct?:boolean})|{type:'mesh-ack';epoch:number;count:number};
export type SimulationWorkerMessage=ReplicaApplied|ReplicaMotion|ReplicaRejected|{type:'health';health:WorkerHealth}|(WorkerMessage&{epoch?:number})|{type:'terrain-reset';epoch:number}|{type:'terrain-visibility';epoch:number;ids:string[]};

export interface WorkerHealth {epoch:number;tick:number;paused:boolean;nearReady:boolean;input:PlayerInput;inputSequence:number;lastAction:string;pending:number;error:string|null;terrain?:{activeJob:string|null;activeAgeMs:number|null;lastCompletionAgeMs:number|null;credits:number;completed:number;meshMs:number};replica?:{requestId:number;tick:number;frames:number;reconcileMs:number}}
