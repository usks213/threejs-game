import type {CoreSimulation} from './core/simulation';
import {inputObservation} from './input-observation';

/** Test-only observation of the visible regional combat tells. Copies scalar
 * values; never targets/raycasts, snapshots saves, advances time, or exposes
 * simulation references. Kept separate from the established input probe. */
export function regionalInputObservation(sim:CoreSimulation){
 return {...inputObservation(sim),grounded:sim.player.grounded,oxygen:sim.oxygen,
  mana:sim.combat.mana,pending:sim.combat.pending,focus:sim.focus.value,selectedElement:sim.selectedElement,
  enemies:sim.enemies.map(e=>{const attack=sim.tactics.get(e.id)?.attack;return {
   id:e.id,regional:e.regional??null,summonOwner:e.summonOwner??null,name:e.name??'',
   position:{...e.position},hp:e.hp,phase:e.phase,time:e.time,wet:sim.enemyElements[e.id].wet,
   tell:attack?{kind:attack.kind,remaining:attack.remaining,serial:attack.serial}:null,
  };}),
 };
}
