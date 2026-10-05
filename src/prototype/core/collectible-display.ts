import {CAMPAIGN_ITEMS,validCampaignState,validGearState,type CampaignSystem,type CampaignState,type GearState} from './campaign';
import {GEAR_SLOTS} from './equipment';
import {STORAGE_CAPACITY,type HomesteadSystem,type HomesteadState} from './homestead';
import {VoxelField,key,type Vec3,type VoxelState} from './voxel';
import {integer,record} from '../../save/validation';

export const DISPLAY_BASE='build:home:display-base',DISPLAY_ITEM='build:home:display-item';
export const DISPLAY_POSITION:Readonly<Vec3>={x:-1,y:1.1,z:2.5};
export const DISPLAY_COST:Readonly<Record<number,number>>={4:4,3:3};
const collectibles=['herbs','sun-herb','amber-resin','marsh-fiber','singing-copper','ash-glass','rime-heart','lake-pearl','lore-leaf','echo-vault-seal'];
/** Progression keys/seals that are still needed for unlocks cannot be deposited. */
export const DISPLAY_ITEMS=Object.values(CAMPAIGN_ITEMS).filter(i=>collectibles.includes(i.id)||GEAR_SLOTS.includes(i.slot!));
export interface CollectibleDisplayState {version:1;built:boolean;item:string|null;gear:GearState|null}
export interface DisplayContext {mayEdit:boolean;alive:boolean;baseActive:boolean;position:Vec3;blockers:readonly Vec3[]}
export const freshCollectibleDisplay=():CollectibleDisplayState=>({version:1,built:false,item:null,gear:null});
const result=(ok:boolean,message:string)=>({ok,message});
const isGear=(id:string)=>GEAR_SLOTS.includes(CAMPAIGN_ITEMS[id]?.slot!);
export function validCollectibleDisplay(value:unknown):value is CollectibleDisplayState {
 if(!record(value)||Object.keys(value).length!==4||value.version!==1||typeof value.built!=='boolean'||value.item!==null&&(typeof value.item!=='string'||!DISPLAY_ITEMS.some(i=>i.id===value.item)))return false;
 if(!value.built&&value.item!==null)return false;
 if(value.item===null||!isGear(value.item))return value.gear===null;
 return validGearState(value.item,value.gear);
}
function author(field:VoxelField,item:string|null){
 field.box({x:-1.5,y:.25,z:2},{x:-.5,y:.5,z:3},3,DISPLAY_BASE,.08);
 field.box({x:-1.25,y:.45,z:2.25},{x:-.75,y:.95,z:2.75},4,DISPLAY_BASE,.06);
 field.box({x:-1.5,y:.9,z:2},{x:-.5,y:1.15,z:3},4,DISPLAY_BASE,.05);
 if(!item)return;
 const box=(a:Vec3,b:Vec3,m:number)=>field.box(a,b,m,DISPLAY_ITEM,.035);
 if(isGear(item)){
  const slot=CAMPAIGN_ITEMS[item].slot;
  if(slot==='weapon'||slot==='tool'){
   box({x:-1.27,y:1.15,z:2.23},{x:-.98,y:1.65,z:2.52},4);
   box({x:-1.5,y:1.5,z:2.23},{x:-.75,y:1.78,z:2.52},4);
   box({x:-1.27,y:1.7,z:2.23},{x:-.98,y:2.22,z:2.52},item==='staff'||item==='bow'?4:6);
  }else{
   box({x:-1.38,y:1.15,z:2.28},{x:-.62,y:1.8,z:2.72},item.startsWith('copper')?6:10);
   if(slot==='armor')box({x:-1.5,y:1.5,z:2.3},{x:-.5,y:1.8,z:2.7},item==='copper-mail'?6:10);
  }
 }else if(item==='lore-leaf')box({x:-1.38,y:1.15,z:2.16},{x:-.62,y:1.4,z:2.84},10);
 else if(['herbs','sun-herb','marsh-fiber'].includes(item)){
  box({x:-1.22,y:1.15,z:2.28},{x:-.78,y:1.5,z:2.72},3);
  box({x:-1.35,y:1.45,z:2.3},{x:-.65,y:1.8,z:2.7},7);
 }else{
  box({x:-1.3,y:1.15,z:2.22},{x:-.7,y:1.65,z:2.78},item==='echo-vault-seal'||item==='singing-copper'?6:8);
  box({x:-1.13,y:1.6,z:2.36},{x:-.87,y:1.85,z:2.64},item==='echo-vault-seal'?6:8);
 }
}
const templates=new Map<string,VoxelState>();
function template(item:string|null){const id=item??'';let state=templates.get(id);if(!state){const field=new VoxelField();author(field,item);state=field.exportState();templates.set(id,state);}return state;}
/** Full raw layer equality is affordable for this bounded, protected furniture.
 * No reload regeneration, hidden free refunds, or second item ledger. */
