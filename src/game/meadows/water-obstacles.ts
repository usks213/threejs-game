import { BUILDINGS } from '../../content/catalog';
import type { WaterObstacle } from '../../fluid/obstacles';
import type { GameSimulation } from '../../simulation/game-simulation';
export function updateWaterObstacles(sim:GameSimulation):void{
 const centers=sim.targets.length?sim.targets.map(t=>t.player):[sim.player],near=(x:number,z:number)=>centers.some(p=>Math.hypot(p.x-x,p.z-z)<48),solids:WaterObstacle[]=[];
 for(const b of sim.adventure.state.buildings){if(!near(b.x,b.z)||['fire','cook','standingTorch','fence','spikes','ladder','stairs'].includes(b.definition)||b.open&&(b.definition==='door'||b.definition==='gate'))continue;const def=BUILDINGS.find(d=>d.id===b.definition)!;if(/wall|floor|door|gate|roof|ridge|raft/i.test(b.definition))solids.push({x:b.x,y:b.y+def.size[1]/2,z:b.z,hx:def.size[0]/2,hy:def.size[1]/2,hz:def.size[2]/2,rotation:b.rotation});}
 for(const b of sim.bodies)if(near(b.position.x,b.position.z))solids.push({...b.position,hx:b.radius*.8,hy:b.radius*.8,hz:b.radius*.8});
 for(const p of centers)solids.push({x:p.x,y:p.y+.65,z:p.z,hx:.28,hy:.65,hz:.28});
 for(const n of sim.adventure.state.resources)if(n.log&&n.ready<=sim.adventure.state.seconds&&near(n.x,n.z))for(const b of [n.log.a,n.log.b])solids.push({...b.position,hx:.3,hy:.3,hz:.3});
 sim.fluid.setObstacles(solids);
}
