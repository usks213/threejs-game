import {integer,number,record} from '../../save/validation';
import {VoxelField,type Vec3,type VoxelState} from './voxel';
import type {VoxelWater} from './water';

export const WATERMILL_ID='build:watermill:loom';
export const WATERMILL_POSITION:Readonly<Vec3>={x:3.5,y:.65,z:-1.4};
export const WATERMILL_ROTOR:Readonly<Vec3>={x:4.3125,y:.32,z:-1.875};
export const WATERMILL_COST:Readonly<Record<number,number>>={4:8,3:4,6:2};
export const WATERMILL_REPAIR:Readonly<Record<number,number>>={4:4,3:2};
export const WATERMILL_SECONDS=8;
const min={x:3.125,y:.3,z:-1.75},max={x:3.875,y:1,z:-1};
export interface WatermillState {version:1;built:boolean;nextJobId:number;job:{id:number;recipe:'weave';remaining:number}|null;angle:number}
export interface WatermillContext {authority:'host'|'guest';alive:boolean;baseActive:boolean;position:Vec3;blockers:readonly Vec3[]}
export interface WatermillResult {ok:boolean;message:string}
export const freshWatermillState=():WatermillState=>({version:1,built:false,nextJobId:1,job:null,angle:0});
const result=(ok:boolean,message:string):WatermillResult=>({ok,message});
const clone=(s:WatermillState):WatermillState=>({...s,job:s.job?{...s.job}:null});
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export function validWatermillState(v:unknown):v is WatermillState {
 if(!record(v)||!keys(v,['version','built','nextJobId','job','angle'])||v.version!==1||typeof v.built!=='boolean'||!integer(v.nextJobId,1,1e9)||!number(v.angle,0,Math.PI*2))return false;
 if(!v.built&&(v.job!==null||v.nextJobId!==1||v.angle!==0))return false;
 return v.job===null||record(v.job)&&keys(v.job,['id','recipe','remaining'])&&integer(v.job.id,1,v.nextJobId-1)&&v.job.id===v.nextJobId-1&&v.job.recipe==='weave'&&number(v.job.remaining,0,WATERMILL_SECONDS);
}
/** Fixed, paid add-on geometry. This never modifies the frozen terrain provider. */
function install(field:VoxelField){field.box(min,max,4,WATERMILL_ID,.05);field.box({x:3.75,y:.3,z:-2},{x:4.0,y:.55,z:-1.5},6,WATERMILL_ID,.015);}
const template=new VoxelField();install(template);
const templateCells=new Map([...template.objectSamples(WATERMILL_ID)].map(c=>[`${c.x},${c.y},${c.z}`,c]));
/** A damaged/missing frame remains damaged on reload. Reject forged geometry outside
 * this machine's paid envelope and a frame with no owner; never regenerate on restore. */
export function validWatermillSave(value:unknown,field:VoxelState):boolean {
 if(value!==undefined&&!validWatermillState(value))return false;
 const state=value??freshWatermillState(),layer=field.layers.find(l=>l.id===WATERMILL_ID);
 if(!state.built)return !layer&&!field.order.includes(WATERMILL_ID);
 if(!layer)return true;
 if(layer.removed.length)return false;
 return layer.cells.every(([x,y,z,d,m])=>{const c=templateCells.get(`${x},${y},${z}`);return !!c&&d>=c.distance-1e-9&&m===c.material;});
}
/** One host-owned machine and at most one escrowed batch. Hydraulic energy is
 * consumed only once for each actual solver step, never inferred from water depth. */
