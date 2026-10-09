import {CAMPAIGN_ITEMS,type CampaignSystem,type CampaignResult} from './campaign';
import type {Vec3,VoxelField} from './voxel';
import type {VoxelWater} from './water';
import {REGIONAL_WATERS} from './regions';

export const FISHING_SPOTS=[
 {id:'trial-basin',name:'灯守りの水槽',minX:4,maxX:10,minZ:-5,maxZ:1,cooldown:45},
 {id:'mirrorlake',name:'澄鐘の岸辺',minX:11,maxX:16,minZ:-52,maxZ:-47,cooldown:45},
] as const;
export type FishingSpotId=typeof FISHING_SPOTS[number]['id'];
export interface FishingWater {spot:FishingSpotId;surfaceY:number;depth:number}
export type FishingWaterProbe=(x:number,z:number)=>FishingWater|null;
/** Volume-backed water for the local basin; the lake uses its authored water volume,
 * clipped against the same SDF floor/buildings. A map label alone cannot supply water. */
export function createFishingWaterProbe(field:VoxelField,water:VoxelWater):FishingWaterProbe{return(x,z)=>{
 const basin=FISHING_SPOTS[0];if(x>basin.minX&&x<basin.maxX&&z>basin.minZ&&z<basin.maxZ){const y=water.surface(x,z);if(!Number.isFinite(y))return null;
  const ix=Math.floor((x-water.origin.x)/water.size),iz=Math.floor((z-water.origin.z)/water.size);let depth=0,found=false;for(let iy=water.ny-1;iy>=0;iy--){const i=water.index(ix,iy,iz),wet=!water.blocked[i]&&water.volume[i]>.02;if(!wet){if(found)break;continue;}found=true;depth+=water.volume[i]*water.size;}const floor=field.ray({x,y:y-.01,z},{x:0,y:-1,z:0},depth+.1);if(floor)depth=Math.min(depth,Math.max(0,y-floor.point.y));
  return{spot:'trial-basin',surfaceY:y,depth};
 }
 const lake=REGIONAL_WATERS.find(w=>w.id==='mirrorlake-basin')!;if(x>lake.min.x&&x<lake.max.x&&z>lake.min.z&&z<lake.max.z){const top=lake.surfaceY,hit=field.ray({x,y:top-.01,z},{x:0,y:-1,z:0},top-lake.min.y+.25),bottom=Math.max(lake.min.y,hit?.point.y??lake.min.y);return{spot:'mirrorlake',surfaceY:top,depth:Math.max(0,top-bottom)};}return null;
 };}
/** Convert the existing first-person aim into a water-surface target; cast() still
 * validates range, depth and solid line of sight. Call on interaction, not every render. */
