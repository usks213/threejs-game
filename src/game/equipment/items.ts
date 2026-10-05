import {ITEM_NAMES,WEAPONS} from '../../content/catalog';
import {ARMOR,TOOL_DURABILITY} from '../../content/meadows/data';
import type {SkyFusion} from '../skybound/types';

/** Compact homogeneous lots preserve old duplicate counts without one object per legacy item. */
export interface GearLot {id:number;kind:string;count:number;quality?:number;durability?:number;fusion?:SkyFusion;legacy?:true}
export interface GearContainer {version:1;revision:number;lots:GearLot[];activeByKind:Record<string,number>}
export interface GearStoragePlan {items:Record<string,number>;gearItems:GearContainer;commit():void}
export interface EquipmentFusionBridge {list():SkyFusion[];get(kind:string):SkyFusion|undefined;prepare(kind:string,fusion:SkyFusion|undefined):()=>void;wear(kind:string):void}
export type GearAllocator=()=>number;
export const GEAR_LIMITS={lots:128,count:100000000,id:1e12,metadata:100000} as const;
const extra=new Set(['armor','glider','fishingRod','linenHat']);
export const equipmentKinds=():string[]=>Object.keys(ITEM_NAMES).filter(isEquipment);
export function isEquipment(kind:string):boolean{return kind!=='hands'&&Object.hasOwn(ITEM_NAMES,kind)&&(Object.hasOwn(WEAPONS,kind)||Object.hasOwn(ARMOR,kind)||Object.hasOwn(TOOL_DURABILITY,kind)||extra.has(kind));}
export const gearMaxDurability=(kind:string,quality=1):number=>(TOOL_DURABILITY[kind]??ARMOR[kind]?.durability??100)+(quality-1)*50;
const validCount=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=GEAR_LIMITS.count;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=GEAR_LIMITS.metadata;
function freshId(allocate:GearAllocator):number{const id=allocate();if(!Number.isSafeInteger(id)||id<1||id>=GEAR_LIMITS.id)throw Error('装備の識別子が上限です');return id;}
function nextRevision(container:GearContainer):number{if(!Number.isSafeInteger(container.revision+1))throw Error('装備の履歴が上限です');return container.revision+1;}
export const emptyGear=():GearContainer=>({version:1,revision:0,lots:[],activeByKind:{}});
export function validateGear(raw:unknown,items?:Readonly<Record<string,number>>,seen?:Set<number>):GearContainer{
 if(!object(raw)||raw.version!==1||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<0||!Array.isArray(raw.lots)||raw.lots.length>GEAR_LIMITS.lots||!object(raw.activeByKind)||Object.keys(raw.activeByKind).length>GEAR_LIMITS.lots)throw Error('装備の保存が不正です');
 const c=raw as unknown as GearContainer,ids=new Set<number>(),counts:Record<string,number>={};
 for(const lot of c.lots){
  if(!object(lot)||!Number.isSafeInteger(lot.id)||lot.id<1||lot.id>=GEAR_LIMITS.id||ids.has(lot.id)||seen?.has(lot.id)||!isEquipment(lot.kind)||!validCount(lot.count)||lot.count<1||lot.quality!==undefined&&!finite(lot.quality)||lot.durability!==undefined&&!finite(lot.durability)||lot.legacy!==undefined&&lot.legacy!==true)throw Error('装備の個体が不正か、所有が重複しています');
  if(!lot.legacy&&(lot.quality===undefined||!Number.isInteger(lot.quality)||lot.quality<1||lot.quality>4||lot.durability===undefined||lot.durability>gearMaxDurability(lot.kind,lot.quality)))throw Error('新しい装備の品質・耐久が不正です');
  if(lot.fusion!==undefined){const f=lot.fusion;if(lot.count!==1||!object(f)||f.equipment!==lot.kind||!['stone','resin','crystal'].includes(f.material)||!Number.isFinite(f.damage)||f.damage<0||f.damage>12||!Number.isFinite(f.durability)||f.durability<0||f.durability>30||!['impact','fire','frost'].includes(f.effect))throw Error('装備の合成が不正です');}
  ids.add(lot.id);counts[lot.kind]=(counts[lot.kind]??0)+lot.count;if(!validCount(counts[lot.kind]))throw Error('装備の数が上限です');
 }
 for(const kind of Object.keys(counts))if(!Object.hasOwn(c.activeByKind,kind))throw Error('選択した装備がありません');
 for(const [kind,id]of Object.entries(c.activeByKind))if(!isEquipment(kind)||!Number.isSafeInteger(id)||!c.lots.some(l=>l.id===id&&l.kind===kind))throw Error('選択した装備がありません');
 if(items){for(const [kind,count]of Object.entries(items))if(isEquipment(kind)&&(!validCount(count)||(counts[kind]??0)!==count))throw Error('装備の所持数と個体が一致しません');for(const [kind,count]of Object.entries(counts))if((items[kind]??0)!==count)throw Error('装備の所持数と個体が一致しません');}
 for(const id of ids)seen?.add(id);
 return {version:1,revision:c.revision,lots:c.lots.map(l=>({id:l.id,kind:l.kind,count:l.count,...(l.quality===undefined?{}:{quality:l.quality}),...(l.durability===undefined?{}:{durability:l.durability}),...(l.legacy?{legacy:true as const}:{}),...(l.fusion?{fusion:{equipment:l.kind,material:l.fusion.material,damage:l.fusion.damage,durability:l.fusion.durability,effect:l.fusion.effect}}:{})})),activeByKind:{...c.activeByKind}};
}
export function selectedGear(container:GearContainer,kind:string):GearLot|undefined{return container.lots.find(l=>l.id===container.activeByKind[kind]&&l.kind===kind)??container.lots.find(l=>l.kind===kind);}
export function projectGear(container:GearContainer,items:Readonly<Record<string,number>>):Record<string,number>{
 const projected={...items};for(const kind of Object.keys(projected))if(isEquipment(kind))projected[kind]=0;for(const lot of container.lots)projected[lot.kind]=(projected[lot.kind]??0)+lot.count;return projected;
}
function reconcileSelection(container:GearContainer):void{
 for(const [kind,id]of Object.entries(container.activeByKind))if(!container.lots.some(l=>l.id===id&&l.kind===kind))delete container.activeByKind[kind];
 for(const lot of container.lots)container.activeByKind[lot.kind]??=lot.id;
}
/** Source metadata is used once. A fusion has a single charge pool and is assigned to one unit only. */
export function migrateGear(items:Readonly<Record<string,number>>,allocate:GearAllocator,metadata:{quality?:Record<string,number>;durability?:Record<string,number>;fusions?:readonly SkyFusion[];fresh?:boolean}={}):GearContainer{
 const entries=Object.entries(items).filter(([kind,count])=>isEquipment(kind)&&count>0);
 if(entries.length*2>GEAR_LIMITS.lots||entries.some(([,count])=>!validCount(count)))throw Error('旧装備の所持数が不正です');
 const container=emptyGear();
 for(const [kind,count]of entries){
  const quality=metadata.quality?.[kind]??(metadata.fresh?1:undefined),durability=metadata.durability?.[kind]??(metadata.fresh?gearMaxDurability(kind,quality??1):undefined),fusion=metadata.fusions?.find(f=>f.equipment===kind);
  const base={kind,...(metadata.fresh?{}:{legacy:true as const}),...(quality===undefined?{}:{quality}),...(durability===undefined?{}:{durability})};
  const first:GearLot={...base,id:freshId(allocate),count:fusion?1:count,...(fusion?{fusion:structuredClone(fusion)}:{})};container.lots.push(first);container.activeByKind[kind]=first.id;
  if(fusion&&count>1)container.lots.push({...base,id:freshId(allocate),count:count-1});
 }
 return validateGear(container,items);
}
/** Select by identity without changing any item's quality, durability or count. */
export function selectGear(container:GearContainer,id:number):GearContainer{
 const lot=container.lots.find(l=>l.id===id);if(!lot)throw Error('その装備は持っていません');const next=structuredClone(container);next.revision=nextRevision(container);next.activeByKind[lot.kind]=id;return next;
}
/** Returns a new source of truth. Caller commits only after its material/capacity checks also pass. */
export function mutateGear(container:GearContainer,kind:string,allocate:GearAllocator,edit:(lot:GearLot)=>void):GearContainer{
 const selected=selectedGear(container,kind);if(!selected)throw Error('持っている装備を選んでください');
 if(selected.count>1&&container.lots.length>=GEAR_LIMITS.lots)throw Error('装備の個体記録がいっぱいです');
 const next=structuredClone(container);next.revision=nextRevision(container);let lot=next.lots.find(l=>l.id===selected.id)!;
 if(lot.count>1){lot.count--;lot={...structuredClone(lot),id:freshId(allocate),count:1};next.lots.push(lot);next.activeByKind[kind]=lot.id;}
 edit(lot);return validateGear(next,projectGear(container,{}));
}
export function mintGear(container:GearContainer,kind:string,count:number,allocate:GearAllocator,metadata:Pick<GearLot,'quality'|'durability'>={quality:1,durability:gearMaxDurability(kind)}):GearContainer{
 if(!isEquipment(kind)||!validCount(count)||count<1)throw Error('作る装備の数が不正です');if(container.lots.length>=GEAR_LIMITS.lots)throw Error('装備の個体記録がいっぱいです');
 const next=structuredClone(container);next.revision=nextRevision(container);const lot:GearLot={id:freshId(allocate),kind,count,...metadata};next.lots.push(lot);next.activeByKind[kind]??=lot.id;return validateGear(next);
}
/** Move exact lots, splitting compact batches only when a partial transfer needs a new identity. */
export function transferGear(source:GearContainer,destination:GearContainer,kind:string,count:number,allocate:GearAllocator,selectedId?:number):{source:GearContainer;destination:GearContainer}{
 if(!isEquipment(kind)||!validCount(count)||count<1)throw Error('移す装備の数が不正です');
 const priority=selectedId??selectedGear(source,kind)?.id,candidates=source.lots.filter(l=>l.kind===kind).sort((a,b)=>Number(b.id===priority)-Number(a.id===priority)||a.id-b.id);
 if(selectedId!==undefined&&!candidates.some(l=>l.id===selectedId&&l.count>=count))throw Error('選んだ装備はありません');
 if(candidates.reduce((n,l)=>n+l.count,0)<count)throw Error('移す装備が足りません');
 if(source.lots.some(l=>destination.lots.some(d=>d.id===l.id)))throw Error('装備の所有が重複しています');
 let remaining=count,added=0;for(const lot of candidates){if(!remaining)break;remaining-=Math.min(remaining,lot.count);added++;}
 if(destination.lots.length+added>GEAR_LIMITS.lots)throw Error('移し先の装備記録がいっぱいです');
 const from=structuredClone(source),to=structuredClone(destination);from.revision=nextRevision(source);to.revision=nextRevision(destination);remaining=count;
 for(const candidate of candidates){if(!remaining)break;const lot=from.lots.find(l=>l.id===candidate.id)!,take=Math.min(remaining,lot.count);remaining-=take;
  if(take===lot.count){from.lots=from.lots.filter(l=>l.id!==lot.id);to.lots.push(lot);}else{lot.count-=take;to.lots.push({...structuredClone(lot),id:freshId(allocate),count:take});}
 }
 reconcileSelection(from);reconcileSelection(to);validateGear(from);validateGear(to);return{source:from,destination:to};
}
export function fuseBridge(get:()=>GearContainer,commit:(next:GearContainer)=>void,allocate:GearAllocator,reserve?:()=>{allocate:GearAllocator;commit():void}):EquipmentFusionBridge{
 return{list:()=>Object.keys(get().activeByKind).flatMap(kind=>{const f=selectedGear(get(),kind)?.fusion;return f?[structuredClone(f)]:[];}),get:kind=>{const f=selectedGear(get(),kind)?.fusion;return f&&f.durability>0?structuredClone(f):undefined;},prepare(kind,fusion){const source=get(),revision=source.revision,ids=reserve?.(),next=mutateGear(source,kind,ids?.allocate??allocate,lot=>{if(fusion)lot.fusion=structuredClone(fusion);else delete lot.fusion;});let used=false;return()=>{if(used||get().revision!==revision)throw Error('装備が更新されています。選び直してください');ids?.commit();commit(next);used=true;};},wear(kind){const selected=selectedGear(get(),kind);if(selected?.fusion&&selected.fusion.durability>0){const ids=reserve?.(),next=mutateGear(get(),kind,ids?.allocate??allocate,lot=>lot.fusion!.durability=Math.max(0,lot.fusion!.durability-1));ids?.commit();commit(next);}}};
}