export class WatermillSystem {
 state=freshWatermillState();flow=0;blockedReason='水車を組み立ててください。';
 private observedStep=-1;private frameRevision=-1;private intact=false;
 constructor(readonly field:VoxelField,readonly water:VoxelWater,readonly materials:Record<number,number>){}
 snapshot(){return clone(this.state);}
 restore(value:unknown){if(!validWatermillState(value))return false;this.state=clone(value);this.flow=0;this.observedStep=this.water.revision;this.frameRevision=-1;this.blockedReason='水流を確認しています。';return true;}
 private canPay(cost:Readonly<Record<number,number>>){return Object.entries(cost).every(([id,n])=>integer(this.materials[Number(id)],n,1e9));}
 private pay(cost:Readonly<Record<number,number>>){for(const [id,n] of Object.entries(cost))this.materials[Number(id)]-=n;}
 interactionStatus(c:WatermillContext):WatermillResult {
  if(c.authority!=='host')return result(false,'水車の操作はホストが行います。');
  if(!c.alive)return result(false,'復活してから操作してください。');
  if(!c.baseActive)return result(false,'先に拠点の炉を灯してください。');
  if(![c.position.x,c.position.y,c.position.z].every(Number.isFinite)||Math.hypot(c.position.x-WATERMILL_POSITION.x,c.position.y-WATERMILL_POSITION.y,c.position.z-WATERMILL_POSITION.z)>2.75)return result(false,'地下聖堂の水門レバー脇、東の水槽沿いの水車から2.75m以内へ。');
  const eye={...c.position,y:c.position.y+1.52},d={x:WATERMILL_POSITION.x-eye.x,y:WATERMILL_POSITION.y-eye.y,z:WATERMILL_POSITION.z-eye.z};
  const hit=this.field.ray(eye,d,Math.hypot(d.x,d.y,d.z));if(hit&&hit.cell.object!==WATERMILL_ID)return result(false,'水車の作業台が見える場所へ移動してください。');
  return result(true,'水車を操作できます。');
 }
 frameIntact(){
  if(this.frameRevision!==this.field.revision){this.frameRevision=this.field.revision;this.intact=true;for(const c of templateCells.values()){if(c.distance>=-.02||c.y<1)continue;const actual=this.field.get(c.x,c.y,c.z);if(!actual||actual.object!==WATERMILL_ID||actual.distance>c.distance+.00001||actual.material!==c.material){this.intact=false;break;}}}
  return this.state.built&&this.intact;
 }
 private geometryReason(c:WatermillContext){
  if(c.blockers.some(p=>p.x+.3>min.x&&p.x-.3<4.55&&p.z+.3>-2.22&&p.z-.3<max.z&&p.y<1.1&&p.y+1.8>-.05))return '作業台や羽根の場所に人・動物がいます。';
  for(const sample of templateCells.values()){if(sample.distance>=-.005)continue;const cell=this.field.at({x:(sample.x+.5)*this.field.size,y:(sample.y+.5)*this.field.size,z:(sample.z+.5)*this.field.size});if(cell&&cell.object!==WATERMILL_ID)return '作業台の場所に固体があります。';}
  for(const x of [3.25,3.75])for(const z of [-1.625,-1.125])if(this.field.distance({x,y:.2,z})>.035)return '作業台の四隅に地面の支えが必要です。';
  return this.rotorReason(c.blockers);
 }
 rotorReason(blockers:readonly Vec3[]=[]){
  if(blockers.some(p=>Math.abs(p.x-WATERMILL_ROTOR.x)<.43&&Math.abs(p.z-WATERMILL_ROTOR.z)<.6&&p.y<.7&&p.y+1.8>-.05))return '羽根の範囲に人・動物がいます。';
  for(let i=0;i<16;i++){const t=i*Math.PI/8;for(const radius of [.2,.33]){const p={x:WATERMILL_ROTOR.x,y:WATERMILL_ROTOR.y+Math.cos(t)*radius,z:WATERMILL_ROTOR.z+Math.sin(t)*radius},cell=this.field.at(p);if(cell&&cell.object!==WATERMILL_ID)return '水車の羽根が固体で塞がれています。';}}
  return '';
 }
 build(c:WatermillContext,repair=false):WatermillResult {
  const gate=this.interactionStatus(c);if(!gate.ok)return gate;
  if(repair?!this.state.built||this.frameIntact():this.state.built)return result(false,repair?'修理が必要な水車がありません。':'水車は設置済みです。');
  const blocked=this.geometryReason(c);if(blocked)return result(false,blocked);
  const cost=repair?WATERMILL_REPAIR:WATERMILL_COST;if(!this.canPay(cost))return result(false,repair?'修理には木材4・石2が必要です。':'設置には木材8・石4・金属2が必要です。');
  // All geometry/resources/actor checks precede either mutation. Repair preserves escrow.
  if(repair)this.field.removeObject(WATERMILL_ID);install(this.field);this.pay(cost);this.state.built=true;this.water.refreshSolids();this.frameRevision=-1;this.flow=0;this.blockedReason='水門を開いて水流を送ってください。';
  return result(true,repair?'水車を修理しました。投入済みの素材はそのままです。':'水車の織機を設置。隣の水門レバーを開き、草葉を投入してください。');
 }
 start(c:WatermillContext):WatermillResult {
  const gate=this.interactionStatus(c);if(!gate.ok)return gate;if(!this.frameIntact())return result(false,'先に水車を組み立てるか修理してください。');
  if(this.state.job)return result(false,'水車は一度に1件です。先に加工品を受け取ってください。');if(this.state.nextJobId>=1e9)return result(false,'加工番号の上限です。');if(!this.canPay({7:6}))return result(false,'草葉6が必要です。');
  this.pay({7:6});this.state.job={id:this.state.nextJobId++,recipe:'weave',remaining:WATERMILL_SECONDS};return result(true,'草葉6を投入。流れる水で布2を織ります。停止中も材料は保持します。');
 }
 claim(id:number,c:WatermillContext):WatermillResult {
  const gate=this.interactionStatus(c);if(!gate.ok)return gate;const job=this.state.job;if(!job||job.id!==id||job.remaining>0)return result(false,'受け取れる布がありません。');
  if(!integer(this.materials[10]??0,0,999997))return result(false,'布の所持上限です。');this.materials[10]=(this.materials[10]??0)+2;this.state.job=null;return result(true,'水車で織った布2を受け取りました。');
 }
 /** Called once, immediately after a 0.1s conservative fluid step, by CoreSimulation. */
 step(blockers:readonly Vec3[]=[]){
  if(this.observedStep===this.water.revision)return;this.observedStep=this.water.revision;
  this.flow=0;this.blockedReason=!this.state.built?'水車を組み立ててください。':!this.frameIntact()?'水車の作業台が破損しています。':this.rotorReason(blockers);if(this.blockedReason)return;
  const volume=this.water.downwardTransfer(2,9,24)+this.water.downwardTransfer(2,9,25);
  this.flow=volume/.1;
  if(this.flow<.00001){this.blockedReason='水流が止まっています。水門を開くか、羽根の上の水路を空けてください。満水では停止します。';return;}
  const powered=Math.min(1,this.flow/.005);this.state.angle=(this.state.angle+powered*.3)%(Math.PI*2);
  if(this.state.job)this.state.job.remaining=Math.max(0,this.state.job.remaining-.1*powered);
 }
}
