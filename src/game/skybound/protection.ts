import type { GameSimulation } from '../../simulation/game-simulation';
import type { Vec3 } from '../../world/types';
export interface ProtectedVolume { center: Vec3; radius: number; below: number; above: number }
/** Small entry/landmark cores, not entire trial zones or arbitrary player building areas. */
export function protectedVolumes(sim:GameSimulation):ProtectedVolume[]{
 if(sim.world.generator!==4)return [];
 const volumes:ProtectedVolume[]=[{center:{x:0,y:sim.world.heightAt(0,8),z:8},radius:1.25,below:1.2,above:2.4}];
 for(const n of sim.adventure.state.resources)if(n.id>=810001&&n.id<=810004||n.id>=825001&&n.id<=825007||n.id>=830001&&n.id<=830003||n.id>=855001&&n.id<=855003||n.id>=856001&&n.id<=856009||n.id===857001)volumes.push({center:{x:n.x,y:n.y,z:n.z},radius:.65,below:.8,above:1.9});
 const spawns=sim.sessionSpawns?.()??sim.targets.flatMap(t=>t.adventure.state.spawn?[t.adventure.state.spawn]:[]);
 for(const p of spawns)volumes.push({center:{...p},radius:1,below:.8,above:2});
 return volumes;
}
export function intersectsProtection(point:Vec3,radius:number,volumes:readonly ProtectedVolume[]):boolean{
 return volumes.some(v=>{const horizontal=Math.max(0,Math.hypot(point.x-v.center.x,point.z-v.center.z)-v.radius),vertical=Math.max(v.center.y-v.below-point.y,point.y-v.center.y-v.above,0);return Math.hypot(horizontal,vertical)<=radius;});
}
/** Keeps the unlimited existing rock system while preventing objects from settling on entry cores. */
export function keepBodiesOutsideProtected(sim:GameSimulation):void{
 const volumes=protectedVolumes(sim);if(!volumes.length)return;
 for(const body of sim.bodies)for(const v of volumes){const p=body.position;if(p.y+body.radius<v.center.y-v.below||p.y-body.radius>v.center.y+v.above)continue;const dx=p.x-v.center.x,dz=p.z-v.center.z,d=Math.hypot(dx,dz),r=v.radius+body.radius+.02;if(d>=r)continue;const x=d?dx/d:1,z=d?dz/d:0;p.x=v.center.x+x*r;p.z=v.center.z+z*r;const outward=Math.max(0,body.velocity.x*x+body.velocity.z*z);body.velocity.x=x*outward;body.velocity.z=z*outward;body.sleeping=false;}
}
