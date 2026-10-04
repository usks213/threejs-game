import type { Adventure } from '../adventure';
import type { EnemyState } from '../types';
import { ENEMIES } from '../../content/catalog';
import { blockedByBuilding } from './obstacles';
export function strikeBarrier(game:Adventure,e:EnemyState,target:{x:number;y:number;z:number}):boolean{
 if(e.cooldown>0||e.windup>0)return false;
 const d=Math.hypot(target.x-e.x,target.z-e.z)||1,x=e.x+(target.x-e.x)/d*.65,z=e.z+(target.z-e.z)/d*.65;
 const b=game.state.buildings.find(b=>blockedByBuilding(b,x,e.y,z,.4));if(!b)return false;
 b.health=Math.max(0,(b.health??100)-(ENEMIES.find(n=>n.id===e.definition)?.damage??20));e.cooldown=2;e.attackFlash=.4;
 if(!b.health){game.sim.dropDebris(b,'wood',2);game.state.buildings=game.state.buildings.filter(n=>n!==b);game.support();}return true;
}
export function shamanMagic(game:Adventure,e:EnemyState,dt:number):void{
 if(e.definition!=='greydwarfShaman')return;const s=game.state;e.attackReady??={};
 if((e.attackReady.heal??0)<=s.seconds){const injured=s.enemies.filter(n=>n.health>0&&n.definition.startsWith('greydwarf')&&Math.hypot(n.x-e.x,n.z-e.z)<4&&n.health<(ENEMIES.find(d=>d.id===n.definition)!.health)*(1+(n.stars??0)));if(injured.length){for(const n of injured)n.attackReady={...n.attackReady,healing:s.seconds+4};e.attackReady.heal=s.seconds+10;e.attackFlash=1;}}
 const actors=game.sim.targets.length?game.sim.targets:[{player:game.sim.player,adventure:game}];
 if((e.attackReady.poison??0)<=s.seconds){for(const actor of actors){const d=Math.hypot(actor.player.x-e.x,actor.player.z-e.z);if(d<5&&d>2){actor.adventure.hurtPlayer(6,'poison',actor.player,e);e.attackReady.poison=s.seconds+8;e.attackFlash=1;}}}
}
