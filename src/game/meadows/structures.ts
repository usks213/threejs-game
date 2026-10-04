import type { GameSimulation } from '../../simulation/game-simulation';
import type { AdventureSave } from '../types';
export function seedStructures(sim:GameSimulation,s:AdventureSave){
 const add=(definition:string,x:number,y:number,z:number,rotation=0)=>s.buildings.push({id:sim.allocateEntityId(),definition,x,y,z,rotation,support:4,contents:{},health:55});
 for(const [x,z]of [[-18,18],[30,-18],[-45,-30]]){
  const y=sim.groundAt(x,z);
  for(const dx of [-1,1])for(const dz of [-1,1])add('floor',x+dx,y,z+dz);
  for(const dx of [-1,1]){add('wall',x+dx,y,z-2);add('wall',x+dx,y,z+2);}
  add('wall',x-2,y,z,Math.PI/2);add('door',x+2,y,z,Math.PI/2);
  for(const dx of [-1,1])add('roof',x+dx,y+2,z-1);add('roof45',x+1,y+2,z+1,Math.PI);
 }
 for(const [kind,x,z]of [['dolmen',24,32],['stoneCircle',-35,30],['graveyard',37,-38]] as const)s.resources.push({id:sim.allocateEntityId(),kind,x,y:sim.groundAt(x,z),z,amount:1,ready:0});
 // Dangerous abandoned settlement is deliberately separated from the spawn clearing.
 for(const [x,z]of [[70,-60],[77,-60]]){const y=sim.groundAt(x,z);for(const dx of [-1,1]){add('wall',x+dx,y,z-2);add('wall',x+dx,y,z+2);}add('roof',x,y+2,z);}
}
