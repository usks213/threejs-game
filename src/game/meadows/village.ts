import type { Adventure } from '../adventure';
import type { EnemyState } from '../types';
import { meadowEnemy } from './world';
import { directedShot } from '../bosses';
import { sees } from './obstacles';
export function stepVillage(game:Adventure,dt:number){
 const s=game.state,p=game.sim.player;
 for(const n of s.resources)if(n.kind==='bodyPile'&&n.ready<=s.seconds&&Math.hypot(n.x-p.x,n.z-p.z)<20){n.spawnTimer=(n.spawnTimer??0)+dt;if(n.spawnTimer>=6){n.spawnTimer=0;if(s.enemies.filter(e=>e.definition.startsWith('draugr')&&e.health>0&&Math.hypot(e.x-n.x,e.z-n.z)<10).length<2){const roll=game.sim.tick%7,kind=roll===0?'draugrElite':roll<3?'draugrArcher':'draugr';s.enemies.push(meadowEnemy(game.sim,kind,n.x+Math.sin(game.sim.tick)*2,n.z+Math.cos(game.sim.tick)*2));}}}
}
export function archerAttack(game:Adventure,e:EnemyState,p:{x:number;y:number;z:number},dt:number):void{
 if(e.windup>0){e.windup=Math.max(0,e.windup-dt);if(e.windup===0){const from={x:e.x,y:e.y+1.2,z:e.z},v=directedShot(from,{x:p.x,y:p.y+.7,z:p.z},0,13);game.projectiles.push({id:game.sim.allocateEntityId(),...from,owner:'enemy:'+e.id,vx:v.x,vy:v.y,vz:v.z,life:3,damage:40,element:'physical',radius:.12,kind:'arrow'});e.cooldown=3;}}
 else if(e.cooldown<=0&&Math.hypot(e.x-p.x,e.z-p.z)<18&&sees(game.sim,e,p))e.windup=1.2;
}
