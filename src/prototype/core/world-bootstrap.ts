import {VoxelField,runVoxelWork,type AuthoredVoxelState,type VoxelWorkOptions,type Vec3,type Sdf} from './voxel';
import {createArena,type ObjectState} from './world';
import {extendCampaignArena} from './campaign-world';
import {extendRegionalWorld} from './regional-world';
export const CAMPAIGN_WORLD_VERSION='campaign-v2';
export interface AuthoredWorldPacket {field:AuthoredVoxelState;objects:ObjectState[]}
export interface WorldBootstrapOptions extends VoxelWorkOptions {signal?:AbortSignal;workerFactory?:()=>Worker;onProgress?:(stage:'authoring'|'merging'|'ready'|'fallback')=>void}
/** Worker payload contains only pristine authored samples. No player state leaves this thread. */
export function authorCampaignWorld():AuthoredWorldPacket {const arena=createArena();extendCampaignArena(arena);extendRegionalWorld(arena);arena.field.captureBaseline(CAMPAIGN_WORLD_VERSION);return {field:arena.field.packAuthoredBaseline(),objects:[...arena.objects.values()]};}
/** Recording all primitives is cheap; expensive lattice sampling is replayed with yields. */
class QueuedAuthorField extends VoxelField {
 private readonly operations:(()=>Generator<void,void>)[]=[];
 override shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){this.operations.push(()=>super.shapeSteps(a,b,sdf,material,object,subtract));}
 override removeObject(object:string){this.operations.push(()=>super.removeObjectSteps(object));}
 *replay():Generator<void,void>{for(const operation of this.operations)yield*operation();this.operations.length=0;}
}
export async function authorCampaignWorldFallback(options:VoxelWorkOptions={}):Promise<AuthoredWorldPacket>{const field=new QueuedAuthorField(),arena=createArena(field);extendCampaignArena(arena);extendRegionalWorld(arena);await runVoxelWork(field.replay(),options);await runVoxelWork(field.captureBaselineSteps(CAMPAIGN_WORLD_VERSION),options);const packed=await runVoxelWork(field.packAuthoredBaselineSteps(),options);return {field:packed,objects:[...arena.objects.values()]};}
const cancelled=()=>new Error('World loading cancelled');
/** Caller keeps its playable hub and disables far-region entry/saving until this resolves.
 * Worker failures fall back to cooperatively budgeted authoring; failure never reports ready. */
export async function bootstrapCampaignWorld(arena:ReturnType<typeof createArena>,options:WorldBootstrapOptions={}):Promise<void>{
 const check=()=>{if(options.signal?.aborted)throw cancelled();};check();
 const yieldTask=options.yieldTask??(()=>new Promise<void>(resolve=>setTimeout(resolve,0))),work:VoxelWorkOptions={budgetMs:options.budgetMs,yieldTask:async()=>{check();await yieldTask();check();}};
 options.onProgress?.('authoring');let packet:AuthoredWorldPacket;
 try{packet=await new Promise<AuthoredWorldPacket>((resolve,reject)=>{
  let worker:Worker;try{worker=options.workerFactory?options.workerFactory():new Worker(new URL('./world-bootstrap.worker.ts',import.meta.url),{type:'module'});}catch(error){reject(error);return;}
  let settled=false;let timeout:ReturnType<typeof setTimeout>|undefined;const finish=(error?:unknown,data?:AuthoredWorldPacket)=>{if(settled)return;settled=true;clearTimeout(timeout);worker.terminate();options.signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(data!);};
  const abort=()=>finish(cancelled());options.signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=(event:MessageEvent<AuthoredWorldPacket|{error:string}>)=>{const result=event.data;if(!result||typeof result!=='object'){finish(new Error('Invalid world worker message'));return;}if('error' in result)finish(new Error(result.error));else finish(undefined,result);};worker.onerror=event=>finish(new Error(event.message||'World worker failed'));worker.onmessageerror=()=>finish(new Error('World worker transfer failed'));timeout=setTimeout(()=>finish(new Error('World worker timed out')),30000);try{worker.postMessage({type:'author'});}catch(error){finish(error);}
 });}catch{check();options.onProgress?.('fallback');packet=await authorCampaignWorldFallback(work);}
 check();options.onProgress?.('merging');await arena.field.mergeAuthoredBaseline(packet.field,work);check();
 for(const object of packet.objects)if(!arena.objects.has(object.id))arena.objects.set(object.id,{...object});options.onProgress?.('ready');
}
