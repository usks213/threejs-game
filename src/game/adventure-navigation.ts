import type {GameSimulation} from '../simulation/game-simulation';
import type {EnemyState} from './types';
import {insideBounds,type Vec3} from '../world/types';
import {siteClear,siteSupport,siteWalkingContext} from './site-walking';

/** Local, transient navigation only. No world-wide navmesh or saved pursuit knowledge. */
export const NAVIGATION_LIMITS={expansionsPerTick:12,expansionsPerEnemy:3,expansionsPerJob:192,jobs:64,radius:12,cell:.75,edgeStep:.15,retryTicks:30,pathTicks:90} as const;
interface Node {point:Vec3;x:number;z:number;cost:number;score:number;parent?:Node}
interface Job {flying:boolean;start:Vec3;goal:Vec3;open:Node[];best:Map<string,number>;closed:Set<string>;expanded:number}
interface Route {enemy:EnemyState;goal:Vec3;seenTick:number;path:Vec3[];job?:Job;retry:number;expires:number}
interface Navigation {tick:number;revision:string;cursor:number;routes:Map<number,Route>;expanded:number;totalExpanded:number;invalidated:number;finished:number;failed:number}
const states=new WeakMap<GameSimulation,Navigation>();
const planar=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
const key=(x:number,z:number,y:number)=>x+','+z+','+Math.round(y*2);
function state(sim:GameSimulation):Navigation{let s=states.get(sim);if(!s){s={tick:-1,revision:'',cursor:0,routes:new Map(),expanded:0,totalExpanded:0,invalidated:0,finished:0,failed:0};states.set(sim,s);}return s;}
function revision(sim:GameSimulation):string{
 // Carves are append-only; doors and moved/replaced buildings can change without
 // changing the array length. Dynamic bodies/assemblies are rechecked live instead.
 return sim.world.edits.length+'|'+sim.adventure.state.buildings.map(b=>[b.id,b.x,b.y,b.z,b.rotation,b.open?1:0,b.removed?.length??0].join(',')).join(';');
}
/** One swept ground segment. Cardinal search edges and actual movement use this
 * same support rule; no diagonal corner shortcut and no unsupported centre. */
export function navigationGroundStep(sim:GameSimulation,from:Vec3,x:number,z:number):Vec3|undefined{
 const y=siteSupport(sim,x,z,from.y);if(y===undefined||Math.abs(y-from.y)>.5)return;
 const point={x,y,z};if(!insideBounds(point,sim.world.bounds,1)||!siteClear(sim,point))return;
 const ctx=siteWalkingContext(sim);
 if(!ctx.solid({x,y:y-.045,z}))return;
 // Existing siteClear samples the cylinder axes. Add its diagonal perimeter so
 // rotated/thin voxel corners cannot be clipped during the local detour.
 for(const dy of [.1,.8,1.55])for(const dx of [-.212,.212])for(const dz of [-.212,.212]){const p={x:x+dx,y:y+dy,z:z+dz};if(ctx.solid(p)||ctx.occupied?.(p))return;}
 return point;
}
function edge(sim:GameSimulation,from:Vec3,to:Vec3,flying=false):Vec3|undefined{
 const distance=planar(from,to),steps=Math.max(1,Math.ceil(distance/NAVIGATION_LIMITS.edgeStep));let at=from;
 for(let i=1;i<=steps;i++){const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;const next=flying?{x,y:from.y,z}:navigationGroundStep(sim,at,x,z);if(!next||flying&&(!insideBounds(next,sim.world.bounds,1)||!siteClear(sim,next)))return;at=next;}
 return at;
}
function start(enemy:EnemyState,goal:Vec3,flying:boolean):Job{const point={x:enemy.x,y:enemy.y,z:enemy.z};return {flying,start:point,goal:{...goal},open:[{point,x:0,z:0,cost:0,score:planar(point,goal)}],best:new Map([[key(0,0,point.y),0]]),closed:new Set(),expanded:0};}
function expand(sim:GameSimulation,route:Route,s:Navigation):void{
 const job=route.job!;let index=0;for(let i=1;i<job.open.length;i++)if(job.open[i].score<job.open[index].score)index=i;
 const node=job.open.splice(index,1)[0];if(!node){route.job=undefined;route.retry=sim.tick+NAVIGATION_LIMITS.retryTicks;s.failed++;return;}
 job.expanded++;s.expanded++;s.totalExpanded++;const id=key(node.x,node.z,node.point.y);job.closed.add(id);
 if(planar(node.point,job.goal)<NAVIGATION_LIMITS.cell&&(job.flying||Math.abs(node.point.y-job.goal.y)<1)){
  const path:Vec3[]=[];let at:Node|undefined=node;while(at?.parent){path.push(at.point);at=at.parent;}route.path=path.reverse();route.job=undefined;route.expires=sim.tick+NAVIGATION_LIMITS.pathTicks;s.finished++;return;
 }
 if(job.expanded>=NAVIGATION_LIMITS.expansionsPerJob){route.job=undefined;route.retry=sim.tick+NAVIGATION_LIMITS.retryTicks;s.failed++;return;}
 for(const [dx,dz]of[[1,0],[0,1],[-1,0],[0,-1]]){
  const x=node.x+dx,z=node.z+dz;if(Math.hypot(x,z)*NAVIGATION_LIMITS.cell>NAVIGATION_LIMITS.radius)continue;
  const target={x:job.start.x+x*NAVIGATION_LIMITS.cell,y:node.point.y,z:job.start.z+z*NAVIGATION_LIMITS.cell};
  const cost=node.cost+NAVIGATION_LIMITS.cell,estimate=key(x,z,node.point.y);if(job.closed.has(estimate)||(job.best.get(estimate)??Infinity)<=cost)continue;
  const point=edge(sim,node.point,target,job.flying);if(!point)continue;const id=key(x,z,point.y);if(job.closed.has(id)||(job.best.get(id)??Infinity)<=cost)continue;
  job.best.set(id,cost);job.open.push({point,x,z,cost,score:cost+planar(point,job.goal),parent:node});
 }
}
/** Called once at the beginning of the authority's ordinary-enemy tick. Jobs
 * queued later wait until the next tick. Round robin prevents first-enemy bias. */
