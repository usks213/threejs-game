import type {Adventure} from '../../src/game/adventure';
import {migrateGear} from '../../src/game/equipment/items';
/** Explicit fixture replacement, not a production reconciliation or a transfer shortcut. */
export function seedInventory(game:Adventure,items:Record<string,number>):void{
 const m=game.state.meadows,fusions=game.sim.skybound.snapshot(game.owner).fusions;
 const gear=migrateGear(items,()=>game.sim.allocateEntityId(),{quality:m?.quality,durability:m?.durability,fusions,fresh:true});
 game.state.inventory={...items};game.gear.commit(gear);
}
