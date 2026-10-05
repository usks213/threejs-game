import { validateSave } from './format';
import type { WorldSave } from './format';
import { partitionWorld, encodeChunk, decodeChunk } from './chunks';
import type { ChunkSave, ChunkBytes } from './chunks';
import { digest } from './checkpoint';
export const CURRENT='single-player',PREVIOUS='single-player-previous';
export interface StorageBatch { expectedHead:string; worlds:[string,unknown][]; chunks:[string,ChunkBytes][]; deleteWorlds?:string[]; deleteChunks?:string[] }
export interface SaveStore { read(store:'worlds'|'chunks',keys:readonly string[]):Promise<Map<string,unknown>>;keys(store:'worlds'|'chunks'):Promise<string[]>;commit(batch:StorageBatch):Promise<void> }
export interface Manifest3 { storageVersion:3;revision:string;save:WorldSave;chunks:string[] }
interface Manifest2 { storageVersion:2;save:WorldSave;chunks:string[] }
export type WorldLoadResult = {status:'empty'} | {status:'loaded';save:WorldSave} | {status:'recoverable';save:WorldSave;message:string} | {status:'blocked';message:string};
export class SaveProtectionError extends Error {}
export const headToken=(raw:unknown):string=>{if(raw===undefined)return 'empty';const seen=new WeakSet<object>();return JSON.stringify(raw,(_key,value)=>{if(value&&typeof value==='object'){if(seen.has(value))return '[repeated-reference]';seen.add(value);}return value;});};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function references(raw:unknown):string[]{return object(raw)&&Array.isArray(raw.chunks)?raw.chunks.filter((key):key is string=>typeof key==='string'):[];}
/** Storage logic separated from IndexedDB so failed atomic commits can be fault-tested. */
export class SaveRepository {
 private writable=false;
 private head:unknown;
 private previous:unknown;
 private recovery:WorldSave|undefined;
 private writes:Promise<unknown>=Promise.resolve();
 private readonly cache=new Map<string,{text:string;key:string}>();
 constructor(private readonly store:SaveStore){}
 private queue<T>(task:()=>Promise<T>):Promise<T>{const next=this.writes.catch(()=>{}).then(task);this.writes=next;return next;}
 private async decode(raw:unknown):Promise<WorldSave>{
  if(!object(raw)||!('storageVersion'in raw))return validateSave(raw);
  if(raw.storageVersion!==2&&raw.storageVersion!==3)throw new Error('この保存形式にはまだ対応していません');
  const manifest=raw as unknown as Manifest2|Manifest3;
  if(!Array.isArray(manifest.chunks)||manifest.chunks.length>100000||new Set(manifest.chunks).size!==manifest.chunks.length||manifest.chunks.some(key=>typeof key!=='string'||key.length>128))throw new Error('チャンク目録が不正です');
  if(manifest.storageVersion===3&&(typeof manifest.revision!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(manifest.revision)||manifest.chunks.some(key=>!/^chunk:[a-f0-9]{64}$/.test(key))))throw new Error('保存世代が不正です');
  const values=await this.store.read('chunks',manifest.chunks),chunks:ChunkSave[]=[];
  for(const key of manifest.chunks){const value=values.get(key);if(!object(value)||!(value.bytes instanceof ArrayBuffer))throw new Error('保存チャンクが見つかりません');const text=await decodeChunk(value as unknown as ChunkBytes);if(manifest.storageVersion===3&&'chunk:'+await digest(text)!==key)throw new Error('保存チャンクが破損しています');const chunk=JSON.parse(text) as ChunkSave;if(!Array.isArray(chunk.edits)||!Array.isArray(chunk.fluids)||!Array.isArray(chunk.bodies))throw new Error('保存チャンクの内容が不正です');chunks.push(chunk);}
  return validateSave({...manifest.save,edits:chunks.flatMap(c=>c.edits).sort((a,b)=>a.id-b.id),fluids:chunks.flatMap(c=>c.fluids),bodies:chunks.flatMap(c=>c.bodies)});
 }
 load():Promise<WorldLoadResult>{return this.queue(()=>this.loadNow());}
 private async loadNow():Promise<WorldLoadResult>{
  this.writable=false;this.recovery=undefined;
  try{
   const records=await this.store.read('worlds',[CURRENT,PREVIOUS]);this.head=records.get(CURRENT);this.previous=records.get(PREVIOUS);
   if(this.head===undefined&&this.previous===undefined){this.writable=true;return {status:'empty'};}
   try{const save=await this.decode(this.head);this.writable=true;return {status:'loaded',save};}catch(error){
    try{const save=await this.decode(this.previous);this.recovery=save;return {status:'recoverable',save:structuredClone(save),message:'最新の保存を読めません。直前の正常な保存を復旧できます。選ぶまで自動保存は停止しています'};}catch{return {status:'blocked',message:'保存を読めません。元データを保護して自動保存を止めました。ファイル読込または明示的な新規開始を選んでください: '+String(error)};}
   }
  }catch(error){return {status:'blocked',message:'保存領域にアクセスできません。自動保存は停止しています: '+String(error)};}
 }
 private async archive():Promise<[string,unknown][]>{
  if(this.head===undefined&&this.previous===undefined)return [];
  const keys=await this.store.keys('chunks'),chunks=await this.store.read('chunks',keys);
  return [[`protected:${crypto.randomUUID()}`,{format:'voxel-recovery-v1',capturedAt:Date.now(),current:structuredClone(this.head),previous:structuredClone(this.previous),chunks:[...chunks]}]];
 }
 private async replace(save:WorldSave,protect:boolean):Promise<WorldSave>{
  const valid=validateSave(save),partitions=partitionWorld(valid),chunks:[string,ChunkBytes][]=[],keys:string[]=[];
  for(const [position,chunk]of partitions){const text=JSON.stringify(chunk),cached=this.cache.get(position),key=cached?.text===text?cached.key:'chunk:'+await digest(text);keys.push(key);if(cached?.key!==key){chunks.push([key,await encodeChunk(text)]);this.cache.set(position,{text,key});}}
  // Cache never proves a chunk exists after a failed write; reinsert every referenced missing key.
  const existing=await this.store.read('chunks',keys);for(const [position,chunk]of partitions){const item=this.cache.get(position)!;if(!existing.has(item.key)&&!chunks.some(([key])=>key===item.key))chunks.push([item.key,await encodeChunk(JSON.stringify(chunk))]);}
  const manifest:Manifest3={storageVersion:3,revision:crypto.randomUUID(),save:{...valid,edits:[],fluids:[],bodies:[]},chunks:keys};
  const archive=protect?await this.archive():[],previous=this.writable?(this.head??this.previous):this.previous;
  const keep=new Set([...keys,...references(previous)]),allKeys=await this.store.keys('chunks');
  await this.store.commit({expectedHead:headToken(this.head),worlds:[...archive,[CURRENT,manifest],...(previous!==undefined?[[PREVIOUS,previous] as [string,unknown]]:[])],chunks,deleteChunks:allKeys.filter(key=>!keep.has(key))});
  this.head=manifest;this.previous=previous;this.writable=true;this.recovery=undefined;return valid;
 }
 save(save:WorldSave):Promise<void>{const snapshot=structuredClone(save);return this.queue(async()=>{if(!this.writable)throw new SaveProtectionError('元の保存を保護中です。復旧・新規開始・ファイル読込を先に選んでください');await this.replace(snapshot,false);});}
 restorePrevious():Promise<WorldSave>{return this.queue(async()=>{if(!this.recovery)throw new SaveProtectionError('正常な復旧用保存がありません');return this.replace(this.recovery,true);});}
 startNew():Promise<void>{return this.queue(async()=>{const archive=await this.archive(),previous=this.writable?(this.head??this.previous):this.previous;await this.store.commit({expectedHead:headToken(this.head),worlds:[...archive,...(previous!==undefined?[[PREVIOUS,previous] as [string,unknown]]:[])],chunks:[],deleteWorlds:[CURRENT]});this.head=undefined;this.previous=previous;this.writable=true;this.recovery=undefined;});}
 async import(save:WorldSave):Promise<WorldSave>{const valid=validateSave(save);return this.queue(()=>this.replace(valid,true));}
}
