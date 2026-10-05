import {validateRoomAccess,type RoomAccessState} from '../networking/room-access';
import { validateSave } from './format';
import type { WorldSave } from './format';
export interface SafeCheckpoint { version: 1; access?:RoomAccessState; world: WorldSave; receipts: [string, string[]][] }
export interface CheckpointManifest { storageVersion: 1; accessRevision?:number; generation: string; segments: number; sha256: string }
export type CheckpointSelection = {status:'empty'} | {status:'loaded'|'recovered';checkpoint:SafeCheckpoint;message?:string} | {status:'blocked';message:string};
export async function digest(text:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateCheckpoint(raw:unknown):SafeCheckpoint {
 if(!raw||typeof raw!=='object'||(raw as SafeCheckpoint).version!==1)throw new Error('共有保存の版に対応していません');
 const source=raw as SafeCheckpoint;
 if(!Array.isArray(source.receipts)||source.receipts.length>10000)throw new Error('操作の受領記録が不正です');
 const seen=new Set<string>(),receipts:[string,string[]][]=[];
 for(const item of source.receipts){if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(item[0])||seen.has(item[0])||!Array.isArray(item[1])||item[1].length>256||new Set(item[1]).size!==item[1].length||item[1].some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(id)))throw new Error('操作の受領記録が不正です');seen.add(item[0]);receipts.push([item[0],[...item[1]]]);}
 return {version:1,...(source.access!==undefined?{access:validateRoomAccess(source.access)}:{}),world:validateSave(source.world),receipts};
}
export function selectCheckpoint(current:unknown,previous:unknown):CheckpointSelection {
 if(current===undefined&&previous===undefined)return {status:'empty'};
 try{if(current===undefined)throw Error('最新の共有保存がありません');return {status:'loaded',checkpoint:validateCheckpoint(current)};}catch(currentError){
  try{if(previous===undefined)throw Error();return {status:'recovered',checkpoint:validateCheckpoint(previous),message:'直前の正常な共有保存へ復旧しました。最新の壊れた保存は保護されています'};}catch{return {status:'blocked',message:'共有保存と復旧用保存を読めません。ワールドは初期化していません: '+String(currentError)};}
 }
}
export async function encodeCheckpoint(checkpoint:SafeCheckpoint,generation:string):Promise<{manifest:CheckpointManifest;segments:Record<string,string>}>{
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(generation))throw new Error('保存世代が不正です');
 const text=JSON.stringify(validateCheckpoint(checkpoint)),count=Math.ceil(text.length/32000);if(count>1024)throw new Error('共有保存が大きすぎます');
 const segments:Record<string,string>={};for(let i=0;i<count;i++)segments[`checkpoint:${generation}:${i}`]=text.slice(i*32000,(i+1)*32000);
 return {manifest:{storageVersion:1,...(checkpoint.access?{accessRevision:checkpoint.access.revision}:{}),generation,segments:count,sha256:await digest(text)},segments};
}
export async function decodeCheckpoint(raw:unknown,readSegment:(key:string)=>Promise<unknown>):Promise<SafeCheckpoint>{
 if(!raw||typeof raw!=='object')throw new Error('共有保存の目録が不正です');const m=raw as CheckpointManifest;
 if(m.accessRevision!==undefined&&(!Number.isSafeInteger(m.accessRevision)||m.accessRevision<0))throw new Error('部屋管理の保存世代が不正です');
 if(m.storageVersion!==1||typeof m.generation!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(m.generation)||!Number.isInteger(m.segments)||m.segments<1||m.segments>1024||!/^([a-f0-9]{64})$/.test(m.sha256))throw new Error('共有保存の目録が不正です');
 const pieces=await Promise.all(Array.from({length:m.segments},(_,i)=>readSegment(`checkpoint:${m.generation}:${i}`)));if(pieces.some(p=>typeof p!=='string'||p.length>32000))throw new Error('共有保存の断片が欠けています');
 const text=(pieces as string[]).join('');if(await digest(text)!==m.sha256)throw new Error('共有保存の検証値が一致しません');const checkpoint=validateCheckpoint(JSON.parse(text));if(m.accessRevision!==undefined&&checkpoint.access?.revision!==m.accessRevision)throw new Error('部屋管理の保存世代が一致しません');return checkpoint;
}
