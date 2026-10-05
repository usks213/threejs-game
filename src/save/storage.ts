import type { WorldSave } from './format';
import { CURRENT, SaveProtectionError, SaveRepository, headToken } from './repository';
import type { SaveStore, StorageBatch, WorldLoadResult } from './repository';
export type { WorldLoadResult } from './repository';
function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const name=new URLSearchParams(location.search).get('campaign')==='legacy'?'voxel-coop-legacy':'voxel-coop-adventure-v1',request=indexedDB.open(name,3);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('worlds'))db.createObjectStore('worlds');if(!db.objectStoreNames.contains('chunks'))db.createObjectStore('chunks');};
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('別のタブを閉じて保存を再試行してください'));
 });
}
const request=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const store:SaveStore={
 async read(name,keys){const db=await database();try{const source=db.transaction(name).objectStore(name),values=await Promise.all(keys.map(key=>request(source.get(key))));return new Map(keys.flatMap((key,i)=>values[i]===undefined?[]:[[key,values[i]]]));}finally{db.close();}},
 async keys(name){const db=await database();try{return (await request(db.transaction(name).objectStore(name).getAllKeys())).map(String);}finally{db.close();}},
 async commit(batch:StorageBatch){const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['worlds','chunks'],'readwrite'),worlds=tx.objectStore('worlds'),chunks=tx.objectStore('chunks'),check=worlds.get(CURRENT);let conflict:Error|undefined;
  check.onsuccess=()=>{if(headToken(check.result)!==batch.expectedHead){conflict=new SaveProtectionError('別のタブで保存が変わりました。再読込してから続けてください');tx.abort();return;}for(const[key,value]of batch.worlds)worlds.put(value,key);for(const[key,value]of batch.chunks)chunks.put(value,key);for(const key of batch.deleteWorlds??[])worlds.delete(key);for(const key of batch.deleteChunks??[])chunks.delete(key);};
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(conflict??tx.error);tx.onabort=()=>reject(conflict??tx.error??new Error('保存処理が中断されました'));
 });}finally{db.close();}},
};
const repository=new SaveRepository(store);
export function loadWorldState():Promise<WorldLoadResult>{return repository.load();}
/** Compatibility reader: corrupted or inaccessible state is never interpreted as an empty world. */
export async function loadWorld():Promise<WorldSave|null>{const result=await loadWorldState();if(result.status==='empty')return null;if(result.status==='loaded')return result.save;throw new SaveProtectionError(result.message);}
export function saveWorld(save:WorldSave):Promise<void>{return repository.save(save);}
export function restorePreviousWorld():Promise<WorldSave>{return repository.restorePrevious();}
export function startNewWorld():Promise<void>{return repository.startNew();}
export function importWorld(save:WorldSave):Promise<WorldSave>{return repository.import(save);}
