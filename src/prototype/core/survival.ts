import {record,number,integer,text,vector,checksum} from '../../save/validation';
import type {VoxelWater} from './water';
import type {Element} from './elements';
import {materialDefinition} from './materials';
import { VoxelField, roundedBox, type Vec3, type Sdf } from './voxel';
export type RecipeId='workbench'|'wall'|'floor'|'roof'|'stairs'|'door'|'window'|'ladder';
export const SURVIVAL_RECIPES:Record<RecipeId,{id:RecipeId;label:string;cost:number}>={
 workbench:{id:'workbench',label:'作業台',cost:8},wall:{id:'wall',label:'木の壁',cost:8},floor:{id:'floor',label:'木の床',cost:4},roof:{id:'roof',label:'木の屋根',cost:6},stairs:{id:'stairs',label:'木の階段',cost:8},door:{id:'door',label:'木の扉',cost:10},window:{id:'window',label:'窓付きの壁',cost:7},ladder:{id:'ladder',label:'木の梯子',cost:6},
};
export interface DropInput {material:number;position:Vec3;count:number;id?:string|number}
export interface MaterialDrop {id:number;material:number;position:Vec3;count:number;velocity?:Vec3;fire?:number;wet?:number;charge?:number}
export interface BuildingState {id:string;recipe:RecipeId;position:Vec3;anchor:Vec3;rotation?:number;cost?:number;signature?:string;open?:boolean}
export interface SurvivalState {version:1;inventory:Record<number,number>;drops:MaterialDrop[];pendingDrops:MaterialDrop[];selected:RecipeId;sequence:number;buildings:BuildingState[];sourceIds:(string|number)[];rotation?:number}
export interface PlacementResult {ok:boolean;message:string}
export interface PlacementPreview extends PlacementResult {bounds:{min:Vec3;max:Vec3};recipe:RecipeId;rotation:number;target:Vec3}
interface BuildingShape {min:Vec3;max:Vec3;sdf:Sdf;anchor:Vec3}
function buildingShape(recipe:RecipeId,target:Vec3,rotation:number,open=false):BuildingShape {
 const sizes:Record<RecipeId,[number,number,number]>={workbench:[1.1,.85,.7],wall:[1.5,1.65,.3],floor:[1.5,.25,1.5],roof:[1.5,.55,1.5],stairs:[1.5,.88,2],door:[2,2.5,.4],window:[1.5,1.65,.4],ladder:[1.2,2.4,.35]};
 const [w,h,d]=sizes[recipe],turn=((rotation%4)+4)%4,c=[1,0,-1,0][turn],s=[0,1,0,-1][turn];
 const world=(p:Vec3):Vec3=>({x:target.x+c*p.x-s*p.z,y:target.y+.025+p.y,z:target.z+s*p.x+c*p.z});
 const local=(p:Vec3):Vec3=>({x:c*(p.x-target.x)+s*(p.z-target.z),y:p.y-target.y-.025,z:-s*(p.x-target.x)+c*(p.z-target.z)});
 const parts:Sdf[]=[],box=(x:number,y:number,z:number,X:number,Y:number,Z:number,r=.04)=>parts.push(roundedBox({x,y,z},{x:X,y:Y,z:Z},r));
 if(recipe==='workbench'){box(-w/2,h-.34,-d/2,w/2,h,d/2,.065);for(const x of [-w/2+.03,w/2-.31])for(const z of [-d/2+.03,d/2-.31])box(x,0,z,x+.28,h-.15,z+.28);}
 else if(recipe==='door'){box(-1,0,-.2,-.5,2.5,.2);box(.5,0,-.2,1,2.5,.2);box(-.5,2,-.2,.5,2.5,.2);if(open)box(-.65,0,0,-.3,2,1.05);else box(-.5,0,-.175,.5,2,.175,.02);}
 else if(recipe==='window'){box(-.75,0,-.2,-.38,1.65,.2);box(.38,0,-.2,.75,1.65,.2);box(-.38,0,-.2,.38,.5,.2);box(-.38,1.2,-.2,.38,1.65,.2);}
 else if(recipe==='ladder'){box(-.6,0,-.175,-.32,2.4,.175);box(.32,0,-.175,.6,2.4,.175);for(let y=.15;y<2.4;y+=.35)box(-.42,y,-.175,.42,Math.min(2.4,y+.23),.175,.015);}
 else if(recipe==='stairs'){for(let i=0;i<4;i++)box(-w/2,0,-d/2+i*.5,w/2,(i+1)*.22,-d/2+(i+1)*.5,0);}
 else if(recipe==='roof'){parts.push(p=>Math.max(Math.abs(p.x)-w/2,Math.abs(p.z)-d/2,Math.abs(p.y-(.4-.25*Math.abs(p.x)/(w/2)))-.15));}
 else box(-w/2,0,-d/2,w/2,h,d/2,.06);
 const corners=[world({x:-w/2,y:0,z:-d/2}),world({x:w/2,y:h,z:d/2}),world({x:-w/2,y:0,z:recipe==='door'&&open?1.05:d/2}),world({x:w/2,y:h,z:-d/2})];
 return {min:{x:Math.min(...corners.map(p=>p.x)),y:target.y+.025,z:Math.min(...corners.map(p=>p.z))},max:{x:Math.max(...corners.map(p=>p.x)),y:target.y+h+.025,z:Math.max(...corners.map(p=>p.z))},sdf:p=>Math.min(...parts.map(shape=>shape(local(p)))),anchor:world({x:recipe==='ladder'?.45:0,y:h-(recipe==='workbench'?.25:.125),z:0})};
}
const finite=(p:Vec3)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Bounded in-memory collection. Building layers deliberately have no salvage: mining a
 * construction can never create more resources than its recipe spent. Versioned checkpoints preserve source identities and pending resources. */
