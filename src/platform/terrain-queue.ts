import type { MeshData } from '../world/types';

type Pending = {kind:'mesh';data:MeshData;bytes:number}|{kind:'remove'};
export interface UploadStats { pending:number;applied:number;uploaded:number;removed:number;bytes:number;milliseconds:number;maxMilliseconds:number }
export function meshBytes(data:MeshData):number {
 return (data.field?.density.byteLength??0)+data.positions.byteLength+data.normals.byteLength+data.colors.byteLength+data.indices.byteLength+(data.grass?.byteLength??0)+(data.coarse?meshBytes(data.coarse):0);
}
/** Main-thread intake is cheap; generation bursts cannot become an unbounded RAF upload. */
export class TerrainQueue {
 private pending=new Map<string,Pending>();
 readonly stats:UploadStats={pending:0,applied:0,uploaded:0,removed:0,bytes:0,milliseconds:0,maxMilliseconds:0};
 enqueue(data:MeshData):number {const replaced=this.pending.get(data.id)?.kind==='mesh'?1:0;this.pending.set(data.id,{kind:'mesh',data,bytes:meshBytes(data)});this.stats.pending=this.pending.size;return replaced;}
 remove(ids:readonly string[],exists:(id:string)=>boolean=()=>true):number {let discarded=0;for(const id of ids){if(this.pending.get(id)?.kind==='mesh')discarded++;this.pending.delete(id);if(exists(id))this.pending.set(id,{kind:'remove'});}this.stats.pending=this.pending.size;return discarded;}
 clear():number {let discarded=0;for(const entry of this.pending.values())if(entry.kind==='mesh')discarded++;this.pending.clear();this.stats.pending=0;return discarded;}
 flush(apply:(data:MeshData)=>void,remove:(id:string)=>void,clock=()=>performance.now(),budget={milliseconds:2,bytes:512*1024,items:2}):number {
  const started=clock();let consumed=0,items=0,bytes=0,removed=0;
  for(const [id,entry]of this.pending){
   const size=entry.kind==='mesh'?entry.bytes:0;
   if(items&&clock()-started>=budget.milliseconds)break;
   if(entry.kind==='mesh'&&(consumed>=budget.items||(consumed>0&&bytes+size>budget.bytes)))continue;
   if(entry.kind==='remove'&&removed>=32)continue;
   this.pending.delete(id);if(entry.kind==='mesh'){apply(entry.data);consumed++;bytes+=size;}else{remove(id);removed++;}items++;
  }
  this.stats.pending=this.pending.size;this.stats.applied=items;this.stats.uploaded=consumed;this.stats.removed=removed;this.stats.bytes=bytes;this.stats.milliseconds=clock()-started;this.stats.maxMilliseconds=Math.max(this.stats.maxMilliseconds,this.stats.milliseconds);
  return consumed;
 }
 fence():ReadonlySet<string>{return new Set(this.pending.keys());}
 hasPending(fence:ReadonlySet<string>):boolean{for(const id of fence)if(this.pending.has(id))return true;return false;}
 get size(){return this.pending.size;}
}
