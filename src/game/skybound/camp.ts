import {isEquipment,validateGear} from '../equipment/items';
import {skyPartOverlapsCapsule} from './assembly-contacts';
import {ITEM_NAMES} from '../../content/catalog';
import {ITEM_WEIGHT} from '../../content/meadows/data';
import {canCarry, occupiedSlots} from '../meadows/inventory';
import {insideBounds} from '../../world/types';
import type {Vec3} from '../../world/types';
import {global, local, orientation, rotate} from './orientation';
import {MATERIAL_MASS, PART_COST, PART_HALF} from './types';
import type {SkyContext, SkyPart, SkyboundSave} from './types';

export const CAMP_LIMITS = {slots: 8, itemKinds: 8, units: 400, cargoMass: 80, transfer: 400, players: 256} as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identity = (v: string): boolean => !['__proto__', 'constructor', 'prototype'].includes(v) && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
/** Equipment is accepted only through the canonical lot transfer callback below. */
export function campStorable(id: string): boolean {
 return Object.hasOwn(ITEM_NAMES,id);
}
export function cargoMass(items: Readonly<Record<string, number>>): number {
 // Quantize once: avoids summation-order differences in durable save validation.
 return Math.round(Object.entries(items).reduce((mass,[id,count])=>mass+count*(Object.hasOwn(ITEM_WEIGHT,id)?ITEM_WEIGHT[id]:1),0)*1000)/1000;
}
export function campAccess(part: SkyPart, owner: string): boolean { return part.creator === owner || part.shared === true; }
export function hasCargo(save: SkyboundSave, id: number): boolean { return Object.values(save.storage?.[id]??{}).some(n=>n>0); }
export function validateCargo(raw: unknown): asserts raw is Record<string, number> {
 if(!object(raw))throw Error('移動倉庫の品物が不正です');
 if(Object.keys(raw).length>CAMP_LIMITS.itemKinds)throw Error('移動倉庫の容量を超えています');
 if(Object.entries(raw).some(([id,n])=>!campStorable(id)||typeof n!=='number'||!Number.isSafeInteger(n)||n<1))throw Error('移動倉庫の品物が不正です');
 const items=raw as Record<string,number>;
 if(Object.values(items).reduce((a,b)=>a+b,0)>CAMP_LIMITS.units||occupiedSlots(items)>CAMP_LIMITS.slots||cargoMass(items)>CAMP_LIMITS.cargoMass)throw Error('移動倉庫の容量を超えています');
}
/** This validator is also used by participant exports after private contents have been redacted. */
export function validateCampSave(save: SkyboundSave, replica=false): void {
 if(save.storage!==undefined){
  if(!object(save.storage)||Object.keys(save.storage).length>64)throw Error('移動倉庫の保存が不正です');
  for(const [id,items]of Object.entries(save.storage)){
   const part=save.parts.find(p=>String(p.id)===id);
   if(!part||part.kind!=='storage')throw Error('移動倉庫の対象がありません');
   validateCargo(items);
  }
 }
 if(save.storageGear!==undefined){
  if(!object(save.storageGear)||Object.keys(save.storageGear).length>64)throw Error('移動倉庫の装備保存が不正です');const seen=new Set<number>();
  for(const[id,gear]of Object.entries(save.storageGear)){if(!save.parts.some(p=>String(p.id)===id&&p.kind==='storage'))throw Error('装備を持つ移動倉庫がありません');validateGear(gear,save.storage?.[id]??{},seen);}
 }
 for(const[id,items]of Object.entries(save.storage??{}))if(!save.storageGear?.[id]&&Object.keys(items).some(kind=>isEquipment(kind)&&kind!=='linenHat'))throw Error('移動倉庫の装備個体が欠けています');
 for(const p of save.parts){
  const loaded=p.cargoMass??0,expected=cargoMass(save.storage?.[p.id]??{});
  if(!Number.isFinite(loaded)||loaded<0||loaded>CAMP_LIMITS.cargoMass||(p.kind!=='storage'&&p.cargoMass!==undefined)||!replica&&loaded!==expected)throw Error('移動倉庫の積載重量が不正です');
  if(p.mass!==MATERIAL_MASS[p.material]*PART_COST[p.kind]+loaded)throw Error('移動倉庫の総重量が不正です');
  if(p.wrecked!==undefined&&(typeof p.wrecked!=='boolean'||p.wrecked&&(p.kind!=='storage'||p.integrity!==0||p.links.length>0||p.enabled)))throw Error('移動倉庫の残骸が不正です');
  if((p.kind==='storage'||p.kind==='bed')&&(!p.creator||!identity(p.creator)||p.trial||p.loan||p.anchored))throw Error('移動拠点の所有者が不正です');
 }
 if(save.camps!==undefined){
  if(!object(save.camps)||Object.keys(save.camps).length>CAMP_LIMITS.players)throw Error('移動拠点の記録が不正です');
  for(const [owner,id]of Object.entries(save.camps))if(!identity(owner)||!Number.isSafeInteger(id)||!save.parts.some(p=>p.id===id&&p.kind==='bed'))throw Error('移動拠点の寝床がありません');
 }
}
export function storageView(save: SkyboundSave, owner: string): {part: number; items: Record<string, number>;gearItems?:import('../equipment/items').GearContainer}[] {
 return save.parts.filter(p=>p.kind==='storage'&&campAccess(p,owner)).map(p=>({part:p.id,items:{...(save.storage?.[p.id]??{})},...(save.storageGear?.[p.id]?{gearItems:structuredClone(save.storageGear[p.id])}:{})}));
}
/** All preconditions precede writes. One synchronous authority transaction changes both inventories. */
export function transferCargo(save: SkyboundSave, part: SkyPart, owner: string, direction: 'store'|'take', id: string, context: SkyContext): void {
 if(part.kind!=='storage'||!campAccess(part,owner))throw Error('この移動倉庫は作成者か共有された仲間だけが使えます');
 const pieces=id.split(':'),item=pieces[1],count=Number(pieces[2]);
 if(pieces.length!==3||String(part.id)!==pieces[0]||!(campStorable(item)||/^gear-\d+$/.test(item))||!/^\d+$/.test(pieces[2])||!Number.isSafeInteger(count)||count<1||count>CAMP_LIMITS.transfer)throw Error('品物または装備個体と1〜400個の個数を選んでください');
 if(direction==='store'&&(part.wrecked||(part.integrity??100)<=0))throw Error('壊れた移動倉庫からは取り出すだけです');
 if(isEquipment(item)||item.startsWith('gear-')){
  if(!context.prepareEquipmentTransfer)throw Error('装備の所持品を同期して再操作してください');
  const oldItems=save.storage?.[part.id],oldGear=save.storageGear?.[part.id],plan=context.prepareEquipmentTransfer(direction,oldItems??{},oldGear,`${item}:${count}`);
  validateCargo(plan.items);validateGear(plan.gearItems,plan.items);const mass=cargoMass(plan.items);
  if(save.storage?.[part.id]!==oldItems||save.storageGear?.[part.id]!==oldGear)throw Error('移動倉庫が更新されています。確認して再操作してください');
  plan.commit();save.storage??={};save.storageGear??={};save.storage[part.id]=plan.items;save.storageGear[part.id]=plan.gearItems;part.cargoMass=mass;part.mass=MATERIAL_MASS[part.material]*PART_COST[part.kind]+mass;return;
 }
 const contents=save.storage?.[part.id]??{},source=direction==='store'?context.inventory:contents;
 if(!Object.hasOwn(source,item)||!Number.isSafeInteger(source[item])||source[item]<count)throw Error('移す品物が足りません');
 const next={...contents},amount=(context.inventory[item]??0)+(direction==='store'?-count:count);
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('持ち物の数が不正です');
 next[item]=(next[item]??0)+(direction==='store'?count:-count);if(!next[item])delete next[item];
 if(direction==='store'){
  if(part.wrecked||(part.integrity??100)<=0)throw Error('壊れた移動倉庫からは取り出すだけです');
  validateCargo(next);
 }else if(!(context.canReceiveItem?.(item,count)??canCarry(context.inventory,item,count)))throw Error('持ち物の空きや重量に余裕がありません');
 const mass=cargoMass(next);
 save.storage??={};save.storage[part.id]=next;context.inventory[item]=amount;
 part.cargoMass=mass;part.mass=MATERIAL_MASS[part.material]*PART_COST[part.kind]+mass;
}
function contains(part: SkyPart, point: Vec3, margin=0): boolean {
 const p=local(point,part),h=PART_HALF[part.kind];
 return Math.abs(p.x)<h.x+margin&&Math.abs(p.y)<h.y+margin&&Math.abs(p.z)<h.z+margin;
}
/** Resolve only a parked, grounded camp. A saved bed ID is never a trusted saved teleport position. */
export function campArrival(owner: string, bed: SkyPart, assembly: readonly SkyPart[], allParts: readonly SkyPart[], context: SkyContext): Vec3 | undefined {
 if(bed.kind!=='bed'||!campAccess(bed,owner)||!assembly.some(p=>p.kind==='storage'&&!p.wrecked&&campAccess(p,owner))||!assembly.some(p=>p.kind==='slab'))return;
 if(assembly.some(p=>p.anchored||p.trial||p.loan||p.wrecked||(p.integrity??100)<=0||(p.burning??0)>0||(p.frozen??0)>0||Math.hypot(p.velocity.x,p.velocity.z)>.2||Math.abs(p.velocity.y)>.5||Math.hypot(p.angularVelocity?.x??0,p.angularVelocity?.y??0,p.angularVelocity?.z??0)>.1||p.enabled&&['wheel','thruster','sail','emitter'].includes(p.kind)))return;
 if(rotate({x:0,y:1,z:0},orientation(bed)).y<.98)return;
 // Require four supported hull-bottom samples. Airborne/floating vehicles cannot become death traps.
 const grounded=assembly.some(part=>{
  const h=PART_HALF[part.kind];if(rotate({x:0,y:1,z:0},orientation(part)).y<.95)return false;
  return [-.65,.65].every(x=>[-.65,.65].every(z=>context.solid(global({x:x*h.x,y:-h.y-.12,z:z*h.z},part))));
 });
 if(!grounded)return;
 const center=global({x:0,y:PART_HALF.bed.y,z:0},bed),exit={x:center.x,y:center.y+.07,z:center.z};
 if(!insideBounds(exit,context.bounds,.4)||exit.y+1.8>=context.bounds.maxY||context.unsafeCamp?.(exit)||(context.immersion?.(exit)??0)>.05)return;
 if(allParts.some(part=>skyPartOverlapsCapsule(part,exit,.3,1.8)))return;
 if(context.actors.some(a=>a.id!==owner&&Math.hypot(a.position.x-exit.x,a.position.z-exit.z)<.7&&Math.abs(a.position.y-exit.y)<1.8))return;
 for(const dx of[-.28,0,.28])for(const dz of[-.28,0,.28]){
  // Recheck the actual bed volume beneath every foot sample, including its complete quaternion.
  if(!contains(bed,{x:exit.x+dx,y:exit.y-.14,z:exit.z+dz}))return;
 }
 for(let dx=-.3;dx<=.301;dx+=.1)for(let dz=-.3;dz<=.301;dz+=.1)for(let y=.04;y<1.8;y+=.1){const p={x:exit.x+dx,y:exit.y+y,z:exit.z+dz};if(context.solid(p)||context.occupied?.(p)||context.protected?.(p)||(context.immersion?.(p)??0)>.05)return;}
 return exit;
}
export function assertCampRange(part: SkyPart, context: SkyContext): void {if(distance(part.position,context.player)>3.5)throw Error('移動拠点の3.5m以内へ近づいてください');}
