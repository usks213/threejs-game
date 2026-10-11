import type {Vec3} from './voxel';
import type {RegionalEnemy,RegionalTactic} from './regions';

export type EnemyAwareness='patrol'|'alert'|'chase'|'search'|'return'|'dead';
export type EnemyAttackKind='melee'|'projectile'|'lunge'|'burst'|'summon';
interface AttackState {kind:EnemyAttackKind;remaining:number;duration:number;target:Vec3;origin:Vec3;serial:number;phase:1|2;radius:number}
/** JSON-safe state. Keep one instance for each definition.id; reset on respawn. */
export interface EnemyTacticState {
 id:number;home:Vec3;time:number;awareness:EnemyAwareness;awarenessTime:number;unseenTime:number;
 lastSeen:Vec3;patrolIndex:number;phase:1|2;attack:AttackState|null;cooldown:number;
 serial:number;generation:number;comboIndex:number;summoned:number;alive:boolean;
}
interface EventBase {eventId:string;enemyId:number;at:number;position:Vec3;phase:1|2}
export type EnemyTacticEvent=
 |EventBase&{type:'tell';kind:EnemyAttackKind;target:Vec3;duration:number;radius:number}
 |EventBase&{type:'cancel';reason:'death'|'lost-target'|'leash'}
 |EventBase&{type:'projectile';target:Vec3;velocity:Vec3;damage:number;radius:number;lifetime:number;element:'physical'|'mist'|'water'}
 |EventBase&{type:'lunge';target:Vec3;velocity:Vec3;damage:number;radius:number;duration:number}
 |EventBase&{type:'melee';target:Vec3;direction:Vec3;damage:number;radius:number;arc:number}
 |EventBase&{type:'burst';damage:number;radius:number;element:'ice'|'water'}
 |EventBase&{type:'summon';count:number;positions:Vec3[];summonKind:'mistling';maxAlive:number};
