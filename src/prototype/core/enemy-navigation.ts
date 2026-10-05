import type {Vec3} from './voxel';
import type {EnemyAwareness} from './enemy-tactics';

/** Stable controller-owned identity; ordinary guards adapt perception without
 * replacing their authored blade/attack state with regional tactics. */
export interface EnemyNavigationState {id:number;home:Vec3;lastSeen:Vec3;awareness:EnemyAwareness|'idle';patrolIndex:number;attack:unknown|null}

/** Local SDF queries only. Navigation never edits terrain or actor position. */
export interface EnemyNavigationField {
 readonly revision:number;
 overlaps(position:Vec3,radius:number,height:number):boolean;
 ray(origin:Vec3,direction:Vec3,distance:number):{point:Vec3;normal:Vec3}|null;
}
export const ENEMY_NAVIGATION_LIMITS={cell:.4,radius:9,expansions:64,surfaceProbes:400,replanSeconds:.75,safetySeconds:.15,stuckSeconds:2.5,progressSeconds:8} as const;
const UP=.26,DOWN=.42,RADIUS=.27,HEIGHT=1.7;
const zero=():Vec3=>({x:0,y:0,z:0});
const flat=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
const toward=(a:Vec3,b:Vec3,speed:number):Vec3=>{const d=flat(a,b);return d>.001?{x:(b.x-a.x)/d*speed,y:0,z:(b.z-a.z)/d*speed}:zero();};

class SurfaceProbe {
 count=0;
 constructor(private readonly field:EnemyNavigationField){}
 floor(point:Vec3):Vec3|null {
  if(++this.count>ENEMY_NAVIGATION_LIMITS.surfaceProbes)return null;
  let high=-Infinity,low=Infinity;
  for(const [x,z] of [[0,0],[.19,0],[-.19,0],[0,.19],[0,-.19]]){
   const hit=this.field.ray({x:point.x+x,y:point.y+UP+.025,z:point.z+z},{x:0,y:-1,z:0},UP+DOWN+.035);
   if(!hit||hit.normal.y<.5)return null;
   high=Math.max(high,hit.point.y);low=Math.min(low,hit.point.y);
  }
  if(high-point.y>UP+.015||point.y-low>DOWN||high-low>UP+.025)return null;
  const supported={x:point.x,y:high+.012,z:point.z};
  return this.field.overlaps(supported,RADIUS,HEIGHT)?null:supported;
 }
 segment(from:Vec3,to:Vec3):Vec3|null {
  const n=Math.max(1,Math.ceil(flat(from,to)/.25));let previous=from;
  for(let i=1;i<=n;i++){
   const next=this.floor({x:from.x+(to.x-from.x)*i/n,y:previous.y,z:from.z+(to.z-from.z)*i/n});
   if(!next)return null;
   previous=next;
  }
  return previous;
 }
}
interface Node {x:number;z:number;position:Vec3;cost:number;score:number;parent:Node|null;closed:boolean}
/** Bounded 7.2m local graph. A path cannot cut corners: each edge checks its
 * intervening capsule and supporting footprint, including the height change. */
function plan(probe:SurfaceProbe,origin:Vec3,goal:Vec3,side:number):Vec3[] {
 const {cell,radius,expansions}=ENEMY_NAVIGATION_LIMITS;
 const start:Node={x:0,z:0,position:{...origin},cost:0,score:flat(origin,goal),parent:null,closed:false};
 const nodes=new Map<string,Node>([['0,0',start]]),open=[start];let best=start;
 // A deterministic tie break survives replans instead of alternating around a tree.
 const neighbors=[[0,1],[side,0],[0,-1],[-side,0],[side,1],[side,-1],[-side,1],[-side,-1]];
 for(let expanded=0;open.length&&expanded<expansions&&probe.count<ENEMY_NAVIGATION_LIMITS.surfaceProbes;expanded++){
  open.sort((a,b)=>a.score-b.score);const current=open.shift()!;current.closed=true;
  if(flat(current.position,goal)<flat(best.position,goal)-.001)best=current;
  if(flat(current.position,goal)<cell*.7)break;
  for(const [dx,dz] of neighbors){
   const x=current.x+dx,z=current.z+dz;if(Math.abs(x)>radius||Math.abs(z)>radius)continue;
   const key=`${x},${z}`,existing=nodes.get(key),cost=current.cost+Math.hypot(dx,dz)*cell;
   if(existing&&(existing.closed||cost>=existing.cost))continue;
   const point=probe.segment(current.position,{x:origin.x+x*cell,y:current.position.y,z:origin.z+z*cell});if(!point)continue;
   const node:Node=existing??{x,z,position:point,cost,score:0,parent:current,closed:false};
   Object.assign(node,{position:point,cost,score:cost+flat(point,goal)*1.15,parent:current});
   if(!existing){nodes.set(key,node);open.push(node);}
  }
 }
 if(best===start||flat(best.position,goal)>flat(origin,goal)-.2)return [];
 const path:Vec3[]=[];for(let node:Node|null=best;node?.parent;node=node.parent)path.unshift(node.position);return path;
}
interface NavigationMemory {
 route:Vec3[];goal:Vec3;mode:string;retry:number;safety:number;revision:number;safeVelocity:Vec3;checkedVelocity:Vec3;
 previous:Vec3;attempted:boolean;stuck:number;withoutProgress:number;bestDistance:number;
 returning:boolean;rest:number;
}
export interface EnemyNavigationResult {velocity:Vec3;disengage:boolean;holding:boolean}
/** One instance per simulation; transient routes are rebuilt after restore.
 * Core.move remains responsible for terrain, actors, step-up and actual motion. */
