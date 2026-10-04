import {key,type Cell,type Vec3,type Sdf,type SampleState} from './voxel';
import {DeterministicSampleProvider,ProviderQueryField,rasterBounds,type SampleBounds} from './sample-provider';

export interface SparseOverlayState {version:1;manifest:string;size:number;order:string[];suppressed:string[];layers:{id:string;cells:SampleState[];removed:string[]}[]}
const equal=(a:Cell|undefined,b:Cell|undefined)=>a===b||!!a&&!!b&&a.distance===b.distance&&a.material===b.material&&a.object===b.object;
/** Sparse, layer-aware mutable edits over an immutable provider. Cache eviction cannot
 * delete edits. A suppressed authored layer stays suppressed when its ID is re-created. */
export class SparseOverlayField extends ProviderQueryField {
 private baselineOrderUnchanged=true;private orderOverlapBounds:SampleBounds[]=[];
 private editedSamples=new Set<string>();private order:string[];private suppressed=new Set<string>();private overrides=new Map<string,Map<string,Cell|null>>();
 constructor(provider:DeterministicSampleProvider){super(provider);this.order=[...provider.layerOrder];}
 get editSampleCount(){let n=0;for(const layer of this.overrides.values())n+=layer.size;return n;}
 get deletedObjectCount(){return this.suppressed.size;}
 private checkLayerOrder(){
  const authored=new Set(this.provider.layerOrder),current=this.order.filter(id=>authored.has(id)&&!this.suppressed.has(id)),expected=this.provider.layerOrder.filter(id=>this.order.includes(id)&&!this.suppressed.has(id));this.baselineOrderUnchanged=current.length===expected.length&&current.every((id,index)=>id===expected[index]);this.orderOverlapBounds=[];
  if(this.baselineOrderUnchanged)return;const ranks=new Map(current.map((id,index)=>[id,index]));
  for(let i=0;i<expected.length;i++)for(let j=i+1;j<expected.length;j++){if(ranks.get(expected[i])!<ranks.get(expected[j])!)continue;const a=this.provider.layerBounds.get(expected[i]),b=this.provider.layerBounds.get(expected[j]);if(!a||!b)continue;const c={minX:Math.max(a.minX,b.minX),maxX:Math.min(a.maxX,b.maxX),minY:Math.max(a.minY,b.minY),maxY:Math.min(a.maxY,b.maxY),minZ:Math.max(a.minZ,b.minZ),maxZ:Math.min(a.maxZ,b.maxZ)};if(c.minX<=c.maxX&&c.minY<=c.maxY&&c.minZ<=c.maxZ)this.orderOverlapBounds.push(c);}
 }

