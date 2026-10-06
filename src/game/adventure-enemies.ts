import {BEGINNER_ENCOUNTER,inBeginnerArea,inEntryClearing,mayEnterEncounterPosition} from './entry-clearing';
import type {Adventure} from './adventure';
import type {EnemyState} from './types';
import type {Vec3} from '../world/types';
import type {GameSimulation} from '../simulation/game-simulation';
import {insideBounds} from '../world/types';
import {ENEMIES} from '../content/catalog';
import {ADVENTURE_ENEMY_IDS,ADVENTURE_LOOT} from '../content/adventure-encounters';
import {siteClear,siteWalkingContext} from './site-walking';
import {adventureWaypoint,clearAdventureRoute,hasAdventureRoute,invalidateAdventureRoute,navigationGroundStep,stepAdventureNavigation} from './adventure-navigation';
import {dropItem} from './interaction/drops';
export const ENCOUNTER_LIMITS={active:64,range:48,projectiles:64,moveSubsteps:8} as const;
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export const isOrdinaryAdventureEnemy=(e:EnemyState)=>!e.boss&&ADVENTURE_ENEMY_IDS.includes(e.definition);
const actors=(g:Adventure)=>g.sim.targets.length?g.sim.targets:[{player:g.sim.player,adventure:g}];
interface Budget {tick:number;selected:Set<number>;last:Map<number,number>;processed:number;nearby:Map<number,EnemyState[]>;pressure:Map<Vec3,EnemyState[]>}
const budgets=new WeakMap<GameSimulation,Budget>();
const lastSeen=new WeakMap<EnemyState,Vec3>();
function budget(game:Adventure):Budget{
 let b=budgets.get(game.sim);if(!b){b={tick:-1,selected:new Set(),last:new Map(),processed:0,nearby:new Map(),pressure:new Map()};budgets.set(game.sim,b);}if(b.tick===game.sim.tick)return b;b.tick=game.sim.tick;b.processed=0;b.selected.clear();
 const active=game.state.enemies.filter(e=>isOrdinaryAdventureEnemy(e)&&actors(game).some(a=>a.adventure.state.health>0&&distance(a.player,e)<ENCOUNTER_LIMITS.range));const start=active.length?(game.sim.tick*ENCOUNTER_LIMITS.active)%active.length:0;for(let i=0;i<Math.min(active.length,ENCOUNTER_LIMITS.active);i++)b.selected.add(active[(start+i)%active.length].id);
 const alive=active.filter(e=>e.health>0),cohort=alive.filter(e=>b.selected.has(e.id));b.nearby.clear();b.pressure.clear();
 // Cache candidates once per participant/tick. Their live windups are read later
 // so even opposite-side ranged enemies share one beginner attack slot.
 for(const actor of actors(game))if(inBeginnerArea(game.sim,actor.player))b.pressure.set(actor.player,alive.filter(e=>distance(e,actor.player)<BEGINNER_ENCOUNTER.sight+2));
 for(const e of cohort)b.nearby.set(e.id,cohort.filter(other=>other!==e&&distance(other,e)<8&&Math.abs(other.y-e.y)<2.5).sort((a,c)=>distance(a,e)-distance(c,e)||a.id-c.id).slice(0,8));
 stepAdventureNavigation(game.sim,b.selected);return b;
}
export function encounterMetrics(sim:GameSimulation):{processed:number;selected:number}{const b=budgets.get(sim);return {processed:b?.processed??0,selected:b?.selected.size??0};}
/** Sight tests world, carved buildings/trees, rocks and oriented assemblies on the authority. */
export function adventureSees(game:Adventure,from:Vec3,to:Vec3):boolean{
 const ctx=siteWalkingContext(game.sim),a={...from,y:from.y+.65},b={...to,y:to.y+.7},d=distance(a,b);if(d>ENCOUNTER_LIMITS.range)return false;
 for(let step=.2;step<d-.2;step+=.2){const t=step/d,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(ctx.solid(p)||ctx.occupied?.(p))return false;}return true;
}
function rotateToward(e:EnemyState,angle:number,amount:number):void{const old=e.heading??0,delta=Math.atan2(Math.sin(angle-old),Math.cos(angle-old));e.heading=old+Math.max(-amount,Math.min(amount,delta));}
function move(game:Adventure,e:EnemyState,target:Vec3,speed:number,dt:number,flying=false,slide=true):boolean{
 const d=distance(e,target);if(d<.05)return true;const travel=Math.min(d,speed*dt),steps=Math.min(ENCOUNTER_LIMITS.moveSubsteps,Math.max(1,Math.ceil(travel/.16))),dx=(target.x-e.x)/d*travel/steps,dy=(target.y-e.y)/d*travel/steps,dz=(target.z-e.z)/d*travel/steps;let moved=false;
 for(let step=0;step<steps;step++){let accepted=false;for(const [x,z]of slide?[[dx,dz],[dx,0],[0,dz]]:[[dx,dz]]){if(Math.abs(x)+Math.abs(z)<1e-8&&!flying)continue;const next={x:e.x+x,y:e.y+(flying?dy:0),z:e.z+z};if(!flying){const supported=navigationGroundStep(game.sim,e,next.x,next.z);if(!supported)continue;next.y=supported.y;}if(!insideBounds(next,game.sim.world.bounds,1)||!mayEnterEncounterPosition(game.sim,e,next)||!siteClear(game.sim,next))continue;Object.assign(e,next);moved=true;accepted=true;break;}if(!accepted)break;}
 return moved;
}
/** Follow a cached local detour when direct movement is blocked. Every actual
 * substep is checked against the live world; search results never move an actor. */
