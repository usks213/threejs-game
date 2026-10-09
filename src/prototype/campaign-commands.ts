import {validInventoryCommand} from './core/inventory';
import type {CoreSimulation} from './core/simulation';
import type {CampaignCommand} from './campaign-ui';
import {record} from '../save/validation';
export type GameCommand=Extract<CampaignCommand,{type:'craft'|'equip'|'consume'|'learn'|'travel'|'remove-pin'|'homestead'|'gear'|'inventory'|'storage'}>;
export interface CommandResult {ok:boolean;message:string;heal?:number;position?:{x:number;y:number;z:number}}
const types=['craft','equip','consume','learn','travel','homestead','gear'];
export function isGameCommand(value:unknown):value is GameCommand {
 if(record(value)&&Object.hasOwn(value,'type')&&value.type==='inventory')return validInventoryCommand(value);
 if(record(value)&&Object.hasOwn(value,'type')&&value.type==='storage')return Object.hasOwn(value,'id')&&typeof value.id==='string'&&value.id.length<=100&&/^(deposit|withdraw):([0-9]+|item:[a-z0-9-]+)$/.test(value.id)&&Reflect.ownKeys(value).length===5&&Reflect.ownKeys(value).every(k=>['type','id','count','revision','stored'].includes(String(k)))&&Number.isSafeInteger(value.count)&&Number(value.count)>=1&&Number(value.count)<=999999&&Number.isSafeInteger(value.revision)&&Number(value.revision)>=0&&Number(value.revision)<1e9&&Number.isSafeInteger(value.stored)&&Number(value.stored)>=0&&Number(value.stored)<=500;
 if(!record(value)||!Object.hasOwn(value,'type')||!Object.hasOwn(value,'id')||typeof value.type!=='string'||!types.includes(value.type)||typeof value.id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(value.id))return false;
 if(!Reflect.ownKeys(value).every(k=>k==='type'||k==='id'||value.type==='craft'&&k==='count'))return false;
 return !Object.hasOwn(value,'count')||typeof value.count==='number'&&Number.isSafeInteger(value.count)&&value.count>=1&&value.count<=20;
}
/** Same transactions for local controls and a host-validated companion context. */
export function executeGameCommand(sim:CoreSimulation,cmd:GameCommand):CommandResult {
 if(!(sim.player.hp>0)&&!(cmd.type==='gear'&&cmd.id.split(':')[0]==='rescue'))return {ok:false,message:'死亡中は復活してから操作する'};
 if(cmd.type==='inventory')return sim.campaign.inventory.execute(cmd,sim.player.position,sim.arena.field,sim.player.yaw,sim.westernContent?{minX:-128,maxX:128,minZ:-160,maxZ:100}:{minX:-80,maxX:80,minZ:-100,maxZ:100});
 if(cmd.type==='storage'){if(!isGameCommand(cmd))return {ok:false,message:'収納操作が不正です。'};if(sim.player===sim.companion&&!sim.companionCanEdit)return {ok:false,message:'収納の変更にはホストの許可が必要です。'};const inventory=sim.campaign.inventory.reconcile();if(inventory.revision!==cmd.revision||sim.home.storedCount!==cmd.stored)return {ok:false,message:'所持品か収納が変わりました。数を選び直してください。'};const [action,kind,item]=cmd.id.split(':'),id=kind==='item'?item:Number(kind);return action==='deposit'?sim.home.deposit(id,cmd.count,sim.homeContext):sim.home.withdraw(id,cmd.count,sim.homeContext);}
 if(cmd.type==='craft')return sim.campaign.craft(cmd.id,sim.player.position,cmd.count);
 if(cmd.type==='equip'){if(!sim.canChangeEquipment)return {ok:false,message:'全員の動作が終わってから共有装備を変える'};const result=sim.campaign.equip(cmd.id);if(result.ok&&(sim.campaign.equippedTool===cmd.id||sim.campaign.equippedWeapon===cmd.id)){sim.fishing.selectRod(false);sim.soilFill=false;sim.player.tool=sim.campaign.equippedTool===cmd.id;sim.buildMode=sim.player.tool&&cmd.id==='build-hammer';}return result;}
 if(cmd.type==='consume'){if(cmd.id==='mana-draught')return sim.restoreMana();const r=sim.campaign.consume(cmd.id,sim.player.hp);if(r.heal)sim.player.hp=Math.min(sim.campaign.maxHp,sim.player.hp+r.heal);return r;}
 if(cmd.type==='learn'){const [id,rank,...extra]=cmd.id.split(':');if(extra.length||rank!==undefined&&!/^[1-3]$/.test(rank))return {ok:false,message:'技能ランクが無効'};return sim.campaign.learn(id,rank===undefined?1:Number(rank));}
 if(cmd.type==='travel'){const r=sim.enemies.some(e=>e.hp>0&&sim.enemyActive(e)&&Math.hypot(e.position.x-sim.player.position.x,e.position.z-sim.player.position.z)<8)?{ok:false,message:'敵が近い。安全な場所から移動する'}:cmd.id==='west-return-hearth'&&sim.western?sim.western.travel(cmd.id,sim.westActorContext):sim.campaign.travel(cmd.id);if(r.position){sim.player.position=sim.safePosition(r.position,true);sim.player.vx=sim.player.vz=sim.player.vy=0;sim.gliding=false;sim.grapple=null;}return r;}
 if(cmd.type==='gear'){if(cmd.id==='fishing-rod')return sim.selectFishingRod(!sim.fishing.selected);const [action,id,gem,...extra]=cmd.id.split(':');if(extra.length||gem!==undefined&&action!=='socket')return {ok:false,message:'装備操作が無効'};
  if(action==='rescue'){const guest=sim.player===sim.companion;sim.player.hp=0;if(!guest)sim.campaign.die(sim.safePosition(sim.player.position));sim.respawn();return {ok:true,message:guest?'共有拠点へ帰還':'素材25%を残し、安全な拠点へ帰還'};}
  if(action==='rest'&&id==='west-return-hearth'&&sim.western)return sim.western.rest(sim.westActorContext);
  if(action==='repair')return sim.campaign.repair(id,sim.player.position);
  if(action==='upgrade')return sim.campaign.upgrade(id,sim.player.position);
  if((action==='socket'||action==='unsocket')&&!sim.canChangeEquipment)return {ok:false,message:'全員の動作が終わってから共有装備を変える'};
  if(action==='socket')return sim.campaign.socket(id,gem??'ember-gem',sim.player.position);
  if(action==='unsocket')return sim.campaign.socket(id,null,sim.player.position);
  if(action==='salvage')return sim.campaign.salvage(id,true);
  if(action==='unequip'){if(!sim.canChangeEquipment)return {ok:false,message:'全員の動作が終わってから共有装備を変える'};const result=sim.campaign.unequip(id as 'weapon');if(result.ok&&id==='tool'){sim.player.tool=false;sim.buildMode=false;}return result;}
  if(action==='reset-skills')return sim.campaign.resetSkills();
 }
 if(cmd.type==='homestead'){const [action,id]=cmd.id.split(':'),h=sim.home,ctx=sim.homeContext;
  if(action==='display-build')return sim.display.build(sim.displayContext);if(action==='display-remove')return sim.display.remove(sim.displayContext);if(action==='display-deposit')return sim.display.deposit(id,sim.displayContext);if(action==='display-withdraw')return sim.display.withdraw(sim.displayContext);
  if(action==='watermill-build')return sim.watermill.build(sim.watermillContext);if(action==='watermill-repair')return sim.watermill.build(sim.watermillContext,true);if(action==='watermill-start')return sim.watermill.start(sim.watermillContext);if(action==='watermill-claim')return sim.watermill.claim(Number(id),sim.watermillContext);
  if(['deposit','withdraw','deposit-all','deposit-matching'].includes(action)&&sim.player===sim.companion&&!sim.companionCanEdit)return {ok:false,message:'収納の変更にはホストの許可が必要です。'};
  if(action==='deposit')return h.deposit(Number(id),1,ctx);if(action==='withdraw')return h.withdraw(Number(id),1,ctx);if(action==='deposit-all')return h.depositAll(ctx);if(action==='deposit-matching')return h.depositMatching(ctx);
  if(action==='seed')return h.prepareSeeds(ctx);if(action==='plant')return h.plant(Number(id),ctx);if(action==='harvest')return h.harvest(Number(id),ctx);
  if(action==='tame')return h.tame(ctx);if(action==='feed')return h.feed(ctx);if(action==='animal')return h.claimAnimal(ctx);if(action==='process')return h.startProcessing(id,ctx);if(action==='claim')return h.claimProcessing(Number(id),ctx);
  if(action==='player-bed-repair')return sim.repairPlayerBed();
  if(action==='furniture'){if(sim.furnitureBlocked(id))return {ok:false,message:'住人や同行者などが設置場所にいます。通り過ぎるのを待ってください'};const r=h.placeFurniture(id,sim.furnitureContext(id));if(r.ok)sim.buildFurniture(id);return r;}
 }return {ok:false,message:'この操作は利用できません'};
}
