import { buildingVoxels,worldPoint } from '../voxel/model';
import { voxelSlabs } from '../voxel/obstacles';
const cache=new Map<string,WaterObstacle[]>();
import type { WaterObstacle } from '../../fluid/obstacles';
import type { GameSimulation } from '../../simulation/game-simulation';
export function updateWaterObstacles(sim:GameSimulation):void{
 const centers=sim.targets.length?sim.targets.map(t=>t.player):[sim.player],near=(x:number,z:number)=>centers.some(p=>Math.hypot(p.x-x,p.z-z)<48),solids:WaterObstacle[]=[];
 for(const b of sim.adventure.state.buildings){if(!near(b.x,b.z)||b.open&&(b.definition==='door'||b.definition==='gate'))continue;const key=b.definition+':'+(b.removed??[]).join(';');let slabs=cache.get(key);if(!slabs){slabs=voxelSlabs(buildingVoxels(b.definition),b.removed);if(cache.size>256)cache.clear();cache.set(key,slabs);}for(const slab of slabs)solids.push({...slab,...worldPoint(slab,b,b.rotation),rotation:b.rotation});}
 for(const b of sim.bodies)if(near(b.position.x,b.position.z))solids.push({...b.position,hx:b.radius*.8,hy:b.radius*.8,hz:b.radius*.8});
 for(const p of centers)solids.push({x:p.x,y:p.y+.65,z:p.z,hx:.28,hy:.65,hz:.28});
 for(const n of sim.adventure.state.resources)if(n.log&&n.ready<=sim.adventure.state.seconds&&near(n.x,n.z))for(const b of [n.log.a,n.log.b])solids.push({...b.position,hx:.3,hy:.3,hz:.3});
 sim.fluid.setObstacles(solids);
}
