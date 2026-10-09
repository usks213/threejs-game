import {VoxelField,key,type Vec3,type Sdf,type Cell,type VoxelState} from './voxel';

export interface SampleBounds {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number}
export interface RecordedShape {type:'shape';bounds:SampleBounds;sdf:Sdf;material:number;object?:string;subtract:boolean}
export interface RecordedRemoval {type:'remove';object:string}
export type SampleOperation=RecordedShape|RecordedRemoval;
const inBounds=(b:SampleBounds,x:number,y:number,z:number)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&z>=b.minZ&&z<=b.maxZ;
export const rasterBounds=(a:Vec3,b:Vec3,size:number):SampleBounds=>({minX:Math.floor((a.x-size*2)/size),maxX:Math.ceil((b.x+size*2)/size),minY:Math.floor((a.y-size*2)/size),maxY:Math.ceil((b.y+size*2)/size),minZ:Math.floor((a.z-size*2)/size),maxZ:Math.ceil((b.z+size*2)/size)});
/** Authoring-only recorder. Existing createArena/extension functions can be used unchanged.
 * This deliberately does not implement an editable/renderable VoxelField. */
export class SampleManifestRecorder extends VoxelField {
 readonly operations:SampleOperation[]=[];
 override shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){this.operations.push({type:'shape',bounds:rasterBounds(a,b,this.size),sdf,material,object,subtract});}
 override removeObject(object:string){this.operations.push({type:'remove',object});}
 createProvider(manifestId:string,maxCacheBlocks=64){return new DeterministicSampleProvider(this.size,this.operations,manifestId,maxCacheBlocks);}
}
interface CacheBlock {distance:Float64Array;material:Uint8Array;owner:Uint16Array;state:Uint8Array}
export interface ProviderCacheStats {blocks:number;numericBytes:number;capacityBytes:number;hits:number;misses:number;evictions:number;evaluations:number}
/** Immutable authored baseline. Numeric LRU caches are disposable, not world state.
 * No content fingerprint is inferred from a human-readable manifestId: the save migrator
 * must separately validate a supported legacy baseline against a certified manifest. */