export function fishingTargetAlongRay(origin:Vec3,direction:Vec3,probe:FishingWaterProbe,maxDistance=8):Vec3|null{
 if(!finite(origin)||!finite(direction)||!Number.isFinite(maxDistance)||maxDistance<=0)return null;const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.001)return null;const d={x:direction.x/length,y:direction.y/length,z:direction.z/length};if(d.y>=-.001)return null;const max=Math.min(8,maxDistance);
 for(let t=.25;t<=max;t+=.25){const sample=probe(origin.x+d.x*t,origin.z+d.z*t);if(!sample||!Number.isFinite(sample.surfaceY))continue;const hit=(sample.surfaceY-origin.y)/d.y;if(hit<=0||hit>max)continue;const x=origin.x+d.x*hit,z=origin.z+d.z*hit,actual=probe(x,z);if(actual&&actual.spot===sample.spot&&Number.isFinite(actual.surfaceY)&&Math.abs(actual.surfaceY-sample.surfaceY)<.1)return{x,y:actual.surfaceY,z};}return null;
}
export interface FishingActor {authority:'host'|'guest';alive:boolean;swimming:boolean;position:Vec3}
export interface FishingAttempt {id:number;spot:FishingSpotId;origin:Vec3;target:Vec3;phase:'casting'|'waiting'|'bite';remaining:number}
export interface FishingState {version:1;selected:boolean;clock:number;serial:number;resolved:number;caught:number;readyAt:Record<FishingSpotId,number>;attempt:FishingAttempt|null}
export type FishingEvent={kind:'waiting'|'bite'|'missed'|'cancelled';message:string;attempt:number};
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const finite=(p:Vec3)=>!!p&&typeof p==='object'&&[p.x,p.y,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<1000);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const fail=(message:string):CampaignResult=>({ok:false,message});
const success=(message:string):CampaignResult=>({ok:true,message});
export const createFishingState=():FishingState=>({version:1,selected:false,clock:0,serial:0,resolved:0,caught:0,readyAt:{'trial-basin':0,mirrorlake:0},attempt:null});
export function validFishingState(value:unknown):value is FishingState{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const s=value as FishingState;
 if(s.version!==1||typeof s.selected!=='boolean'||!Number.isFinite(s.clock)||s.clock<0||s.clock>1e9||![s.serial,s.resolved,s.caught].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9)||s.resolved>s.serial||s.caught>s.resolved||!s.readyAt||typeof s.readyAt!=='object'||Object.keys(s.readyAt).length!==FISHING_SPOTS.length)return false;
 for(const spot of FISHING_SPOTS){const ready=s.readyAt[spot.id];if(!Number.isFinite(ready)||ready<0||ready>s.clock+spot.cooldown+.001)return false;}
 if(s.attempt===null)return s.resolved===s.serial;
 const a=s.attempt;if(!a||typeof a!=='object'||a.id!==s.serial||s.resolved!==s.serial-1||!s.selected||!finite(a.origin)||!finite(a.target)||!['casting','waiting','bite'].includes(a.phase)||!Number.isFinite(a.remaining)||a.remaining<=0||a.remaining>(a.phase==='casting'?.6:a.phase==='bite'?1.8:7.25)+1e-8)return false;
 const spot=FISHING_SPOTS.find(p=>p.id===a.spot);return !!spot&&s.readyAt[spot.id]>s.clock&&a.target.x>spot.minX&&a.target.x<spot.maxX&&a.target.z>spot.minZ&&a.target.z<spot.maxZ&&distance(a.origin,a.target)<=7.5;
}
/** Persist snapshot + campaign inventory in the SAME checked checkpoint. Loading creates
 * a staging instance; older per-module snapshots cannot rewind a live instance's receipts.
 * No offline catches: elapsed active time advances only via authoritative simulation ticks. */
