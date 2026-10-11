import type {GameSimulation} from '../simulation/game-simulation';
import type {Vec3} from '../world/types';
import {skyContext} from './skybound/context';
import {local} from './skybound/orientation';
import {PART_HALF,type SkyPartKind} from './skybound/types';
// Rotation-invariant broad phase, computed once per kind. The exact oriented test still
// reads the live part pose, including movement later within the same authority tick.
const radii=Object.fromEntries(Object.entries(PART_HALF).map(([kind,h])=>[kind,Math.hypot(h.x,h.y,h.z)])) as Record<SkyPartKind,number>;
/** Same carved world and oriented parts as the other authority mechanics. */
const contexts=new WeakMap<GameSimulation,{tick:number;edits:number;buildings:object;resources:object;count:number;value:ReturnType<typeof skyContext>}>();
export function siteWalkingContext(sim:GameSimulation){const previous=contexts.get(sim),buildings=sim.adventure.state.buildings,resources=sim.adventure.state.resources,count=buildings.length+resources.length;if(previous?.tick===sim.tick&&previous.edits===sim.world.edits.length&&previous.buildings===buildings&&previous.resources===resources&&previous.count===count)return previous.value;const ctx=skyContext(sim);const value={...ctx,solid:(p:Vec3)=>ctx.solid(p)||sim.skybound.state.parts.some(part=>{const r=radii[part.kind],at=part.position;if(Math.abs(p.x-at.x)>r||Math.abs(p.y-at.y)>r||Math.abs(p.z-at.z)>r)return false;const q=local(p,part),half=PART_HALF[part.kind];return Math.abs(q.x)<half.x&&Math.abs(q.y)<half.y&&Math.abs(q.z)<half.z;})};contexts.set(sim,{tick:sim.tick,edits:sim.world.edits.length,buildings,resources,count,value});return value;}
export function siteSupport(sim:GameSimulation,x:number,z:number,nearY:number):number|undefined{
 const ctx=siteWalkingContext(sim);let highest:number|undefined;
 for(const [dx,dz]of[[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]]){let previous=nearY+.45;const px=x+dx,pz=z+dz;if(ctx.solid({x:px,y:previous,z:pz}))continue;
  for(let y=previous-.1;y>=nearY-1.2;y-=.1){if(ctx.solid({x:px,y,z:pz})){let low=y,high=previous;for(let i=0;i<6;i++){const mid=(low+high)/2;if(ctx.solid({x:px,y:mid,z:pz}))low=mid;else high=mid;}highest=Math.max(highest??-Infinity,high+.015);break;}previous=y;}
 }return highest;
}
export function siteClear(sim:GameSimulation,p:Vec3):boolean{const ctx=siteWalkingContext(sim);for(const y of [.1,.8,1.55])for(const [x,z]of[[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]])if(ctx.solid({x:p.x+x,y:p.y+y,z:p.z+z})||ctx.occupied?.({x:p.x+x,y:p.y+y,z:p.z+z}))return false;return true;}
export function walkSiteRescue(sim:GameSimulation,position:Vec3,target:Vec3,dt:number):void{
 const d=Math.hypot(target.x-position.x,target.z-position.z);if(d<1.3)return;const dx=(target.x-position.x)/d*2.1*Math.min(dt,1/15)/2,dz=(target.z-position.z)/d*2.1*Math.min(dt,1/15)/2;
 for(let i=0;i<2;i++)for(const [x,z]of[[dx,dz],[dx,0],[0,dz]]){const next={x:position.x+x,y:position.y,z:position.z+z},y=siteSupport(sim,next.x,next.z,position.y);if(y===undefined||Math.abs(y-position.y)>.42)continue;next.y=y;if(!siteClear(sim,next))continue;Object.assign(position,next);break;}
}
