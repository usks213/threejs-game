import {separatesContact} from './contact-separation';
import {number,record,vector} from '../../save/validation';
import {capsule,ellipsoid,VoxelField,type Hit,type Vec3} from './voxel';
import {extractSurface} from './surface';

export const NAGI_HOME=Object.freeze({x:-3.95,y:.27,z:4.8});
export const NAGI_BED=Object.freeze({x:-4.25,y:.7,z:2.75});
export const NAGI_WORK=Object.freeze({x:-4.25,y:.27,z:4.75});
export const NAGI_SOCIAL=Object.freeze({x:-1.75,y:.27,z:3.25});
export type NpcSchedule='work'|'social'|'rest';
export type NpcActivity=NpcSchedule|'sleep'|'shelter'|'walking'|'waiting'|'talking'|'recovering';
export interface NpcLifeState {version:1;position:Vec3;yaw:number;activity:NpcActivity;vy:number;grounded:boolean;accumulator:number;phase:number;talkSeconds:number;recovery:'none'|'overlap'|'void'}
export interface NpcLifeContext {field:VoxelField;hour:number;rain:boolean;bed:boolean;blockers?:readonly Vec3[]}
export const NPC_LIFE_RULES=Object.freeze({step:1/30,speed:.8,radius:.44,height:1.9,maxStep:.52,minX:-6.25,maxX:-.75,minZ:1.25,maxZ:6.25});
const r=NPC_LIFE_RULES,activities:readonly NpcActivity[]=['work','social','rest','sleep','shelter','walking','waiting','talking','recovering'];
const flatDistance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
const inCamp=(p:Vec3)=>p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;
export function npcSchedule(hour:number):NpcSchedule {const h=((hour%24)+24)%24;return h<6||h>=22?'rest':h>=8&&h<12||h>=14&&h<18?'work':'social';}
export function createNpcLifeState():NpcLifeState {return {version:1,position:{...NAGI_HOME},yaw:0,activity:'waiting',vy:0,grounded:false,accumulator:0,phase:0,talkSeconds:0,recovery:'none'};}
export function validNpcLifeState(v:unknown):v is NpcLifeState {
 if(!record(v)||Object.keys(v).length!==10||!Object.keys(v).every(k=>Object.hasOwn(createNpcLifeState(),k))||v.version!==1||!vector(v.position)||Object.keys(v.position).length!==3||!inCamp(v.position)||!number(v.position.y,-8,3)||!number(v.yaw,-Math.PI,Math.PI)||!activities.includes(v.activity as NpcActivity)||!number(v.vy,-8,0)||typeof v.grounded!=='boolean'||!number(v.accumulator,0,r.step-Number.EPSILON)||!number(v.phase,0,60-Number.EPSILON)||!number(v.talkSeconds,0,4)||!['none','overlap','void'].includes(String(v.recovery)))return false;
 return v.recovery==='none'?v.activity!=='recovering':v.activity==='recovering'&&!v.grounded&&v.vy===0&&(v.recovery!=='void'||v.position.y===-8);
}

/** Protected, local SDF pose fields. Shared extracted surfaces and targeting use
 * the same vertices. No actor animation ever edits or remeshes world terrain. */