export class FishingSystem {
 private state=createFishingState();
 constructor(readonly campaign:CampaignSystem,readonly field:VoxelField,readonly water: FishingWaterProbe){}
 snapshot(){return copy(this.state);}
 restore(value:unknown,validateOnly=false){if(!validFishingState(value)||value.serial<this.state.serial||value.resolved<this.state.resolved||value.clock<this.state.clock)return false;if(value.selected&&!this.campaign.has('fishing-rod'))return false;if(!validateOnly)this.state=copy(value);return true;}
 get selected(){return this.state.selected;}
 get phase(){return this.state.attempt?.phase??'idle';}
 get status(){const a=this.state.attempt;return a?{phase:a.phase,remaining:a.remaining,spot:a.spot,target:{...a.target},message:a.phase==='casting'?'浮きを投げている':a.phase==='waiting'?'浮きが沈むまで待つ':'食いついた。今すぐ操作して巻き上げる'}:{phase:'idle',remaining:0,spot:null,target:null,message:'釣竿を選び、岸から水面へ投げる'};}
 selectRod(selected:boolean):CampaignResult{if(selected&&!this.campaign.has('fishing-rod'))return fail('木材5・草葉3で葦糸の釣竿を作る');if(!selected)this.cancel('釣竿をしまった');this.state.selected=selected;return success(selected?'釣竿を選択した。餌を用意して水面を狙う':'釣竿をしまった');}
 private validActor(actor:FishingActor){return actor.authority==='host'&&actor.alive&&!actor.swimming&&finite(actor.position)&&this.state.selected&&this.campaign.has('fishing-rod');}
 private clearLine(origin:Vec3,target:Vec3){const from={...origin,y:origin.y+1.2},to={...target,y:target.y+.08},d=distance(from,to),hit=this.field.ray(from,{x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},Math.max(0,d-.08));return !hit;}
 private validWater(target:Vec3,spot?:FishingSpotId){const sample=this.water(target.x,target.z),registered=sample&&FISHING_SPOTS.find(p=>p.id===sample.spot);return sample&&registered&&target.x>registered.minX&&target.x<registered.maxX&&target.z>registered.minZ&&target.z<registered.maxZ&&(!spot||sample.spot===spot)&&Number.isFinite(sample.depth)&&sample.depth>=.35&&Number.isFinite(sample.surfaceY)&&Math.abs(sample.surfaceY-target.y)<.25?sample:null;}
 cast(target:Vec3,actor:FishingActor):CampaignResult{
  if(!this.validActor(actor))return fail('生存中に岸へ立ち、釣竿を選択する');if(this.state.attempt)return fail('現在の浮きを巻き上げるか中断する');if(!finite(target))return fail('水面を狙う');
  const water=this.validWater(target),range=distance(actor.position,target);if(!water||range<1||range>6||actor.position.y<water.surfaceY-.1||actor.position.y-water.surfaceY>2.5)return fail('1〜6m先の深さ35cm以上の水面を岸から狙う');
  if(!this.clearLine(actor.position,target))return fail('釣り糸が壁や地形に遮られています');if(this.state.readyAt[water.spot]>this.state.clock)return fail(`魚が戻るまで${Math.ceil(this.state.readyAt[water.spot]-this.state.clock)}秒待つ`);
  if(!this.campaign.has('fish-bait'))return fail('草葉2から草実の練り餌を3個作る');if((this.campaign.state.items.silverfin??0)>=CAMPAIGN_ITEMS.silverfin.stackLimit)return fail('生魚の持物に空きを作る');if(this.state.serial>=1e9)return fail('釣り記録の上限');
  const id=this.state.serial+1;this.campaign.state.items['fish-bait']--;this.state.serial=id;this.state.readyAt[water.spot]=this.state.clock+FISHING_SPOTS.find(p=>p.id===water.spot)!.cooldown;this.state.attempt={id,spot:water.spot,origin:{...actor.position},target:{...target,y:water.surfaceY},phase:'casting',remaining:.6};return success('餌を1個使い、浮きを投げ入れた');
 }
 cancel(message='釣りを中断した'):CampaignResult{const a=this.state.attempt;if(!a)return fail('釣りをしていません');this.state.resolved=a.id;this.state.attempt=null;return success(message+'。使った餌は戻らない');}
 private interrupted(actor:FishingActor){const a=this.state.attempt;return !a||!this.validActor(actor)||distance(actor.position,a.origin)>.65||!this.validWater(a.target,a.spot)||!this.clearLine(actor.position,a.target);}
 tick(dt:number,actor:FishingActor):FishingEvent[]{const events:FishingEvent[]=[];if(actor.authority!=='host')return events;if(!Number.isFinite(dt)||dt<=0)return events;let remaining=Math.min(dt,1);this.state.clock=Math.min(1e9,this.state.clock+remaining);const original=this.state.attempt;
  if(original&&this.interrupted(actor)){this.cancel();events.push({kind:'cancelled',message:'移動・死亡・水面や糸の変化で釣りを中断した',attempt:original.id});return events;}
  while(remaining>1e-9&&this.state.attempt){const a=this.state.attempt,step=Math.min(remaining,a.remaining);a.remaining-=step;remaining-=step;if(a.remaining>1e-8)break;
   if(a.phase==='casting'){a.phase='waiting';a.remaining=5+(a.id%4)*.75;events.push({kind:'waiting',message:'浮きが沈むまで待つ',attempt:a.id});}
   else if(a.phase==='waiting'){a.phase='bite';a.remaining=1.8;events.push({kind:'bite',message:'食いついた。今すぐ操作して巻き上げる',attempt:a.id});}
   else{this.cancel();events.push({kind:'missed',message:'魚が餌を離した',attempt:a.id});}
  }return events;
 }
 reel(actor:FishingActor):CampaignResult{if(actor.authority!=='host')return fail('現在、釣りはホストが操作します');const a=this.state.attempt;if(!a)return fail('先に浮きを投げ入れる');if(this.interrupted(actor)){this.cancel();return fail('糸が切れ、釣りを中断した');}if(a.phase!=='bite'){this.cancel();return fail('巻き上げるのが早すぎた。浮きが沈む合図を待つ');}
  if((this.campaign.state.items.silverfin??0)>=CAMPAIGN_ITEMS.silverfin.stackLimit){this.cancel();return fail('生魚の持物がいっぱいで、魚を逃がした');}
  this.campaign.state.items.silverfin=(this.campaign.state.items.silverfin??0)+1;this.state.caught++;this.state.resolved=a.id;this.state.attempt=null;return success('澄鰭魚を1匹釣り上げた。炉で焼くか薬草汁にできる');
 }
 /** One action works for keyboard E and the existing mobile interaction button. */
 interact(target:Vec3|null,actor:FishingActor){if(actor.authority!=='host')return fail('現在、釣りはホストが操作します');return this.state.attempt?this.reel(actor):target?this.cast(target,actor):fail('岸から水面を狙う');}
}
