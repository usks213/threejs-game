import {encodeRoomAccess,decodeRoomAccess,overlayRoomAccess} from './room-access';
import {decodeCheckpoint,encodeCheckpoint,validateCheckpoint,type CheckpointManifest,type SafeCheckpoint} from './checkpoint';
export interface RoomStorage { get<T=unknown>(key:string):Promise<T|undefined>; put(entries:Record<string,unknown>):Promise<void>; delete(keys:string[]):Promise<unknown>; transaction<T>(fn:(tx:RoomStorage)=>Promise<T>):Promise<T> }
const CURRENT='room-current',PREVIOUS='room-previous';
const keys=(manifest:CheckpointManifest)=>Array.from({length:manifest.segments},(_,i)=>`checkpoint:${manifest.generation}:${i}`);
async function putChunks(tx:RoomStorage,entries:Record<string,unknown>):Promise<void>{const pairs=Object.entries(entries);for(let i=0;i<pairs.length;i+=128)await tx.put(Object.fromEntries(pairs.slice(i,i+128)));}
/** Immutable generations and atomic pointers. Invalid originals are never overwritten. */
export async function readRoom(storage:RoomStorage):Promise<{checkpoint:SafeCheckpoint|null;recovered:boolean;revision?:string}>{
 const accessRaw=await storage.get('room-access'),access=accessRaw===undefined?undefined:await decodeRoomAccess(accessRaw);
 const current=await storage.get(CURRENT),previous=await storage.get(PREVIOUS);
 if(accessRaw===undefined&&[current,previous].some(m=>m&&typeof m==='object'&&'accessRevision'in m))throw Error('部屋管理の保存が欠落しています。新規部屋としては開けません');
 if(current!==undefined||previous!==undefined){
  let checkpoint:SafeCheckpoint;
  try{checkpoint=await decodeCheckpoint(current,key=>storage.get(key));}catch{
   try{checkpoint=overlayRoomAccess(await decodeCheckpoint(previous,key=>storage.get(key)),access);}catch{throw Error('Room and backup are unreadable; neither has been reset');}
   await storage.transaction(async tx=>{if(current!==undefined)await tx.put({[`protected:${crypto.randomUUID()}`]:current});await tx.put({[CURRENT]:previous});});return {checkpoint,recovered:true,revision:(previous as CheckpointManifest).generation};
  }
  return {checkpoint:overlayRoomAccess(checkpoint,access),recovered:false,revision:(current as CheckpointManifest).generation};
 }
 const count=await storage.get<number>('segments');if(count===undefined){if(access)throw Error('管理情報のある部屋のワールド保存がありません');return {checkpoint:null,recovered:false};}
 if(!Number.isInteger(count)||count<1||count>1024)throw Error('Invalid legacy room');
 const parts:string[]=[];for(let i=0;i<count;i++){const part=await storage.get(`world:${i}`);if(typeof part!=='string')throw Error('Incomplete legacy room');parts.push(part);}
 const checkpoint=overlayRoomAccess(validateCheckpoint(JSON.parse(parts.join(''))),access);const revision=await writeRoom(storage,checkpoint);return {checkpoint,recovered:false,revision};
}
export async function writeRoom(storage:RoomStorage,checkpoint:SafeCheckpoint):Promise<string>{
 const encoded=await encodeCheckpoint(checkpoint,crypto.randomUUID()),access=checkpoint.access?await encodeRoomAccess(checkpoint.access):undefined;
 await storage.transaction(async tx=>{
  const current=await tx.get<CheckpointManifest>(CURRENT),previous=await tx.get<CheckpointManifest>(PREVIOUS),prior=await tx.get('room-access');if(prior!==undefined&&checkpoint.access){const priorAccess=await decodeRoomAccess(prior);if(priorAccess.revision>checkpoint.access.revision||priorAccess.revision===checkpoint.access.revision&&JSON.stringify(priorAccess)!==JSON.stringify(checkpoint.access))throw Error('古い管理情報では保存を上書きできません');}
  await putChunks(tx,encoded.segments);await tx.put({...(access?{'room-access':access}:{}),[CURRENT]:encoded.manifest,...(current?{[PREVIOUS]:current}:{})});
  // A protected invalid generation is no longer a pointer and is intentionally retained.
  if(previous&&previous.storageVersion===1&&typeof previous.generation==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(previous.generation)&&Number.isInteger(previous.segments)&&previous.segments>0&&previous.segments<=1024&&previous.generation!==current?.generation){const stale=keys(previous);for(let i=0;i<stale.length;i+=128)await tx.delete(stale.slice(i,i+128));}
 });
 return encoded.manifest.generation;
}
