import { validateSave, type WorldSave } from './format';
import {partitionWorld,encodeChunk,decodeChunk,type ChunkSave,type ChunkBytes} from './chunks';
interface Manifest {storageVersion:2;save:WorldSave;chunks:string[]}
const cached=new Map<string,string>();
let writes=Promise.resolve();
function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(new URLSearchParams(location.search).get('campaign')==='legacy'?'threejs-survival-phase0':'threejs-survival-meadows',2);
  request.onupgradeneeded=()=>{
   const db=request.result;if(!db.objectStoreNames.contains('worlds'))db.createObjectStore('worlds');
   if(!db.objectStoreNames.contains('chunks'))db.createObjectStore('chunks');
  };
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('別のタブを閉じて保存を再試行してください'));
 });
}
const read=(store:IDBObjectStore,key:string)=>new Promise<unknown>((resolve,reject)=>{
 const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function loadWorld():Promise<WorldSave|null>{
 const db=await database();
 try{
  const raw=await read(db.transaction('worlds').objectStore('worlds'),'single-player');
  if(raw===undefined)return null;
  if((raw as Manifest).storageVersion!==2)return validateSave(raw);
  const manifest=raw as Manifest;
  if(!Array.isArray(manifest.chunks) || manifest.chunks.length>100000)throw new Error('チャンク目録が不正です');
  const store=db.transaction('chunks').objectStore('chunks');
  const bytes=await Promise.all(manifest.chunks.map(key=>read(store,key)));
  const chunks=await Promise.all(bytes.map(async(value,index)=>{
   if(!value)throw new Error('保存チャンクが見つかりません');
   const text=await decodeChunk(value as ChunkBytes);cached.set(manifest.chunks[index],text);return JSON.parse(text) as ChunkSave;
  }));
  return validateSave({...manifest.save,edits:chunks.flatMap(c=>c.edits).sort((a,b)=>a.id-b.id),fluids:chunks.flatMap(c=>c.fluids),bodies:chunks.flatMap(c=>c.bodies)});
 }finally{db.close();}
}
export function saveWorld(save:WorldSave):Promise<void>{
 const snapshot=structuredClone(save);
 const write=async()=>{
  const partitions=partitionWorld(snapshot), changed:[string,string,ChunkBytes][]=[];
  for(const [key,chunk] of partitions){const text=JSON.stringify(chunk);if(cached.get(key)!==text)changed.push([key,text,await encodeChunk(text)]);}
  const db=await database();
  try{
   await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(['worlds','chunks'],'readwrite'),store=transaction.objectStore('chunks');
    for(const [key,,bytes] of changed)store.put(bytes,key);
    for(const key of cached.keys())if(!partitions.has(key))store.delete(key);
    transaction.objectStore('worlds').put({storageVersion:2,save:{...snapshot,edits:[],fluids:[],bodies:[]},chunks:[...partitions.keys()]} satisfies Manifest,'single-player');
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
   });
   for(const [key,text] of changed)cached.set(key,text);for(const key of cached.keys())if(!partitions.has(key))cached.delete(key);
  }finally{db.close();}
 };
 writes=writes.catch(()=>{}).then(write);return writes;
}

