import { materialDefinition } from './materials';
import { key, type Cell, type Hit, type Vec3, type VoxelField } from './voxel';
import type { VoxelWater } from './water';
export type Element='water'|'fire'|'earth'|'wind'|'lightning';
export interface MaterialDrop { material:number; position:Vec3; count:number }
export interface MaterialShard { material:number; position:Vec3; life:number }
export interface DamageResult { damaged:number; destroyed:number }
export interface ElementState { position:Vec3; fire:number; wet:number; charge:number }
export interface ElementEffect { element:Element; position:Vec3; direction:Vec3; life:number; strength:number }
const NEIGHBORS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
/** Deterministic bounded local gameplay approximation, not full thermodynamics. */
export class ElementSystem {
 readonly states=new Map<string,ElementState>();
 readonly damagedObjects=new Set<string>();
 readonly effects:ElementEffect[]=[];
 readonly shards:MaterialShard[]=[];
 readonly maxStates=256;readonly maxEffects=64;
 private readonly health=new Map<string,{material:number;object?:string;remaining:number}>();
 private drops:MaterialDrop[]=[];
 private accumulator=0;
 constructor(readonly field:VoxelField,readonly water:VoxelWater){}
 private position(c:Vec3):Vec3{return {x:(c.x+.5)*this.field.size,y:(c.y+.5)*this.field.size,z:(c.z+.5)*this.field.size};}
 private healthKey(cell:Cell){return `${key(cell.x,cell.y,cell.z)}:${cell.material}:${cell.object??'base'}`;}
 durability(cell:Cell){const saved=this.health.get(this.healthKey(cell));return saved&&saved.material===cell.material&&saved.object===cell.object?saved.remaining:materialDefinition(cell.material).durability;}
 getDurability(cell:Cell){return {hp:this.durability(cell),max:materialDefinition(cell.material).durability};}
 private damageCell(cell:Cell,power:number):DamageResult{
  const current=this.field.get(cell.x,cell.y,cell.z),def=materialDefinition(cell.material);
  if(!current||current.material!==cell.material||current.object!==cell.object||!def.collectible||power<=0)return {damaged:0,destroyed:0};
  if(cell.object)this.damagedObjects.add(cell.object);
  const id=key(cell.x,cell.y,cell.z),remaining=Math.max(0,this.durability(cell)-power);
  this.health.set(this.healthKey(cell),{material:cell.material,object:cell.object,remaining});
  if(remaining>0)return {damaged:1,destroyed:0};
  if(!this.field.depleteSample(cell))return {damaged:0,destroyed:0};
  this.health.delete(this.healthKey(cell));this.states.delete(id);
  if(this.shards.length>=64)this.shards.shift();this.shards.push({material:cell.material,position:this.position(cell),life:.7});
  if(!cell.object?.startsWith('build:'))this.drops.push({material:cell.material,position:this.position(cell),count:1});
  return {damaged:1,destroyed:1};
 }
 private nearby(point:Vec3,radius:number){const s=this.field.size,ix=Math.floor(point.x/s),iy=Math.floor(point.y/s),iz=Math.floor(point.z/s),n=Math.ceil(radius/s),found:Cell[]=[];
  for(let x=ix-n;x<=ix+n;x++)for(let y=iy-n;y<=iy+n;y++)for(let z=iz-n;z<=iz+n;z++){
   const c=this.field.get(x,y,z);if(!c)continue;const p=this.position(c);if(Math.hypot(p.x-point.x,p.y-point.y,p.z-point.z)<=radius)found.push(c);
  }return found;
 }
 damage(hit:Hit,power:number,radius=.27):DamageResult{
  if(!Number.isFinite(power)||power<=0)return {damaged:0,destroyed:0};
  // Clamp area work. Include the authoritative occupied hit sample even on an interpolated boundary.
  const cells=this.nearby(hit.point,Math.max(0,Math.min(1,Number.isFinite(radius)?radius:.27)));
  if(!cells.some(c=>c.x===hit.cell.x&&c.y===hit.cell.y&&c.z===hit.cell.z))cells.push(hit.cell);
  const result={damaged:0,destroyed:0};for(const c of cells){const r=this.damageCell(c,power);result.damaged+=r.damaged;result.destroyed+=r.destroyed;}return result;
 }
 private state(c:Cell){const id=key(c.x,c.y,c.z);let state=this.states.get(id);
  if(!state&&this.states.size<this.maxStates){state={position:this.position(c),fire:0,wet:0,charge:0};this.states.set(id,state);}return state;
 }
 private effect(element:Element,position:Vec3,direction:Vec3,strength=1){if(this.effects.length>=this.maxEffects)this.effects.shift();this.effects.push({element,position:{...position},direction:{...direction},life:.7,strength});}
 cast(element:Element,hit:Hit,direction:Vec3):DamageResult{
  const length=Math.hypot(direction.x,direction.y,direction.z)||1,d={x:direction.x/length,y:direction.y/length,z:direction.z/length};
  this.effect(element,hit.point,d);
  const cells=this.nearby(hit.point,.8);if(!cells.some(c=>c===hit.cell)&&this.field.get(hit.cell.x,hit.cell.y,hit.cell.z))cells.push(hit.cell);
  if(element==='water'){
   for(const c of cells){const state=this.state(c);if(state){state.fire=0;state.wet=5;state.charge=0;}}
   const p={x:hit.point.x+hit.normal.x*.2,y:hit.point.y+hit.normal.y*.2,z:hit.point.z+hit.normal.z*.2};
   this.water.add(Math.floor((p.x-this.water.origin.x)/this.water.size),Math.floor((p.y-this.water.origin.y)/this.water.size),Math.floor((p.z-this.water.origin.z)/this.water.size),1);
  }else if(element==='fire'){
   for(const c of cells){if(!materialDefinition(c.material).combustible)continue;const state=this.state(c);if(state&&state.wet<=0)state.fire=1;}
  }else if(element==='earth'){
   const result={damaged:0,destroyed:0};for(const c of cells){const state=this.states.get(key(c.x,c.y,c.z));if(state)state.fire=0;
    if(c.material===2||c.material===3||c.material===8){const r=this.damageCell(c,28);result.damaged+=r.damaged;result.destroyed+=r.destroyed;}}
   return result;
  }else if(element==='wind'){
   // Advect ignition toward the cast direction, visiting only a short 1.5 m segment.
   for(const c of cells){const state=this.states.get(key(c.x,c.y,c.z));if(!state||state.fire<=0)continue;
    for(let step=1;step<=6;step++){const p=this.position(c),next=this.field.get(Math.floor((p.x+d.x*step*this.field.size)/this.field.size),Math.floor((p.y+d.y*step*this.field.size)/this.field.size),Math.floor((p.z+d.z*step*this.field.size)/this.field.size));
     if(next&&materialDefinition(next.material).combustible){const target=this.state(next);if(target&&target.wet<=0)target.fire=1;}}
   }
   for(const drop of this.drops)if(Math.hypot(drop.position.x-hit.point.x,drop.position.y-hit.point.y,drop.position.z-hit.point.z)<2){drop.position.x+=d.x*.7;drop.position.y+=Math.max(.1,d.y*.7);drop.position.z+=d.z*.7;}
  }else{
   // Charge traverses connected six-neighbour metal, with finite energy and node budget.
   const start=this.field.get(hit.cell.x,hit.cell.y,hit.cell.z);if(start&&materialDefinition(start.material).conductive){const queue=[{cell:start,charge:1}],seen=new Set<string>();
    for(let i=0;i<queue.length&&i<64;i++){const {cell,charge}=queue[i],id=key(cell.x,cell.y,cell.z);if(seen.has(id))continue;seen.add(id);const state=this.state(cell);if(state)state.charge=Math.max(state.charge,charge);this.effect('lightning',this.position(cell),d,charge);
     if(charge>.25)for(const [x,y,z] of NEIGHBORS){const next=this.field.get(cell.x+x,cell.y+y,cell.z+z);if(next&&materialDefinition(next.material).conductive&&!seen.has(key(next.x,next.y,next.z))&&queue.length<128)queue.push({cell:next,charge:charge*.8});}
    }
   }
  }return {damaged:0,destroyed:0};
 }
 tick(dt:number){
  if(!Number.isFinite(dt)||dt<=0)return;this.accumulator+=Math.min(dt,.5);
  while(this.accumulator>=.1-1e-9){this.accumulator-=.1;this.step();}
 }
 private step(){
  for(let i=this.shards.length-1;i>=0;i--){this.shards[i].life-=.1;if(this.shards[i].life<=0)this.shards.splice(i,1);}
  for(let i=this.effects.length-1;i>=0;i--){this.effects[i].life-=.1;if(this.effects[i].life<=0)this.effects.splice(i,1);}
  const ignite:Cell[]=[];
  for(const [id,state] of this.states){const [x,y,z]=id.split(',').map(Number),cell=this.field.get(x,y,z);
   if(!cell){this.states.delete(id);continue;}
   state.wet=Math.max(0,state.wet-.1);state.charge=Math.max(0,state.charge-.2);
   if(this.water.surface(state.position.x,state.position.z)>state.position.y)state.wet=2;
   if(state.wet>0)state.fire=0;
   if(state.fire>0){
    this.damageCell(cell,1.5);
    for(const [dx,dy,dz] of NEIGHBORS){const next=this.field.get(x+dx,y+dy,z+dz);if(next&&materialDefinition(next.material).combustible)ignite.push(next);}
   }
   if(state.fire<=0&&state.wet<=0&&state.charge<=0)this.states.delete(id);
  }
  // Apply spread after the pass so propagation is independent of Map insertion order.
  for(const cell of ignite){const state=this.state(cell);if(state&&state.wet<=0)state.fire=1;}
 }
 drainDrops(){const drops=this.drops;this.drops=[];return drops;}
}