export function validCollectibleDisplaySave(value:unknown,field:VoxelState,campaign:CampaignState,home:HomesteadState){
 const state=value===undefined?freshCollectibleDisplay():value;if(!validCollectibleDisplay(state))return false;
 const reserved=[DISPLAY_BASE,DISPLAY_ITEM],actual=field.layers.filter(l=>reserved.includes(l.id));
 if(field.suppressed?.some(id=>reserved.includes(id)))return false;
 const expected=state.built?template(state.item).layers:[];
 if(actual.length!==expected.length||field.order.filter(id=>reserved.includes(id)).length!==expected.length)return false;
 for(const layer of expected){const saved=actual.find(l=>l.id===layer.id);if(!saved||saved.removed.length||saved.cells.length!==layer.cells.length)return false;const cells=new Map(saved.cells.map(c=>[key(c[0],c[1],c[2]),c]));if(cells.size!==saved.cells.length||layer.cells.some(c=>{const other=cells.get(key(c[0],c[1],c[2]));return !other||other[4]!==c[4]||Math.abs(other[3]-c[3])>1e-12;}))return false;}
 if(!state.item)return true;
 if(!integer(home.storage.items[state.item],1,STORAGE_CAPACITY))return false;
 if(isGear(state.item)){
  if(home.storage.items[state.item]!==1||(campaign.items[state.item]??0)!==0||Object.hasOwn(campaign.gearState,state.item)||Object.values(campaign.equipment).includes(state.item))return false;
  return validCampaignState({...campaign,items:{...campaign.items,[state.item]:1},gearState:{...campaign.gearState,[state.item]:state.gear!}});
 }
 return true;
}
export class CollectibleDisplaySystem {
 state=freshCollectibleDisplay();
 constructor(readonly field:VoxelField,readonly campaign:CampaignSystem,readonly home:HomesteadSystem){
  home.reservedItemCount=id=>this.state.item===id?1:0;
  campaign.externalItemCount=id=>home.state.storage.items[id]??0;
 }
 snapshot():CollectibleDisplayState{return {...this.state,gear:this.state.gear?{...this.state.gear}:null};}
 restore(value:unknown){if(!validCollectibleDisplay(value))return false;this.state={...value,gear:value.gear?{...value.gear}:null};return true;}
 status(c:DisplayContext){
  if(!c.mayEdit)return result(false,'展示の変更にはホストの編集許可が必要です。');
  if(!c.alive)return result(false,'復活してから操作してください。');
  if(!c.baseActive)return result(false,'先に拠点の炉を灯してください。');
  if(![c.position.x,c.position.y,c.position.z].every(Number.isFinite)||Math.hypot(c.position.x+3,c.position.y-.25,c.position.z-4)>4)return result(false,'灯守りの炉から4m以内で操作してください。');
  return result(true,'拠点の記念展示を変更できます。');
 }
 buildStatus(c:DisplayContext){
  const gate=this.status(c);if(!gate.ok)return gate;if(this.state.built)return result(false,'展示台は設置済みです。');
  if(c.blockers.some(p=>p.x+.55>-1.5&&p.x-.55<-.5&&p.z+.55>2&&p.z-.55<3&&p.y<2.3&&p.y+1.9>.25))return result(false,'展示場所に人や動物がいます。');
  // Reserve the full display volume before accepting payment, including later tall exhibits.
  for(let x=-1.375;x<-.5;x+=.25)for(let z=2.125;z<3;z+=.25)for(let y=.375;y<2.3;y+=.25)if(this.field.distance({x,y,z})<-.01)return result(false,'展示場所に建築や固体があります。');
  for(const x of [-1.375,-.625])for(const z of [2.125,2.875])if(this.field.distance({x,y:.2,z})>.035)return result(false,'展示台の四隅に地面の支えが必要です。');
  if(Object.entries(DISPLAY_COST).some(([id,n])=>!integer(this.home.materials[Number(id)],n,999999)))return result(false,'展示台には木材4・石3が必要です。');
  return result(true,'展示台を設置できます。');
 }
 build(c:DisplayContext){const check=this.buildStatus(c);if(!check.ok)return check;author(this.field,null);for(const [id,n] of Object.entries(DISPLAY_COST))this.home.materials[Number(id)]-=n;this.state.built=true;return result(true,'記念展示台を設置。所持している品を1つ預けて展示できます。');}
 depositStatus(id:string,c:DisplayContext){
  const gate=this.status(c);if(!gate.ok)return gate;if(!this.state.built)return result(false,'先に記念展示台を設置してください。');if(this.state.item)return result(false,'先に展示中の品を取り出してください。');
  if(!DISPLAY_ITEMS.some(i=>i.id===id))return result(false,'この品は展示できません。');if(!integer(this.campaign.state.items[id],1,CAMPAIGN_ITEMS[id].stackLimit))return result(false,'所持している品だけ展示できます。');
  if(Object.values(this.campaign.state.equipment).includes(id))return result(false,'装備・成長で装備を外してから展示してください。');
  if(c.blockers.some(p=>p.x+.55>-1.5&&p.x-.55<-.5&&p.z+.55>2&&p.z-.55<3&&p.y<2.3&&p.y+1.9>1.15))return result(false,'展示品を置く場所に人や動物がいます。');
  for(const cell of template(id).layers.find(l=>l.id===DISPLAY_ITEM)!.cells){if(cell[3]>=-.005)continue;const point={x:(cell[0]+.5)*this.field.size,y:(cell[1]+.5)*this.field.size,z:(cell[2]+.5)*this.field.size},other=this.field.at(point);if(other&&other.object!==DISPLAY_BASE)return result(false,'展示品を置く場所に建築や固体があります。');}
  if(this.home.storedCount>=STORAGE_CAPACITY)return result(false,'収納の空きを1つ作ってください。');
  return result(true,'1つ預けて展示できます。');
 }
 deposit(id:string,c:DisplayContext){
  const check=this.depositStatus(id,c);if(!check.ok)return check;
  const gear=isGear(id)?this.campaign.gearInfo(id):null;
  this.campaign.state.items[id]--;this.home.state.storage.items[id]=(this.home.state.storage.items[id]??0)+1;if(gear)delete this.campaign.state.gearState[id];
  this.state.item=id;this.state.gear=gear;this.field.removeObject(DISPLAY_ITEM);author(this.field,id);
  return result(true,CAMPAIGN_ITEMS[id].label+'を展示しました。装備の性能は展示中は働きません。');
 }
 withdrawStatus(c:DisplayContext){const gate=this.status(c);if(!gate.ok)return gate;const id=this.state.item;if(!id)return result(false,'展示中の品はありません。');if(!integer(this.home.state.storage.items[id],1,STORAGE_CAPACITY))return result(false,'展示品の収納記録を確認できません。');if(!integer((this.campaign.state.items[id]??0)+1,1,CAMPAIGN_ITEMS[id].stackLimit))return result(false,'持ち物の空きを作ってください。');return result(true,'同じ品を1つ持ち物へ戻します。');}
 withdraw(c:DisplayContext){const check=this.withdrawStatus(c);if(!check.ok)return check;const id=this.state.item!;this.home.state.storage.items[id]--;this.campaign.state.items[id]=(this.campaign.state.items[id]??0)+1;if(this.state.gear)this.campaign.state.gearState[id]={...this.state.gear};this.state.item=null;this.state.gear=null;this.field.removeObject(DISPLAY_ITEM);return result(true,CAMPAIGN_ITEMS[id].label+'を取り出しました。耐久・強化・ジェムは保存されます。');}
 removeStatus(c:DisplayContext){const gate=this.status(c);if(!gate.ok)return gate;if(!this.state.built)return result(false,'展示台はありません。');if(this.state.item)return result(false,'先に展示品を取り出してください。');if(Object.entries(DISPLAY_COST).some(([id,n])=>!integer((this.home.materials[Number(id)]??0)+n,0,999999)))return result(false,'返却する木材4・石3の空きを作ってください。');return result(true,'空の展示台を撤去し、木材4・石3を返します。');}
 remove(c:DisplayContext){const check=this.removeStatus(c);if(!check.ok)return check;this.field.removeObject(DISPLAY_BASE);for(const [id,n] of Object.entries(DISPLAY_COST))this.home.materials[Number(id)]=(this.home.materials[Number(id)]??0)+n;this.state=freshCollectibleDisplay();return result(true,'展示台を撤去し、木材4・石3を返しました。');}
}
