import type {GameSimulation} from '../simulation/game-simulation';
import type {Vec3} from '../world/types';
import {insideBounds} from '../world/types';
import {skyContext} from './skybound/context';
import {skyPartOverlapsCapsule} from './skybound/assembly-contacts';
/** A saved coordinate is only a preference: edits, occupants and water may have changed. */
export function safeSavedRespawn(sim:GameSimulation,point:Vec3,owner:string):boolean{
 const ctx=skyContext(sim);
 if(!insideBounds(point,sim.world.bounds,.4)||point.y+1.8>=sim.world.bounds.maxY||ctx.unsafeCamp?.(point)||(ctx.immersion?.(point)??0)>.05)return false;
 if(ctx.actors.some(a=>a.id!==owner&&Math.hypot(a.position.x-point.x,a.position.z-point.z)<.7&&Math.abs(a.position.y-point.y)<1.8))return false;
 if(sim.skybound.state.parts.some(part=>skyPartOverlapsCapsule(part,point,.3,1.8)))return false;
 for(let x=-.3;x<=.301;x+=.1)for(let z=-.3;z<=.301;z+=.1)for(let y=.04;y<1.8;y+=.1){const probe={x:point.x+x,y:point.y+y,z:point.z+z};if(ctx.solid(probe)||ctx.occupied?.(probe)||(ctx.immersion?.(probe)??0)>.05)return false;}
 // Legacy static beds save an elevated point. Allow a short safe drop, never a cliff.
 for(let y=.05;y<=2;y+=.1)if(ctx.solid({x:point.x,y:point.y-y,z:point.z}))return true;
 return false;
}
/** Bounded deterministic search around the protected start; never stack a live arrival on a peer. */
export function safeStartRespawn(sim:GameSimulation,owner:string):Vec3|undefined{
 for(const radius of[0,1,2,3,4,6])for(let direction=0;direction<(radius?8:1);direction++){
  const angle=direction*Math.PI/4,x=Math.sin(angle)*radius,z=8+Math.cos(angle)*radius,y=sim.groundAt(x,z)+.03,point={x,y,z};
  if(safeSavedRespawn(sim,point,owner))return point;
 }
 return undefined;
}
