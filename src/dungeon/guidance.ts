import {blocked,distance,wallRay,solidWalls} from './world';
import type {Vec3} from '../prototype/core/voxel';
import type {Input,Snapshot} from './types';

export interface RaidGuidance {goal:'loot'|'return';title:string;detail:string;target:string;waypoint:Vec3;distance:number}
const eye=(p:Vec3)=>({...p,y:p.y+1.3});
const point=(x:number,z:number):Vec3=>({x,y:0,z});
/** Directions use the same horizontal body clearance as server movement. */
export function clearRouteSegment(from:Vec3,to:Vec3,seed:number,doors:Snapshot['doors']) {
 for(const wall of solidWalls(seed,doors)){
  let lo=0,hi=1;
  for(const axis of ['x','z'] as const){
   const delta=to[axis]-from[axis],min=wall.min[axis]-.3,max=wall.max[axis]+.3;
   if(Math.abs(delta)<1e-8){if(from[axis]<=min||from[axis]>=max){hi=-1;break;}}
   else {const a=(min-from[axis])/delta,b=(max-from[axis])/delta;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
  }
  if(lo<hi)return false;
 }
 return true;
}
const GRID=31;
const cell=(x:number,z:number)=>(z+15)*GRID+x+15;
interface RouteGraph {positions:Vec3[];edges:number[][];clear:boolean[]}
// Bounded memo of immutable wall topology. Door state is handled at the visible
// waypoint/action layer; no actor, room identity or saved progress enters it.
const graphs=new Map<number,RouteGraph>();
function routeGraph(seed:number):RouteGraph {
 const cached=graphs.get(seed);if(cached)return cached;
 const positions=Array.from({length:GRID*GRID},(_,index)=>point(index%GRID-15,Math.floor(index/GRID)-15));
 const clear=positions.map(p=>!blocked(p,seed,[],.35));
 const edges=positions.map((p,index)=>!clear[index]?[]:[[1,0],[-1,0],[0,1],[0,-1]].flatMap(([dx,dz])=>{
  const x=p.x+dx,z=p.z+dz;if(Math.abs(x)>15||Math.abs(z)>15)return [];
  const id=cell(x,z);return clear[id]&&clearRouteSegment(p,positions[id],seed,[])?[id]:[];
 }));
 const graph={positions,edges,clear};if(graphs.size>=2)graphs.delete(graphs.keys().next().value!);graphs.set(seed,graph);return graph;
}
/** A small navigation graph for directions only. Doors remain actions, never auto-open.
 * Neither enemies nor hidden container contents are used to plot the route. */
export function raidRoute(snapshot:Snapshot,from:Vec3,to:Vec3):Vec3[] {
 const openDoors=snapshot.doors.map(door=>({...door,open:true}));
 if(clearRouteSegment(from,to,snapshot.seed,openDoors))return [to];
 // Rounding next to a wall can land inside it. Attach the route to a nearby
 // visible, clear graph node instead of pretending the rounded cell is walkable.
 const starts:Vec3[]=[];
 for(let x=Math.floor(from.x)-1;x<=Math.ceil(from.x)+1;x++)for(let z=Math.floor(from.z)-1;z<=Math.ceil(from.z)+1;z++){
  const p=point(x,z);if(Math.abs(x)<=15&&Math.abs(z)<=15&&!blocked(p,snapshot.seed,openDoors,.35)&&clearRouteSegment(from,p,snapshot.seed,openDoors))starts.push(p);
 }
 starts.sort((a,b)=>distance(from,a)-distance(from,b));const start=starts[0];if(!start)return [];
 const graph=routeGraph(snapshot.seed),startId=cell(start.x,start.z);
 const queue=new Int32Array(GRID*GRID),parents=new Int32Array(GRID*GRID);parents.fill(-2);parents[startId]=-1;
 let count=1,reached=-1;queue[0]=startId;
 for(let index=0;index<count;index++){
  const id=queue[index],current=graph.positions[id];
  if(distance(current,to)<1.5&&clearRouteSegment(current,to,snapshot.seed,openDoors)){reached=id;break;}
  for(const next of graph.edges[id]){if(parents[next]!==-2)continue;parents[next]=id;queue[count++]=next;}
 }
 if(reached<0)return [];
 const route:Vec3[]=[to];
 for(let cursor=reached;cursor>=0;cursor=parents[cursor])route.unshift(graph.positions[cursor]);
 return route;
}
function routeDistance(from:Vec3,route:Vec3[]){let length=0,previous=from;for(const p of route){length+=distance(previous,p);previous=p;}return length;}
function nextWaypoint(snapshot:Snapshot,from:Vec3,route:Vec3[]){
 let next=route[0];
 for(const p of route){if(!clearRouteSegment(from,p,snapshot.seed,snapshot.doors))break;next=p;}
 return next;
}
const exitNames:Record<string,string>={'exit-west':'西の帰還灯','exit-east':'東の帰還灯','exit-north':'北の帰還灯'};
/** Contextual first-raid guidance; no persistent onboarding state or save mutation. */
export function raidGuidance(snapshot:Snapshot):RaidGuidance|null {
 const actor=snapshot.actors.find(value=>value.id===snapshot.you);
 if(snapshot.phase!=='raid'||actor?.status!=='alive')return null;
 const valuables=actor.bag.filter(item=>item.kind==='relic'||item.kind==='ore').reduce((n,item)=>n+item.count,0);
 const urgent=actor.hp<actor.maxHp*.4||snapshot.elapsed>390;
 const boxes=snapshot.containers.filter(box=>box.kind==='chest'&&!box.locked&&(!box.opened||box.items.length>0));
 const seekReturn=valuables>0||urgent||boxes.length===0;
 const candidates=(seekReturn?snapshot.exits.filter(exit=>exit.remaining>0):boxes).map(target=>{
  const route=raidRoute(snapshot,actor.position,target.position);
  const length=route.length?routeDistance(actor.position,route):Infinity;
  // Choose the soonest reachable extraction, rather than sending an injured
  // explorer to wait beside a locked portal while another is already open.
  const score='opensAt'in target?Math.max(length/2.5,target.opensAt-snapshot.elapsed):length;
  return {target,route,length,score};
 }).filter(candidate=>Number.isFinite(candidate.length)).sort((a,b)=>a.score-b.score||a.length-b.length);
 const choice=candidates[0];if(!choice)return null;
 const {target,route,length}=choice;
 const door=snapshot.doors.find(value=>!value.open&&distance(actor.position,value.position)<=2.6&&[actor.position,...route].some((p,index,points)=>{const q=points[index+1];if(!q||(p.z-value.position.z)*(q.z-value.position.z)>0||Math.abs(q.z-p.z)<.001)return false;const x=p.x+(q.x-p.x)*(value.position.z-p.z)/(q.z-p.z);return Math.abs(x-value.position.x)<3;})&&!wallRay(eye(actor.position),eye(value.position),snapshot.seed,snapshot.doors.filter(other=>other!==value)));
 let title:string,detail:string;
 if('opensAt'in target){const wait=Math.max(0,Math.ceil(target.opensAt-snapshot.elapsed));title=exitNames[target.id]??'帰還の光';detail=wait?`開通まで ${wait}秒 · 近くで備える`:'調べる → 4秒静止で持ち帰る';if(urgent)detail='体力・時間に注意 · '+detail;}
 else {title=target.opened?'戦利品を拾う':'最初の戦利品を探す';detail=target.opened?'調べる → 品物を選んで拾う':'箱に近づき「調べる」→ 1.5秒静止';}
 if(door)detail='進路の扉を「調べる」で開く';
 return {goal:seekReturn?'return':'loot',title,detail,target:target.id,waypoint:door?.position??nextWaypoint(snapshot,actor.position,route),distance:length};
}
export function guidanceBearing(from:Vec3,to:Vec3,look:Pick<Input,'yaw'>){
 const angle=Math.atan2(-(to.x-from.x),-(to.z-from.z))-look.yaw;
 const relative=Math.atan2(Math.sin(angle),Math.cos(angle));
 const direction=Math.round(-relative/(Math.PI/4));
 return ['↑','↗','→','↘','↓','↙','←','↖'][(direction+8)%8];
}