export type NpcPose='stand'|'work-a'|'work-b'|'social-a'|'social-b'|'sleep'|'rest'|'walk-a'|'walk-b';
const bodies=new Map<NpcPose,{field:VoxelField;surface:ReturnType<typeof extractSurface>}>();
export function npcBody(pose:NpcPose){
 const cached=bodies.get(pose);if(cached)return cached;const f=new VoxelField(.0625),id='artisan';
 const limb=(a:Vec3,b:Vec3,radius:number,m=10)=>f.shape({x:Math.min(a.x,b.x)-radius,y:Math.min(a.y,b.y)-radius,z:Math.min(a.z,b.z)-radius},{x:Math.max(a.x,b.x)+radius,y:Math.max(a.y,b.y)+radius,z:Math.max(a.z,b.z)+radius},capsule(a,b,radius),m,id);
 const orb=(p:Vec3,s:Vec3,m=5)=>f.shape({x:p.x-s.x,y:p.y-s.y,z:p.z-s.z},{x:p.x+s.x,y:p.y+s.y,z:p.z+s.z},ellipsoid(p,s),m,id);
 const sitting=pose==='sleep'||pose==='rest',hip=sitting?.38:.85,head=sitting?1.02:1.6;
 limb({x:0,y:hip,z:0},{x:0,y:head-.3,z:0},.23);orb({x:0,y:head,z:pose==='sleep'?-.06:0},{x:.19,y:.22,z:.19});
 for(const sign of [-1,1]){const x=sign*.13,step=pose==='walk-a'?sign*.10:pose==='walk-b'?-sign*.10:0;limb({x,y:hip,z:0},{x,y:sitting?.28:.12,z:sitting?-.25:step},.105,4);orb({x,y:.10,z:sitting?-.26:-.05+step},{x:.11,y:.10,z:.16},5);}
 limb({x:-.22,y:head-.33,z:0},{x:-.27,y:head-.68,z:-.10},.085);
 const working=pose.startsWith('work'),waving=pose.startsWith('social'),hand={x:.27,y:working?(pose==='work-a'?1.55:1.03):waving?(pose==='social-a'?1.75:1.5):head-.68,z:working?-.24:0};
 limb({x:.22,y:head-.33,z:0},hand,.085);if(working){limb(hand,{...hand,y:hand.y+.2},.045,4);limb({x:hand.x-.10,y:hand.y+.2,z:hand.z},{x:hand.x+.10,y:hand.y+.2,z:hand.z},.075,6);}
 const surface=extractSurface(f);for(const c of f.cells.values())Object.freeze(c);f.dirty.clear();const result={field:f,surface};bodies.set(pose,result);return result;
}

/** Only the authoritative CoreSimulation ticks this actor. The rescue/reward
 * ledger stays in CampaignSystem. This class cannot grant any item or XP. */