export class SurvivalSystem {
 readonly inventory:Record<number,number>={2:0,3:0,4:0,6:0,7:0,10:0};
 readonly drops:MaterialDrop[]=[];readonly pendingDrops:MaterialDrop[]=[];selected:RecipeId='workbench';rotation=0;private undoRecord:{id:string;revision:number}|null=null;
 readonly maxDrops=192;readonly maxBuildings=64;buildBounds={minX:-11,maxX:11,minZ:-19,maxZ:19};
 private readonly pendingIndex=new Map<string,MaterialDrop>();
 private dropKey(d:DropInput){return `${d.material}:${d.position.x},${d.position.y},${d.position.z}`;}
 private pendingCursor=0;private sequence=0;private buildings:BuildingState[]=[];
 private accepted=new WeakSet<DropInput>();private readonly sourceIds=new Set<string|number>();
 constructor(readonly field:VoxelField,readonly water?:VoxelWater,readonly damagedObjects?:ReadonlySet<string>){}
 exportState():SurvivalState {const clone=(d:MaterialDrop):MaterialDrop=>({...d,position:{...d.position},...(d.velocity?{velocity:{...d.velocity}}:{})});return {version:1,inventory:{...this.inventory},drops:this.drops.map(clone),pendingDrops:this.pendingDrops.map(clone),selected:this.selected,sequence:this.sequence,buildings:this.buildings.map(b=>({...b,position:{...b.position},anchor:{...b.anchor}})),sourceIds:[...this.sourceIds],rotation:this.rotation};}
 restoreState(value:unknown):boolean {
  if(!record(value)||value.version!==1||!record(value.inventory)||!text(value.selected)||!Object.hasOwn(SURVIVAL_RECIPES,value.selected)||!integer(value.sequence)||!Array.isArray(value.drops)||value.drops.length>this.maxDrops||!Array.isArray(value.pendingDrops)||value.pendingDrops.length>100000||!Array.isArray(value.buildings)||value.buildings.length>this.maxBuildings||!Array.isArray(value.sourceIds)||value.sourceIds.length>8192)return false;
  if(value.rotation!==undefined&&!integer(value.rotation,0,3))return false;
  const inventory:Record<number,number>={};for(const id of Object.keys(this.inventory)){const n=value.inventory[id];if(!integer(n,0,1e9))return false;inventory[Number(id)]=n;}if(Object.keys(value.inventory).length!==Object.keys(inventory).length)return false;
  const ids=new Set<number>(),pendingKeys=new Set<string>();
  const parseDrops=(entries:unknown[],pending:boolean):MaterialDrop[]|null=>{const out:MaterialDrop[]=[];for(const d of entries){if(!record(d)||!integer(d.id,1,value.sequence as number)||ids.has(d.id)||!integer(d.material)||!(d.material in inventory)||!integer(d.count,1,1e9)||!vector(d.position)||d.velocity!==undefined&&!vector(d.velocity))return null;for(const state of ['fire','wet','charge'])if(d[state]!==undefined&&!number(d[state],0,1e6))return null;ids.add(d.id);const drop:MaterialDrop={id:d.id,material:d.material,count:d.count,position:{...d.position}};if(d.velocity)drop.velocity={...d.velocity as Vec3};for(const state of ['fire','wet','charge'] as const)if(d[state]!==undefined)drop[state]=d[state] as number;const key=this.dropKey(drop);if(pending&&pendingKeys.has(key))return null;if(pending)pendingKeys.add(key);out.push(drop);}return out;};
  const drops=parseDrops(value.drops,false),pending=parseDrops(value.pendingDrops,true);if(!drops||!pending)return false;
  const buildingIds=new Set<string>(),buildings:BuildingState[]=[];for(const b of value.buildings){if(!record(b)||!text(b.id)||!text(b.recipe)||!Object.hasOwn(SURVIVAL_RECIPES,b.recipe)||!vector(b.position)||!vector(b.anchor)||buildingIds.has(b.id))return false;const serial=Number(b.id.split(':').at(-1));if(b.id!==`build:${b.recipe}:${serial}`||!integer(serial,1,value.sequence)||ids.has(serial))return false;ids.add(serial);buildingIds.add(b.id);if(b.rotation!==undefined&&!integer(b.rotation,0,3)||b.cost!==undefined&&b.cost!==SURVIVAL_RECIPES[b.recipe as RecipeId].cost||b.signature!==undefined&&!(typeof b.signature==='string'&&/^[0-9a-f]{8}$/.test(b.signature))||b.open!==undefined&&typeof b.open!=='boolean')return false;buildings.push({id:b.id,recipe:b.recipe as RecipeId,position:{...b.position},anchor:{...b.anchor},rotation:(b.rotation??0) as number,...(b.cost!==undefined?{cost:b.cost as number}:{}),...(b.signature!==undefined?{signature:b.signature as string}:{}),open:b.open===true});}
  const sources=new Set<string|number>();for(const id of value.sourceIds){if(!(text(id)||integer(id))||sources.has(id))return false;sources.add(id);}
  Object.assign(this.inventory,inventory);this.drops.splice(0,this.drops.length,...drops);this.pendingDrops.length=0;for(const d of pending)this.pendingDrops.push(d);this.pendingIndex.clear();for(const d of pending)this.pendingIndex.set(this.dropKey(d),d);this.pendingCursor=0;this.sequence=value.sequence;this.selected=value.selected as RecipeId;this.buildings=buildings;this.rotation=(value.rotation??0) as number;this.undoRecord=null;this.sourceIds.clear();for(const id of sources)this.sourceIds.add(id);this.accepted=new WeakSet();return true;
 }
 ladder(id:string){const b=this.buildings.find(b=>b.id===id&&b.recipe==='ladder');if(!b||!this.alive(b)||this.damagedObjects?.has(id))return null;return {id:b.id,position:{...b.position},rotation:b.rotation??0,height:2.4};}
 get recipe(){return SURVIVAL_RECIPES[this.selected];}
 cycleRecipe(){const ids=Object.keys(SURVIVAL_RECIPES) as RecipeId[];this.selected=ids[(ids.indexOf(this.selected)+1)%ids.length];return this.selected;}
 private clearLine(a:Vec3,b:Vec3,tolerance=.05){const d=distance(a,b);return d<.001||!this.field.ray(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},Math.max(0,d-tolerance));}
 /** Returns accepted resource units; malformed/replayed entries are not credited. */
 addDrops(entries:readonly DropInput[]){let added=0;
  for(const entry of entries){const material=entry.material===5?4:entry.material===8?3:entry.material===1?2:entry.material;
   if(!(material in this.inventory)||!finite(entry.position)||!Number.isSafeInteger(entry.count)||entry.count<=0||entry.count>1000000||this.accepted.has(entry)||(entry.id!==undefined&&this.sourceIds.has(entry.id)))continue;
   if(entry.id!==undefined&&this.sourceIds.size>=8192)continue;
   const stack=this.drops.find(d=>d.material===material&&distance(d.position,entry.position)<.65&&this.clearLine(d.position,entry.position));
   if(stack){if(stack.count+entry.count>1000000)continue;stack.count+=entry.count;}
   else {const key=this.dropKey({...entry,material}),backlog=this.pendingIndex.get(key);if(backlog)backlog.count+=entry.count;else {const drop={id:++this.sequence,material,position:{...entry.position},count:entry.count};if(this.drops.length<this.maxDrops)this.drops.push(drop);else {this.pendingDrops.push(drop);this.pendingIndex.set(key,drop);}}}
   this.accepted.add(entry);if(entry.id!==undefined)this.sourceIds.add(entry.id);added+=entry.count;
  }return added;
 }
 /** Pick up only exposed chunks close to the player's body, with SDF visibility. */
 tick(dt:number,playerPosition:Vec3){if(!Number.isFinite(dt)||dt<=0||!finite(playerPosition))return 0;
  const hand={...playerPosition,y:playerPosition.y+.85};let picked=0;
  // Rotate a bounded window through the backlog, prioritizing nearby chunks so
  // distant debris cannot permanently hide newly mined resources at the player.
  for(let inspected=0;inspected<32&&this.pendingDrops.length;inspected++){
   const index=this.pendingCursor++%this.pendingDrops.length,candidate=this.pendingDrops[index];
   let farIndex=-1,farDistance=distance(hand,candidate.position);
   for(let j=0;j<this.drops.length;j++){const d=distance(hand,this.drops[j].position);if(d>farDistance+.05){farDistance=d;farIndex=j;}}
   if(farIndex<0)continue;
   const displaced=this.drops[farIndex];this.drops[farIndex]=candidate;this.pendingIndex.delete(this.dropKey(candidate));
   this.pendingDrops[index]=this.pendingDrops[this.pendingDrops.length-1];this.pendingDrops.pop();
   const id=this.dropKey(displaced),existing=this.pendingIndex.get(id);if(existing)existing.count+=displaced.count;else{this.pendingDrops.push(displaced);this.pendingIndex.set(id,displaced);}
  }
  for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];
   const step=Math.min(dt,.05),v=d.velocity??(d.velocity={x:0,y:0,z:0}),surface=this.water?.surface(d.position.x,d.position.z)??-Infinity,submerged=surface>d.position.y;
   d.wet=Math.max(0,(d.wet??0)-dt);d.charge=Math.max(0,(d.charge??0)-dt);if(submerged){d.wet=3;d.fire=0;}
   if((d.fire??0)>0){d.fire=Math.max(0,d.fire!-dt);if(d.fire===0){d.count--;if(d.count<=0){this.drops.splice(i,1);continue;}}}
   v.y=Math.max(-8,Math.min(5,v.y+(-9.8+(submerged&&[4,7,10].includes(d.material)?18:0))*step));const drag=Math.exp(-step*(submerged?7:1.2));v.x*=drag;v.z*=drag;if(submerged)v.y*=Math.exp(-step*4);
   for(const axis of ['x','y','z'] as const){const delta=v[axis]*step;if(Math.abs(delta)<.00001)continue;const dir={x:0,y:0,z:0};dir[axis]=Math.sign(delta);const hit=this.field.ray(d.position,dir,Math.abs(delta)+.055);if(hit){d.position[axis]+=dir[axis]*Math.max(0,hit.distance-.055);v[axis]*=-.12;if(axis==='y'){v.x*=.7;v.z*=.7;}}else d.position[axis]+=delta;}
   if(distance(hand,d.position)>1.65||this.field.distance(d.position)<-.015||!this.clearLine(hand,d.position))continue;
   this.inventory[d.material]+=d.count;picked+=d.count;this.drops.splice(i,1);
  }
  while(this.drops.length<this.maxDrops&&this.pendingDrops.length){const drop=this.pendingDrops.pop()!;this.pendingIndex.delete(this.dropKey(drop));this.drops.push(drop);}
  return picked;
 }
 /** Material-aware loose bodies keep momentum; all movement is swept against SDF. */
 react(element:Element,point:Vec3,direction:Vec3){for(const drop of this.drops){if(distance(drop.position,point)>1.4||!this.clearLine({...point,y:point.y+.05},drop.position,.15))continue;
  if(element==='water'){drop.wet=5;drop.fire=0;drop.charge=0;}
  if(element==='fire'&&materialDefinition(drop.material).combustible&&!(drop.wet!>0))drop.fire=3;
  if(element==='lightning'&&(drop.material===6||drop.wet!>0))drop.charge=.6;
  if(element==='earth')drop.fire=0;
 }if(element==='wind'||element==='earth')this.pushDrops(point,direction);}
 pushDrops(point:Vec3,direction:Vec3){if(!finite(point)||!finite(direction))return;const length=Math.hypot(direction.x,direction.y,direction.z)||1;
  for(const drop of this.drops){if(distance(drop.position,point)>2.5||!this.clearLine({...point,y:point.y+.05},drop.position,.15))continue;const v=drop.velocity??(drop.velocity={x:0,y:0,z:0}),mass=drop.material===6?3:drop.material===3?2:1;for(const axis of ['x','y','z'] as const)v[axis]=Math.max(-6,Math.min(6,v[axis]+direction[axis]/length*4/mass));v.y=Math.max(v.y,1/mass);}}
 private alive(b:{id:string;anchor:Vec3}){return this.field.distance(b.anchor)<0&&this.field.materialAt(b.anchor)?.object===b.id;}
 hasWorkbench(position:Vec3){return this.buildings.some(b=>b.recipe==='workbench'&&this.alive(b)&&distance(b.position,position)<=3&&this.clearLine({...position,y:position.y+1.15},{...b.position,y:b.position.y+1.15}));}
 rotate(step=1){if(Number.isInteger(step))this.rotation=((this.rotation+step)%4+4)%4;return this.rotation;}
 private signature(id:string){return checksum(JSON.stringify([...this.field.objectSamples(id)].sort((a,b)=>a.x-b.x||a.y-b.y||a.z-b.z).map(c=>[c.x,c.y,c.z,c.distance,c.material])));}
 private bodyIntersects(shape:BuildingShape,bodies:readonly Vec3[]){for(const body of bodies)for(let y=.12;y<1.75;y+=.18)for(const [x,z] of [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]])if(shape.sdf({x:body.x+x,y:body.y+y,z:body.z+z})<.06)return true;return false;}
 preview(target:Vec3,playerPosition:Vec3,enemies:readonly Vec3[]=[]):PlacementPreview{
  const shape=buildingShape(this.selected,target,this.rotation),recipe=this.recipe,base={bounds:{min:shape.min,max:shape.max},recipe:recipe.id,rotation:this.rotation,target:{...target}};
  const result=(ok:boolean,message:string):PlacementPreview=>({...base,ok,message});
  if(!finite(target)||!finite(playerPosition)||enemies.some(p=>!finite(p)))return result(false,'設置位置が無効');
  const eye={...playerPosition,y:playerPosition.y+1.52},a=shape.min,b=shape.max;
  if(a.x<this.buildBounds.minX||b.x>this.buildBounds.maxX||a.z<this.buildBounds.minZ||b.z>this.buildBounds.maxZ||target.y<-.1||b.y>8||distance(eye,target)>3.1||!this.clearLine(eye,{...target,y:target.y+.08},.14))return result(false,'近くの見える支えを狙う（高さ8mまで）');
  if(recipe.id!=='workbench'&&!this.hasWorkbench(target))return result(false,'3m以内に作業台が必要');
  if(this.inventory[4]<recipe.cost)return result(false,`木材が不足（${recipe.cost}必要）`);
  if(this.buildings.length>=this.maxBuildings)return result(false,'建築数の上限');
  if(this.bodyIntersects(shape,[playerPosition,...enemies]))return result(false,'体に重なるため設置できない');
  for(const x of [a.x+.16,b.x-.16])for(const z of [a.z+.12,b.z-.12])if(this.field.distance({x,y:target.y-.09,z})>.025)return result(false,'四隅に平らな支えが必要');
  const step=this.field.size/2;
  for(let x=a.x+.035;x<b.x;x+=step)for(let y=a.y+.06;y<b.y;y+=step)for(let z=a.z+.035;z<b.z;z+=step){const p={x,y,z};if(shape.sdf(p)<-.005&&this.field.distance(p)<-.005)return result(false,'他の固体に重なっている');}
  return result(true,recipe.label+'を設置できます');
 }
 place(target:Vec3,playerPosition:Vec3,enemies:readonly Vec3[]=[]):PlacementResult{
  const check=this.preview(target,playerPosition,enemies);if(!check.ok)return check;
  const recipe=this.recipe,shape=buildingShape(recipe.id,target,this.rotation),id=`build:${recipe.id}:${++this.sequence}`;
  this.field.shape(shape.min,shape.max,shape.sdf,4,id);this.inventory[4]-=recipe.cost;
  this.buildings.push({id,recipe:recipe.id,position:{...target},anchor:shape.anchor,rotation:this.rotation,cost:recipe.cost,signature:this.signature(id),open:false});this.undoRecord={id,revision:this.field.revision};
  return {ok:true,message:recipe.label+'を設置（木材 −'+recipe.cost+'）'};
 }
 private removalCheck(build:BuildingState,player:Vec3,enemies:readonly Vec3[]):string {
  if(!finite(player)||distance(player,build.position)>4)return '4m以内の建築を選んでください';
  const shape=buildingShape(build.recipe,build.position,build.rotation??0,build.open),a=shape.min,b=shape.max;
  if([player,...enemies].some(p=>p.x>a.x-.3&&p.x<b.x+.3&&p.z>a.z-.3&&p.z<b.z+.3&&p.y>=a.y-.1&&p.y<=b.y+.4))return '上に人がいるため解体できません';
  if(this.buildings.some(other=>other.id!==build.id&&other.position.y>build.position.y+.2&&Math.abs(other.position.x-build.position.x)<2&&Math.abs(other.position.z-build.position.z)<2&&this.alive(other)))return '上の建築を先に解体してください';
  if(!this.clearLine({...player,y:player.y+1.52},build.anchor,.8))return '見える建築を選んでください';return '';
 }
 dismantle(id:string,player:Vec3,enemies:readonly Vec3[]=[]):PlacementResult {
  const build=this.buildings.find(b=>b.id===id);if(!build)return {ok:false,message:'解体できる建築がありません'};const reason=this.removalCheck(build,player,enemies);if(reason)return {ok:false,message:reason};
  const refund=!this.damagedObjects?.has(id)&&build.signature&&build.signature===this.signature(id)?build.cost??0:0;if(this.inventory[4]+refund>1e9)return {ok:false,message:'木材の所持上限です'};
  this.field.removeObject(id);this.inventory[4]+=refund;this.buildings.splice(this.buildings.indexOf(build),1);this.undoRecord=null;return {ok:true,message:`解体しました（木材 +${refund}）`};
 }
 undo(player:Vec3,enemies:readonly Vec3[]=[]):PlacementResult {const last=this.undoRecord,build=last?this.buildings.find(b=>b.id===last.id):undefined;if(!last||!build||this.damagedObjects?.has(build.id)||last.revision!==this.field.revision||build.signature!==this.signature(build.id))return {ok:false,message:'変更されていない直前の建築だけ取り消せます'};return this.dismantle(build.id,player,enemies);}
 toggleDoor(id:string,player:Vec3,enemies:readonly Vec3[]=[]):PlacementResult {
  const build=this.buildings.find(b=>b.id===id&&b.recipe==='door');if(!build||!finite(player)||distance(player,build.position)>3)return {ok:false,message:'近くの木の扉を選んでください'};
  if(this.damagedObjects?.has(id)||!build.signature||build.signature!==this.signature(id))return {ok:false,message:'壊れた扉は開閉できません'};
  const open=buildingShape('door',build.position,build.rotation??0,true),closed=buildingShape('door',build.position,build.rotation??0,false),sweep={...open,sdf:roundedBox(open.min,open.max)};
  if(this.bodyIntersects(sweep,[player,...enemies]))return {ok:false,message:'扉の動く範囲に人がいます'};
  for(let x=open.min.x;x<=open.max.x;x+=.125)for(let y=open.min.y+.08;y<open.max.y;y+=.125)for(let z=open.min.z;z<=open.max.z;z+=.125){const p={x,y,z};if(this.field.distance(p)<-.005&&this.field.materialAt(p)?.object!==id)return {ok:false,message:'扉の動く範囲に障害物があります'};}
  const shape=build.open?closed:open;this.field.removeObject(id);this.field.shape(shape.min,shape.max,shape.sdf,4,id);build.open=!build.open;build.signature=this.signature(id);this.undoRecord=null;return {ok:true,message:build.open?'扉を開きました':'扉を閉じました'};
 }
}
