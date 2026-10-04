import type {ClientMessage,WorkerMessage} from './protocol';
/** Local worker transport only. Saves and multiplayer wire messages are unchanged. */
export type SimulationClientMessage=ClientMessage|{type:'mesh-ack';epoch:number;count:number};
export type SimulationWorkerMessage=(WorkerMessage&{epoch?:number})|{type:'terrain-reset';epoch:number};
