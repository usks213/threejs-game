import {CampaignSystem,CAMPAIGN_ITEMS} from './core/campaign';
import {GEAR_SLOTS,SLOT_LABELS,toolPower,isTwoHanded} from './core/equipment';
import {meleeDefinition} from './core/motion';
import {inventoryDefinition,inventoryProtected,INVENTORY_SLOTS,type InventoryKey} from './core/inventory';
import type {CoreSimulation} from './core/simulation';
export interface InventorySlotView {slot:number;key:InventoryKey;label:string;count:number;total:number;detail:string;protected:boolean}
export interface InventoryViewModel {revision:number;capacity:number;slots:InventorySlotView[];drops:{id:number;label:string;count:number;available:boolean;reason:string}[]}
const categories={weapon:'武器',armor:'防具',tool:'道具',food:'食料',medicine:'回復',quest:'重要品・記録',accessory:'装飾・強化',ammunition:'矢弾',resource:'素材',farming:'農業'};
const format=(n:number)=>String(Math.round(n*100)/100);
/** Compare through the actual campaign modifiers, including future gem/skill
 * ranks. The detached state never mutates either equipment or ledgers. */
export function equipmentComparison(c:CampaignSystem,id:string):string {
 const item=CAMPAIGN_ITEMS[id];if(!item?.slot)return '';
 const next=new CampaignSystem({});next.state={...c.state,equipment:{...c.state.equipment,[item.slot]:id}};
 const old=c.state.equipment[item.slot],parts:string[]=[];
 if(item.slot==='weapon'&&isTwoHanded(id))next.state.equipment.shield=null;
 if(item.slot==='shield'&&!c.canGuard){next.state.equipment.shield=old;parts.push('装備不可：両手武器を先に外してください');}
 const metric=(label:string,before:number,after:number,unit='')=>parts.push(`${label} ${format(before)}→${format(after)}${unit}（${after-before>=0?'+':''}${format(after-before)}）`);
 const normal=(s:CampaignSystem)=>Math.round((s.equippedWeapon==='bow'?28:meleeDefinition('slash',s.meleeArchetype).damage)*s.attackMultiplier);
 if(item.slot==='weapon'){metric('通常攻撃',normal(c),normal(next));metric('属性威力',c.spellMultiplier*100,next.spellMultiplier*100,'%');if(id==='bow'||old==='bow')metric('矢威力',old==='bow'?28*c.attackMultiplier:0,id==='bow'?28*next.attackMultiplier:0);}
 if(['armor','head','legs','shield'].includes(item.slot)){metric('総物理軽減',c.damageReduction*100,next.damageReduction*100,'%');metric('移動速度',c.moveMultiplier*100,next.moveMultiplier*100,'%');metric('寒冷蓄積',c.coldMultiplier*100,next.coldMultiplier*100,'%');if(item.slot==='shield')metric('ガード消費',c.canGuard?c.guardCost:0,next.canGuard?next.guardCost:0);}
 if(item.slot==='tool'){metric('対木材の採集力',toolPower(old,4,false)*c.toolEfficiency,toolPower(id,4,false)*next.toolEfficiency);metric('対石の採集力',toolPower(old,3,false)*c.toolEfficiency,toolPower(id,3,false)*next.toolEfficiency);}
 if(item.slot==='glider'){parts.push(`滑空 ${c.canGlide?'可':'不可'}→${next.canGlide?'可':'不可'}`);metric('滑空速度',c.glideSpeedMultiplier*100,next.glideSpeedMultiplier*100,'%');metric('滑空消費',c.glideStaminaMultiplier*100,next.glideStaminaMultiplier*100,'%');}
 if(item.slot==='grapple')metric('鉤縄',c.canGrapple?1:0,next.canGrapple?1:0);
 if(item.slot==='charm'){metric('最大HP',c.maxHp,next.maxHp);metric('最大スタミナ',c.maxStamina,next.maxStamina);}
 if(GEAR_SLOTS.includes(item.slot)){const g=c.gearInfo(id);parts.push(`耐久 ${format(g.durability)}/${g.maxDurability} · 強化 +${g.upgrade} · ジェム ${g.socket?CAMPAIGN_ITEMS[g.socket]?.label??g.socket:'なし'}`);}
 return `比較 · ${SLOT_LABELS[item.slot]}：${old?CAMPAIGN_ITEMS[old].label:'初期装備'} → ${item.label} / ${parts.join(' / ')}`;
}
export function inventoryViewModel(sim:CoreSimulation):InventoryViewModel {
 const c=sim.campaign,state=c.inventory.reconcile();
 return {revision:state.revision,capacity:INVENTORY_SLOTS,slots:state.slots.flatMap((s,slot)=>{if(!s)return [];const def=inventoryDefinition(s.key)!,id=s.key.slice(s.key.startsWith('material:')?9:5),comparison=s.key.startsWith('item:')?equipmentComparison(c,id):'';return [{slot,key:s.key,label:def.icon+' '+def.label,count:s.count,total:s.key.startsWith('material:')?c.materials[Number(id)]:c.state.items[id],protected:inventoryProtected(s.key),detail:`分類 ${categories[def.category]} / ${def.description} / 入手: ${def.source}${comparison?' / '+comparison:''}`}];}),drops:state.drops.map(d=>{const status=c.inventory.pickupStatus(d.id,1,sim.player.position,sim.arena.field);return {id:d.id,label:inventoryDefinition(d.key)!.label,count:d.count,available:status.ok,reason:status.message};})};
}