/** A VoxelField is accepted structurally. A non-null ray hit before the target blocks vision. */
export interface EnemySightField {ray(origin:Vec3,direction:Vec3,maxDistance:number):{distance:number}|null}
export interface EnemyTacticInput {
 definition:RegionalEnemy;position:Vec3;targetPosition:Vec3;hp:number;targetAlive:boolean;
 field:EnemySightField;dt:number;liveSummons?:number;forward?:Vec3;
}
export interface EnemyTacticOutput {velocity:Vec3;events:EnemyTacticEvent[];awareness:EnemyAwareness;phase:1|2}
const copy=(p:Vec3):Vec3=>({...p});
const zero=():Vec3=>({x:0,y:0,z:0});
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const planar=(a:Vec3,b:Vec3,speed=1):Vec3=>{const x=b.x-a.x,z=b.z-a.z,n=Math.hypot(x,z);return n>.001?{x:x/n*speed,y:0,z:z/n*speed}:zero();};
const aimed=(a:Vec3,b:Vec3,speed:number):Vec3=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,n=Math.hypot(x,y,z)||1;return{x:x/n*speed,y:y/n*speed,z:z/n*speed};};
const eye=(p:Vec3):Vec3=>({x:p.x,y:p.y+1.15,z:p.z});
export function createEnemyTacticState(definition:RegionalEnemy):EnemyTacticState {
 return{id:definition.id,home:copy(definition.position),time:0,awareness:'patrol',awarenessTime:0,unseenTime:0,lastSeen:copy(definition.position),patrolIndex:0,phase:1,attack:null,cooldown:0,serial:0,generation:0,comboIndex:0,summoned:0,alive:true};
}
export function resetEnemyTacticState(state:EnemyTacticState,definition:RegionalEnemy){const generation=state.generation+1;Object.assign(state,createEnemyTacticState(definition),{generation});return state;}
export function enemyCanSee(input:Pick<EnemyTacticInput,'position'|'targetPosition'|'targetAlive'|'field'|'forward'>,range=14){
 if(!input.targetAlive)return false;
 const from=eye(input.position),to=eye(input.targetPosition),d=distance(from,to);if(d>range)return false;if(d<.001)return true;
 if(input.forward&&d>2){const f=input.forward,n=Math.hypot(f.x,f.z),dx=to.x-from.x,dz=to.z-from.z,l=Math.hypot(dx,dz);if(n>.001&&l>.001&&(f.x*dx+f.z*dz)/(n*l)<-.2)return false;}
 const hit=input.field.ray(from,aimed(from,to,1),Math.max(0,d-.3));return !hit||hit.distance>=d-.3;
}
const ranges:Record<RegionalTactic,number>={melee:2,spear:2.8,charge:7,flier:6,archer:12,caster:10,summoner:11,shockwave:5.5,'tidal-combo':10};
function profile(tactic:RegionalTactic,phase:1|2,combo:number):{kind:EnemyAttackKind;windup:number;cooldown:number;radius:number}{
 switch(tactic){
  case 'archer':return{kind:'projectile',windup:.85,cooldown:1.7,radius:.14};
  case 'caster':return{kind:'projectile',windup:1.1,cooldown:2,radius:.28};
  case 'charge':return{kind:'lunge',windup:.8,cooldown:2.1,radius:.85};
  case 'flier':return{kind:'lunge',windup:.65,cooldown:1.8,radius:.7};
  case 'summoner':return combo%2===0?{kind:'summon',windup:1.6,cooldown:2.8,radius:3}:{kind:'projectile',windup:1.05,cooldown:1.7,radius:.3};
  case 'shockwave':return{kind:'burst',windup:phase===2?.95:1.25,cooldown:phase===2?1.55:2.2,radius:phase===2?6:4.5};
  case 'tidal-combo':{
   const kind:EnemyAttackKind=phase===2?(['lunge','burst','projectile'] as const)[combo%3]:(['projectile','burst'] as const)[combo%2];
   return{kind,windup:kind==='burst'?1.2:.95,cooldown:phase===2?1.1:1.8,radius:kind==='burst'?(phase===2?6:4):kind==='lunge'?1:.3};
  }
  case 'spear':return{kind:'melee',windup:.7,cooldown:1.2,radius:2.8};
  default:return{kind:'melee',windup:.9,cooldown:1.5,radius:2};
 }
}
function transition(state:EnemyTacticState,next:EnemyAwareness){if(state.awareness!==next){state.awareness=next;state.awarenessTime=0;}}
function eventBase(state:EnemyTacticState,position:Vec3,suffix:string):EventBase{return{eventId:`${state.id}:${state.generation}:${state.serial}:${suffix}`,enemyId:state.id,at:state.time,position:copy(position),phase:state.phase};}
function cancel(state:EnemyTacticState,input:EnemyTacticInput,events:EnemyTacticEvent[],reason:'death'|'lost-target'|'leash'){
 if(state.attack){events.push({...eventBase(state,input.position,'cancel'),type:'cancel',reason});state.attack=null;}
}
function release(state:EnemyTacticState,input:EnemyTacticInput,events:EnemyTacticEvent[]){
 const attack=state.attack!;const {definition:d,position}=input;const base={...eventBase(state,position,'release'),phase:attack.phase};
 const damage=Math.round(d.damage*(attack.phase===2?1.15:1));
 switch(attack.kind){
  case 'melee':events.push({...base,type:'melee',target:copy(attack.target),direction:planar(attack.origin,attack.target),damage,radius:attack.radius,arc:d.tactic==='spear'?.5:1.3});break;
  case 'projectile':{
   const origin=eye(position),target=eye(attack.target),element=d.tactic==='archer'?'physical':d.tactic==='tidal-combo'?'water':'mist';
   events.push({...base,position:origin,type:'projectile',target,velocity:aimed(origin,target,d.tactic==='archer'?12:8),damage,radius:attack.radius,lifetime:3,element});break;
  }
  case 'lunge':events.push({...base,type:'lunge',target:copy(attack.target),velocity:planar(attack.origin,attack.target,d.tactic==='flier'?10:12),damage,radius:attack.radius,duration:d.tactic==='flier'?.4:.48});break;
  case 'burst':events.push({...base,type:'burst',damage,radius:attack.radius,element:d.tactic==='shockwave'?'ice':'water'});break;
  case 'summon':{
   const live=Math.max(0,Math.floor(input.liveSummons??state.summoned)),count=Math.max(0,Math.min(attack.phase===2?2:1,3-live));
   if(count){const positions=Array.from({length:count},(_,i)=>({x:position.x+(i?1:-1)*1.6,y:position.y,z:position.z+1.3}));events.push({...base,type:'summon',count,positions,summonKind:'mistling',maxAlive:3});state.summoned+=count;}
   break;
  }
 }
 state.cooldown=profile(d.tactic,attack.phase,state.comboIndex).cooldown;state.comboIndex++;state.attack=null;
}
/** Pure controller boundary: mutates only the supplied state. It does not move actors,
 * touch voxels, reduce HP, spawn creatures, or call renderers. Resolve every release event
 * once by eventId, with normal collision/LOS checks at impact in the host simulation.
 * Caller reports current living summons, and rejects invalid spawn positions.
 * dt is finite elapsed seconds (0..5); larger catch-up steps are bounded to prevent runaway work. */
