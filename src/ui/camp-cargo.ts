import {ITEM_NAMES} from '../content/catalog';
import {isEquipment,type GearContainer} from '../game/equipment/items';
import {gearLotLabel} from './equipment-lots';
export interface CampCargoChoice{value:string;label:string;held:number;stored:number}
export function campCargoChoices(inventory:Readonly<Record<string,number>>,personal:GearContainer|undefined,cargo:{items:Record<string,number>;gearItems?:GearContainer}|undefined):CampCargoChoice[]{
 const materials=[...new Set([...Object.keys(inventory),...Object.keys(cargo?.items??{})])].filter(id=>Object.hasOwn(ITEM_NAMES,id)&&!isEquipment(id)&&((inventory[id]??0)>0||(cargo?.items[id]??0)>0)).sort().map(id=>({value:id,label:ITEM_NAMES[id],held:inventory[id]??0,stored:cargo?.items[id]??0}));
 const lots=new Map([...(personal?.lots??[]),...(cargo?.gearItems?.lots??[])].map(lot=>[lot.id,lot]));
 const gear=[...lots.values()].sort((a,b)=>a.id-b.id).map(lot=>({value:'gear-'+lot.id,label:gearLotLabel(lot)+' #'+lot.id,held:personal?.lots.find(l=>l.id===lot.id)?.count??0,stored:cargo?.gearItems?.lots.find(l=>l.id===lot.id)?.count??0}));
 return [...materials,...gear];
}
