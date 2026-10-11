import {VoxelField,key,type Vec3,type VoxelState} from './voxel';

export const PLAYER_BED='player-bed',PLAYER_BED_OBJECT='build:home:player-bed';
export const PLAYER_BED_POSITION:Readonly<Vec3>={x:-.5,y:.25,z:5.25};
export const PLAYER_REST_MAX_SECONDS=420;
export type RestTarget='dawn'|'dusk';
export const REST_HOURS:Readonly<Record<RestTarget,number>>={dawn:6,dusk:18};
export const REST_STEP=.1,REST_CHUNK_STEPS=40;
export const REST_NEUTRAL={x:0,z:0,sprint:false,block:false,water:false};
export interface RestResult {ok:boolean;message:string}

/** A separate paid camp bed. Its canopy is real, destructible shelter, not a
 * lighting flag. The existing smith's bed remains exclusively his furniture. */
export function buildPlayerBed(field:VoxelField){
 field.box({x:-1.25,y:.25,z:4.75},{x:.25,y:.55,z:5.75},4,PLAYER_BED_OBJECT,.06);
 field.box({x:-1.15,y:.55,z:4.85},{x:.15,y:.73,z:5.65},10,PLAYER_BED_OBJECT,.04);
 for(const x of [-1.125,.125])for(const z of [4.875,5.625])field.box({x:x-.1,y:.25,z:z-.1},{x:x+.1,y:2.75,z:z+.1},4,PLAYER_BED_OBJECT,.02);
 field.box({x:-2,y:2.65,z:4.25},{x:1,y:2.9,z:6.25},4,PLAYER_BED_OBJECT,.04);
}
const template=new VoxelField();buildPlayerBed(template);
const cells=new Map([...template.ownedLayerSamples(PLAYER_BED_OBJECT)].map(c=>[key(c.x,c.y,c.z),c]));
export function playerBedIntact(field:VoxelField){
 const owned=new Map([...field.ownedLayerSamples(PLAYER_BED_OBJECT)].map(c=>[key(c.x,c.y,c.z),c]));
 return [...cells].every(([id,c])=>{const actual=owned.get(id);return actual&&actual.material===c.material&&Math.abs(actual.distance-c.distance)<1e-9;});
}
export function playerBedPlacementReason(field:VoxelField,blockers:readonly (Vec3&{radius?:number})[]){
 if(blockers.some(p=>p.x+(p.radius??.3)>-1.9&&p.x-(p.radius??.3)<.9&&p.z+(p.radius??.3)>4.35&&p.z-(p.radius??.3)<6.15&&p.y<2.9&&p.y+1.9>.25))return '寝台の設置場所に人・動物がいます。';
 for(const c of cells.values()){if(c.distance>=-.005)continue;const at=field.at({x:(c.x+.5)*field.size,y:(c.y+.5)*field.size,z:(c.z+.5)*field.size});if(at&&at.object!==PLAYER_BED_OBJECT)return '寝台や屋根の設置場所に固体があります。';}
 for(const x of [-1.125,.125])for(const z of [4.875,5.625])if(field.distance({x,y:.2,z})>.035)return '寝台の四隅に地面の支えが必要です。';
 return '';
}
/** Older saves have no player bed. Owned damage may persist, but a forged or
 * unowned layer cannot acquire rest eligibility through a reload. */
export function validPlayerBedSave(furniture:readonly string[],field:VoxelState){
 const layer=field.layers.find(l=>l.id===PLAYER_BED_OBJECT);
 if(!furniture.includes(PLAYER_BED))return !layer&&!field.order.includes(PLAYER_BED_OBJECT);
 if(!layer)return true;
 return !layer.removed.length&&layer.cells.every(([x,y,z,d,m])=>{const c=cells.get(key(x,y,z));return !!c&&m===c.material&&d>=c.distance-1e-9;});
}

/** Transient work only. Every elapsed second must be earned by the caller's
 * ordinary simulation tick; cancellation never rolls time forward or back. */
export class DawnDuskWait {
 private remaining=0;private elapsed=0;private target:RestTarget|null=null;
 get active(){return this.target!==null;}
 snapshot(){return {active:this.active,target:this.target,remaining:this.remaining,elapsed:this.elapsed};}
 start(target:RestTarget,hour:number):RestResult {
  if(this.active)return {ok:false,message:'すでに休息中です。中断してから選び直してください。'};
  if(!Object.hasOwn(REST_HOURS,target)||!Number.isFinite(hour)||hour<0||hour>=24)return {ok:false,message:'待機する時刻が不正です。'};
  const hours=(REST_HOURS[target]-hour+24)%24;
  // At the selected hour, do not silently queue an entire extra day.
  if(hours<1/900)return {ok:false,message:'すでに指定の時刻です。'};
  this.target=target;this.remaining=hours*90;this.elapsed=0;
  return {ok:true,message:(target==='dawn'?'朝6時':'夕方18時')+'まで休息します。途中で中断できます。'};
 }
 cancel(){this.target=null;this.remaining=0;return {ok:true,message:'休息を中断しました。経過した時間はそのままです。'};}
 advance(tick:(dt:number)=>void,guard:()=>RestResult,shouldYield:()=>boolean=()=>false):{ended:boolean;completed:boolean;message?:string}{
  if(!this.active)return {ended:false,completed:false};
  for(let steps=0;steps<REST_CHUNK_STEPS;steps++){
   const safe=guard();if(!safe.ok){this.cancel();return {ended:true,completed:false,message:safe.message};}
   const dt=Math.min(REST_STEP,this.remaining);tick(dt);this.remaining=Math.max(0,this.remaining-dt);this.elapsed+=dt;
   const after=guard();if(!after.ok){this.cancel();return {ended:true,completed:false,message:after.message};}
   if(this.remaining<1e-7){this.target=null;this.remaining=0;return {ended:true,completed:true,message:'休息を終えました。'};}
   if(shouldYield())break;
  }
  return {ended:false,completed:false};
 }
}
