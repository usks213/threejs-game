import type {Adventure} from '../adventure';
import type {BuildingState,ResourceNode} from '../types';
import {ARMOR} from '../../content/meadows/data';
import {WEAPONS} from '../../content/catalog';
import {canCarry,carryAmount,occupiedSlots} from '../meadows/inventory';
import {reconcileSlots} from '../meadows/inventory-layout';
import {emptyGear,fuseBridge,gearMaxDurability,isEquipment,migrateGear,mintGear,mutateGear,projectGear,selectedGear,selectGear,transferGear,validateGear,GEAR_LIMITS} from './items';
import type {GearContainer,GearLot,GearAllocator,GearStoragePlan} from './items';
interface Grave {items:Record<string,number>;gearItems?:GearContainer}
/** Equipment lots own equipment counts. The old dictionaries are synchronized read projections. */
export class EquipmentInventory {
 private boundOwner?:string;
 constructor(private readonly game:Adventure){}
 private get s(){return this.game.state;}
 private reserve(max=GEAR_LIMITS.lots*4){return this.game.sim.reserveEntityIds(max);}
 ensure():GearContainer{
  const s=this.s,m=s.meadows,sky=this.game.sim.skybound;
  if(!s.gearItems){
   const ids=this.reserve(GEAR_LIMITS.lots*(2+(m?.graves?.length??0))),legacy={fresh:this.game.freshEquipment,quality:m?.quality,durability:m?.durability,fusions:sky.state.fusions[this.game.owner]??[]},gear=migrateGear(s.inventory,ids.allocate,legacy);
   const held=new Set(gear.lots.map(l=>l.kind)),unheld=<T>(record:Record<string,T>|undefined)=>Object.fromEntries(Object.entries(record??{}).filter(([kind])=>!held.has(kind)));
   const grave=s.graveGear?validateGear(s.graveGear,s.grave??{}):migrateGear(s.grave??{},ids.allocate,{quality:unheld(m?.quality),durability:unheld(m?.durability),fusions:legacy.fusions.filter(f=>!held.has(f.equipment))});
   const graves=m?.graves?.map(g=>({...g,gearItems:g.gearItems?validateGear(g.gearItems,g.items):migrateGear(g.items,ids.allocate)}));
   ids.commit();this.game.freshEquipment=false;s.gearItems=gear;s.graveGear=grave;if(m&&graves)m.graves=graves;this.sync();
  }
  if(this.boundOwner!==this.game.owner){s.gearItems=validateGear(s.gearItems,s.inventory);this.sync();sky.bindEquipment(this.game.owner,fuseBridge(()=>this.s.gearItems!,next=>this.commit(next),()=>this.game.sim.allocateEntityId(),()=>this.reserve(1)));this.boundOwner=this.game.owner;}
  return s.gearItems;
 }
 /** Strict check at command boundaries; runtime writes must use these transactional methods. */
 assertProjection():void{validateGear(this.ensure(),this.s.inventory);this.sync();}
 private sync(layout=false):void{
  const s=this.s,c=s.gearItems!;s.inventory=projectGear(c,s.inventory);
  if(s.meadows){const m=s.meadows;m.quality={};m.durability={};for(const kind of Object.keys(c.activeByKind)){const lot=selectedGear(c,kind);if(lot?.quality!==undefined)m.quality[kind]=lot.quality;if(lot?.durability!==undefined)m.durability[kind]=lot.durability;}for(const[slot,kind]of Object.entries(m.gear))if(!s.inventory[kind])delete m.gear[slot];if(layout)reconcileSlots(m,s.inventory);}
  if(!s.inventory.glider&&this.game.traversal.gliding)this.game.traversal.stop();if(s.meadows&&!s.inventory.fishingRod)s.meadows.fishing=undefined;
  if(s.equipment!=='hands'&&!s.inventory[s.equipment])s.equipment='hands';
 }
 commit(next:GearContainer,inventory?:Record<string,number>):void{this.s.gearItems=next;if(inventory)this.s.inventory=inventory;this.sync(true);}
 selected(kind:string):GearLot|undefined{return selectedGear(this.ensure(),kind);}
 select(id:number):string{
  const next=selectGear(this.ensure(),id),lot=next.lots.find(l=>l.id===id)!;this.commit(next);
  if(Object.hasOwn(WEAPONS,lot.kind)&&!['hammer','hoe'].includes(lot.kind))this.s.equipment=lot.kind;
  if(this.s.meadows){if(Object.hasOwn(ARMOR,lot.kind))this.s.meadows.gear[ARMOR[lot.kind].slot]=lot.kind;if(['shield','towerShield'].includes(lot.kind))this.s.meadows.gear.offhand=lot.kind;}
  return lot.kind;
 }
 /** Split a selected legacy batch before stamina, ammo, damage or other consequences. */
 prepareUse(kind:string):void{
  if(!isEquipment(kind))return;const source=this.ensure(),lot=selectedGear(source,kind);if(!lot)throw Error('その装備は持っていません');
  if(!Number.isSafeInteger(source.revision+8))throw Error('装備の履歴が上限です');
  if(lot.count>1){const ids=this.reserve(1),next=mutateGear(source,kind,ids.allocate,()=>{});ids.commit();this.commit(next);}
 }
 wear(kind:string,amount=1):void{
  const lot=this.selected(kind);if(lot?.durability===undefined)return;const source=this.ensure(),ids=this.reserve(1),next=mutateGear(source,kind,ids.allocate,l=>l.durability=Math.max(0,l.durability!-amount));ids.commit();this.commit(next);
 }
 edit(kind:string,edit:(lot:GearLot)=>void,inventory?:Record<string,number>):void{
  const source=this.ensure(),ids=this.reserve(1),next=mutateGear(source,kind,ids.allocate,edit);ids.commit();this.commit(next,inventory);
 }
 craft(kind:string,count:number,inventory:Record<string,number>):void{
  if(!canCarry(inventory,kind,count,this.s.meadows))throw Error('持ち物の空きを作ってください');
  const source=this.ensure(),ids=this.reserve(1),next=mintGear(source,kind,count,ids.allocate);ids.commit();this.commit(next,inventory);
  if(this.s.meadows&&!this.s.meadows.discovered.includes(kind))this.s.meadows.discovered.push(kind);
 }
 repairAll():void{
  let next=this.ensure();const ids=this.reserve(GEAR_LIMITS.lots);for(const kind of Object.keys(next.activeByKind)){const lot=selectedGear(next,kind);if(lot?.durability!==undefined)next=mutateGear(next,kind,ids.allocate,l=>l.durability=gearMaxDurability(kind,l.quality??1));}ids.commit();this.commit(next);
 }
 /** Parses a kind or an exact held lot. A lot selector cannot name another holder's item. */
 selection(selection:string,source:GearContainer,items:Record<string,number>,fallback=1):{kind:string;count:number;lotId?:number}{
  const pieces=selection.split(':');let kind=pieces[0],raw=pieces[1],lotId:number|undefined;
  if(kind==='gear'){if(pieces.length!==3||!/^\d+$/.test(pieces[1]))throw Error('装備を選び直してください');lotId=Number(pieces[1]);const lot=source.lots.find(l=>l.id===lotId);if(!lot)throw Error('選んだ装備はありません');kind=lot.kind;raw=pieces[2];}
  if(raw!==undefined&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<1)||pieces.length>(lotId===undefined?2:3))throw Error('移す個数が不正です');
  const available=lotId===undefined?items[kind]??0:source.lots.find(l=>l.id===lotId)!.count;if(raw!==undefined&&isEquipment(kind)&&Number(raw)>available)throw Error('装備の個数が更新されています。確認して再操作してください');const count=Math.min(available,raw===undefined?fallback:Number(raw));if(!count)throw Error('移す品物がありません');return{kind,count,lotId};
 }
 planHolder(items:Record<string,number>,container:GearContainer|undefined,allocate:GearAllocator):GearContainer{return container?validateGear(container,items):migrateGear(items,allocate);}
 transferBuilding(building:BuildingState,selection:string,direction:'store'|'take'):void{
  const source=this.ensure(),ids=this.reserve(),box=this.planHolder(building.contents,building.gearItems,ids.allocate),from=direction==='store'?source:box,fromItems=direction==='store'?this.s.inventory:building.contents,{kind,count,lotId}=this.selection(selection,from,fromItems);
  if(!isEquipment(kind))throw Error('装備を選んでください');
  if(direction==='store'&&occupiedSlots({...building.contents,[kind]:(building.contents[kind]??0)+count})>10)throw Error('箱の10枠がいっぱいです');
  if(direction==='take'&&!canCarry(this.s.inventory,kind,count,this.s.meadows))throw Error('持ち物に空きがありません');
  const result=transferGear(from,direction==='store'?box:source,kind,count,ids.allocate,lotId),personal=direction==='store'?result.source:result.destination,stored=direction==='store'?result.destination:result.source;
  ids.commit();building.gearItems=stored;building.contents=projectGear(stored,building.contents);this.commit(personal);if(direction==='take'&&this.s.meadows&&!this.s.meadows.discovered.includes(kind))this.s.meadows.discovered.push(kind);
 }
 /** Camp limits are checked by the caller before this staged actor/storage transaction commits. */
 prepareStorage(direction:'store'|'take',items:Record<string,number>,gearItems:GearContainer|undefined,selection:string):GearStoragePlan{
  const personal=this.ensure(),revision=personal.revision,inventory=JSON.stringify(this.s.inventory),slots=JSON.stringify(this.s.meadows?.slots),ids=this.reserve();
  const cargo=this.planHolder(items,gearItems,ids.allocate),from=direction==='store'?personal:cargo,sourceItems=direction==='store'?this.s.inventory:items;
  const normalized=selection.replace(/^gear-(\d+):/,'gear:$1:'),{kind,count,lotId}=this.selection(normalized,from,sourceItems);
  if(!isEquipment(kind))throw Error('個体を持つ装備を選んでください');
  if(direction==='take'&&!canCarry(this.s.inventory,kind,count,this.s.meadows))throw Error('持ち物の空きや重量に余裕がありません');
  const moved=transferGear(from,direction==='store'?cargo:personal,kind,count,ids.allocate,lotId),nextPersonal=direction==='store'?moved.source:moved.destination,nextCargo=direction==='store'?moved.destination:moved.source;
  const projected=Object.fromEntries(Object.entries(projectGear(nextCargo,items)).filter(([,count])=>count>0));let used=false;
  return {items:projected,gearItems:nextCargo,commit:()=>{
   if(used||this.s.gearItems?.revision!==revision||JSON.stringify(this.s.inventory)!==inventory||JSON.stringify(this.s.meadows?.slots)!==slots)throw Error('所持品が更新されています。確認して再操作してください');
   ids.commit();this.commit(nextPersonal);used=true;if(direction==='take'&&this.s.meadows&&!this.s.meadows.discovered.includes(kind))this.s.meadows.discovered.push(kind);
  }};
 }
 /** Grave/container recovery is partial and lossless: overflow remains with its original owner. */
 recover(holder:Grave):number{
  let personal=this.ensure();const ids=this.reserve(),source=this.planHolder(holder.items,holder.gearItems,ids.allocate);let remaining=source,inventory={...this.s.inventory},items={...holder.items},picked=0;const received:string[]=[];
  for(const[kind,count]of Object.entries(items)){const amount=carryAmount(inventory,kind,count,this.s.meadows);if(!amount)continue;
   if(isEquipment(kind)){const moved=transferGear(remaining,personal,kind,amount,ids.allocate);remaining=moved.source;personal=moved.destination;inventory=projectGear(personal,inventory);}else inventory[kind]=(inventory[kind]??0)+amount;
   items[kind]-=amount;picked+=amount;received.push(kind);
  }
  if(!picked)throw Error('持ち物の空きを作ってください');ids.commit();holder.items=items;holder.gearItems=remaining;this.commit(personal,inventory);if(this.s.meadows)for(const kind of received)if(!this.s.meadows.discovered.includes(kind))this.s.meadows.discovered.push(kind);return picked;
 }
 finishDeath():void{
  const source=this.s.gearItems!,kept=new Set(source.lots.filter(lot=>this.game.sim.world.generator===4&&lot.kind==='glider').map(lot=>lot.id));
  // Keep the exact owned wing, including compact legacy batches and selection.
  // Never mint a replacement or copy its identity into the recoverable grave.
  const partition=(retain:boolean):GearContainer=>({version:1,revision:retain?Math.min(Number.MAX_SAFE_INTEGER,source.revision+1):source.revision,lots:source.lots.filter(lot=>kept.has(lot.id)===retain).map(lot=>structuredClone(lot)),activeByKind:Object.fromEntries(Object.entries(source.activeByKind).filter(([,id])=>kept.has(id)===retain))});
  this.s.graveGear=validateGear(partition(false),this.s.grave??{});
  this.commit(validateGear(partition(true),this.s.inventory));
 }
 /** First prepares the new holder; its caller commits source and world together. */
 extract(kind:string,count:number,allocate:GearAllocator,lotId?:number):{personal:GearContainer;cargo:GearContainer}{const moved=transferGear(this.ensure(),emptyGear(),kind,count,allocate,lotId);return{personal:moved.source,cargo:moved.destination};}
 receive(node:ResourceNode,count:number):void{
  const personal=this.ensure(),ids=this.reserve(),source=this.planHolder({[node.kind]:node.amount},node.gearItems,ids.allocate),moved=transferGear(source,personal,node.kind,count,ids.allocate);
  ids.commit();node.amount-=count;node.gearItems=moved.source;if(!node.amount)this.s.resources=this.s.resources.filter(n=>n!==node);this.commit(moved.destination);if(this.s.meadows&&!this.s.meadows.discovered.includes(node.kind))this.s.meadows.discovered.push(node.kind);
 }
}
