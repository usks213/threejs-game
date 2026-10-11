import {record,number,integer,vector} from '../../save/validation';
import type {VoxelState} from './voxel';
import type {ElementSaveState} from './elements';
import {creatureVoxels} from './world';
import {ElementSystem,type Element} from './elements';
import {VoxelWater} from './water';
import type {Hit,Vec3} from './voxel';
export interface EntityElementState {version:1;field:VoxelState;reactions:ElementSaveState;velocity:Vec3;scars:Vec3[];wet:number;shock:number;shockCooldown:number;burning:number;reward:number;rewardedDeath:boolean}
/** Each enemy owns material samples. AI health is separate from its destructible armour/cloth. */
export class EntityElements {
 readonly field=creatureVoxels();readonly reactions:ElementSystem;
 readonly velocity:Vec3={x:0,y:0,z:0};readonly scars:Vec3[]=[];
 wet=0;shock=0;shockCooldown=0;burning=0;private reward=12;private rewardedDeath=false;
 constructor(){this.field.captureBaseline('entity-materials-v1');const water=new VoxelWater(this.field);water.volume.fill(0);this.reactions=new ElementSystem(this.field,water);}
 exportState():EntityElementState {return {version:1,field:this.field.exportState(),reactions:this.reactions.exportState(),velocity:{...this.velocity},scars:this.scars.map(p=>({...p})),wet:this.wet,shock:this.shock,shockCooldown:this.shockCooldown,burning:this.burning,reward:this.reward,rewardedDeath:this.rewardedDeath};}
 restoreState(value:unknown):boolean {
  if(!record(value)||value.version!==1||!vector(value.velocity)||!Array.isArray(value.scars)||value.scars.length>192||!value.scars.every(vector)||!integer(value.reward,0,12)||typeof value.rewardedDeath!=='boolean'||value.rewardedDeath&&value.reward!==0)return false;
  for(const id of ['wet','shock','shockCooldown','burning'])if(!number(value[id],0,1e6))return false;
  const stagedField=creatureVoxels();stagedField.captureBaseline('entity-materials-v1');if(!stagedField.restoreState(value.field))return false;
  const stagedReactions=new ElementSystem(stagedField,this.reactions.water);if(!stagedReactions.restoreState(value.reactions))return false;
  this.field.restoreState(value.field);this.reactions.restoreState(value.reactions);Object.assign(this.velocity,value.velocity);this.scars.splice(0,this.scars.length,...value.scars.map(p=>({...p})));this.reward=value.reward;this.rewardedDeath=value.rewardedDeath;this.wet=value.wet as number;this.shock=value.shock as number;this.shockCooldown=value.shockCooldown as number;this.burning=value.burning as number;return true;
 }
 local(p:Vec3,position:Vec3,yaw:number):Vec3{const x=p.x-position.x,z=p.z-position.z,c=Math.cos(yaw),s=Math.sin(yaw);return {x:c*x-s*z,y:p.y-position.y,z:s*x+c*z};}
 world(p:Vec3,position:Vec3,yaw:number):Vec3{const c=Math.cos(yaw),s=Math.sin(yaw);return {x:position.x+c*p.x+s*p.z,y:position.y+p.y,z:position.z-s*p.x+c*p.z};}
 impulse(d:Vec3,power:number){const n=Math.hypot(d.x,d.y,d.z)||1;this.velocity.x=Math.max(-5,Math.min(5,this.velocity.x+d.x/n*power));this.velocity.z=Math.max(-5,Math.min(5,this.velocity.z+d.z/n*power));}
 cast(element:Element,hit:Hit,direction:Vec3){
  if(element==='fire'&&this.wet>0)return 0;this.reactions.cast(element,hit,direction);
  if(element==='water'){this.wet=5;this.burning=0;for(const state of this.reactions.states.values()){state.fire=0;state.wet=5;}}
  if(element==='fire'&&this.wet<=0)this.burning=Math.max(this.burning,[...this.reactions.states.values()].some(s=>s.fire>0)?4:0);
  if(element==='lightning'&&(this.wet>0||hit.cell.material===6)&&this.shockCooldown<=0){this.shock=.55;this.shockCooldown=1.8;this.reactions.damage(hit,this.wet>0?80:40,.14);return this.wet>0?24:12;}
  if(element==='earth'){this.reactions.damage(hit,35,.16);return 7;}
  return 0;
 }
 tick(dt:number){this.wet=Math.max(0,this.wet-dt);this.shock=Math.max(0,this.shock-dt);this.shockCooldown=Math.max(0,this.shockCooldown-dt);this.reactions.tick(dt);this.burning=[...this.reactions.states.values()].some(s=>s.fire>0)?1:0;return this.burning?6*dt:0;}
 drain(position:Vec3,yaw:number){const out=[];for(const drop of this.reactions.drainDrops()){if(this.scars.length<192)this.scars.push({...drop.position});if(this.reward>0){this.reward--;out.push({...drop,position:this.world(drop.position,position,yaw),count:1});}}return out;}
 deathDrops(position:Vec3){if(this.rewardedDeath)return [];this.rewardedDeath=true;const count=this.reward;this.reward=0;return count?[{material:6,position:{...position,y:position.y+.6},count}]:[];}
}
