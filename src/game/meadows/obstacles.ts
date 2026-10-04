import { BUILDINGS } from '../../content/catalog';
import type { BuildingState,EnemyState } from '../types';
import type { GameSimulation } from '../../simulation/game-simulation';
export function localPoint(b:BuildingState,x:number,z:number){const c=Math.cos(b.rotation),s=Math.sin(b.rotation),dx=x-b.x,dz=z-b.z;return {x:dx*c-dz*s,z:dx*s+dz*c};}
export function blockedByBuilding(b:BuildingState,x:number,y:number,z:number,radius=.3):boolean{
 if(['fire','cook','bed','beehive','raft','sign'].includes(b.definition)||b.open)return false;const def=BUILDINGS.find(d=>d.id===b.definition);if(!def)return false;const p=localPoint(b,x,z);
 return Math.abs(p.x)<def.size[0]/2+radius&&Math.abs(p.z)<def.size[2]/2+radius&&y<b.y+def.size[1]&&y+1.1>b.y;
}
export function reconcileCreature(sim:GameSimulation,e:EnemyState,from:{x:number;y:number;z:number}):void{
 if(e.health<=0)return;
 const y=sim.groundAt(e.x,e.z),blocked=Math.abs(y-from.y)>1.3||sim.adventure.state.buildings.some(b=>blockedByBuilding(b,e.x,y,e.z,e.boss?.7:.25));
 if(blocked){e.x=from.x;e.z=from.z;e.y=from.y;}else e.y=y;
}
export function sees(sim:GameSimulation,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number}):boolean{
 for(let i=1;i<6;i++){const t=i/6,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+.8,z:a.z+(b.z-a.z)*t};if(sim.world.density(p)<0||sim.adventure.state.buildings.some(w=>blockedByBuilding(w,p.x,p.y,p.z,.05)))return false;}return true;
}
