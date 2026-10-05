import type {GameSimulation} from '../simulation/game-simulation';
import type {Vec3} from '../world/types';
/** Only the surface arrival clearing is peaceful. Sky/cave routes and player
 * camps retain normal threats; this does not prevent damage or pause the world. */
export const ENTRY_CLEARING={x:0,z:8,radius:6,below:2,above:4} as const;
export function inEntryClearing(sim:GameSimulation,point:Vec3):boolean{
 if(sim.world.generator!==4)return false;
 const center=ENTRY_CLEARING,ground=sim.world.heightAt(center.x,center.z);
 return Math.hypot(point.x-center.x,point.z-center.z)<=center.radius&&point.y>=ground-center.below&&point.y<=ground+center.above;
}
/** Ordinary enemies may leave an old saved position inside the clearing, but
 * may not enter it or move deeper into it while chasing another participant. */
export function mayEnterEncounterPosition(sim:GameSimulation,from:Vec3,to:Vec3):boolean{
 if(!inEntryClearing(sim,to))return true;
 return inEntryClearing(sim,from)&&Math.hypot(to.x-ENTRY_CLEARING.x,to.z-ENTRY_CLEARING.z)>Math.hypot(from.x-ENTRY_CLEARING.x,from.z-ENTRY_CLEARING.z);
}
