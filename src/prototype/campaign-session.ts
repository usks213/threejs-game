import {CoreSimulation} from './core/simulation';
import {CheckpointStore} from '../save/checkpoint';
import {SurvivalSystem} from './core/survival';
import {ElementSystem} from './core/elements';
import {EntityElements} from './core/entity-elements';
import {CampaignSystem} from './core/campaign';
import {HomesteadSystem} from './core/homestead';
import {REGIONAL_ENEMIES} from './core/regions';
import {record,number,integer,vector,text} from '../save/validation';
export interface CampaignSettings {volume:number;sensitivity:number;graphics:'balanced'|'high';bindings:Record<string,string>;pins:{id:string;x:number;z:number}[]}
export const defaultSettings=():CampaignSettings=>({volume:.8,sensitivity:1,graphics:'balanced',bindings:{},pins:[]});
export function captureCampaign(sim:CoreSimulation,settings:CampaignSettings){return {version:1 as const,world:'campaign-v2',seconds:sim.seconds,worldHour:sim.worldHour,worldDay:sim.worldDay,cold:sim.cold,player:{position:{...sim.player.position},yaw:sim.player.yaw,pitch:sim.player.pitch,hp:sim.player.hp,stamina:sim.player.stamina,flasks:sim.player.flasks,tool:sim.player.tool},field:sim.arena.field.exportState(),survival:sim.survival.exportState(),elements:sim.elements.exportState(),entities:sim.enemyElements.map(e=>e.exportState()),enemies:sim.enemies.map(e=>({id:e.id,summonOwner:e.summonOwner,position:{...e.position},yaw:e.yaw,hp:e.hp})),objects:[...sim.arena.objects.values()].map(o=>({id:o.id,open:o.open,hp:o.hp})),campaign:sim.campaign.snapshot(),home:sim.home.snapshot(),water:{volume:Array.from(sim.water.volume),injected:sim.water.injected,phase:sim.water.phase,on:sim.waterOn},settings:JSON.parse(JSON.stringify(settings)) as CampaignSettings};}
export type CampaignSave=ReturnType<typeof captureCampaign>;
const REGULAR_ENEMIES=4,RESERVE_SUMMONS=3,SUMMON_START=REGULAR_ENEMIES+REGIONAL_ENEMIES.length,ENEMY_COUNT=SUMMON_START+RESERVE_SUMMONS;
const SUMMONERS=new Set(REGIONAL_ENEMIES.flatMap((enemy,index)=>enemy.tactic==='summoner'?[REGULAR_ENEMIES+index]:[]));
// Includes a generous glide/fall margin around authored terrain; rejects unbounded coordinates.
const worldPosition=(v:unknown)=>vector(v)&&number(v.x,-80,80)&&number(v.y,-30,100)&&number(v.z,-100,100);
const bindableActions=new Set(['interact','jump','dodge','heavy','heal','sword','chisel','element-next','cast','recipe-next','build','special','dismantle']);
const knownKeys=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(key=>keys.includes(key));
function validEnemy(value:unknown,index:number){
 if(!record(value)||!knownKeys(value,['id','summonOwner','position','yaw','hp'])||value.id!==index||!worldPosition(value.position)||!number(value.yaw))return false;
 const maxHp=index===1?180:index<REGULAR_ENEMIES?100:index<SUMMON_START?REGIONAL_ENEMIES[index-REGULAR_ENEMIES].hp:35;
 if(!number(value.hp,0,maxHp))return false;
 // Ordinary enemies must never become eligible for the reusable summon pool.
 if(index<SUMMON_START)return value.summonOwner===undefined||value.summonOwner===-1;
 return integer(value.summonOwner,-1,ENEMY_COUNT-1)&&(value.summonOwner===-1?value.hp===0:SUMMONERS.has(value.summonOwner));
}
/** Cheap envelope boundary; component validators stage a transaction before installation. */
export function isCampaignSave(v:unknown):v is CampaignSave{
 if(!record(v)||v.version!==1||v.world!=='campaign-v2'||!number(v.seconds,0,1e9)||!number(v.worldHour,0,24)||!integer(v.worldDay,0,1e9)||!number(v.cold,0,100)||!record(v.player)||!knownKeys(v.player,['position','yaw','pitch','hp','stamina','flasks','tool'])||!worldPosition(v.player.position)||!number(v.player.hp,0,500)||!number(v.player.stamina,0,500)||!integer(v.player.flasks,0,10000)||!number(v.player.yaw)||!number(v.player.pitch,-Math.PI/2,Math.PI/2)||typeof v.player.tool!=='boolean')return false;
 if(!record(v.field)||!record(v.survival)||!record(v.elements)||!record(v.campaign)||!record(v.home)||!Array.isArray(v.entities)||v.entities.length!==ENEMY_COUNT||!Array.from(v.entities).every(record)||!Array.isArray(v.enemies)||v.enemies.length!==ENEMY_COUNT||!Array.from(v.enemies).every(validEnemy)||!Array.isArray(v.objects)||v.objects.length>1024)return false;
 const objectIds=new Set<string>();for(const object of v.objects){if(!record(object)||!knownKeys(object,['id','open','hp'])||!text(object.id)||objectIds.has(object.id)||typeof object.open!=='boolean'||!number(object.hp,0,100000))return false;objectIds.add(object.id);}
 if(!record(v.water)||!Array.isArray(v.water.volume)||v.water.volume.length!==48*12*48||!number(v.water.injected,0,1e9)||!integer(v.water.phase,0,1e9)||typeof v.water.on!=='boolean')return false;
 for(const amount of v.water.volume)if(!number(amount,0,1.00001))return false;
 if(!record(v.settings)||!number(v.settings.volume,0,1)||!number(v.settings.sensitivity,.5,2)||!['balanced','high'].includes(String(v.settings.graphics))||!record(v.settings.bindings)||!Array.isArray(v.settings.pins)||v.settings.pins.length>12)return false;
 const keys=new Set<string>();for(const [action,key] of Object.entries(v.settings.bindings)){if(!bindableActions.has(action)||typeof key!=='string'||!/^((Key[A-Z])|(Digit[0-9])|Space|ControlLeft|AltLeft|Delete)$/.test(key)||['KeyW','KeyA','KeyS','KeyD','KeyI','KeyJ','KeyM'].includes(key)||keys.has(key))return false;keys.add(key);}
 const pinIds=new Set<string>();for(const pin of v.settings.pins){if(!record(pin)||!text(pin.id,100)||pinIds.has(pin.id)||!number(pin.x,-80,80)||!number(pin.z,-100,30))return false;pinIds.add(pin.id);}return true;
}
export function hydrateCampaign(data:unknown):{sim:CoreSimulation;settings:CampaignSettings}|null{
 if(!isCampaignSave(data))return null;const sim=new CoreSimulation(true);return restoreCampaignInto(sim,data);}
