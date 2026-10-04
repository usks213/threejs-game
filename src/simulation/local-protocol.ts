import type {ClientMessage,WorkerMessage,PlayerInput} from './protocol';
/** Local worker transport only. Saves and multiplayer wire messages are unchanged. */
export type SimulationClientMessage=(ClientMessage&{direct?:boolean})|{type:'mesh-ack';epoch:number;count:number};
export type SimulationWorkerMessage={type:'health';health:WorkerHealth}|(WorkerMessage&{epoch?:number})|{type:'terrain-reset';epoch:number}|{type:'terrain-visibility';epoch:number;ids:string[]};

export interface WorkerHealth {epoch:number;tick:number;paused:boolean;nearReady:boolean;input:PlayerInput;inputSequence:number;lastAction:string;pending:number;error:string|null}