function navigate(game:Adventure,e:EnemyState,target:Vec3,speed:number,dt:number,flying=false):void{
 if(distance(e,target)<.25){clearAdventureRoute(game.sim,e);return;}
 if(hasAdventureRoute(game.sim,e)){const waypoint=adventureWaypoint(game.sim,e,target);if(waypoint&&!move(game,e,waypoint,speed,dt,flying,false))invalidateAdventureRoute(game.sim,e);return;}
 if(move(game,e,target,speed,dt,flying,false)){clearAdventureRoute(game.sim,e);return;}
 adventureWaypoint(game.sim,e,target,flying);
}
function shoot(game:Adventure,e:EnemyState,target:Vec3,damage:number,element:string):void{
 if(game.projectiles.filter(p=>p.owner?.startsWith('enemy:')).length>=ENCOUNTER_LIMITS.projectiles)return;
 const from={x:e.x,y:e.y+.75,z:e.z},toward={x:target.x,y:target.y+.7,z:target.z},d=Math.max(.1,distance(from,toward)),speed=8;
 game.projectiles.push({id:game.sim.allocateEntityId(),owner:'enemy:'+e.id,...from,vx:(toward.x-from.x)/d*speed,vy:(toward.y-from.y)/d*speed,vz:(toward.z-from.z)/d*speed,life:3,damage,element,radius:.16});
}
/** Returns true only for new-world ordinary roles; Generator 1/2/3 keep their original AI. */
export function stepAdventureEnemy(game:Adventure,e:EnemyState,dt:number):boolean{
 if(game.sim.world.generator!==4||!isOrdinaryAdventureEnemy(e))return false;
 const b=budget(game);if(!b.selected.has(e.id))return true;const previous=b.last.get(e.id);if(previous===game.sim.tick)return true;b.last.set(e.id,game.sim.tick);b.processed++;dt=Math.min(.2,previous===undefined?dt:(game.sim.tick-previous)/30);
 e.homeY??=e.y;const def=ENEMIES.find(d=>d.id===e.definition)!;
 const living=actors(game).filter(a=>a.adventure.state.health>0);if(!living.length)return true;
 if(e.health<=0){const home={x:e.homeX,y:e.homeY,z:e.homeZ};if(e.respawnAt!==undefined&&e.respawnAt<=game.state.seconds&&living.every(a=>distance(a.player,home)>18)&&siteClear(game.sim,home)){Object.assign(e,home);e.health=def.health*(1+(e.stars??0))*(1+(e.tier-1)*.4);e.cooldown=2;e.windup=0;e.attackReady={};e.attackKind='idle';delete e.respawnAt;lastSeen.delete(e);clearAdventureRoute(game.sim,e);}return true;}
 const water=game.sim.fluid.immersion(e,1.2);if(water>.35)e.burn=0;
 if((e.burn??0)>0){e.burn=Math.max(0,e.burn!-dt);game.hit(e,4.4*dt,'fire',false);if(e.health<=0)return true;}
 if((e.stagger??0)>0){e.stagger=Math.max(0,e.stagger!-dt);e.windup=0;e.attackKind='recover';return true;}
 // Peaceful target selection must not stop passive water motion or wet healing.
 const flow=game.sim.fluid.current(e);if(water>.05){move(game,e,{x:e.x+flow.x,y:e.y,z:e.z+flow.z},Math.min(3,Math.hypot(flow.x,flow.z))*water,dt,e.definition==='veilray');if(e.definition==='slime')e.health=Math.min(def.health*(1+(e.stars??0))*(1+(e.tier-1)*.4),e.health+dt*.8);}
 const threats=living.filter(a=>!inEntryClearing(game.sim,a.player));
 if(!threats.length){
  e.windup=0;e.alerted=0;e.attackKind='idle';if(e.attackReady)e.attackReady.dashUntil=0;lastSeen.delete(e);clearAdventureRoute(game.sim,e);
  const home={x:e.homeX,y:e.homeY,z:e.homeZ};if(distance(e,home)>1)navigate(game,e,home,def.speed*.6,dt,e.definition==='veilray');
  return true;
 }
 const target=threats.reduce((best,a)=>distance(a.player,e)<distance(best.player,e)?a:best),p=target.player,d=distance(p,e),beginner=inBeginnerArea(game.sim,p),visible=d<(beginner?BEGINNER_ENCOUNTER.sight:28)&&adventureSees(game,e,p),ready=e.attackReady??={};
 const damage=beginner?Math.min(def.damage,BEGINNER_ENCOUNTER.damage):def.damage,element=beginner?'physical':def.element;
 e.slow=Math.max(0,e.slow-dt);e.cooldown=Math.max(0,e.cooldown-dt);e.alerted=visible?(beginner?BEGINNER_ENCOUNTER.alert:6):Math.max(0,(beginner?Math.min(e.alerted??0,BEGINNER_ENCOUNTER.alert):e.alerted??0)-dt);if(visible)lastSeen.set(e,{x:p.x,y:p.y,z:p.z});
 const peers=b.nearby.get(e.id)??[];
 // Only a creature with direct sight can call. Calls carry a location, not live wall vision.
 if(visible&&!beginner&&!inBeginnerArea(game.sim,e)&&(ready.callAt??0)<=game.state.seconds){ready.callAt=game.state.seconds+1.5;for(const ally of peers)if(!inBeginnerArea(game.sim,ally)&&adventureSees(game,e,ally)){ally.alerted=Math.max(ally.alerted??0,4);lastSeen.set(ally,{x:p.x,y:p.y,z:p.z});}}
 if(e.definition==='cinderunner'&&(water>.35||beginner)&&((ready.dashUntil??0)>game.state.seconds||e.windup>0&&e.attackKind==='charge')){e.windup=0;ready.dashUntil=0;ready.recoverUntil=game.state.seconds+.8;e.cooldown=Math.max(e.cooldown,2);e.attackKind=beginner?'recover':'quenched';return true;}
 if(e.definition==='reedspitter'){
  const fire=game.state.buildings.find(f=>f.definition==='fire'&&(f.fuel??0)>0&&!f.open&&distance(f,e)<5&&adventureSees(game,e,f));
  if(fire){const length=Math.max(.1,Math.hypot(e.x-fire.x,e.z-fire.z));e.windup=0;e.attackKind='flee';navigate(game,e,{x:e.x+(e.x-fire.x)/length*3,y:e.y,z:e.z+(e.z-fire.z)/length*3},def.speed*1.2,dt);return true;}
 }
 if(e.definition==='cinderunner'&&(ready.dashUntil??0)>game.state.seconds){const aim=e.attackYaw??0,moved=move(game,e,{x:e.x+Math.sin(aim)*2,y:e.y,z:e.z+Math.cos(aim)*2},8,dt,false,false);if(!moved)ready.dashUntil=0;if(!ready.dashHit)for(const actor of threats)if(distance(actor.player,e)<1.4&&adventureSees(game,e,actor.player)){actor.adventure.hurtPlayer(inBeginnerArea(game.sim,actor.player)?BEGINNER_ENCOUNTER.damage:def.damage,inBeginnerArea(game.sim,actor.player)?'physical':'fire',actor.player,e);ready.dashHit=1;break;}e.attackKind='dash';return true;}
 if(e.windup>0){e.windup=Math.max(0,e.windup-dt);if(e.windup>0)return true;
  if(e.definition==='cinderunner'&&e.attackKind==='charge'){ready.dashUntil=game.state.seconds+.6;ready.dashHit=0;e.attackKind='dash';e.cooldown=3;return true;}
  if(visible){if(e.definition==='reedspitter'||e.definition==='veilray')shoot(game,e,p,damage,element);else if(d<(e.definition==='cinderunner'?1.65:def.reach)+.6)target.adventure.hurtPlayer(damage,e.definition==='cinderunner'&&water>.35?'physical':element,p,e);}
  e.cooldown=beginner?BEGINNER_ENCOUNTER.cooldown:e.definition==='slime'?2.8:2.2;ready.recoverUntil=game.state.seconds+.65;e.attackKind='recover';return true;
 }
 if((ready.recoverUntil??0)>game.state.seconds)return true;
 if(!visible){const remembered=lastSeen.get(e),searching=(e.alerted??0)>0&&remembered!==undefined,goal=searching?remembered:{x:e.homeX,y:e.homeY,z:e.homeZ};e.attackKind=searching?'pursue':'idle';if(distance(e,goal)>(searching?.35:1)){rotateToward(e,Math.atan2(goal.x-e.x,goal.z-e.z),dt*3);navigate(game,e,goal,def.speed*(searching?1:.6)*(beginner?BEGINNER_ENCOUNTER.speed:1),dt,e.definition==='veilray');}else clearAdventureRoute(game.sim,e);return true;}
 rotateToward(e,Math.atan2(p.x-e.x,p.z-e.z),dt*(e.definition==='shellguard'?1.8:5));
 const ranged=e.definition==='reedspitter'||e.definition==='veilray',charging=e.definition==='cinderunner'&&water<=.35&&!beginner,reach=ranged?(beginner?BEGINNER_ENCOUNTER.sight:12):charging?8:e.definition==='cinderunner'?1.65:def.reach+.25;
 const attackNeighbors=beginner?(b.pressure.get(p)??[]):peers;
 const attacking=attackNeighbors.filter(ally=>ally!==e&&(ally.windup>0||(ally.attackReady?.dashUntil??0)>game.state.seconds)).length;
 if(e.cooldown<=0&&d<reach&&attacking<(beginner?1:2)){e.windup=beginner?BEGINNER_ENCOUNTER.windup:charging?1.15:ranged?.8:e.definition==='slime'?.9:.65;e.attackKind=charging?'charge':ranged?'shot':e.definition==='slime'?'hop':'melee';e.attackYaw=Math.atan2(p.x-e.x,p.z-e.z);return true;}
 let destination:Vec3=p;let speed=def.speed*(beginner?BEGINNER_ENCOUNTER.speed:1)*(e.slow?.4:1)*(water>.1&&e.definition!=='slime'?.7:1);
 if(peers.length&&!beginner&&!ranged&&d>2){const dx=p.x-e.x,dz=p.z-e.z,planar=Math.max(.1,Math.hypot(dx,dz)),rank=peers.filter(ally=>ally.id<e.id).length,side=rank%2?1:-1;destination={x:p.x+dz/planar*side*1.8,y:p.y,z:p.z-dx/planar*side*1.8};}
 if(ranged){const planar=Math.max(.1,Math.hypot(p.x-e.x,p.z-e.z));if(d<5)destination={x:e.x+(e.x-p.x)/planar*3,y:e.y,z:e.z+(e.z-p.z)/planar*3};else if(d<9){const side=e.id%2?1:-1;destination={x:e.x+(p.z-e.z)/planar*side,y:e.y,z:e.z-(p.x-e.x)/planar*side};speed*=.45;}if(e.definition==='veilray')destination={...destination,y:Math.max(e.homeY,p.y+1.8)};}
 e.attackKind=e.definition==='shellguard'?'guard':peers.length&&!beginner?'flank':'pursue';if(d>(e.definition==='cinderunner'?1.65:def.reach)||ranged)navigate(game,e,destination,speed,dt,e.definition==='veilray');return true;
}
export function adventureGuardMultiplier(game:Adventure,e:EnemyState,element:string,source?:Vec3):number{
 if(game.sim.world.generator!==4||e.definition!=='shellguard'||element!=='physical'||e.windup>0||(e.stagger??0)>0||(e.attackReady?.recoverUntil??0)>game.state.seconds)return 1;
 const p=source??actors(game).find(a=>a.adventure.owner===game.owner)?.player??game.sim.player,dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);return d>.01&&(dx*Math.sin(e.heading??0)+dz*Math.cos(e.heading??0))/d>.4?.25:1;
}
export function dropAdventureEnemyLoot(game:Adventure,e:EnemyState):boolean{
 if(game.sim.world.generator!==4||!isOrdinaryAdventureEnemy(e))return false;e.respawnAt=game.state.seconds+180;
 for(const [kind,count]of Object.entries(ADVENTURE_LOOT[e.definition]))dropItem(game,kind,count,e);return true;
}
