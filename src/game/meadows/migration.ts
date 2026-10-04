import type { GameSimulation } from '../../simulation/game-simulation';
import type { AdventureSave } from '../types';
/** Add new authored encounters to existing Meadows saves without resetting the player's world. */
export function migrateMeadows(sim:GameSimulation,s:AdventureSave):void{
 const m=s.meadows;if(!m||(m.contentVersion??0)>=2)return;
 if(!s.resources.some(n=>n.kind==='bodyPile'))s.resources.push({id:sim.allocateEntityId(),kind:'bodyPile',x:70,y:sim.groundAt(70,-60),z:-60,amount:1,ready:0});
 if(!m.gear.offhand)m.gear.offhand=s.inventory.towerShield?'towerShield':s.inventory.shield?'shield':'';
 if(!m.gear.offhand)delete m.gear.offhand;m.contentVersion=2;
}