export class NpcLife {
 state:NpcLifeState|null=null;
 private route:Vec3[]=[];private goalKey='';private retry=0;private reconciled:NpcLifeState|null=null;
 get position(){return this.state?.position??NAGI_HOME;}
 get visible(){return !!this.state&&this.state.recovery==='none';}
 get pose():NpcPose {const s=this.state;if(s?.activity==='sleep')return 'sleep';if(s?.activity==='rest')return 'rest';if(s?.activity==='walking')return s.phase%.7<.35?'walk-a':'walk-b';if(s?.activity==='work')return s.phase%1<.5?'work-a':'work-b';if(s?.activity==='social'||s?.activity==='talking')return s.phase%2<1?'social-a':'social-b';return 'stand';}
 get label(){return this.state?({work:'炉で道具の手入れ',social:'炉辺で交流',rest:'休息 · 屋根付きの寝床を用意',sleep:'寝床で就寝',shelter:'雨宿り',walking:'移動中',waiting:'通路の空きを待っている',talking:'会話中',recovering:'安全な足場を待っている'} as const)[this.state.activity]:'';}
 snapshot(){return this.state?structuredClone(this.state):null;}
 restore(value:unknown){if(value!==null&&!validNpcLifeState(value))return false;this.state=value?structuredClone(value as NpcLifeState):null;this.route=[];this.goalKey='';this.retry=0;this.reconciled=null;return true;}
 /** Existing rescue transfers to the camp once. Old saves keep their rewards
  * and gain only an actor; their frozen authored baseline is never replaced. */
 reconcile(rescued:boolean,context:NpcLifeContext){
  if(!rescued){this.restore(null);return;}
  if(!this.state)this.state=createNpcLifeState();
  if(this.reconciled===this.state)return;
  this.reconciled=this.state;context.field.removeObject('artisan');
  if(this.state.recovery==='none'&&this.overlapsTerrain(context.field,this.position)){this.state.recovery='overlap';this.state.activity='recovering';this.state.grounded=false;this.state.vy=0;}
  if(this.state.recovery!=='none')this.recover(context);
 }
 overlapsTerrain(field:VoxelField,p=this.position){return field.overlaps(p,r.radius,r.height);}
 overlaps(p:Vec3,radius=.27,height=1.65){return this.visible&&p.y+height>this.position.y&&this.position.y+r.height>p.y&&flatDistance(p,this.position)<radius+r.radius;}
 private blocked(p:Vec3,c:NpcLifeContext,from?:Vec3){return this.overlapsTerrain(c.field,p)||(c.blockers??[]).some(b=>Math.abs(b.y-p.y)<1.8&&flatDistance(b,p)<.72&&!(from&&Math.abs(b.y-from.y)<1.8&&flatDistance(b,from)<.72&&separatesContact(from,p,b)));}
 private floor(x:number,z:number,field:VoxelField,from=1.28):Vec3|null {
  let high=-Infinity,low=Infinity,supported=false;
  for(const [dx,dz] of [[0,0],[-.4,-.4],[-.4,.4],[.4,-.4],[.4,.4]]){const hit=field.ray({x:x+dx,y:from,z:z+dz},{x:0,y:-1,z:0},1.5);if(!hit)return null;supported ||=hit.normal.y>=.45;high=Math.max(high,hit.point.y);low=Math.min(low,hit.point.y);}
  if(!supported||high-low>r.maxStep)return null;const p={x,y:high+.015,z};return inCamp(p)&&!this.overlapsTerrain(field,p)?p:null;
 }
 private clearStep(a:Vec3,b:Vec3,c:NpcLifeContext,actors=true){
  if(Math.abs(b.y-a.y)>r.maxStep||!inCamp(b))return false;
  // Sweep up before a stair and across its top. Every intermediate capsule is
  // tested, so a roof, thin wall or an occupied step cannot be skipped.
  const y=Math.max(a.y,b.y),steps=Math.max(1,Math.ceil(Math.max(flatDistance(a,b),Math.abs(b.y-a.y))/.08));
  for(let i=1;i<=steps;i++){const t=i/steps,up={x:a.x,y:a.y+(y-a.y)*t,z:a.z},p={x:a.x+(b.x-a.x)*t,y,z:a.z+(b.z-a.z)*t};if(this.overlapsTerrain(c.field,up)||(actors?this.blocked(p,c,a):this.overlapsTerrain(c.field,p)))return false;}
  return true;
 }
 private sheltered(p:Vec3,c:NpcLifeContext){return !!c.field.ray({x:p.x,y:p.y+r.height+.04,z:p.z},{x:0,y:1,z:0},3.5);}
 private bedReady(c:NpcLifeContext){const hit=c.field.ray({x:NAGI_BED.x,y:1.3,z:NAGI_BED.z},{x:0,y:-1,z:0},1.2);return c.bed&&hit?.cell.object==='build:home:bed'&&this.sheltered(NAGI_BED,c);}
 private destination(c:NpcLifeContext):{point:Vec3;activity:NpcActivity} {
  if(npcSchedule(c.hour)==='rest')return this.bedReady(c)?{point:NAGI_BED,activity:'sleep'}:{point:NAGI_WORK,activity:'rest'};
  if(c.rain){for(const p of [NAGI_BED,NAGI_WORK,NAGI_SOCIAL])if(this.sheltered(p,c))return {point:p,activity:'shelter'};}
  const activity=npcSchedule(c.hour);return {point:activity==='work'?NAGI_WORK:NAGI_SOCIAL,activity};
 }
 /** Bounded 12x11 cardinal graph. Cached route follows actual supported ground;
  * dynamic actors yield locally, without moving people or editing their builds. */
 private plan(target:Vec3,c:NpcLifeContext){
  const points:(Vec3|null)[]=[],width=12,height=11;for(let z=0;z<height;z++)for(let x=0;x<width;x++)points.push(this.floor(r.minX+x*.5,r.minZ+z*.5,c.field));
  const goal=points.reduce((best,p,i)=>p&&flatDistance(p,target)<.26?i:best,-1);if(goal<0)return [];
  const starts=points.map((p,i)=>({p,i,d:p?flatDistance(p,this.position):Infinity})).filter(v=>v.p&&v.d<.85).sort((a,b)=>a.d-b.d),start=starts.find(v=>this.clearStep(this.position,v.p!,c,false));if(!start)return [];
  const queue=[start.i],parents=new Map<number,number>([[start.i,-1]]);let found=false;
  for(let q=0;q<queue.length;q++){const i=queue[q];if(i===goal){found=true;break;}const x=i%width,z=Math.floor(i/width);for(const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){if(nx<0||nx>=width||nz<0||nz>=height)continue;const j=nz*width+nx;if(parents.has(j)||!points[j]||!this.clearStep(points[i]!,points[j]!,c,false))continue;parents.set(j,i);queue.push(j);}}
  if(!found)return [];const route:Vec3[]=[];for(let i=goal;i>=0;i=parents.get(i)!)route.unshift(points[i]!);return route;
 }
 private yieldToActors(c:NpcLifeContext){
  const nearby=(c.blockers??[]).filter(p=>Math.abs(p.y-this.position.y)<1.8&&flatDistance(p,this.position)<1.15).sort((a,b)=>flatDistance(a,this.position)-flatDistance(b,this.position))[0];if(!nearby)return false;
  const angle=Math.atan2(this.position.z-nearby.z,this.position.x-nearby.x),distance=flatDistance(nearby,this.position);
  for(const turn of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]){const p=this.floor(this.position.x+Math.cos(angle+turn)*r.speed*r.step,this.position.z+Math.sin(angle+turn)*r.speed*r.step,c.field);if(!p||flatDistance(p,nearby)<=distance+.001||!this.clearStep(this.position,p,c))continue;this.state!.yaw=Math.atan2(-(p.x-this.position.x),-(p.z-this.position.z));Object.assign(this.position,p);this.state!.activity='walking';return true;}return false;
 }
 private recover(c:NpcLifeContext){
  if(this.retry>0)return;this.retry=1;
  for(const source of [this.position,NAGI_HOME,NAGI_WORK,NAGI_SOCIAL,{x:-4.75,y:.25,z:3.75}]){const p=this.floor(source.x,source.z,c.field);if(!p||this.blocked(p,c))continue;Object.assign(this.state!,{position:p,vy:0,grounded:true,recovery:'none',activity:'waiting'});this.route=[];this.goalKey='';return;}
 }
 talk(eye:Vec3,field:VoxelField){
  if(!this.visible||Math.hypot(eye.x-this.position.x,eye.y-(this.position.y+1),eye.z-this.position.z)>2.8)return {ok:false,message:'ナギが見える場所まで近づいてください'};
  const direction={x:this.position.x-eye.x,y:this.position.y+.9-eye.y,z:this.position.z-eye.z};if(!this.ray(eye,direction,3,field))return {ok:false,message:'遮蔽物の向こうからは話せません'};
  const label=this.label;this.state!.talkSeconds=4;this.state!.activity='talking';return {ok:true,message:'ナギ「'+(label.includes('寝床')||label.includes('休息')?'夜は屋根付きの寝床で休む。床と通路を空けてくれると助かる。':label.includes('待って')?'通路が塞がっているようだ。建築を直せば歩いて戻れる。':'朝と午後は炉で道具を手入れし、昼と夕方は皆と過ごす。装備は炉のそばで作れる。')+'」'};
 }
 ray(origin:Vec3,d:Vec3,range:number,terrain?:VoxelField):Hit|null {
  if(!this.visible)return null;const s=this.state!,n=Math.hypot(d.x,d.y,d.z);if(n<1e-9)return null;
  const q={x:s.position.x-origin.x,y:s.position.y+.9-origin.y,z:s.position.z-origin.z},along=(q.x*d.x+q.y*d.y+q.z*d.z)/n;if(along< -1||along>range+1||q.x*q.x+q.y*q.y+q.z*q.z-along*along>1.5)return null;
  const c=Math.cos(s.yaw),sn=Math.sin(s.yaw),x=origin.x-s.position.x,z=origin.z-s.position.z,hit=npcBody(this.pose).field.ray({x:c*x-sn*z,y:origin.y-s.position.y,z:sn*x+c*z},{x:c*d.x-sn*d.z,y:d.y,z:sn*d.x+c*d.z},range);if(!hit)return null;
  if(terrain){const wall=terrain.ray(origin,d,hit.distance);if(wall&&wall.distance<hit.distance-.005)return null;}
  return {...hit,point:{x:s.position.x+c*hit.point.x+sn*hit.point.z,y:s.position.y+hit.point.y,z:s.position.z-sn*hit.point.x+c*hit.point.z},normal:{x:c*hit.normal.x+sn*hit.normal.z,y:hit.normal.y,z:-sn*hit.normal.x+c*hit.normal.z}};
 }
 tick(dt:number,c:NpcLifeContext){
  if(!this.state||!Number.isFinite(dt)||dt<=0)return;const s=this.state;s.accumulator+=Math.min(dt,.5);
  while(s.accumulator>=r.step-1e-9){s.accumulator=Math.max(0,s.accumulator-r.step);if(s.accumulator<1e-9)s.accumulator=0;s.phase=(s.phase+r.step)%60;this.retry=Math.max(0,this.retry-r.step);s.talkSeconds=Math.max(0,s.talkSeconds-r.step);
   if(s.recovery!=='none'){this.recover(c);continue;}
   // Removing the floor triggers gravity, never hovering or walking over a pit.
   const support=this.floor(s.position.x,s.position.z,c.field);const supported=!!support&&Math.abs(support.y-s.position.y)<.07;
   if(!supported){s.grounded=false;s.vy=Math.max(-8,s.vy-12*r.step);const fall={...s.position,y:s.position.y+s.vy*r.step};if(!this.overlapsTerrain(c.field,fall))s.position.y=fall.y;else{s.vy=0;s.grounded=true;}if(s.position.y< -8){s.position.y=-8;s.recovery='void';s.activity='recovering';s.vy=0;s.grounded=false;}continue;}s.vy=0;s.grounded=true;
   if(s.talkSeconds>0){s.activity='talking';continue;}
   if(this.yieldToActors(c))continue;
   const dest=this.destination(c),key=dest.activity+':'+dest.point.x+':'+dest.point.z;
   if(flatDistance(s.position,dest.point)<1.5&&(c.blockers??[]).some(b=>Math.abs(b.y-dest.point.y)<1.8&&flatDistance(b,dest.point)<1.15)){s.activity='waiting';continue;}
   if(flatDistance(s.position,dest.point)<.08){s.activity=dest.activity;s.yaw=dest.activity==='work'?Math.PI/2:0;continue;}
   if(key!==this.goalKey||!this.route.length&&this.retry===0){this.goalKey=key;this.route=this.plan(dest.point,c);this.retry=2;}
   while(this.route.length&&flatDistance(s.position,this.route[0])<.04)this.route.shift();
   const next=this.route[0];if(!next){s.activity='waiting';continue;}
   const distance=flatDistance(s.position,next),amount=Math.min(distance,r.speed*r.step),p=this.floor(s.position.x+(next.x-s.position.x)/distance*amount,s.position.z+(next.z-s.position.z)/distance*amount,c.field);
   if(!p||!this.clearStep(s.position,p,c)){s.activity='waiting';if(this.retry===0){this.route=[];this.goalKey='';}continue;}
   s.yaw=Math.atan2(-(p.x-s.position.x),-(p.z-s.position.z));Object.assign(s.position,p);s.activity='walking';
  }
 }
}
