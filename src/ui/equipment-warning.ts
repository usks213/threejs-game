import {ITEM_NAMES} from '../content/catalog';
import {gearMaxDurability} from '../game/equipment/items';
import type {AdventureSnapshot} from '../game/types';
export type EquipmentWarningState=Pick<AdventureSnapshot,'equipment'|'inventory'|'gearItems'>&{meadows?:Pick<NonNullable<AdventureSnapshot['meadows']>,'gear'|'quality'|'durability'>};
export interface EquipmentWarning{kind:string;broken:boolean;remaining:number;maximum:number;text:string}
export function equipmentWarnings(state:EquipmentWarningState):EquipmentWarning[]{
 const kinds=[...new Set([state.equipment,...Object.values(state.meadows?.gear??{})])],warnings:EquipmentWarning[]=[];
 for(const kind of kinds){
  if(kind==='hands'||!(state.inventory[kind]>0))continue;
  const lot=state.gearItems?.lots.find(l=>l.id===state.gearItems?.activeByKind[kind]),remaining=lot?.durability??state.meadows?.durability[kind],quality=lot?.quality??state.meadows?.quality[kind]??1,maximum=gearMaxDurability(kind,quality);
  if(remaining===undefined||!Number.isFinite(remaining)||remaining>maximum*.15)continue;
  const broken=remaining<=0;warnings.push({kind,broken,remaining,maximum,text:`${ITEM_NAMES[kind]??kind} ${broken?'破損中':'壊れそう'} · ${Math.ceil(remaining)}/${maximum} · 工作で修理`});
 }
 return warnings.sort((a,b)=>Number(b.broken)-Number(a.broken)||a.remaining/a.maximum-b.remaining/b.maximum);
}
