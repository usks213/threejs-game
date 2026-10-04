import type { AdventureSave } from '../types';
import type { GameSimulation } from '../../simulation/game-simulation';
import type { Vec3 } from '../../world/types';
import { meadowEnemy } from './world';
/** Populate each distant meadow tile once; harvested resources never reset on revisiting. */
export function populateMeadowTiles(sim:GameSimulation,s:AdventureSave,p:Vec3):void{
 const m=s.meadows!;m.worldTiles??=[];const known=new Set(m.worldTiles),cx=Math.floor(p.x/32),cz=Math.floor(p.z/32);
 for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){
  const id=x+','+z;if(known.has(id)||Math.abs(x)>29||Math.abs(z)>29)continue;known.add(id);
  if(Math.hypot(x*32+16,z*32+16)<100)continue;
  const random=(i:number)=>{let h=Math.imul(x+7319,374761393)^Math.imul(z,668265263)^Math.imul(i,1442695041);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
  for(let i=0;i<18;i++){const px=x*32+random(i*2)*30,pz=z*32+random(i*2+1)*30,y=sim.groundAt(px,pz);if(y<.1)continue;const kind=['beech','beech','birch','oak','branch','stone','berry','mushroom','sapling','dandelion'][i%10];s.resources.push({id:sim.allocateEntityId(),kind,x:px,y,z:pz,amount:['branch','stone'].includes(kind)?2:1,ready:0});}
  const px=x*32+16,pz=z*32+16;if(sim.groundAt(px,pz)>.2)s.enemies.push(meadowEnemy(sim,random(60)>.5?'deer':'boar',px,pz,random(61)>.93?2:random(61)>.75?1:0));
  if(sim.groundAt(px,pz)>.2&&random(63)<.22){const node=(kind:string,dx=0,dz=0)=>s.resources.push({id:sim.allocateEntityId(),kind,x:px+dx,y:sim.groundAt(px+dx,pz+dz),z:pz+dz,amount:1,ready:0});node(random(64)>.5?'dolmen':'graveyard');node(random(64)>.5?'lootChest':'buriedChest',0,1);}
  // Newly visited coastal water belongs to the persisted fluid simulation.
  for(let wx=x*32;wx<x*32+32;wx+=.5)for(let wz=z*32;wz<z*32+32;wz+=.5){const y=sim.groundAt(wx+.25,wz+.25);if(y>=-.1)continue;for(let wy=Math.max(-5,Math.ceil(y*2)/2);wy<0;wy+=.5)sim.fluid.add({x:wx,y:wy,z:wz},.95);}
 }
 m.worldTiles=[...known];
}
