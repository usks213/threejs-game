import {VoxelField,type Cell,type Vec3} from '../core/voxel';
import type {DeterministicSampleProvider,SampleBounds} from '../core/sample-provider';

export interface ProviderResidentField extends VoxelField {
 provider:DeterministicSampleProvider;
 sampleCell(x:number,y:number,z:number):Cell|undefined;
 editedChunkBounds?():ReadonlyMap<string,SampleBounds>;
}
export function isProviderResidentField(field:VoxelField):field is ProviderResidentField {
 const value=field as Partial<ProviderResidentField>;return typeof value.sampleCell==='function'&&typeof value.provider?.authoredChunkKeys==='function'&&typeof value.provider?.sampleBoundsForChunk==='function';
}
export interface ResidencyStats {knownOwnerChunks:number;enumerations:number;sampleQueries:number;solidSamples:number;maxChunkQueries:number;numericCacheBytes:number;numericCacheBudgetBytes:number;cachedBlocks:number;cacheEvictions:number}
const merge=(a:SampleBounds|undefined,b:SampleBounds):SampleBounds=>a?{minX:Math.min(a.minX,b.minX),maxX:Math.max(a.maxX,b.maxX),minY:Math.min(a.minY,b.minY),maxY:Math.max(a.maxY,b.maxY),minZ:Math.min(a.minZ,b.minZ),maxZ:Math.max(a.maxZ,b.maxZ)}:{...b};
/** Only metadata persists here. Surface Cells are yielded for one owner at a time,
 * consumed by the mesher, and not retained in a duplicate global object map. */
export class ProviderResidency {
 private revision=-1;private bounds=new Map<string,SampleBounds>();private owners=new Set<string>();
 private enumerations=0;private sampleQueries=0;private solidSamples=0;private maxChunkQueries=0;
 constructor(readonly field:ProviderResidentField){}
 private refresh(){
  if(this.revision===this.field.revision)return;this.bounds.clear();this.owners.clear();
  for(const id of this.field.provider.authoredChunkKeys()){const [x,z]=id.split(',').map(Number),b=this.field.provider.sampleBoundsForChunk(x,z);if(b)this.bounds.set(id,b);}
  for(const [id,b] of this.field.editedChunkBounds?.()??[])this.bounds.set(id,merge(this.bounds.get(id),b));
  for(const id of this.bounds.keys()){const [x,z]=id.split(',').map(Number);for(const dx of [-1,0])for(const dz of [-1,0])this.owners.add(`${x+dx},${z+dz}`);}
  this.revision=this.field.revision;
 }
 chunkKeys():ReadonlySet<string>{this.refresh();return this.owners;}
 /** A cube owner needs corner samples through max+1 in X/Z. Its Y extent comes
  * solely from authored/edit metadata; no guessed height range or world-wide scan. */
 boundsForOwner(id:string):SampleBounds|undefined{
  this.refresh();const [cx,cz]=id.split(',').map(Number),minX=cx*16,maxX=minX+16,minZ=cz*16,maxZ=minZ+16;let bounds:SampleBounds|undefined;
  for(const dx of [0,1])for(const dz of [0,1]){const b=this.bounds.get(`${cx+dx},${cz+dz}`);if(!b||b.maxX<minX||b.minX>maxX||b.maxZ<minZ||b.minZ>maxZ)continue;bounds=merge(bounds,{minX:Math.max(minX,b.minX),maxX:Math.min(maxX,b.maxX),minY:b.minY,maxY:b.maxY,minZ:Math.max(minZ,b.minZ),maxZ:Math.min(maxZ,b.maxZ)});}
  return bounds;
 }
 nearChunkKeys(center:Vec3,radius:number){const width=16*this.field.size;return [...this.chunkKeys()].filter(id=>{const [x,z]=id.split(',').map(Number);return Math.hypot((x+.5)*width-center.x,(z+.5)*width-center.z)<=radius;});}
 *samples(id:string):Generator<Cell,void>{const b=this.boundsForOwner(id);if(!b)return;this.enumerations++;let queries=0;
  for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)for(let z=b.minZ;z<=b.maxZ;z++){queries++;this.sampleQueries++;const cell=this.field.sampleCell(x,y,z);if(cell&&cell.distance<0){this.solidSamples++;yield cell;}}
  this.maxChunkQueries=Math.max(this.maxChunkQueries,queries);
 }
 get stats():ResidencyStats{this.refresh();const c=this.field.provider.stats;return{knownOwnerChunks:this.owners.size,enumerations:this.enumerations,sampleQueries:this.sampleQueries,solidSamples:this.solidSamples,maxChunkQueries:this.maxChunkQueries,numericCacheBytes:c.numericBytes,numericCacheBudgetBytes:c.capacityBytes,cachedBlocks:c.blocks,cacheEvictions:c.evictions};}
 dispose(){this.bounds.clear();this.owners.clear();this.revision=-1;}
}
/** Proposed survival-signature bridge: same composed-sample semantics in both worlds.
 * Callers retain their existing deterministic sort/hash. No SurvivalSystem edit here. */
export function* samplesForObject(field:VoxelField,id:string):Generator<Cell,void>{
 const provider=field as Partial<ProviderResidentField>;if(typeof provider.objectSamples==='function'){yield*provider.objectSamples(id);return;}
 for(const cell of field.cells.values())if(cell.object===id)yield cell;
}