export class EnemyLocalNavigation {
 private states=new WeakMap<EnemyNavigationState,NavigationMemory>();
 reset(){this.states=new WeakMap();}
 step(state:EnemyNavigationState,position:Vec3,desired:Vec3,field:EnemyNavigationField,elapsed:number):EnemyNavigationResult {
  const dt=Number.isFinite(elapsed)?Math.max(0,Math.min(.1,elapsed)):0;
  const speed=Math.hypot(desired.x,desired.z);
  let goal=state.awareness==='return'?state.home:state.awareness==='patrol'?{x:state.home.x+(state.patrolIndex%2?1.2:-1.2),y:state.home.y,z:state.home.z}:state.lastSeen;
  // A ranged enemy retreating from a close target retains its requested direction.
  if((goal.x-position.x)*desired.x+(goal.z-position.z)*desired.z<-.001)goal={x:position.x+desired.x/Math.max(speed,.001)*2,y:position.y,z:position.z+desired.z/Math.max(speed,.001)*2};
  let memory=this.states.get(state);
  if(!memory){memory={route:[],goal:{...goal},mode:state.awareness,retry:0,safety:0,revision:-1,safeVelocity:zero(),checkedVelocity:zero(),previous:{...position},attempted:false,stuck:0,withoutProgress:0,bestDistance:flat(position,goal),returning:false,rest:0};this.states.set(state,memory);}
  memory.retry=Math.max(0,memory.retry-dt);memory.safety-=dt;memory.rest=Math.max(0,memory.rest-dt);
  if(memory.attempted){memory.stuck=flat(position,memory.previous)<dt*.12?memory.stuck+dt:Math.max(0,memory.stuck-dt*2);}
  memory.previous={...position};memory.attempted=false;
  if(state.awareness==='dead'||!dt)return{velocity:zero(),disengage:false,holding:false};
  // Once home is reached after a failed pursuit, briefly hold before reacquiring.
  if(memory.returning&&flat(position,state.home)<.65){memory.returning=false;memory.rest=3;memory.route=[];memory.safety=0;}
  if(memory.rest>0)return{velocity:zero(),disengage:true,holding:true};
  const changed=state.awareness!==memory.mode||flat(goal,memory.goal)>1.5;
  if(changed){memory.route=[];memory.safety=0;memory.mode=state.awareness;memory.goal={...goal};memory.bestDistance=flat(position,goal);memory.withoutProgress=0;memory.stuck=0;}
  const heightBlocked=(state.awareness==='chase'||state.awareness==='search')&&!state.attack&&Math.abs(goal.y-position.y)>.6&&flat(position,goal)<.3;
  if(speed<.01&&!heightBlocked){memory.stuck=0;return{velocity:zero(),disengage:false,holding:false};}
  if(flat(position,goal)<memory.bestDistance-.3){memory.bestDistance=flat(position,goal);memory.withoutProgress=0;}else memory.withoutProgress+=dt;
  if(memory.stuck>=ENEMY_NAVIGATION_LIMITS.stuckSeconds||memory.withoutProgress>=ENEMY_NAVIGATION_LIMITS.progressSeconds){
   memory.route=[];memory.safety=0;memory.stuck=0;memory.withoutProgress=0;memory.retry=0;
   if(state.awareness==='return'||state.awareness==='patrol'){memory.rest=3;return{velocity:zero(),disengage:state.awareness==='return',holding:true};}
   memory.returning=true;return{velocity:zero(),disengage:true,holding:false};
  }
  if(speed<.01)return{velocity:zero(),disengage:false,holding:false};
  while(memory.route.length&&flat(position,memory.route[0])<.1)memory.route.shift();
  const next=memory.route[0]??goal;
  let velocity=toward(position,next,speed);
  const turned=Math.abs(Math.hypot(memory.checkedVelocity.x,memory.checkedVelocity.z)-speed)>.01||velocity.x*memory.checkedVelocity.x+velocity.z*memory.checkedVelocity.z<speed*speed*.985;
  if(memory.safety<=0||memory.revision!==field.revision||turned){
   const requested=velocity,probe=new SurfaceProbe(field),length=Math.min(flat(position,next),speed*(ENEMY_NAVIGATION_LIMITS.safetySeconds+.1)+.08);
   const safe=probe.segment(position,{x:position.x+velocity.x/speed*length,y:position.y,z:position.z+velocity.z/speed*length});
   if(!safe){
    memory.route=[];velocity=zero();
    if(memory.retry===0){memory.route=plan(probe,position,goal,state.id%2?1:-1);memory.retry=ENEMY_NAVIGATION_LIMITS.replanSeconds;}
    if(memory.route.length)velocity=toward(position,memory.route[0],speed);
   }
   memory.checkedVelocity=memory.route.length?velocity:requested;memory.safeVelocity=velocity;memory.safety=ENEMY_NAVIGATION_LIMITS.safetySeconds;memory.revision=field.revision;
  }else velocity=memory.safeVelocity;
  // Stop exactly at a waypoint so cached decisions never overshoot a corner.
  const limit=memory.route.length?flat(position,memory.route[0])/dt:flat(position,goal)/dt,n=Math.hypot(velocity.x,velocity.z);
  if(n>limit)velocity={x:velocity.x/n*limit,y:0,z:velocity.z/n*limit};
  memory.attempted=true;
  return{velocity,disengage:false,holding:false};
 }
}
/** A committed lunge keeps its authored direction; it stops at unsafe ground
 * instead of steering during the tell/release or falling from a cliff. */
export function safeEnemyLunge(field:EnemyNavigationField,position:Vec3,velocity:Vec3,dt:number):boolean {
 if(!Number.isFinite(dt)||dt<=0||dt>.1)return false;
 return !!new SurfaceProbe(field).segment(position,{x:position.x+velocity.x*dt,y:position.y,z:position.z+velocity.z*dt});
}