export function stepEnemyTactic(state:EnemyTacticState,input:EnemyTacticInput):EnemyTacticOutput {
 const events:EnemyTacticEvent[]=[];let velocity=zero();
 if(state.id!==input.definition.id)throw new Error('Enemy tactic state belongs to a different enemy');
 if(!Number.isFinite(input.hp)||input.hp<=0){if(state.alive){cancel(state,input,events,'death');state.alive=false;transition(state,'dead');}return{velocity,events,awareness:state.awareness,phase:state.phase};}
 if(!state.alive)return{velocity,events,awareness:state.awareness,phase:state.phase};
 let budget=Number.isFinite(input.dt)?Math.max(0,Math.min(5,input.dt)):0;
 const visible=budget>0&&enemyCanSee(input),leashed=distance(input.position,state.home)>22;
 while(budget>1e-9){const dt=Math.min(1/120,budget);budget-=dt;state.time+=dt;state.awarenessTime+=dt;
  const {definition:d,position,targetPosition}=input;
  state.phase=d.boss&&input.hp/d.hp<=.5?2:1;
  if(visible){state.lastSeen=copy(targetPosition);state.unseenTime=0;}else state.unseenTime+=dt;
  if(leashed){cancel(state,input,events,'leash');transition(state,'return');}
  else if(!input.targetAlive){cancel(state,input,events,'lost-target');transition(state,'return');}
  else if(state.awareness==='patrol'&&visible)transition(state,'alert');
  else if(state.awareness==='alert'&&state.awarenessTime>=.45)transition(state,visible?'chase':'search');
  else if(state.awareness==='chase'&&!visible&&state.unseenTime>=1.25)transition(state,'search');
  else if(state.awareness==='search'){if(visible)transition(state,'chase');else if(state.awarenessTime>=3)transition(state,'return');}
  else if(state.awareness==='return'&&distance(position,state.home)<.6)transition(state,'patrol');
  velocity=zero();
  if(state.awareness==='patrol'){
   const target={x:state.home.x+(state.patrolIndex%2?1.2:-1.2),y:state.home.y,z:state.home.z};if(distance(position,target)<.35)state.patrolIndex++;velocity=planar(position,target,.65);
  }else if(state.awareness==='search')velocity=distance(position,state.lastSeen)>.65?planar(position,state.lastSeen,1.15):zero();
  else if(state.awareness==='return')velocity=planar(position,state.home,1.8);
  else if(state.awareness==='chase'&&!state.attack){const dist=distance(position,targetPosition),range=ranges[d.tactic];
   if(!visible||dist>range*.88)velocity=planar(position,visible?targetPosition:state.lastSeen,d.tactic==='flier'?2.8:2.1);
   else if((d.tactic==='archer'||d.tactic==='caster')&&dist<3.5)velocity=planar(targetPosition,position,1.4);
  }
  if(state.attack){
   state.attack.remaining-=dt;
   if(state.attack.remaining<=1e-8){release(state,input,events);}
   continue;
  }
  state.cooldown=Math.max(0,state.cooldown-dt);
  if(state.awareness==='chase'&&visible&&state.cooldown<=0&&distance(position,targetPosition)<=ranges[d.tactic]){
   const attack=profile(d.tactic,state.phase,state.comboIndex);state.serial++;
   state.attack={kind:attack.kind,remaining:attack.windup,duration:attack.windup,target:copy(targetPosition),origin:copy(position),serial:state.serial,phase:state.phase,radius:attack.radius};
   events.push({...eventBase(state,position,'tell'),type:'tell',kind:attack.kind,target:copy(targetPosition),duration:attack.windup,radius:attack.radius});velocity=zero();
  }
 }
 return{velocity,events,awareness:state.awareness,phase:state.phase};
}

export interface CombatFocusState {value:number;confirmedHitIds:string[];spentActionIds:string[]}
export const createCombatFocus=():CombatFocusState=>({value:0,confirmedHitIds:[],spentActionIds:[]});
/** Supply a collision-confirmed hit ID, never an input/attack attempt ID. */
export function gainCombatFocus(state:CombatFocusState,hitId:string,amount=12){if(!hitId||!Number.isFinite(amount)||amount<=0||state.confirmedHitIds.includes(hitId))return false;state.confirmedHitIds.push(hitId);if(state.confirmedHitIds.length>256)state.confirmedHitIds.shift();state.value=Math.min(100,Math.max(0,state.value)+amount);return true;}
/** Action IDs make retries idempotent. Caller applies the skill only when this returns true. */
export function spendCombatFocus(state:CombatFocusState,actionId:string,cost=100){if(!actionId||!Number.isFinite(cost)||cost<=0||cost>100||state.spentActionIds.includes(actionId)||state.value<cost)return false;state.value-=cost;state.spentActionIds.push(actionId);if(state.spentActionIds.length>64)state.spentActionIds.shift();return true;}
