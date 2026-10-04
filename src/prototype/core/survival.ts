import { VoxelField, roundedBox, type Vec3 } from './voxel';
export type RecipeId='workbench'|'wall'|'floor';
export const SURVIVAL_RECIPES:Record<RecipeId,{id:RecipeId;label:string;cost:number}>={
 workbench:{id:'workbench',label:'作業台',cost:8},wall:{id:'wall',label:'木の壁',cost:8},floor:{id:'floor',label:'木の床',cost:4},
};
export interface DropInput {material:number;position:Vec3;count:number;id?:string|number}
export interface MaterialDrop {id:number;material:number;position:Vec3;count:number}
export interface PlacementResult {ok:boolean;message:string}
const finite=(p:Vec3)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Bounded in-memory collection. Building layers deliberately have no salvage: mining a
 * construction can never create more resources than its recipe spent. No persistence. */
export class SurvivalSystem {
 readonly inventory:Record<number,number>={2:0,3:0,4:0,6:0,7:0,10:0};
 readonly drops:MaterialDrop[]=[];readonly pendingDrops:MaterialDrop[]=[];selected:RecipeId='workbench';
 readonly maxDrops=192;readonly maxBuildings=64;
 private readonly pendingIndex=new Map<string,MaterialDrop>();
 private dropKey(d:DropInput){return `${d.material}:${d.position.x},${d.position.y},${d.position.z}`;}
 private pendingCursor=0;private sequence=0;private buildings:{id:string;recipe:RecipeId;position:Vec3;anchor:Vec3}[]=[];
 private readonly accepted=new WeakSet<DropInput>();private readonly sourceIds=new Set<string|number>();
 constructor(readonly field:VoxelField){}
 get recipe(){return SURVIVAL_RECIPES[this.selected];}
 cycleRecipe(){const ids:RecipeId[]=['workbench','wall','floor'];this.selected=ids[(ids.indexOf(this.selected)+1)%ids.length];return this.selected;}
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
   const fall=Math.min(dt,.1)*2.5;
   if(this.field.distance(d.position)>.01){const hit=this.field.ray(d.position,{x:0,y:-1,z:0},fall+.06);d.position.y-=hit?Math.max(0,hit.distance-.055):fall;}
   if(distance(hand,d.position)>1.65||this.field.distance(d.position)<-.015||!this.clearLine(hand,d.position))continue;
   this.inventory[d.material]+=d.count;picked+=d.count;this.drops.splice(i,1);
  }
  while(this.drops.length<this.maxDrops&&this.pendingDrops.length){const drop=this.pendingDrops.pop()!;this.pendingIndex.delete(this.dropKey(drop));this.drops.push(drop);}
  return picked;
 }
 /** Wind moves loose active chunks along unobstructed SDF segments only. */
 pushDrops(point:Vec3,direction:Vec3){if(!finite(point)||!finite(direction))return;const l=Math.hypot(direction.x,direction.y,direction.z);if(l<.0001)return;
  for(const drop of this.drops){if(distance(drop.position,point)>2.5||!this.clearLine(point,drop.position))continue;const dir={x:direction.x/l,y:direction.y/l,z:direction.z/l},hit=this.field.ray(drop.position,dir,.75),step=hit?Math.max(0,hit.distance-.06):.75;drop.position={x:drop.position.x+dir.x*step,y:drop.position.y+dir.y*step,z:drop.position.z+dir.z*step};}
 }
 private alive(b:{id:string;anchor:Vec3}){return this.field.distance(b.anchor)<0&&this.field.materialAt(b.anchor)?.object===b.id;}
 hasWorkbench(position:Vec3){return this.buildings.some(b=>b.recipe==='workbench'&&this.alive(b)&&distance(b.position,position)<=3&&this.clearLine({...position,y:position.y+1.15},{...b.position,y:b.position.y+1.15}));}
 place(target:Vec3,playerPosition:Vec3,enemies:readonly Vec3[]=[]):PlacementResult{
  const fail=(message:string):PlacementResult=>({ok:false,message});
  if(!finite(target)||!finite(playerPosition))return fail('設置位置が無効');
  const recipe=this.recipe,eye={...playerPosition,y:playerPosition.y+1.52};
  if(Math.abs(target.x)>11||Math.abs(target.z)>19||target.y<-.1||target.y>5||distance(eye,target)>3.1||!this.clearLine(eye,{...target,y:target.y+.08},.14))return fail('近くの見える地面を狙う');
  if(recipe.id!=='workbench'&&!this.hasWorkbench(target))return fail('3m以内に作業台が必要');
  if(this.inventory[4]<recipe.cost)return fail(`木材が不足（${recipe.cost}必要）`);
  if(this.buildings.length>=this.maxBuildings)return fail('建築数の上限');
  const w=recipe.id==='workbench'?1.1:1.5,h=recipe.id==='workbench'?.85:recipe.id==='wall'?1.65:.25,d=recipe.id==='workbench'?.7:recipe.id==='wall'?.3:1.5;
  const a={x:target.x-w/2,y:target.y+.025,z:target.z-d/2},b={x:target.x+w/2,y:target.y+h+.025,z:target.z+d/2};
  for(const body of [playerPosition,...enemies]){const dx=Math.max(a.x-body.x,0,body.x-b.x),dz=Math.max(a.z-body.z,0,body.z-b.z);if(Math.hypot(dx,dz)<.34&&body.y<b.y+.05&&body.y+1.75>a.y)return fail('体に重なるため設置できない');}
  // Every corner must be supported. This prevents bridges in empty air and floating builds.
  for(const x of [a.x+.16,b.x-.16])for(const z of [a.z+.12,b.z-.12])if(this.field.distance({x,y:target.y-.09,z})>.025)return fail('平らな支えが必要');
  // Sample the entire proposed volume at half the world lattice size; reject existing solids.
  const step=this.field.size/2;
  for(let x=a.x+.035;x<b.x;x+=step)for(let y=a.y+.06;y<b.y;y+=step)for(let z=a.z+.035;z<b.z;z+=step)if(this.field.distance({x,y,z})<-.005)return fail('他の固体に重なっている');
  const id=`build:${recipe.id}:${++this.sequence}`;
  if(recipe.id==='workbench'){
   const top={...a,y:b.y-.34};this.field.box(top,b,4,id,.065);
   for(const x of [a.x+.03,b.x-.31])for(const z of [a.z+.03,b.z-.31])this.field.box({x,y:a.y,z},{x:x+.28,y:b.y-.15,z:z+.28},4,id,.045);
  }else this.field.shape(a,b,roundedBox(a,b,.06),4,id);
  this.inventory[4]-=recipe.cost;
  this.buildings.push({id,recipe:recipe.id,position:{...target},anchor:{x:target.x,y:b.y-(recipe.id==='workbench'?.25:.125),z:target.z}});
  return {ok:true,message:recipe.label+'を設置（木材 −'+recipe.cost+'）'};
 }
}