export class DeterministicSampleProvider {
 readonly layerOrder:string[]=[];readonly layerBounds=new Map<string,SampleBounds>();
 private readonly operations:readonly SampleOperation[];private readonly chunks=new Map<string,number[]>();private readonly removals:number[]=[];
 private readonly cache=new Map<string,CacheBlock>();private readonly owners:string[]=[''];private readonly ownerIds=new Map<string,number>([['',0]]);
 private readonly layerRanks=new Map<string,number>();private lastBlock:CacheBlock|undefined;private lastBlockCoords=[NaN,NaN,NaN];
 private hits=0;private misses=0;private evictions=0;private evaluations=0;
 readonly blockWidth=16;readonly blockSamples=4096;readonly bytesPerBlock=4096*12;readonly maxCacheBlocks:number;
 constructor(readonly size:number,operations:readonly SampleOperation[],readonly manifestId:string,maxCacheBlocks=64){
  if(!Number.isFinite(size)||size<=0||!manifestId)throw new Error('Invalid sample manifest');
  this.maxCacheBlocks=Math.max(1,Math.min(2048,Math.floor(maxCacheBlocks)||1));
  this.operations=operations.map(op=>op.type==='remove'?{...op}:{...op,bounds:{...op.bounds}});
  const layers=new Set<string>();
  for(const [index,operation] of this.operations.entries()){
   if(operation.type==='remove'){this.removals.push(index);layers.delete(operation.object);continue;}
   const b=operation.bounds;
   if(operation.object&&!operation.subtract){layers.add(operation.object);if(!this.ownerIds.has(operation.object)){this.ownerIds.set(operation.object,this.owners.length);this.owners.push(operation.object);if(this.owners.length>65535)throw new Error('Too many authored objects');}
    const old=this.layerBounds.get(operation.object);this.layerBounds.set(operation.object,old?{minX:Math.min(old.minX,b.minX),maxX:Math.max(old.maxX,b.maxX),minY:Math.min(old.minY,b.minY),maxY:Math.max(old.maxY,b.maxY),minZ:Math.min(old.minZ,b.minZ),maxZ:Math.max(old.maxZ,b.maxZ)}:{...b});
   }
   for(let x=Math.floor(b.minX/16);x<=Math.floor(b.maxX/16);x++)for(let z=Math.floor(b.minZ/16);z<=Math.floor(b.maxZ/16);z++){const id=`${x},${z}`;let list=this.chunks.get(id);if(!list)this.chunks.set(id,list=[]);list.push(index);}
  }
  this.layerOrder.push(...layers);this.layerOrder.forEach((id,index)=>this.layerRanks.set(id,index));
  // Removal events are global layer operations, even when that layer's geometry is remote.
  for(const list of this.chunks.values()){list.push(...this.removals);list.sort((a,b)=>a-b);}
 }
 get operationCount(){return this.operations.length;}
 /** Metadata only; no numeric samples are evaluated or retained by these lookups. */
 authoredChunkKeys():IterableIterator<string>{return this.chunks.keys();}
 sampleBoundsForChunk(cx:number,cz:number):SampleBounds|undefined {
  const list=this.chunks.get(`${cx},${cz}`);if(!list)return;let bounds:SampleBounds|undefined;
  for(const index of list){const op=this.operations[index];if(op.type!=='shape'||op.subtract)continue;const b=op.bounds,minX=Math.max(cx*16,b.minX),maxX=Math.min(cx*16+15,b.maxX),minZ=Math.max(cz*16,b.minZ),maxZ=Math.min(cz*16+15,b.maxZ);if(minX>maxX||minZ>maxZ)continue;
   if(!bounds)bounds={minX,maxX,minY:b.minY,maxY:b.maxY,minZ,maxZ};else{bounds.minX=Math.min(bounds.minX,minX);bounds.maxX=Math.max(bounds.maxX,maxX);bounds.minY=Math.min(bounds.minY,b.minY);bounds.maxY=Math.max(bounds.maxY,b.maxY);bounds.minZ=Math.min(bounds.minZ,minZ);bounds.maxZ=Math.max(bounds.maxZ,maxZ);}
  }
  return bounds;
 }

