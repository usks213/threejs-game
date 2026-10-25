import type { Battle, Build, Launch, Match } from '../core/types';
export type Phase = 'idle' | 'queued' | 'ready' | 'countdown' | 'battle' | 'round-end' | 'match-end' | 'opponent-disconnected';
export interface StateMessage { type:'state'; phase:Phase; player:0|1|null; roomId:string|null; match:Match|null; battle:Battle|null; ready:[boolean,boolean]; countdownEndsAt?:number; reason?:string; opponentName?:string }
export type ServerMessage = StateMessage | {type:'hello';token:string;lastSeq:number;serverTime:number} | {type:'error';message:string} | {type:'pong';serverTime:number};
export type ClientMessage = {seq:number} & ({type:'queue';build:Build} | {type:'launch';launch:Launch} | {type:'next'} | {type:'cancel'} | {type:'ping'});
