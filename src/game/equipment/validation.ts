import type {SkyboundSave} from '../skybound/types';
import type {AdventureSave} from '../types';
import {insideBounds,WORLD} from '../../world/types';
import {validateGear,projectGear,isEquipment,selectedGear} from './items';
import type {GearContainer} from './items';
/** Validate/sanitize a detached adventure save. Shared-world members are checked together later. */
export function validateAdventureGear(s:AdventureSave,seen=new Set<number>()):number{
 let maximum=0;
 const check=(container:GearContainer,items:Record<string,number>):GearContainer=>{const c=validateGear(container,items,seen);for(const l of c.lots)maximum=Math.max(maximum,l.id);return c;};
 if(s.gearItems!==undefined){s.gearItems=check(s.gearItems,s.inventory);if(s.meadows){s.meadows.quality={};s.meadows.durability={};for(const kind of Object.keys(s.gearItems.activeByKind)){const lot=selectedGear(s.gearItems,kind);if(lot?.quality!==undefined)s.meadows.quality[kind]=lot.quality;if(lot?.durability!==undefined)s.meadows.durability[kind]=lot.durability;}}}
 if(s.graveGear!==undefined)s.graveGear=check(s.graveGear,s.grave??{});
 for(const grave of s.meadows?.graves??[])if(grave.gearItems!==undefined)grave.gearItems=check(grave.gearItems,grave.items);
 for(const node of s.resources)if(node.gearItems!==undefined){if(!isEquipment(node.kind)||node.amount<1||!Array.isArray(node.gearItems?.lots)||node.gearItems.lots.length!==1)throw Error('地面の装備保存が不正です');node.gearItems=check(node.gearItems,{[node.kind]:node.amount});}
 for(const building of s.buildings)if(building.gearItems!==undefined)building.gearItems=check(building.gearItems,building.contents);
 if(s.gearFlights!==undefined){
  if(!Array.isArray(s.gearFlights)||s.gearFlights.length>64||new Set(s.gearFlights.map(f=>f.id)).size!==s.gearFlights.length)throw Error('投擲装備の保存が不正です');
  s.gearFlights=s.gearFlights.map(f=>{if(!f||!Number.isSafeInteger(f.id)||f.id<1||!f.point||!insideBounds(f.point,WORLD,.1)||!Array.isArray(f.gearItems?.lots)||f.gearItems.lots.length!==1||f.gearItems.lots[0].kind!=='flintSpear'||f.gearItems.lots[0].count!==1)throw Error('投擲装備の保存が不正です');maximum=Math.max(maximum,f.id);return{id:f.id,point:{x:f.point.x,y:f.point.y,z:f.point.z},gearItems:check(f.gearItems,projectGear(f.gearItems,{}))};});
 }
 return maximum;
}
export function maximumGearId(s:AdventureSave):number{
 let max=0;const containers=[s.gearItems,s.graveGear,...(s.meadows?.graves??[]).map(g=>g.gearItems),...s.resources.map(n=>n.gearItems),...s.buildings.map(b=>b.gearItems),...(s.gearFlights??[]).map(f=>f.gearItems)];
 for(const c of containers)for(const lot of c?.lots??[])max=Math.max(max,lot.id);for(const f of s.gearFlights??[])max=Math.max(max,f.id);return max;
}

export function maximumCampGearId(s:SkyboundSave):number{let max=0;for(const container of Object.values(s.storageGear??{}))for(const lot of container.lots)max=Math.max(max,lot.id);return max;}
/** Global uniqueness includes camp cargo alongside players, graves, static chests, drops and flights. */
export function validateCampGear(s:SkyboundSave,seen:Set<number>):number{let max=0;for(const[id,gear]of Object.entries(s.storageGear??{})){const copy=validateGear(gear,s.storage?.[id]??{},seen);s.storageGear![id]=copy;for(const lot of copy.lots)max=Math.max(max,lot.id);}return max;}
