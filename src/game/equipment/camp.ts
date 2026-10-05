import type {GameSimulation} from '../../simulation/game-simulation';
import {GEAR_LIMITS,isEquipment,migrateGear} from './items';
/** Earlier mobile stores allowed linen hats as count-only cargo. Preserve them with unknown provenance. */
export function migrateCampGear(sim:GameSimulation):void{
 const state=sim.skybound.state,pending=Object.entries(state.storage??{}).filter(([id,items])=>!state.storageGear?.[id]&&Object.keys(items).some(isEquipment));if(!pending.length)return;
 const ids=sim.reserveEntityIds(pending.length*GEAR_LIMITS.lots),next={...(state.storageGear??{})};
 for(const[id,items]of pending){if(Object.keys(items).some(kind=>isEquipment(kind)&&kind!=='linenHat'))throw Error('移動倉庫の装備個体が欠けています');next[id]=migrateGear(items,ids.allocate);}
 ids.commit();state.storageGear=next;
}
