import { seedStructures } from './structures';
import type { GameSimulation } from '../../simulation/game-simulation';
import { ENEMIES } from '../../content/catalog';
import type { AdventureSave, EnemyState } from '../types';
export function meadowEnemy(sim:GameSimulation,definition:string,x:number,z:number,stars=0):EnemyState{
 const def=ENEMIES.find(e=>e.id===definition)!;
 return {id:sim.allocateEntityId(),definition,x,y:sim.groundAt(x,z),z,homeX:x,homeZ:z,tier:1,health:def.health*(1+stars),stars,cooldown:2,windup:0,slow:0,boss:false};
}
/** Deterministic authored clearings within the existing editable world. */
export function seedMeadows(sim:GameSimulation,s:AdventureSave):void{
 s.resources=[];s.enemies=[];
 const node=(kind:string,x:number,z:number,amount=1)=>s.resources.push({id:sim.allocateEntityId(),kind,x,y:sim.groundAt(x,z),z,amount,ready:0});
 for(let i=0;i<210;i++){
  const a=i*2.399963,r=10+Math.sqrt(i)*4.3,x=Math.sin(a)*r-12,z=Math.cos(a)*r-15;
  const kind=i%13===0?'oak':i%7===0?'birch':i%4===0?'beech':i%5===0?'mushroom':i%6===0?'dandelion':i%3===0?'berry':i%2===0?'stone':'branch';
  node(kind,x,z,['branch','stone'].includes(kind)?3:1);
 }
 for(let i=0;i<8;i++)node(i%2?'stone':'branch',Math.sin(i*2.4)*(3+i*.3),8+Math.cos(i*2.4)*(3+i*.3),3);
 for(let i=0;i<22;i++)node('flint',-24+Math.sin(i)*3,-2-i*1.8,2);
 for(let i=0;i<26;i++){
  const kind=['boar','deer','deer','greyling','neck','gull'][i%6],a=i*2.4,r=22+(i%7)*5,x=kind==='neck'?-24:Math.sin(a)*r,z=kind==='neck'?-10-i:Math.cos(a)*r-8;
  const safeZ=!['deer','gull'].includes(kind)&&Math.hypot(x,z-8)<24?z-25:z;
  s.enemies.push(meadowEnemy(sim,kind,x,safeZ,['boar','deer'].includes(kind)&&i>15?i%3:0));
 }
 node('merchant',-48,12);for(let i=0;i<12;i++)node(i%3?'perch':'pike',-24+Math.sin((-10-i*3)*.04)*4,-10-i*3);
 node('sacrifice',0,3);node('runestone',2,4);node('altar',0,-40);
 for(const [x,z] of [[-18,18],[30,-18],[-45,-30]]){
  node('lootChest',x,z);node('beeNest',x+2,z);node('runestone',x-3,z+2);

 }
 node('buriedChest',-35,30);node('runestone',-32,30);seedStructures(sim,s);for(let i=0;i<4;i++)s.enemies.push(meadowEnemy(sim,i===0?'draugrElite':i===1?'draugrArcher':'draugr',70+i*2,-60));node('bodyPile',70,-60);node('lootChest',77,-60);
}