export function stepAdventureNavigation(sim:GameSimulation,selected:ReadonlySet<number>):void{
 if(sim.world.generator!==4)return;const s=state(sim);if(s.tick===sim.tick)return;s.tick=sim.tick;s.expanded=0;
 const current=revision(sim);if(s.revision!==current){for(const route of s.routes.values()){if(route.job||route.path.length)s.invalidated++;route.path=[];route.job=undefined;route.retry=0;}s.revision=current;}
 for(const [id,route]of s.routes)if(route.enemy.health<=0||sim.tick-route.seenTick>90||!sim.adventure.state.enemies.includes(route.enemy))s.routes.delete(id);
 const queue=[...s.routes.values()].filter(r=>r.job&&selected.has(r.enemy.id));if(!queue.length)return;
 let cursor=s.cursor%queue.length,attempts=0;const slices=new Map<Route,number>();
 while(s.expanded<NAVIGATION_LIMITS.expansionsPerTick&&attempts<queue.length*NAVIGATION_LIMITS.expansionsPerEnemy){const route=queue[cursor];cursor=(cursor+1)%queue.length;attempts++;if(route.job&&(slices.get(route)??0)<NAVIGATION_LIMITS.expansionsPerEnemy){expand(sim,route,s);slices.set(route,(slices.get(route)??0)+1);}if(queue.every(r=>!r.job))break;}
 s.cursor=cursor;
}
/** Return a queued local waypoint, or wait. A new target is only supplied by the
 * enemy's actual observation/home logic, never by hidden player state. */
export function adventureWaypoint(sim:GameSimulation,enemy:EnemyState,goal:Vec3,flying=false):Vec3|undefined{
 const s=state(sim);let route=s.routes.get(enemy.id);
 if(!route){if(s.routes.size>=NAVIGATION_LIMITS.jobs)return;route={enemy,goal:{...goal},seenTick:sim.tick,path:[],retry:0,expires:0};s.routes.set(enemy.id,route);}
 route.seenTick=sim.tick;
 if(planar(route.goal,goal)>1||Math.abs(route.goal.y-goal.y)>1){route.goal={...goal};route.path=[];route.job=undefined;route.retry=0;}
 if(route.path.length&&route.expires<=sim.tick){route.path=[];route.retry=0;}
 while(route.path.length&&planar(enemy,route.path[0])<.12)route.path.shift();
 if(route.path.length)return route.path[0];
 if(!route.job&&sim.tick>=route.retry)route.job=start(enemy,route.goal,flying||enemy.definition==='veilray');
 return undefined;
}
export function invalidateAdventureRoute(sim:GameSimulation,enemy:EnemyState):void{const s=states.get(sim),route=s?.routes.get(enemy.id);if(route){route.path=[];route.job=undefined;route.retry=0;s!.invalidated++;}}
export function clearAdventureRoute(sim:GameSimulation,enemy:EnemyState):void{states.get(sim)?.routes.delete(enemy.id);}
export function hasAdventureRoute(sim:GameSimulation,enemy:EnemyState):boolean{const r=states.get(sim)?.routes.get(enemy.id);return !!r&&(!!r.job||r.path.length>0);}
export function navigationMetrics(sim:GameSimulation){const s=states.get(sim);return {expanded:s?.expanded??0,totalExpanded:s?.totalExpanded??0,jobs:[...s?.routes.values()??[]].filter(r=>r.job).length,paths:[...s?.routes.values()??[]].filter(r=>r.path.length).length,invalidated:s?.invalidated??0,finished:s?.finished??0,failed:s?.failed??0};}