 get stats():ProviderCacheStats{return{blocks:this.cache.size,numericBytes:this.cache.size*this.bytesPerBlock,capacityBytes:this.maxCacheBlocks*this.bytesPerBlock,hits:this.hits,misses:this.misses,evictions:this.evictions,evaluations:this.evaluations};}
 clearCache(){this.cache.clear();this.lastBlock=undefined;this.lastBlockCoords=[NaN,NaN,NaN];}
 /** Exact per-layer replay, including positive narrow-band samples and material ties.
  * The returned cells are detached; callers may retain/edit them without mutating baseline. */
 layersAt(x:number,y:number,z:number):Map<string,Cell>{
  this.evaluations++;const values=new Map<string,Cell>(),limit=this.size*2,position={x:(x+.5)*this.size,y:(y+.5)*this.size,z:(z+.5)*this.size};
  const candidates=this.chunks.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)??this.removals;
  for(const index of candidates){const op=this.operations[index];if(op.type==='remove'){values.delete(op.object);continue;}if(!inBounds(op.bounds,x,y,z))continue;
   const d=Math.max(-limit,Math.min(limit,op.sdf(position))),targets=op.subtract?[...values.keys()]:[op.object??''];
   for(const layer of targets){const old=values.get(layer),before=old?.distance??limit,after=op.subtract?Math.max(before,-d):Math.min(before,d);
    if(after===before&&(op.subtract||!old||d>before||old.material===op.material))continue;
    if(after>=limit)values.delete(layer);else values.set(layer,{x,y,z,distance:after,material:op.subtract?old!.material:op.material,object:op.subtract?old!.object:op.object});
   }
  }
  return values;
 }
 /** Baseline composition uses final GLOBAL layer order, not the order a local sample
  * happened to encounter layers; this is important for exact overlapping-object ties. */
 private evaluate(x:number,y:number,z:number){const values=this.layersAt(x,y,z);let best:Cell|undefined,rank=Infinity;for(const [id,value] of values){const candidateRank=id===''?-1:this.layerRanks.get(id);if(candidateRank===undefined)continue;if(!best||value.distance<best.distance||value.distance===best.distance&&candidateRank<rank){best=value;rank=candidateRank;}}return best;}

 private cached(x:number,y:number,z:number){
  const bx=Math.floor(x/16),by=Math.floor(y/16),bz=Math.floor(z/16),i=(x-bx*16)*256+(y-by*16)*16+(z-bz*16);let block:CacheBlock;
  if(this.lastBlock&&bx===this.lastBlockCoords[0]&&by===this.lastBlockCoords[1]&&bz===this.lastBlockCoords[2])block=this.lastBlock;
  else{const id=`${bx},${by},${bz}`,found=this.cache.get(id);if(found){block=found;this.cache.delete(id);this.cache.set(id,block);}else{if(this.cache.size>=this.maxCacheBlocks){this.cache.delete(this.cache.keys().next().value!);this.evictions++;}block={distance:new Float64Array(4096),material:new Uint8Array(4096),owner:new Uint16Array(4096),state:new Uint8Array(4096)};this.cache.set(id,block);}this.lastBlock=block;this.lastBlockCoords=[bx,by,bz];}
  if(!block.state[i]){this.misses++;const value=this.evaluate(x,y,z);block.state[i]=value?2:1;block.distance[i]=value?.distance??this.size*2;if(value){block.material[i]=value.material;block.owner[i]=this.ownerIds.get(value.object??'')!;}}
  else this.hits++;
  return {block,i};
 }
 sample(x:number,y:number,z:number){const {block,i}=this.cached(x,y,z);return block.distance[i];}
 cell(x:number,y:number,z:number):Cell|undefined{const {block,i}=this.cached(x,y,z);if(block.state[i]!==2)return;return{x,y,z,distance:block.distance[i],material:block.material[i],object:this.owners[block.owner[i]]||undefined};}
 /** Explicit bounded enumeration for a future resident mesher; never materializes
  * the whole world. Bounds use integer lattice coordinates, including caller-owned halo. */
 *samples(bounds:SampleBounds,occupiedOnly=false):Generator<Cell,void>{for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)for(let z=bounds.minZ;z<=bounds.maxZ;z++){const cell=this.cell(x,y,z);if(cell&&(!occupiedOnly||cell.distance<0))yield cell;}}
 /** Append-only extensions must not mutate this instance or silently reuse its identity. */
 append(operations:readonly SampleOperation[],manifestId:string){if(!manifestId||manifestId===this.manifestId)throw new Error('Extension needs a distinct manifest identity');return new DeterministicSampleProvider(this.size,[...this.operations,...operations],manifestId,this.maxCacheBlocks);}
}
/** Query-only adapter reuses the original interpolation, normal, ray and capsule routines.
 * cells is intentionally NOT a whole-world enumeration. Production integration must adopt
 * an explicit resident iterator rather than treating this prototype as a drop-in renderer. */
export class ProviderQueryField extends VoxelField {
 constructor(readonly provider:DeterministicSampleProvider){super(provider.size);}
 override exportState():VoxelState{throw new Error('Provider prototype requires explicit save migration; legacy export is disabled');}
 override restoreState(_value:unknown,_validateOnly=false):boolean{return false;}
 sampleCell(x:number,y:number,z:number){return this.provider.cell(x,y,z);}
 override sample(x:number,y:number,z:number){return this.provider.sample(x,y,z);}
 override get(x:number,y:number,z:number){const c=this.sampleCell(x,y,z);return c&&c.distance<0?c:undefined;}
 override materialAt(p:Vec3){const s=this.size,ix=Math.floor(p.x/s),iy=Math.floor(p.y/s),iz=Math.floor(p.z/s);let best:Cell|undefined,d=Infinity;
  for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++)for(let z=iz-1;z<=iz+1;z++){const c=this.sampleCell(x,y,z);if(!c||c.distance>=0||c.material===0)continue;const dd=((x+.5)*s-p.x)**2+((y+.5)*s-p.y)**2+((z+.5)*s-p.z)**2;if(dd<d){d=dd;best=c;}}
  return best;
 }
}
