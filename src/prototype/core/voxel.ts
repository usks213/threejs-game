import {record,number,integer,text} from '../../save/validation';
export interface Vec3 { x:number; y:number; z:number }
/** A signed distance sample at the centre of a voxel; negative is solid. */
export interface Cell extends Vec3 { material:number; object?:string; distance:number }
export interface Hit { point:Vec3; normal:Vec3; cell:Cell; distance:number }
export const SOLID_SIZE=.25;
export const WATER_SIZE=.125;
export const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export const chunkKey=(x:number,z:number)=>`${Math.floor(x/16)},${Math.floor(z/16)}`;
export type Sdf=(p:Vec3)=>number;
export const sphere=(c:Vec3,r:number):Sdf=>p=>Math.hypot(p.x-c.x,p.y-c.y,p.z-c.z)-r;
export const ellipsoid=(c:Vec3,r:Vec3):Sdf=>p=>(Math.hypot((p.x-c.x)/r.x,(p.y-c.y)/r.y,(p.z-c.z)/r.z)-1)*Math.min(r.x,r.y,r.z);
export const capsule=(a:Vec3,b:Vec3,r:number):Sdf=>p=>{const x=p.x-a.x,y=p.y-a.y,z=p.z-a.z,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,t=Math.max(0,Math.min(1,(x*dx+y*dy+z*dz)/(dx*dx+dy*dy+dz*dz||1)));return Math.hypot(x-t*dx,y-t*dy,z-t*dz)-r;};
export const roundedBox=(a:Vec3,b:Vec3,r=0):Sdf=>p=>{const x=Math.abs(p.x-(a.x+b.x)/2)-(b.x-a.x)/2+r,y=Math.abs(p.y-(a.y+b.y)/2)-(b.y-a.y)/2+r,z=Math.abs(p.z-(a.z+b.z)/2)-(b.z-a.z)/2+r;return Math.hypot(Math.max(x,0),Math.max(y,0),Math.max(z,0))+Math.min(Math.max(x,y,z),0)-r;};
export type SampleState=[number,number,number,number,number];
export interface VoxelState {suppressed?:string[];version:1;size:number;baseline:string;base:SampleState[];removedBase:string[];layers:{id:string;cells:SampleState[];removed:string[]}[];order:string[]}
export interface AuthoredVoxelState {version:1;size:number;baseline:string;base:Float64Array;layers:{id:string;samples:Float64Array}[]}
export interface VoxelWorkOptions {budgetMs?:number;yieldTask?:()=>Promise<void>}
export async function runVoxelWork<T>(steps:Generator<void,T>,options:VoxelWorkOptions={}):Promise<T>{const budget=Math.max(.5,Math.min(12,options.budgetMs??3)),yieldTask=options.yieldTask??(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));let start=performance.now();for(;;){const step=steps.next();if(step.done)return step.value;if(performance.now()-start>=budget){await yieldTask();start=performance.now();}}}
const encodeSample=(c:Cell):SampleState=>[c.x,c.y,c.z,c.distance,c.material];
const sameSample=(a:Cell,b:Cell)=>a.distance===b.distance&&a.material===b.material;
/** Authoritative sampled SDF. Neither collision nor rendering consults the authoring primitives. */
export class VoxelField {
 readonly cells=new Map<string,Cell>();readonly dirty=new Set<string>();revision=0;
 constructor(readonly size=SOLID_SIZE){}
 private baselineLayerRefs=new Map<string,Map<string,Cell>>();private mergingAuthored=false;
 private baselineId='empty';private baselineBase=new Map<string,Cell>();private baselineLayers=new Map<string,Map<string,Cell>>();
 /** Freeze the deterministic authored world before gameplay. Existing Cell values are immutable. */
 captureBaseline(worldId:string){const steps=this.captureBaselineSteps(worldId);while(!steps.next().done){/* synchronous authoring path, including workers */}}
 *captureBaselineSteps(worldId:string):Generator<void,void>{
  this.baselineBase=new Map();this.baselineLayers=new Map();this.baselineLayerRefs=new Map(this.layers);
  let hash=2166136261,work=0;const feed=(value:string)=>{for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}};
  feed('['+this.size+',[');let first=true;for(const [id,c] of this.base){this.baselineBase.set(id,c);if(!first)feed(',');first=false;feed(JSON.stringify(encodeSample(c)));if(++work%256===0)yield;}feed('],[');first=true;for(const [id,cells] of this.layers){const baseline=new Map<string,Cell>();this.baselineLayers.set(id,baseline);if(!first)feed(',');first=false;feed('['+JSON.stringify(id)+',[');let firstCell=true;for(const [key,c] of cells){baseline.set(key,c);if(!firstCell)feed(',');firstCell=false;feed(JSON.stringify(encodeSample(c)));if(++work%256===0)yield;}feed(']]');}feed(']]');this.baselineId=worldId+':'+(hash>>>0).toString(16).padStart(8,'0');
 }
 packAuthoredBaseline():AuthoredVoxelState {const steps=this.packAuthoredBaselineSteps();for(;;){const result=steps.next();if(result.done)return result.value;}}
 *packAuthoredBaselineSteps():Generator<void,AuthoredVoxelState>{
  const pack=function*(cells:Map<string,Cell>):Generator<void,Float64Array>{const samples=new Float64Array(cells.size*5);let i=0;for(const c of cells.values()){samples[i++]=c.x;samples[i++]=c.y;samples[i++]=c.z;samples[i++]=c.distance;samples[i++]=c.material;if(i%1280===0)yield;}return samples;};
  const base=yield*pack(this.baselineBase),layers:{id:string;samples:Float64Array}[]=[];for(const [id,cells] of this.baselineLayers)layers.push({id,samples:yield*pack(cells)});return {version:1,size:this.size,baseline:this.baselineId,base,layers};
 }
 /** Merge a pristine full authored world into a playable hub. A sample is adopted only
  * if it still matches its OLD baseline at the instant that sample is visited.
  * Edits during yields are therefore retained, and never become the new baseline. */
 async mergeAuthoredBaseline(packet:AuthoredVoxelState,options:VoxelWorkOptions={}):Promise<void>{
  if(this.mergingAuthored)throw new Error('World merge already in progress');this.mergingAuthored=true;
  try{await runVoxelWork(this.mergeAuthoredSteps(packet),options);}finally{this.mergingAuthored=false;}
 }
 private *mergeAuthoredSteps(packet:AuthoredVoxelState):Generator<void,void>{
  if(!packet||packet.version!==1||packet.size!==this.size||!text(packet.baseline,200)||!Array.isArray(packet.layers)||packet.layers.length>1024)throw new Error('Invalid authored world');
  let work=0,count=0;const ids=new Set<string>();for(const layer of packet.layers){if(!text(layer.id)||ids.has(layer.id))throw new Error('Invalid authored layer');ids.add(layer.id);}
  for(const part of [{id:'',samples:packet.base},...packet.layers]){if(!(part.samples instanceof Float64Array)||part.samples.length%5)throw new Error('Invalid authored layer');count+=part.samples.length/5;if(count>2000000)throw new Error('Authored world too large');const keys=new Set<string>();for(let i=0;i<part.samples.length;i+=5){const x=part.samples[i],y=part.samples[i+1],z=part.samples[i+2],d=part.samples[i+3],m=part.samples[i+4];if(!integer(x,-8192,8192)||!integer(y,-8192,8192)||!integer(z,-8192,8192)||!number(d,-this.size*2,this.size*2)||!integer(m,0,10))throw new Error('Invalid authored sample');const id=key(x,y,z);if(keys.has(id))throw new Error('Duplicate authored sample');keys.add(id);if(++work%256===0)yield;}}
  const oldBase=this.baselineBase,oldLayers=this.baselineLayers,newBase=new Map<string,Cell>(),newLayers=new Map<string,Map<string,Cell>>(),targets=new Map<string,Map<string,Cell>|null>();
  const oldRefs=this.baselineLayerRefs;
  for(const part of packet.layers){newLayers.set(part.id,new Map());const current=this.layers.get(part.id),old=oldLayers.get(part.id);if(old&&(!current||oldRefs.get(part.id)!==current)||!old&&current){targets.set(part.id,null);continue;}const target=current??new Map<string,Cell>();targets.set(part.id,target);if(!current)this.layers.set(part.id,target);}
  // Original authored order precedes later player construction layers (SDF tie ownership).
  const ordered=new Map<string,Map<string,Cell>>();for(const p of packet.layers){const current=this.layers.get(p.id);if(current)ordered.set(p.id,current);}for(const [id,layer] of this.layers)if(!ordered.has(id))ordered.set(id,layer);this.layers.clear();for(const [id,layer] of ordered)this.layers.set(id,layer);
  const unchanged=(current:Cell|undefined,old:Cell|undefined)=>current===old||!!current&&!!old&&sameSample(current,old);
  const markedChunks=new Set<string>();const markDirty=(c:Cell)=>{const x=Math.floor(c.x/16),z=Math.floor(c.z/16),id=`${x},${z}`;if(markedChunks.has(id))return;markedChunks.add(id);for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(`${x+dx},${z+dz}`);};
  const refresh=(id:string,before:Cell|undefined,after:Cell|undefined)=>{const composed=this.cells.get(id);if(composed===before&&after&&(!before||after.distance<=before.distance)||!composed&&after){this.cells.set(id,after);markDirty(after);}else if(after&&composed&&after.distance<composed.distance){this.cells.set(id,after);markDirty(after);}else if(after&&composed&&after.distance===composed.distance&&after.object!==composed.object)this.compose(after.x,after.y,after.z);else if(composed===before&&before)this.compose(before.x,before.y,before.z);};
  for(const part of [{id:'',samples:packet.base},...packet.layers]){const original=part.id?oldLayers.get(part.id)??new Map<string,Cell>():oldBase,target=part.id?targets.get(part.id):this.base,baseline=part.id?newLayers.get(part.id)!:newBase;
   for(let i=0;i<part.samples.length;i+=5){const x=part.samples[i],y=part.samples[i+1],z=part.samples[i+2],distance=part.samples[i+3],material=part.samples[i+4],id=key(x,y,z),old=original.get(id),authored=old&&old.distance===distance&&old.material===material?old:{x,y,z,distance,material,...(part.id?{object:part.id}:{})};baseline.set(id,authored);
    if(target&&(!part.id||this.layers.get(part.id)===target)){const current=target.get(id);if(unchanged(current,old)&&current!==authored){target.set(id,authored);refresh(id,current,authored);}}
    if(++work%256===0){markedChunks.clear();yield;}
   }
   if(target)for(const [id,old] of original){if(!baseline.has(id)&&(!part.id||this.layers.get(part.id)===target)&&unchanged(target.get(id),old)){const before=target.get(id);target.delete(id);refresh(id,before,undefined);}if(++work%256===0){markedChunks.clear();yield;}}
  }
  // Authored objects omitted by expansion stay absent unless the player replaced them.
  for(const [id,original] of oldLayers)if(!newLayers.has(id)){const current=this.layers.get(id);if(current&&current===oldRefs.get(id)){for(const [key,old] of original){if(unchanged(current.get(key),old)){const before=current.get(key);current.delete(key);refresh(key,before,undefined);}if(++work%256===0){markedChunks.clear();yield;}}if(!current.size)this.layers.delete(id);}}
  this.baselineBase=newBase;this.baselineLayers=newLayers;this.baselineLayerRefs=new Map(this.layers);this.baselineId=packet.baseline;this.revision++;
 }
 exportState():VoxelState {
  if(this.mergingAuthored)throw new Error('World is still loading');
  const diff=(current:Map<string,Cell>,baseline:Map<string,Cell>)=>{const cells:SampleState[]=[],removed:string[]=[];for(const [id,c] of current){const before=baseline.get(id);if(!before||c!==before&&!sameSample(c,before))cells.push(encodeSample(c));}for(const id of baseline.keys())if(!current.has(id))removed.push(id);return {cells,removed};};
  const base=diff(this.base,this.baselineBase);
  return {version:1,size:this.size,baseline:this.baselineId,base:base.cells,removedBase:base.removed,order:[...this.layers.keys()],layers:[...this.layers].map(([id,cells])=>({id,...diff(cells,this.baselineLayers.get(id)??new Map())}))};
 }
 /** Validate all data first, then replace layers atomically. Never flatten overlapping terrain. */
 restoreState(value:unknown,validateOnly=false):boolean {
  if(this.mergingAuthored)return false;
  if(!record(value)||value.version!==1||value.size!==this.size||value.baseline!==this.baselineId||!Array.isArray(value.layers)||value.layers.length>1024||!Array.isArray(value.order)||value.order.length!==value.layers.length)return false;
  let samples=0;
  const decode=(entries:unknown,removed:unknown,original:Map<string,Cell>,object?:string):Map<string,Cell>|null=>{
   if(!Array.isArray(entries)||!Array.isArray(removed)||(samples+=entries.length+removed.length)>1000000)return null;
   const out=new Map(original),seen=new Set<string>();
   for(const id of removed){if(typeof id!=='string'||!original.has(id)||seen.has(id))return null;seen.add(id);out.delete(id);}
   for(const tuple of entries){if(!Array.isArray(tuple)||tuple.length!==5)return null;const [x,y,z,d,m]=tuple;if(!integer(x,-8192,8192)||!integer(y,-8192,8192)||!integer(z,-8192,8192)||!number(d,-this.size*2,this.size*2)||!integer(m,0,10))return null;const id=key(x,y,z);if(seen.has(id))return null;seen.add(id);out.set(id,{x,y,z,distance:d,material:m,object});}
   return out;
  };
  const base=decode(value.base,value.removedBase,this.baselineBase);if(!base)return false;
  const layers=new Map<string,Map<string,Cell>>();
  for(let i=0;i<value.layers.length;i++){const layer=value.layers[i];if(!record(layer)||!text(layer.id)||value.order[i]!==layer.id||layers.has(layer.id))return false;const decoded=decode(layer.cells,layer.removed,this.baselineLayers.get(layer.id)??new Map(),layer.id);if(!decoded)return false;layers.set(layer.id,decoded);}
  if(validateOnly)return true;
  const changedChunks=new Set<string>();for(const cell of this.cells.values())changedChunks.add(chunkKey(cell.x,cell.z));
  this.base.clear();for(const [id,c] of base)this.base.set(id,c);this.layers.clear();for(const [id,cells] of layers)this.layers.set(id,cells);
  this.cells.clear();for(const c of this.base.values())this.cells.set(key(c.x,c.y,c.z),c);
  for(const layer of this.layers.values())for(const [id,c] of layer){const old=this.cells.get(id);if(!old||c.distance<old.distance)this.cells.set(id,c);}
  for(const c of this.cells.values())changedChunks.add(chunkKey(c.x,c.z));for(const id of changedChunks){const [x,z]=id.split(',').map(Number);for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(`${x+dx},${z+dz}`);}this.revision++;return true;
 }
 /** Composed samples, including the positive SDF band, for deterministic object signatures. */
 *objectSamples(object:string):Generator<Cell,void>{for(const cell of this.cells.values())if(cell.object===object)yield cell;}
 layerSamplesAt(x:number,y:number,z:number):Cell[]{const id=key(x,y,z);return [this.base,...this.layers.values()].flatMap(layer=>{const c=layer.get(id);return c?[c]:[];});}
 /** Owned samples, including those hidden under another layer. */
 *ownedLayerSamples(object:string):Generator<Cell,void>{yield* this.layers.get(object)?.values()??[];}
 sample(x:number,y:number,z:number){return this.cells.get(key(x,y,z))?.distance??this.size*2;}
 get(x:number,y:number,z:number){const c=this.cells.get(key(x,y,z));return c&&c.distance<0?c:undefined;}
 private readonly base=new Map<string,Cell>();private readonly layers=new Map<string,Map<string,Cell>>();
 private compose(x:number,y:number,z:number){const id=key(x,y,z),old=this.cells.get(id);let cell=this.base.get(id);for(const layer of this.layers.values()){const candidate=layer.get(id);if(candidate&&(!cell||candidate.distance<cell.distance))cell=candidate;}
  if(cell)this.cells.set(id,cell);else this.cells.delete(id);
  if(old?.distance!==cell?.distance||old?.material!==cell?.material||old?.object!==cell?.object)for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(chunkKey(x+dx,z+dz));
 }
 private write(layer:Map<string,Cell>,x:number,y:number,z:number,distance:number,material:number,object?:string){const id=key(x,y,z),d=Math.max(-this.size*2,Math.min(this.size*2,distance));if(d>=this.size*2)layer.delete(id);else layer.set(id,{x,y,z,distance:d,material,object});}
 /** Rasterize CSG into sampled distances. Object layers preserve underlying terrain when removed. */
 shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){const steps=this.shapeSteps(a,b,sdf,material,object,subtract);while(!steps.next().done){/* synchronous author path */}}
 *shapeSteps(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false):Generator<void,void>{
  let work=0;
  const s=this.size,pad=s*2;let layer=this.base;if(object&&!subtract){let found=this.layers.get(object);if(!found)this.layers.set(object,found=new Map());layer=found;}
  const targets=subtract?[this.base,...this.layers.values()]:[layer];
  for(let x=Math.floor((a.x-pad)/s);x<=Math.ceil((b.x+pad)/s);x++)for(let y=Math.floor((a.y-pad)/s);y<=Math.ceil((b.y+pad)/s);y++)for(let z=Math.floor((a.z-pad)/s);z<=Math.ceil((b.z+pad)/s);z++){
   const id=key(x,y,z),d=Math.max(-s*2,Math.min(s*2,sdf({x:(x+.5)*s,y:(y+.5)*s,z:(z+.5)*s})));let changed=false;
   for(const target of targets){const old=target.get(id),before=old?.distance??s*2,after=subtract?Math.max(before,-d):Math.min(before,d);if(after===before&&(subtract||!old||d>before||old.material===material))continue;this.write(target,x,y,z,after,subtract?(old?.material??material):material,subtract?old?.object:object);changed=true;}
   if(changed)this.compose(x,y,z);if(++work%256===0)yield;
  }this.revision++;
 }
 box(a:Vec3,b:Vec3,material:number,object?:string,r=0){this.shape(a,b,roundedBox(a,b,r),material,object,material===0);}
 set(x:number,y:number,z:number,material:number,object?:string){const s=this.size;this.box({x:x*s,y:y*s,z:z*s},{x:(x+1)*s,y:(y+1)*s,z:(z+1)*s},material,object);}
 carve(p:Vec3,r:number){this.shape({x:p.x-r,y:p.y-r,z:p.z-r},{x:p.x+r,y:p.y+r,z:p.z+r},sphere(p,r),0,undefined,true);}
 /** Deplete one occupied distance sample only. Neighbour samples retain their
  * sign and durability; interpolation still supplies a smooth collision/mesh surface. */
 depleteSample(cell:Cell){
  const current=this.get(cell.x,cell.y,cell.z);if(!current||current.material!==cell.material||current.object!==cell.object)return false;
  const id=key(cell.x,cell.y,cell.z);
  const layer=current.object?this.layers.get(current.object):this.base;
  if(!layer)return false;const old=layer.get(id);if(!old||old.distance>=0)return false;
  layer.set(id,{...old,distance:this.size*.5});
  this.compose(cell.x,cell.y,cell.z);this.revision++;return true;
 }
 removeObject(object:string){const steps=this.removeObjectSteps(object);while(!steps.next().done){/* synchronous author path */}}
 *removeObjectSteps(object:string):Generator<void,void>{const layer=this.layers.get(object);if(!layer)return;this.layers.delete(object);let work=0;for(const c of layer.values()){this.compose(c.x,c.y,c.z);if(++work%256===0)yield;}this.revision++;}
 distance(p:Vec3){const s=this.size,q=[p.x/s-.5,p.y/s-.5,p.z/s-.5],base=q.map(Math.floor),t=q.map((v,i)=>v-base[i]),order=[0,1,2].sort((a,b)=>t[b]-t[a]),n=[...base];
  let d=this.sample(n[0],n[1],n[2])*(1-t[order[0]]);n[order[0]]++;
  d+=this.sample(n[0],n[1],n[2])*(t[order[0]]-t[order[1]]);n[order[1]]++;
  d+=this.sample(n[0],n[1],n[2])*(t[order[1]]-t[order[2]]);n[order[2]]++;
  return d+this.sample(n[0],n[1],n[2])*t[order[2]];
 }
 materialAt(p:Vec3){const s=this.size,ix=Math.floor(p.x/s),iy=Math.floor(p.y/s),iz=Math.floor(p.z/s);let best:Cell|undefined,d=Infinity;
  for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++)for(let z=iz-1;z<=iz+1;z++){const c=this.cells.get(key(x,y,z));if(!c||c.distance>=0||c.material===0)continue;const dd=((x+.5)*s-p.x)**2+((y+.5)*s-p.y)**2+((z+.5)*s-p.z)**2;if(dd<d){d=dd;best=c;}}return best;
 }
 at(p:Vec3){return this.distance(p)<-.0001?this.materialAt(p):undefined;}
 normal(p:Vec3){const h=this.size*.2,dx=this.distance({...p,x:p.x+h})-this.distance({...p,x:p.x-h}),dy=this.distance({...p,y:p.y+h})-this.distance({...p,y:p.y-h}),dz=this.distance({...p,z:p.z+h})-this.distance({...p,z:p.z-h}),n=Math.hypot(dx,dy,dz)||1;return {x:dx/n,y:dy/n,z:dz/n};}
 /** Bounded sphere tracing plus bisection against the same interpolated SDF used by the mesh. */
 ray(origin:Vec3,direction:Vec3,maxDistance:number):Hit|null{
  const l=Math.hypot(direction.x,direction.y,direction.z);if(l<1e-9)return null;const d={x:direction.x/l,y:direction.y/l,z:direction.z/l};let t=0,previous=0;
  while(t<=maxDistance){const p={x:origin.x+d.x*t,y:origin.y+d.y*t,z:origin.z+d.z*t},sdf=this.distance(p);
   if(sdf<=.0002){let lo=previous,hi=t;for(let i=0;i<9;i++){const m=(lo+hi)/2;if(this.distance({x:origin.x+d.x*m,y:origin.y+d.y*m,z:origin.z+d.z*m})>0)lo=m;else hi=m;}const distance=(lo+hi)/2,point={x:origin.x+d.x*distance,y:origin.y+d.y*distance,z:origin.z+d.z*distance},cell=this.materialAt(point);return cell?{point,normal:this.normal(point),cell,distance}:null;}
   previous=t;t+=Math.max(this.size*.02,Math.min(this.size*.45,sdf*.75));
  }return null;
 }
 /** Vertical capsule; bottom is the feet, not a voxel-aligned bounding box. */
 private sphereOverlap(p:Vec3,r:number){if(this.distance(p)>=r-.002)return false;const n=this.normal(p);if(this.distance({x:p.x-n.x*r,y:p.y-n.y*r,z:p.z-n.z*r})<-.002)return true;for(const [x,y,z] of [[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]])if(this.distance({x:p.x+x,y:p.y+y,z:p.z+z})<-.002)return true;return false;}
 overlaps(p:Vec3,radius=.27,height=1.65){for(let y=radius;y<=height-radius+.001;y+=Math.min(.18,height-2*radius))if(this.sphereOverlap({x:p.x,y:p.y+y,z:p.z},radius))return true;return this.sphereOverlap({x:p.x,y:p.y+height-radius,z:p.z},radius);}

}
export const direction=(yaw:number,pitch:number):Vec3=>({x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)});