 private boundsRevision=-1;private editBounds=new Map<string,SampleBounds>();
 /** Sparse edit metadata includes new player geometry outside every authored chunk. */
 editedChunkBounds():ReadonlyMap<string,SampleBounds>{
  if(this.boundsRevision===this.revision)return this.editBounds;this.editBounds=new Map();
  for(const layer of this.overrides.values())for(const id of layer.keys()){const [x,y,z]=id.split(',').map(Number),chunk=`${Math.floor(x/16)},${Math.floor(z/16)}`,b=this.editBounds.get(chunk);if(b){b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);b.minZ=Math.min(b.minZ,z);b.maxZ=Math.max(b.maxZ,z);}else this.editBounds.set(chunk,{minX:x,maxX:x,minY:y,maxY:y,minZ:z,maxZ:z});}
  this.boundsRevision=this.revision;return this.editBounds;
 }
 objectSampleBounds(object:string):SampleBounds|undefined{
  if(!this.order.includes(object))return;const original=this.suppressed.has(object)?undefined:this.provider.layerBounds.get(object);let b=original?{...original}:undefined;
  for(const id of this.overrides.get(object)?.keys()??[]){const [x,y,z]=id.split(',').map(Number);if(b){b.minX=Math.min(b.minX,x);b.maxX=Math.max(b.maxX,x);b.minY=Math.min(b.minY,y);b.maxY=Math.max(b.maxY,y);b.minZ=Math.min(b.minZ,z);b.maxZ=Math.max(b.maxZ,z);}else b={minX:x,maxX:x,minY:y,maxY:y,minZ:z,maxZ:z};}return b;
 }
 /** Composed samples, including the positive SDF band: matches legacy cells filtering. */
 override *objectSamples(object:string):Generator<Cell,void>{const b=this.objectSampleBounds(object);if(!b)return;for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)for(let z=b.minZ;z<=b.maxZ;z++){const cell=this.sampleCell(x,y,z);if(cell?.object===object)yield cell;}}

 private values(x:number,y:number,z:number){const values=this.provider.layersAt(x,y,z),id=key(x,y,z);for(const layer of this.suppressed)values.delete(layer);for(const [layer,edits] of this.overrides){if(!edits.has(id))continue;const value=edits.get(id);if(value)values.set(layer,value);else values.delete(layer);}return values;}
 override sampleCell(x:number,y:number,z:number){
  const edited=this.editedSamples.has(key(x,y,z)),suppressed=[...this.suppressed].some(id=>{const b=this.provider.layerBounds.get(id);return !!b&&x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&z>=b.minZ&&z<=b.maxZ;});
  const reordered=this.orderOverlapBounds.some(b=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY&&z>=b.minZ&&z<=b.maxZ);
  if(!reordered&&!edited&&!suppressed)return this.provider.cell(x,y,z);
  const values=this.values(x,y,z);let best=values.get('');for(const layer of this.order){const value=values.get(layer);if(value&&(!best||value.distance<best.distance))best=value;}
  return best?{...best}:undefined;
 }
 override sample(x:number,y:number,z:number){return this.sampleCell(x,y,z)?.distance??this.size*2;}
 private writeEdit(layer:string,x:number,y:number,z:number,value:Cell|null){let edits=this.overrides.get(layer);if(!edits)this.overrides.set(layer,edits=new Map());edits.set(key(x,y,z),value);this.editedSamples.add(key(x,y,z));for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(`${Math.floor((x+dx)/16)},${Math.floor((z+dz)/16)}`);}
 override shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){
  const bounds=rasterBounds(a,b,this.size),limit=this.size*2;
  if(object&&!subtract&&!this.order.includes(object)){this.order.push(object);this.checkLayerOrder();}
  for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)for(let z=bounds.minZ;z<=bounds.maxZ;z++){
   const values=this.values(x,y,z),d=Math.max(-limit,Math.min(limit,sdf({x:(x+.5)*this.size,y:(y+.5)*this.size,z:(z+.5)*this.size}))),targets=subtract?['',...this.order]:[object??''];
   for(const layer of targets){const old=values.get(layer),before=old?.distance??limit,after=subtract?Math.max(before,-d):Math.min(before,d);if(after===before&&(subtract||!old||d>before||old.material===material))continue;
    const value=after>=limit?null:{x,y,z,distance:after,material:subtract?(old?.material??material):material,object:subtract?old?.object:object};this.writeEdit(layer,x,y,z,value);
   }
  }
  this.revision++;
 }
 private markLayerBounds(object:string){const b=this.provider.layerBounds.get(object);if(b)for(let x=Math.floor(b.minX/16);x<=Math.floor(b.maxX/16);x++)for(let z=Math.floor(b.minZ/16);z<=Math.floor(b.maxZ/16);z++)this.dirty.add(`${x},${z}`);}
 private markEdits(edits:Map<string,Cell|null>|undefined){for(const id of edits?.keys()??[]){const [x,,z]=id.split(',').map(Number);for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(`${Math.floor((x+dx)/16)},${Math.floor((z+dz)/16)}`);}}
 override removeObject(object:string){if(!this.order.includes(object))return;this.markEdits(this.overrides.get(object));this.markLayerBounds(object);this.order=this.order.filter(id=>id!==object);this.overrides.delete(object);if(this.provider.layerOrder.includes(object))this.suppressed.add(object);this.checkLayerOrder();this.revision++;}

 override depleteSample(cell:Cell){const current=this.get(cell.x,cell.y,cell.z);if(!current||current.material!==cell.material||current.object!==cell.object)return false;const layer=cell.object??'',old=this.values(cell.x,cell.y,cell.z).get(layer);if(!old||old.distance>=0)return false;this.writeEdit(layer,cell.x,cell.y,cell.z,{...old,distance:this.size*.5});this.revision++;return true;}
 exportOverlay():SparseOverlayState{return{version:1,manifest:this.provider.manifestId,size:this.size,order:[...this.order],suppressed:[...this.suppressed],layers:[...this.overrides].map(([id,edits])=>({id,cells:[...edits.values()].filter((c):c is Cell=>!!c).map(c=>[c.x,c.y,c.z,c.distance,c.material]),removed:[...edits].filter(([,c])=>!c).map(([id])=>id)}))};}
 /** Prototype validated DTO boundary. It does not accept legacy baseline IDs implicitly. */
 restoreOverlay(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const v=value as SparseOverlayState;
  if(v.version!==1||v.manifest!==this.provider.manifestId||v.size!==this.size||!Array.isArray(v.order)||!Array.isArray(v.suppressed)||!Array.isArray(v.layers)||v.layers.length>1024)return false;
  const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=200;
  if(v.order.some(id=>!validId(id))||new Set(v.order).size!==v.order.length||v.order.length>1024||v.suppressed.some(id=>!validId(id)||!this.provider.layerOrder.includes(id))||new Set(v.suppressed).size!==v.suppressed.length)return false;
  // Authored layers may be omitted only with an explicit tombstone.
  if(this.provider.layerOrder.some(id=>!v.order.includes(id)&&!v.suppressed.includes(id)))return false;
  const overrides=new Map<string,Map<string,Cell|null>>();let count=0;
  for(const layer of v.layers){if(!layer||typeof layer!=='object'||layer.id!==''&&!validId(layer.id)||overrides.has(layer.id)||layer.id!==''&&!v.order.includes(layer.id)||!Array.isArray(layer.cells)||!Array.isArray(layer.removed)||(count+=layer.cells.length+layer.removed.length)>1000000)return false;
   const edits=new Map<string,Cell|null>();
   for(const t of layer.cells){if(!Array.isArray(t)||t.length!==5)return false;const [x,y,z,distance,material]=t;if(![x,y,z].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=8192)||!Number.isFinite(distance)||Math.abs(distance)>this.size*2||!Number.isInteger(material)||material<0||material>10)return false;const id=key(x,y,z);if(edits.has(id))return false;edits.set(id,{x,y,z,distance,material,object:layer.id||undefined});}
   for(const id of layer.removed){if(typeof id!=='string'||!/^[-]?\d+,[-]?\d+,[-]?\d+$/.test(id)||edits.has(id))return false;const xyz=id.split(',').map(Number);if(xyz.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>8192)||key(xyz[0],xyz[1],xyz[2])!==id)return false;edits.set(id,null);}
   overrides.set(layer.id,edits);
  }
  for(const id of this.provider.authoredChunkKeys()){const [x,z]=id.split(',').map(Number);for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(`${x+dx},${z+dz}`);}
  for(const layer of this.overrides.values())this.markEdits(layer);for(const layer of overrides.values())this.markEdits(layer);for(const id of new Set([...this.suppressed,...v.suppressed]))this.markLayerBounds(id);
  this.order=[...v.order];this.suppressed=new Set(v.suppressed);this.overrides=overrides;this.checkLayerOrder();this.editedSamples=new Set([...overrides.values()].flatMap(layer=>[...layer.keys()]));this.revision++;return true;
 }
 /** Compact overrides that now equal baseline; safe to call between transactions. */
 compact(){this.boundsRevision=-1;for(const [layer,edits] of this.overrides){for(const [id,value] of edits){const [x,y,z]=id.split(',').map(Number),baseline=this.suppressed.has(layer)?undefined:this.provider.layersAt(x,y,z).get(layer);if(equal(value??undefined,baseline))edits.delete(id);}if(!edits.size)this.overrides.delete(layer);}this.editedSamples=new Set([...this.overrides.values()].flatMap(layer=>[...layer.keys()]));}
}
