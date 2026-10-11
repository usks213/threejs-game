import {expect,type Page} from '@playwright/test';
import {PlayerControls} from './campaign-controls';
import {readRegional} from './regional-evidence';

const costs:Record<string,Record<number,number>>={bandage:{7:3,10:1},'berry-meal':{7:4},'mana-draught':{7:2,3:1}};
export async function craftRegional(page:Page,controls:PlayerControls,id:keyof typeof costs,count:number){
 await controls.menu('crafting');const before=await readRegional(page);
 for(let n=0;n<count;n++)await controls.row(id,'craft');
 const after=await readRegional(page);expect(after.campaign.items[id]).toBe((before.campaign.items[id]??0)+count);
 for(const [key,cost] of Object.entries(costs[id]))expect(after.inventory[Number(key)],id+' must spend harvested material '+key).toBe(before.inventory[Number(key)]-cost*count);
 await controls.resume();
}
export async function consumeRegional(page:Page,controls:PlayerControls,id:'bandage'|'berry-meal'|'mana-draught'){
 await controls.menu('inventory');const before=await readRegional(page);expect(before.campaign.items[id]).toBeGreaterThan(0);await controls.row(id,'consume');const after=await readRegional(page);
 expect(after.campaign.items[id]).toBe(before.campaign.items[id]-1);
 if(id==='bandage'){const max=100+(before.campaign.skillRanks?.vigor??0)*20+(before.campaign.foodSeconds>0?20:0)+(before.campaign.equipment.charm==='ember-charm'?15:0);expect(after.hp).toBe(Math.min(max,before.hp+25));}
 if(id==='mana-draught')expect(after.combat.mana).toBe(Math.min(100,before.combat.mana+60));
 if(id==='berry-meal')expect(after.campaign.foodSeconds).toBe(180);
 await controls.resume();
}
export async function recoverRegional(page:Page,controls:PlayerControls){
 for(let n=0;n<6;n++){const p=await readRegional(page),max=100+(p.campaign.skillRanks?.vigor??0)*20+(p.campaign.foodSeconds>0?20:0);if(p.hp>=max-10||!p.campaign.items.bandage)break;await consumeRegional(page,controls,'bandage');}
}
export async function maintainRegionalGear(page:Page,controls:PlayerControls,upgrade=false){
 await controls.menu('equipment');
 for(const id of ['iron-blade','hide-coat']){
  const before=await readRegional(page),gear=before.campaign.gearState[id]??{durability:100,maxDurability:100,upgrade:0};
  if(gear.durability<gear.maxDurability){await controls.row('repair:'+id,'gear');const after=await readRegional(page);expect(after.campaign.gearState[id].durability).toBe(gear.maxDurability);expect(after.inventory[6]).toBe(before.inventory[6]-Math.ceil((gear.maxDurability-gear.durability)/25));}
  if(upgrade)await upgradeRegionalGear(page,controls,id);
 }
 await controls.resume();
}
export async function upgradeRegionalGear(page:Page,controls:PlayerControls,id:string){
 const before=await readRegional(page),rank=before.campaign.gearState[id]?.upgrade??0;await controls.row('upgrade:'+id,'gear');const after=await readRegional(page);
 expect(after.campaign.gearState[id].upgrade).toBe(rank+1);expect(after.inventory[6]).toBe(before.inventory[6]-2*(rank+1));expect(after.inventory[3]).toBe(before.inventory[3]-3*(rank+1));
}
