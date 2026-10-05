import type {CoreSimulation} from './core/simulation';
import type {CampaignCommand} from './campaign-ui';
import {record} from '../save/validation';
export type GameCommand=Extract<CampaignCommand,{type:'craft'|'equip'|'consume'|'learn'|'travel'|'remove-pin'|'homestead'|'gear'}>;
export interface CommandResult {ok:boolean;message:string;heal?:number;position?:{x:number;y:number;z:number}}
const types=['craft','equip','consume','learn','travel','homestead','gear'];
export function isGameCommand(value:unknown):value is GameCommand {
 if(!record(value)||!Object.hasOwn(value,'type')||!Object.hasOwn(value,'id')||typeof value.type!=='string'||!types.includes(value.type)||typeof value.id!=='string'||!/^[a-zA-Z0-9:_-]{1,100}$/.test(value.id))return false;
 if(!Reflect.ownKeys(value).every(k=>k==='type'||k==='id'||value.type==='craft'&&k==='count'))return false;
 return !Object.hasOwn(value,'count')||typeof value.count==='number'&&Number.isSafeInteger(value.count)&&value.count>=1&&value.count<=20;
}
/** Same transactions for local controls and a host-validated companion context. */
export function executeGameCommand(sim:CoreSimulation,cmd:GameCommand):CommandResult {
 if(!(sim.player.hp>0)&&!(cmd.type==='gear'&&cmd.id.split(':')[0]==='rescue'))return {ok:false,message:'死亡中は復活してから操作する'};
 if(cmd.type==='craft')return sim.campaign.craft(cmd.id,sim.player.position,cmd.count);
 if(cmd.type==='equip')return sim.campaign.equip(cmd.id);
 if(cmd.type==='consume'){const r=sim.campaign.consume(cmd.id,sim.player.hp);if(r.heal)sim.player.hp=Math.min(sim.campaign.maxHp,sim.player.hp+r.heal);return r;}
 if(cmd.type==='learn')return sim.campaign.learn(cmd.id);
 if(cmd.type==='travel'){const r=sim.enemies.some(e=>e.hp>0&&sim.enemyActive(e)&&Math.hypot(e.position.x-sim.player.position.x,e.position.z-sim.player.position.z)<8)?{ok:false,message:'敵が近い。安全な場所から移動する'}:cmd.id==='west-return-hearth'&&sim.western?sim.western.travel(cmd.id,sim.westActorContext):sim.campaign.travel(cmd.id);if(r.position){sim.player.position=sim.safePosition(r.position,true);sim.player.vx=sim.player.vz=sim.player.vy=0;sim.gliding=false;sim.grapple=null;}return r;}
 if(cmd.type==='gear'){if(cmd.id==='fishing-rod')return sim.selectFishingRod(!sim.fishing.selected);const [action,id]=cmd.id.split(':');
  if(action==='rescue'){const guest=sim.player===sim.companion;sim.player.hp=0;if(!guest)sim.campaign.die(sim.safePosition(sim.player.position));sim.respawn();return {ok:true,message:guest?'共有拠点へ帰還':'素材25%を残し、安全な拠点へ帰還'};}
  if(action==='rest'&&id==='west-return-hearth'&&sim.western)return sim.western.rest(sim.westActorContext);
  if(action==='repair')return sim.campaign.repair(id,sim.player.position);
  if(action==='upgrade')return sim.campaign.upgrade(id,sim.player.position);
  if(action==='socket')return sim.campaign.socket(id,'ember-gem',sim.player.position);
  if(action==='unsocket')return sim.campaign.socket(id,null,sim.player.position);
  if(action==='salvage')return sim.campaign.salvage(id,true);
  if(action==='unequip')return sim.campaign.unequip(id as 'weapon');
  if(action==='reset-skills')return sim.campaign.resetSkills();
 }
 if(cmd.type==='homestead'){const [action,id]=cmd.id.split(':'),h=sim.home,ctx=sim.homeContext;
  if(action==='deposit')return h.deposit(Number(id),1,ctx);if(action==='withdraw')return h.withdraw(Number(id),1,ctx);if(action==='deposit-all')return h.depositAll(ctx);
  if(action==='seed')return h.prepareSeeds(ctx);if(action==='plant')return h.plant(Number(id),ctx);if(action==='harvest')return h.harvest(Number(id),ctx);
  if(action==='tame')return h.tame(ctx);if(action==='feed')return h.feed(ctx);if(action==='animal')return h.claimAnimal(ctx);if(action==='process')return h.startProcessing(id,ctx);if(action==='claim')return h.claimProcessing(Number(id),ctx);
  if(action==='furniture'){const r=h.placeFurniture(id,ctx);if(r.ok)sim.buildFurniture(id);return r;}
 }return {ok:false,message:'この操作は利用できません'};
}
