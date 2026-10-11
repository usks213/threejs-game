import type {GameSimulation} from '../simulation/game-simulation';
import type {Vec3} from '../world/types';
/** A surface-only space to learn gathering, building and the movement controls.
 * This changes ordinary encounters, never player damage or world simulation. */
export const ENTRY_CLEARING={x:0,z:8,radius:16,below:2,above:4} as const;
export const BEGINNER_ENCOUNTER={radius:44,sight:8,damage:3,alert:2,windup:1.25,cooldown:4,speed:.8} as const;
export function inEntryClearing(sim:GameSimulation,point:Vec3):boolean{
 if(sim.world.generator!==4)return false;
 const center=ENTRY_CLEARING,ground=sim.world.heightAt(center.x,center.z);
 return Math.hypot(point.x-center.x,point.z-center.z)<=center.radius&&point.y>=ground-center.below&&point.y<=ground+center.above;
}
/** The authored first encounters follow the natural surface only. Digging down,
 * climbing the sky route or leaving the start region restores ordinary combat. */
export function inBeginnerArea(sim:GameSimulation,point:Vec3):boolean{
 if(sim.world.generator!==4||point.y<-3||point.y>17||Math.hypot(point.x-ENTRY_CLEARING.x,point.z-ENTRY_CLEARING.z)>BEGINNER_ENCOUNTER.radius)return false;
 const ground=sim.world.heightAt(point.x,point.z);
 return point.y>=ground-ENTRY_CLEARING.below&&point.y<=ground+ENTRY_CLEARING.above;
}
/** Ordinary enemies may leave an old saved position inside the clearing, but
 * may not enter it or move deeper into it while chasing another participant. */
export function mayEnterEncounterPosition(sim:GameSimulation,from:Vec3,to:Vec3):boolean{
 if(!inEntryClearing(sim,to))return true;
 return inEntryClearing(sim,from)&&Math.hypot(to.x-ENTRY_CLEARING.x,to.z-ENTRY_CLEARING.z)>Math.hypot(from.x-ENTRY_CLEARING.x,from.z-ENTRY_CLEARING.z);
}
/** Sweep the same finite cylinder used for target/movement exclusion, so an
 * already fired ordinary enemy shot cannot follow a retreating player inside. */
export function crossesEntryClearing(sim:GameSimulation,from:Vec3,to:Vec3):boolean{
 if(sim.world.generator!==4)return false;
 const c=ENTRY_CLEARING,ground=sim.world.heightAt(c.x,c.z),low=ground-c.below,high=ground+c.above,dy=to.y-from.y;
 let start=0,end=1;
 if(Math.abs(dy)<1e-8){if(from.y<low||from.y>high)return false;}
 else{const a=(low-from.y)/dy,b=(high-from.y)/dy;start=Math.max(0,Math.min(a,b));end=Math.min(1,Math.max(a,b));if(start>end)return false;}
 const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz,t=length?Math.max(start,Math.min(end,((c.x-from.x)*dx+(c.z-from.z)*dz)/length)):start;
 return Math.hypot(from.x+dx*t-c.x,from.z+dz*t-c.z)<=c.radius;
}
