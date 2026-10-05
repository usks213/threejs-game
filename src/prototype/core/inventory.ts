import {CAMPAIGN_ITEMS,CAMPAIGN_MATERIALS,type CampaignSystem} from './campaign';
import type {Vec3,VoxelField} from './voxel';

/** Slots are a bounded presentation of the authoritative quantity ledgers, never
 * independent item instances. External rewards/consumption reconcile lazily. */
export const INVENTORY_SLOTS=96,INVENTORY_DROPS=32,INVENTORY_MATERIAL_LIMIT=1e9;
export type InventoryKey=`material:${number}`|`item:${string}`;
export interface InventoryStack {key:InventoryKey;count:number}
export interface InventoryDrop extends InventoryStack {id:number;position:Vec3;origin:Vec3;vy:number}
export interface InventoryState {version:1;revision:number;slots:(InventoryStack|null)[];drops:InventoryDrop[];nextDropId:number}
export interface InventoryWorldBounds {minX:number;maxX:number;minZ:number;maxZ:number}
const defaultBounds:InventoryWorldBounds={minX:-80,maxX:80,minZ:-100,maxZ:100};
export interface InventoryCommand {type:'inventory';id:'split'|'combine'|'move'|'sort'|'drop'|'pickup';revision:number;slot?:number;target?:number;count?:number}
export interface InventoryResult {ok:boolean;message:string}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:object,expected:readonly string[])=>Reflect.ownKeys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown,min=0,max=1e9):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const position=(v:unknown):v is Vec3=>object(v)&&keys(v,['x','y','z'])&&['x','y','z'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k] as number)<1000);
const result=(ok:boolean,message:string):InventoryResult=>({ok,message});
export function inventoryDefinition(key:string){
 if(key.startsWith('material:')){const id=key.slice(9);return String(Number(id))===id&&Object.hasOwn(CAMPAIGN_MATERIALS,id)?CAMPAIGN_MATERIALS[Number(id)]:undefined;}
 if(key.startsWith('item:')&&Object.hasOwn(CAMPAIGN_ITEMS,key.slice(5)))return CAMPAIGN_ITEMS[key.slice(5)];
 return undefined;
}
export const inventoryLimit=(key:string)=>key.startsWith('material:')?INVENTORY_MATERIAL_LIMIT:inventoryDefinition(key)?.stackLimit??0;
export function inventoryProtected(key:string){const def=inventoryDefinition(key);return !def||def.category==='quest'||'slot' in def&&!!def.slot||def.id==='fishing-rod';}
export function validInventoryState(value:unknown):value is InventoryState {
 if(!object(value)||!keys(value,['version','revision','slots','drops','nextDropId'])||value.version!==1||!integer(value.revision)||!integer(value.nextDropId,1)||!Array.isArray(value.slots)||value.slots.length!==INVENTORY_SLOTS||Object.keys(value.slots).length!==value.slots.length||!Array.isArray(value.drops)||value.drops.length>INVENTORY_DROPS||Object.keys(value.drops).length!==value.drops.length)return false;
 const stack=(v:unknown):v is InventoryStack=>object(v)&&Object.hasOwn(v,'key')&&Object.hasOwn(v,'count')&&typeof v.key==='string'&&!!inventoryDefinition(v.key)&&integer(v.count,1,inventoryLimit(v.key));
 if(value.slots.some(s=>s!==null&&(!stack(s)||!keys(s,['key','count']))))return false;
 const layoutTotals=new Map<string,number>();for(const slot of value.slots)if(slot)layoutTotals.set(slot.key,(layoutTotals.get(slot.key)??0)+slot.count);if([...layoutTotals].some(([key,n])=>n>inventoryLimit(key)))return false;
 const ids=new Set<number>(),totals=new Map<string,number>();
 for(const d of value.drops){if(!stack(d)||!keys(d,['id','key','count','position','origin','vy']))return false;const drop=d as unknown as InventoryDrop;if(!integer(drop.id,1,value.nextDropId-1)||ids.has(drop.id)||inventoryProtected(drop.key)||!position(drop.position)||!position(drop.origin)||typeof drop.vy!=='number'||!Number.isFinite(drop.vy)||Math.abs(drop.vy)>20)return false;ids.add(drop.id);totals.set(drop.key,(totals.get(drop.key)??0)+drop.count);}
 return [...totals].every(([key,n])=>n<=INVENTORY_MATERIAL_LIMIT&&!!inventoryDefinition(key));
}
export function validInventoryCommand(value:Record<string,unknown>):value is Record<string,unknown> & InventoryCommand {
 if(value.type!=='inventory'||!integer(value.revision)||typeof value.id!=='string')return false;
 const keys=value.id==='sort'?['type','id','revision']:value.id==='pickup'?['type','id','revision','target','count']:value.id==='drop'?['type','id','revision','slot','count']:['type','id','revision','slot','target','count'];
 if(!Reflect.ownKeys(value).every(k=>typeof k==='string'&&keys.includes(k))||!keys.every(k=>Object.hasOwn(value,k)))return false;
 if(value.id==='sort')return true;
 if(!integer(value.count,1))return false;
 if(value.id==='pickup')return integer(value.target,1);
 if(!integer(value.slot,0,INVENTORY_SLOTS-1))return false;
 return value.id==='drop'||['split','combine','move'].includes(value.id)&&integer(value.target,0,INVENTORY_SLOTS-1);
}
export function freshInventory():InventoryState{return {version:1,revision:0,slots:Array(INVENTORY_SLOTS).fill(null),drops:[],nextDropId:1};}
export class CampaignInventory {
 constructor(private readonly campaign:CampaignSystem){}
 get state(){return this.campaign.state.inventory??(this.campaign.state.inventory=freshInventory());}
 private holdings(){return new Map<InventoryKey,number>([...Object.entries(this.campaign.materials).filter(([,n])=>n>0).map(([id,n])=>[`material:${id}` as InventoryKey,n] as const),...Object.entries(this.campaign.state.items).filter(([,n])=>n>0).map(([id,n])=>[`item:${id}` as InventoryKey,n] as const)]);}
 private ledger(key:InventoryKey):Record<string,number>{return key.startsWith('material:')?this.campaign.materials:this.campaign.state.items;}
 private id(key:InventoryKey){return key.slice(key.startsWith('material:')?9:5);}
 private commit(){this.state.revision=Math.min(1e9,this.state.revision+1);}
 /** Preserve split positions while reconciling spends. New rewards first merge
  * into matching stacks. If split slots obstruct a new kind, compact safely. */
 reconcile(){
  const s=this.state,remaining=this.holdings();
  const next=s.slots.map(stack=>{if(!stack)return null;const count=Math.min(stack.count,remaining.get(stack.key)??0);remaining.set(stack.key,(remaining.get(stack.key)??0)-count);return count?{key:stack.key,count}:null;});
  for(const [key,amount] of remaining){if(!amount)continue;const existing=next.find(x=>x?.key===key);if(existing)existing.count+=amount;else{const free=next.indexOf(null);if(free<0){const compact=[...this.holdings()].map(([key,count])=>({key,count}));if(compact.length>INVENTORY_SLOTS)throw Error('Inventory catalog exceeds slot capacity');next.splice(0,next.length,...compact,...Array(INVENTORY_SLOTS-compact.length).fill(null));break;}next[free]={key,count:amount};}}
  if(next.some((slot,i)=>slot?.key!==s.slots[i]?.key||slot?.count!==s.slots[i]?.count)){s.slots=next;this.commit();}
  return s;
 }
 snapshot(){return structuredClone(this.reconcile());}
 private checkRevision(revision:number){this.reconcile();return integer(revision)&&revision===this.state.revision&&revision<1e9;}
 execute(cmd:InventoryCommand,position:Vec3,field:VoxelField,yaw=0,bounds:InventoryWorldBounds=defaultBounds):InventoryResult {
  if(!validInventoryCommand(cmd as unknown as Record<string,unknown>))return result(false,'持物の操作が不正です。');
  if(!this.checkRevision(cmd.revision))return result(false,'持物が変わりました。選び直してください。');
  if(cmd.id==='pickup')return this.pickup(cmd.target!,cmd.count!,position,field);
  if(cmd.id==='sort'){const entries=[...this.holdings()].sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>({key,count}));this.state.slots=[...entries,...Array(INVENTORY_SLOTS-entries.length).fill(null)];this.commit();return result(true,'同じ品物をまとめ、種類順に整理しました。');}
  const source=this.state.slots[cmd.slot!],count=cmd.count!;
  if(!source||count>source.count)return result(false,'選んだ枠の数が足りません。');
  if(cmd.id==='drop')return this.drop(cmd.slot!,count,position,field,yaw,bounds);
  const target=this.state.slots[cmd.target!];
  if(cmd.slot===cmd.target)return result(false,'別の移動先を選んでください。');
  if(cmd.id==='split'&&(target||count>=source.count))return result(false,'分割は元の数より少なくし、空き枠を選んでください。');
  if(cmd.id==='combine'&&(!target||target.key!==source.key))return result(false,'同じ品物の枠を選んでください。');
  if(cmd.id==='move'&&target)return result(false,'移動先は空き枠を選んでください。');
  if(target){if(target.count+count>inventoryLimit(source.key))return result(false,'結合先の上限です。');target.count+=count;}
  else this.state.slots[cmd.target!]={key:source.key,count};
  source.count-=count;if(!source.count)this.state.slots[cmd.slot!]=null;this.commit();return result(true,`${inventoryDefinition(source.key)!.label} ×${count}を${cmd.id==='split'?'分割':cmd.id==='combine'?'結合':'移動'}しました。`);
 }
 private drop(slot:number,count:number,actor:Vec3,field:VoxelField,yaw:number,bounds:InventoryWorldBounds){
  const stack=this.state.slots[slot]!;
  if(inventoryProtected(stack.key))return result(false,'装備・釣竿・重要品は落とせません。展示できる装備は拠点の記念展示台を利用してください。');
  if(this.state.drops.length>=INVENTORY_DROPS||this.state.nextDropId>=1e9)return result(false,'落とし物は32包までです。先に回収してください。');
  if(!position(actor)||!Number.isFinite(yaw))return result(false,'安全な場所で落としてください。');
  const eye={...actor,y:actor.y+1.52},point={x:actor.x-Math.sin(yaw)*.65,y:actor.y+.5,z:actor.z-Math.cos(yaw)*.65},delta={x:point.x-eye.x,y:point.y-eye.y,z:point.z-eye.z};
  if(!position(point)||point.x<bounds.minX||point.x>bounds.maxX||point.z<bounds.minZ||point.z>bounds.maxZ||point.y<-29||point.y>99||field.distance(point)<.15||field.ray(eye,delta,Math.hypot(delta.x,delta.y,delta.z)-.12))return result(false,'目の前に落とす空間がありません。少し離れてください。');
  this.ledger(stack.key)[this.id(stack.key)]-=count;
  this.state.drops.push({id:this.state.nextDropId++,key:stack.key,count,position:point,origin:{...point},vy:0});
  stack.count-=count;if(!stack.count)this.state.slots[slot]=null;this.commit();return result(true,`${inventoryDefinition(stack.key)!.label} ×${count}を落としました。照準を合わせて回収できます。`);
 }
 pickupStatus(id:number,count:number,actor:Vec3,field:VoxelField):InventoryResult {
  const drop=this.state.drops.find(d=>d.id===id);if(!drop||!integer(count,1)||count>drop.count)return result(false,'落とし物の数を確認してください。');
  if(!position(actor))return result(false,'回収位置が不正です。');
  const eye={...actor,y:actor.y+1.52},delta={x:drop.position.x-eye.x,y:drop.position.y-eye.y,z:drop.position.z-eye.z},distance=Math.hypot(delta.x,delta.y,delta.z);
  if(distance>2.75||field.distance(drop.position)<.08||field.ray(eye,delta,Math.max(0,distance-.15)))return result(false,'落とし物が見える2.75m以内に近づいてください。');
  const held=this.ledger(drop.key)[this.id(drop.key)]??0;if(held+count>inventoryLimit(drop.key))return result(false,'持物の所持上限です。数を減らしてください。');
  if(!this.state.slots.some(s=>s===null||s.key===drop.key))return result(false,'持物の枠がいっぱいです。結合か整理で空きを作ってください。');
  return result(true,'指定した数を回収できます。');
 }
 pickup(id:number,count:number,actor:Vec3,field:VoxelField):InventoryResult {
  this.reconcile();const status=this.pickupStatus(id,count,actor,field);if(!status.ok)return status;
  const drop=this.state.drops.find(d=>d.id===id)!;this.ledger(drop.key)[this.id(drop.key)]=(this.ledger(drop.key)[this.id(drop.key)]??0)+count;drop.count-=count;if(!drop.count)this.state.drops.splice(this.state.drops.indexOf(drop),1);this.reconcile();this.commit();return result(true,`${inventoryDefinition(drop.key)!.label} ×${count}を回収しました。`);
 }
 tick(dt:number,field:VoxelField){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
  for(const drop of this.state.drops){
   // Keep the last safe position if edited terrain encloses a bundle. It remains
   // in the save and cannot be collected through the enclosing surface.
   if(field.distance(drop.position)<.08){drop.vy=0;continue;}
   drop.vy=Math.max(-12,drop.vy-9.8*dt);const steps=Math.max(1,Math.ceil(Math.abs(drop.vy*dt)/.06));
   for(let i=0;i<steps;i++){const next={...drop.position,y:drop.position.y+drop.vy*dt/steps};if(next.y<Math.max(-29,drop.origin.y-12)||!position(next)){drop.position={...drop.origin};drop.vy=0;break;}if(field.distance(next)<.13){drop.vy=0;break;}drop.position=next;}
  }
 }
}
