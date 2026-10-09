import { BUILDINGS } from '../../content/catalog';
import { roofHeight } from '../meadows/building-shapes';
import type { Vec3 } from '../../world/types';
import type { BuildingState } from '../types';
export type VoxelMaterial='wood'|'stone'|'leaves'|'cloth'|'metal';
export interface ObjectVoxel extends Vec3 { material:VoxelMaterial; key:string }
export interface VoxelModel { size:number; cells:Map<string,ObjectVoxel> }
export const voxelKey=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const cache=new Map<string,VoxelModel>();
function generate(key:string,size:number,min:Vec3,max:Vec3,fill:(p:Vec3)=>VoxelMaterial|null):VoxelModel{
 const cached=cache.get(key);if(cached)return cached;const model:VoxelModel={size,cells:new Map()};
 for(let x=Math.floor(min.x/size);x<Math.ceil(max.x/size);x++)for(let y=Math.floor(min.y/size);y<Math.ceil(max.y/size);y++)for(let z=Math.floor(min.z/size);z<Math.ceil(max.z/size);z++){const p={x:(x+.5)*size,y:(y+.5)*size,z:(z+.5)*size},material=fill(p);if(material){const key=voxelKey(x,y,z);model.cells.set(key,{x,y,z,key,material});}}
 cache.set(key,model);return model;
}
export function buildingVoxels(id:string):VoxelModel{
 const existing=cache.get('b:'+id);if(existing)return existing;
 const def=BUILDINGS.find(b=>b.id===id)!;const [w,h,d]=def.size,size=.125,roof=roofHeight(id,0,0)!==null;
 return generate('b:'+id,size,{x:-w/2,y:0,z:-d/2},{x:w/2,y:roof?2.25:Math.max(h,.125),z:d/2},p=>{
  if(roof){const top=roofHeight(id,p.x,p.z)!;return p.y>top&&p.y<=top+.25?'wood':null;}
  if(id==='stairs'||id==='ladder'){const top=Math.max(0,Math.min(2,p.z+1));return p.y<=top&&p.y>top-.25?'wood':null;}
  if(id==='window'&&Math.abs(p.x)<.6&&p.y>.65&&p.y<1.55)return null;
  if(id==='beam26'||id==='beam45'){const slope=id==='beam45'?1:.5;return Math.abs(p.y-h/2-p.x*slope)<.125?'wood':null;}
  if(['bench','choppingBlock','tanningRack'].includes(id)){return p.y>h-.2||Math.abs(p.x)>w/2-.25&&Math.abs(p.z)>d/2-.25?'wood':null;}
  if(id==='cook')return Math.abs(p.x)>w/2-.15||p.y>h-.15?'wood':null;
  if(id==='routeBanner')return Math.abs(p.x)<.13?'wood':p.y>.75?'cloth':null;
  if(id==='echoMemorial')return p.y<.25||Math.abs(p.x)<.38&&p.y>Math.abs(p.x)*.5?'stone':null;
  if(id==='windChime')return Math.abs(p.x)<.13||p.y>1.5?'wood':Math.abs(p.x)>.25&&p.y>.65&&Math.abs(p.z)<.13?'metal':null;
  if(id==='routeMonument')return p.y<.25||Math.abs(p.x)<.25||p.y>1.5&&Math.abs(p.z)<.15?'stone':null;
  if(id==='chest')return p.y<.125||p.y>h-.125||Math.abs(p.x)>w/2-.125||Math.abs(p.z)>d/2-.125?'wood':null;
  if(id==='fire'){const r=Math.hypot(p.x,p.z);return r>.2?'stone':'wood';}
  if(id==='portal')return Math.abs(p.x)>w/2-.3||p.y>h-.3?'wood':null;
  if(id==='bed'&&p.y>h-.125)return 'cloth';
  return id==='foundation'||id==='stoneFloor'||id.startsWith('stone')?'stone':'wood';
 });
}
export function treeVoxels(kind:string,id:number):VoxelModel{
 const height=kind==='oak'?6:4+(id%5)*.25,r=kind==='oak'?2.2:1.65;
 return generate('t:'+kind+':'+id%5,.25,{x:-r,y:0,z:-r},{x:r,y:height+1,z:r},p=>{
  if(Math.hypot(p.x,p.z)<(kind==='oak'?.45:.3)&&p.y<height)return 'wood';
  const nx=p.x/r,nz=p.z/r,ny=(p.y-height*.8)/(height*.35);if(nx*nx+nz*nz+ny*ny<1+Math.sin(p.x*7+p.z*3)*.08)return 'leaves';return null;
 });
}
export function localPoint(point:Vec3,origin:Vec3,rotation=0):Vec3 {const x=point.x-origin.x,z=point.z-origin.z,c=Math.cos(rotation),s=Math.sin(rotation);return{x:x*c-z*s,y:point.y-origin.y,z:x*s+z*c};}
export function worldPoint(point:Vec3,origin:Vec3,rotation=0):Vec3 {const c=Math.cos(rotation),s=Math.sin(rotation);return{x:origin.x+point.x*c+point.z*s,y:origin.y+point.y,z:origin.z-point.x*s+point.z*c};}
/** The occupied model follows a hinged door around its left edge when opened. */
export function buildingPose(b:BuildingState):Vec3 & {rotation:number}{
 const pose={x:b.x,y:b.y,z:b.z,rotation:b.rotation};
 if(!b.open||(b.definition!=='door'&&b.definition!=='gate'))return pose;
 const half=(BUILDINGS.find(d=>d.id===b.definition)?.size[0]??1)/2;
 pose.rotation+=Math.PI/2;
 pose.x+=half*(Math.cos(pose.rotation)-Math.cos(b.rotation));
 pose.z-=half*(Math.sin(pose.rotation)-Math.sin(b.rotation));
 return pose;
}
export function occupied(model:VoxelModel,point:Vec3,removed:ReadonlySet<string>):boolean {
 const bounds=voxelBounds(model);
 if(point.x<bounds.min.x||point.x>=bounds.max.x||point.y<bounds.min.y||point.y>=bounds.max.y||point.z<bounds.min.z||point.z>=bounds.max.z)return false;
 const key=voxelKey(Math.floor(point.x/model.size),Math.floor(point.y/model.size),Math.floor(point.z/model.size));
 return model.cells.has(key)&&!removed.has(key);
}
export function carveVoxels(model:VoxelModel,point:Vec3,radius:number,removed:string[]):ObjectVoxel[]{const gone=new Set(removed),hits:ObjectVoxel[]=[];for(const c of model.cells.values()){if(gone.has(c.key)||Math.hypot((c.x+.5)*model.size-point.x,(c.y+.5)*model.size-point.y,(c.z+.5)*model.size-point.z)>radius)continue;hits.push(c);removed.push(c.key);}return hits;}
/** Finds a real occupied surface, including holes and rotated pieces. */
export function rayVoxel(model:VoxelModel,origin:Vec3,direction:Vec3,removed:readonly string[]=[],limit=20):number|null {
 const bounds=voxelBounds(model),size=model.size;
 let near=0,far=limit;
 for(const axis of ['x','y','z'] as const){
  const d=direction[axis];
  if(Math.abs(d)<1e-10){if(origin[axis]<bounds.min[axis]||origin[axis]>=bounds.max[axis])return null;continue;}
  const a=(bounds.min[axis]-origin[axis])/d,b=(bounds.max[axis]-origin[axis])/d;
  near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
 }
 if(near>far||!Number.isFinite(near)||Math.hypot(direction.x,direction.y,direction.z)<1e-10)return null;
 const gone=new Set(removed),axes=['x','y','z'] as const;
 const cell={x:0,y:0,z:0},step={x:0,y:0,z:0},next={x:Infinity,y:Infinity,z:Infinity},stride={x:Infinity,y:Infinity,z:Infinity};
 for(const axis of axes){
  const d=direction[axis],p=origin[axis]+d*(near+1e-8);cell[axis]=Math.floor(p/size);
  if(Math.abs(d)<1e-10)continue;step[axis]=Math.sign(d);stride[axis]=size/Math.abs(d);
  next[axis]=((cell[axis]+(d>0?1:0))*size-origin[axis])/d;
 }
 let distance=near;
 // Traverse each crossed cell once. Broad-phase bounds reject most trees/buildings
 // before allocating probe points; tied boundaries advance together.
 while(distance<=far+1e-8){
  const key=voxelKey(cell.x,cell.y,cell.z);if(model.cells.has(key)&&!gone.has(key))return distance;
  const crossing=Math.min(next.x,next.y,next.z);if(!Number.isFinite(crossing)||crossing>far+1e-8)return null;
  for(const axis of axes)if(next[axis]<=crossing+1e-8){cell[axis]+=step[axis];next[axis]+=stride[axis];}
  distance=crossing;
 }
 return null;
}
export function bodyTouchesVoxels(model:VoxelModel,point:Vec3,removed:readonly string[]=[],height=1.45):boolean{
 const gone=new Set(removed);for(const dx of [-.28,0,.28])for(const dz of [-.28,0,.28])for(let y=.1;y<height;y+=.2)if(occupied(model,{x:point.x+dx,y:point.y+y,z:point.z+dz},gone))return true;return false;
}
/** Query a cell-top under the feet; collision heights follow the visible voxel staircase. */
export function footSurface(model:VoxelModel,point:Vec3,previousY:number,removed:readonly string[]=[]):number|null{
 const bounds=voxelBounds(model);
 // Most world buildings are nowhere near these feet. Reject their local bounds
 // before allocating a removed-cell set or walking empty vertical voxel columns.
 if(point.x+.22<bounds.min.x||point.x-.22>=bounds.max.x||point.z+.22<bounds.min.z||point.z-.22>=bounds.max.z)return null;
 const high=Math.min(Math.floor((previousY+.45)/model.size),Math.ceil(bounds.max.y/model.size)-1),low=Math.max(Math.floor((point.y-.35)/model.size),Math.floor(bounds.min.y/model.size));
 if(high<low)return null;
 const gone=new Set(removed);let top:number|null=null;
 for(const dx of [-.22,0,.22])for(const dz of [-.22,0,.22]){const x=Math.floor((point.x+dx)/model.size),z=Math.floor((point.z+dz)/model.size);for(let y=high;y>=low;y--){const key=voxelKey(x,y,z);if(!model.cells.has(key)||gone.has(key))continue;const height=(y+1)*model.size;if(height<=previousY+.45)top=Math.max(top??-Infinity,height);break;}}
 return top;
}
const boundsCache=new WeakMap<VoxelModel,{min:Vec3;max:Vec3}>();
export function voxelBounds(model:VoxelModel){let bounds=boundsCache.get(model);if(bounds)return bounds;const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};for(const cell of model.cells.values())for(const axis of ['x','y','z'] as const){min[axis]=Math.min(min[axis],cell[axis]*model.size);max[axis]=Math.max(max[axis],(cell[axis]+1)*model.size);}bounds={min,max};boundsCache.set(model,bounds);return bounds;}