/** No live state changes until every module, object and terrain decoder has succeeded.
 * Staging reuses the authored field only for reads, never rebuilds the large world. */
export function restoreCampaignInto(sim:CoreSimulation,data:unknown):{sim:CoreSimulation;settings:CampaignSettings}|null{
 if(!sim.campaignMode||!sim.worldReady||!isCampaignSave(data)||sim.enemies.length!==data.enemies.length||sim.enemyElements.length!==data.entities.length)return null;
 // Normalize the JSON boundary before component decoding: holes become explicit nulls,
 // unsupported object values disappear, and no caller-owned nested objects are installed.
 try{data=JSON.parse(JSON.stringify(data)) as unknown;}catch{return null;}if(!isCampaignSave(data))return null;
 if(data.objects.length!==sim.arena.objects.size||data.objects.some(object=>!sim.arena.objects.has(object.id)))return null;
 const survival=new SurvivalSystem(sim.arena.field,sim.water),elements=new ElementSystem(sim.arena.field,sim.water),campaign=new CampaignSystem(survival.inventory),home=new HomesteadSystem(survival.inventory,campaign.state.items),entities:EntityElements[]=[];
 if(!survival.restoreState(data.survival)||!elements.restoreState(data.elements)||!campaign.restore(data.campaign)||!home.restore(data.home)||!sim.arena.field.restoreState(data.field,true))return null;
 for(const value of data.entities){const body=new EntityElements();if(!body.restoreState(value))return null;entities.push(body);}
 // Commit is synchronous and contains only the same already-validated DTOs. No callbacks or
 // yields can observe a partially installed state. Preserve shared material/item references.
 sim.arena.field.restoreState(data.field);sim.survival.restoreState(survival.exportState());sim.elements.restoreState(elements.exportState());sim.campaign.restore(campaign.snapshot());sim.home.restore(home.snapshot());
 for(let i=0;i<entities.length;i++)sim.enemyElements[i]=entities[i];
 for(const value of data.objects){const object=sim.arena.objects.get(value.id)!;object.open=value.open;object.hp=value.hp;}
 sim.seconds=data.seconds;sim.worldHour=data.worldHour;sim.worldDay=data.worldDay;sim.cold=data.cold;
 Object.assign(sim.player,{position:{...data.player.position},yaw:data.player.yaw,pitch:data.player.pitch,hp:data.player.hp,stamina:data.player.stamina,flasks:data.player.flasks,tool:data.player.tool,vy:0,vx:0,vz:0,phase:'idle',time:0,queued:'',guard:0,hit:false,hitstop:0,impact:0,blockTime:0});
 for(let i=0;i<sim.enemies.length;i++)Object.assign(sim.enemies[i],{hp:data.enemies[i].hp,yaw:data.enemies[i].yaw,summonOwner:i<SUMMON_START?undefined:data.enemies[i].summonOwner,position:{...data.enemies[i].position},phase:data.enemies[i].hp>0?'idle':'dead',time:0,vy:0,hit:false,hitstop:0,interrupted:undefined});
 sim.defeated=sim.enemies.filter(e=>e.hp<=0).length;sim.water.volume.set(data.water.volume);sim.water.injected=data.water.injected;sim.water.phase=data.water.phase;sim.waterOn=data.water.on;sim.water.refreshSolids();sim.water.revision++;
 if(sim.player.hp>0&&sim.arena.field.overlaps(sim.player.position))sim.player.position=sim.safePosition(sim.campaign.spawn);
 return {sim,settings:{volume:data.settings.volume,sensitivity:data.settings.sensitivity,graphics:data.settings.graphics,bindings:{...data.settings.bindings},pins:data.settings.pins.map(pin=>({id:pin.id,x:pin.x,z:pin.z}))}};
}
export function createCampaignStore(){return new CheckpointStore<CampaignSave>({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)},'ash-campaign-v1',isCampaignSave);}
