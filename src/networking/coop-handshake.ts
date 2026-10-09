import type {WorldSave} from '../save/format';
import type {Snapshot} from '../simulation/protocol';
declare const __COOP_BUILD_ID__:string;
const validBuild=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value);
export const COOP_BUILD_ID=typeof __COOP_BUILD_ID__!=='undefined'&&validBuild(__COOP_BUILD_ID__)?__COOP_BUILD_ID__:'local';
export interface CoopHelloInfo {buildId?:string;roomId?:string;clientTick?:number}
export interface CoopSessionInfo {buildId:string;roomId:string|null;worldSeed:number;worldVersion:number;generator:number;serverTick:number}
/** Capabilities are deliberately absent from this public diagnostic identity. */
export function helloInfo(raw:Record<string,unknown>):CoopHelloInfo{
 const out:CoopHelloInfo={};
 if(raw.buildId!==undefined){if(!validBuild(raw.buildId))throw Error('ビルド識別子が不正です');out.buildId=raw.buildId;}
 if(raw.roomId!==undefined){if(typeof raw.roomId!=='string'||!/^[a-f0-9]{48}$/.test(raw.roomId))throw Error('部屋の識別子が不正です');out.roomId=raw.roomId;}
 if(raw.clientTick!==undefined){if(!Number.isSafeInteger(raw.clientTick)||Number(raw.clientTick)<0)throw Error('入力時刻が不正です');out.clientTick=Number(raw.clientTick);}
 return out;
}
export function sessionInfo(save:WorldSave,state:Snapshot,roomId:string|null):CoopSessionInfo{return {buildId:COOP_BUILD_ID,roomId,worldSeed:save.seed,worldVersion:save.version,generator:save.generator,serverTick:state.tick};}
export function validateSessionInfo(raw:unknown,roomId:string,save:WorldSave,state:Snapshot):CoopSessionInfo{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('部屋の同期情報が不正です');const s=raw as CoopSessionInfo;
 if(!validBuild(s.buildId)||s.roomId!==null&&s.roomId!==roomId||s.worldSeed!==save.seed||s.worldVersion!==save.version||s.generator!==save.generator||s.serverTick!==state.tick||!Number.isSafeInteger(s.serverTick)||s.serverTick<0)throw Error('部屋・世界・時刻の同期情報が一致しません');
 return {buildId:s.buildId,roomId:s.roomId,worldSeed:s.worldSeed,worldVersion:s.worldVersion,generator:s.generator,serverTick:s.serverTick};
}
