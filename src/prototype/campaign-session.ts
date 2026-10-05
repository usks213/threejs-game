import {createPlayerEnvironmentState,clonePlayerEnvironmentState,validPlayerEnvironmentState} from './core/player-environment';
import {DEFAULT_AUDIO_MIX,type AudioMix} from './audio';
import {FishingSystem,createFishingState,createFishingWaterProbe,validFishingState} from './core/fishing';
import {WEST_EXPEDITION_MANIFEST,WEST_POINTS,WEST_RESOURCES} from './core/expedition-west';
import {WEST_RUNTIME_ENEMIES,WestExpeditionSystem,validWestExpeditionState} from './core/expedition-west-integration';
import {StreamedCampaignField} from './core/streamed-campaign-field';
import {ensureCampaignAnchor,reconcileRegionalClaims} from './core/campaign-repairs';
import type {VoxelField,VoxelState} from './core/voxel';
import {validCompanionSnapshot} from './core/companion';
import {CoreSimulation} from './core/simulation';
import {CAMPAIGN_SAMPLE_MANIFEST} from './core/campaign-sample-provider';
import {CheckpointStore,type SaveStorage} from '../save/checkpoint';
import {SurvivalSystem} from './core/survival';
import {ElementSystem} from './core/elements';
import {EntityElements} from './core/entity-elements';
import {CampaignSystem} from './core/campaign';
import {HomesteadSystem} from './core/homestead';
import {REGIONAL_ENEMIES} from './core/regions';
import {record,number,integer,vector,text} from '../save/validation';
export interface CampaignSettings {reducedMotion?:boolean;textScale?:number;cameraMode?:'first'|'third';cameraDistance?:number;audioMix?:AudioMix;volume:number;sensitivity:number;graphics:'balanced'|'performance'|'high';bindings:Record<string,string>;pins:{id:string;x:number;z:number}[]}
export const defaultSettings=():CampaignSettings=>({reducedMotion:false,textScale:1,cameraMode:'first',cameraDistance:3,audioMix:{...DEFAULT_AUDIO_MIX},volume:.8,sensitivity:1,graphics:'balanced',bindings:{},pins:[]});
interface EntityCacheEntry {body:EntityElements;revision:number;json:string}
interface TerrainCacheEntry {field:VoxelField;revision:number;json:string;validated:boolean;entities?:EntityCacheEntry[]}
/** One detached terrain snapshot per live simulation, weakly held across network frames. */
const terrainCache=new WeakMap<CoreSimulation,TerrainCacheEntry>();
export interface CampaignSnapshotOptions {reuseTerrain?:boolean;includeCompanion?:boolean}
function captureTerrain(sim:CoreSimulation,reuse=false):VoxelState {
 if(!reuse)return sim.arena.field.exportState();const field=sim.arena.field,cached=terrainCache.get(sim);
 if(cached&&cached.field===field&&cached.revision===field.revision)return JSON.parse(cached.json) as VoxelState;
 const json=JSON.stringify(field.exportState());terrainCache.set(sim,{field,revision:field.revision,json,validated:false,entities:cached?.entities});return JSON.parse(json) as VoxelState;
}
export function captureCampaign(sim:CoreSimulation,settings:CampaignSettings,options:CampaignSnapshotOptions={}){return {version:1 as const,world:sim.westernContent?'campaign-v4' as const:sim.streamedWorld?'campaign-v3' as const:'campaign-v2' as const,seconds:sim.seconds,worldHour:sim.worldHour,worldDay:sim.worldDay,cold:sim.cold,...(sim.campaignMode?{environment:clonePlayerEnvironmentState(sim.environment)}:{}),player:{position:{...sim.player.position},yaw:sim.player.yaw,pitch:sim.player.pitch,hp:sim.player.hp,stamina:sim.player.stamina,flasks:sim.player.flasks,tool:sim.player.tool},field:captureTerrain(sim,options.reuseTerrain),survival:sim.survival.exportState(),elements:sim.elements.exportState(),entities:sim.enemyElements.map(e=>e.exportState()),enemies:sim.enemies.map(e=>({id:e.id,summonOwner:e.summonOwner,position:{...e.position},yaw:e.yaw,hp:e.hp})),objects:[...sim.arena.objects.values()].map(o=>({id:o.id,open:o.open,hp:o.hp})),campaign:sim.campaign.snapshot(),home:sim.home.snapshot(),...(sim.campaignMode?{fishing:sim.fishing.snapshot()}:{}),water:{volume:Array.from(sim.water.volume),injected:sim.water.injected,phase:sim.water.phase,on:sim.waterOn},settings:JSON.parse(JSON.stringify(settings)) as CampaignSettings,...(options.includeCompanion===false?{}:{partyCompanion:sim.companionSnapshot()}),...(sim.western?{western:sim.western.snapshot()}:{})};}
export type CampaignSave=ReturnType<typeof captureCampaign>;
const REGULAR_ENEMIES=4,RESERVE_SUMMONS=3,SUMMON_START=REGULAR_ENEMIES+REGIONAL_ENEMIES.length,ENEMY_COUNT=SUMMON_START+RESERVE_SUMMONS;
const SUMMONERS=new Set(REGIONAL_ENEMIES.flatMap((enemy,index)=>enemy.tactic==='summoner'?[REGULAR_ENEMIES+index]:[]));
// Includes a generous glide/fall margin around authored terrain; rejects unbounded coordinates.
const worldPosition=(v:unknown,western=false)=>vector(v)&&number(v.x,western?-128:-80,western?128:80)&&number(v.y,-30,100)&&number(v.z,western?-160:-100,100);
const bindableActions=new Set(['attack','interact','jump','dodge','heavy','heal','sword','chisel','element-next','cast','recipe-next','build','special','dismantle']);
const knownKeys=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(key=>keys.includes(key));
function validEnemy(value:unknown,index:number,western=false){
 if(!record(value)||!knownKeys(value,['id','summonOwner','position','yaw','hp'])||value.id!==index||!worldPosition(value.position,western)||!number(value.yaw))return false;
 const maxHp=index>=ENEMY_COUNT?(western?WEST_RUNTIME_ENEMIES.find(enemy=>enemy.slot===index)?.definition.hp??-1:-1):index===1?180:index<REGULAR_ENEMIES?100:index<SUMMON_START?REGIONAL_ENEMIES[index-REGULAR_ENEMIES].hp:35;
 if(!number(value.hp,0,maxHp))return false;
 // Ordinary enemies must never become eligible for the reusable summon pool.
 if(index<SUMMON_START||index>=ENEMY_COUNT)return value.summonOwner===undefined||value.summonOwner===-1;
 return integer(value.summonOwner,-1,ENEMY_COUNT-1)&&(value.summonOwner===-1?value.hp===0:SUMMONERS.has(value.summonOwner));
}
/** Cheap envelope boundary; component validators stage a transaction before installation. */
export function isCampaignSave(v:unknown):v is CampaignSave{
 if(!record(v)||v.version!==1||!['campaign-v2','campaign-v3','campaign-v4'].includes(String(v.world))||!number(v.seconds,0,1e9)||!number(v.worldHour,0,24)||!integer(v.worldDay,0,1e9)||!number(v.cold,0,100)||!record(v.player)||!knownKeys(v.player,['position','yaw','pitch','hp','stamina','flasks','tool'])||!worldPosition(v.player.position,v.world==='campaign-v4')||!number(v.player.hp,0,500)||!number(v.player.stamina,0,500)||!integer(v.player.flasks,0,10000)||!number(v.player.yaw)||!number(v.player.pitch,-Math.PI/2,Math.PI/2)||typeof v.player.tool!=='boolean')return false;
 if(v.environment!==undefined&&!validPlayerEnvironmentState(v.environment))return false;
 if(v.partyCompanion!==undefined&&v.partyCompanion!==null&&!validCompanionSnapshot(v.partyCompanion,v.world==='campaign-v4'))return false;
 if(v.world==='campaign-v4'?!validWestExpeditionState(v.western):v.western!==undefined)return false;if(v.fishing!==undefined&&!validFishingState(v.fishing))return false;
 const enemyCount=v.world==='campaign-v4'?ENEMY_COUNT+4:ENEMY_COUNT;
 if(!record(v.field)||!record(v.survival)||!record(v.elements)||!record(v.campaign)||!record(v.home)||!Array.isArray(v.entities)||v.entities.length!==enemyCount||!Array.from(v.entities).every(record)||!Array.isArray(v.enemies)||v.enemies.length!==enemyCount||!Array.from(v.enemies).every((enemy,index)=>validEnemy(enemy,index,v.world==='campaign-v4'))||!Array.isArray(v.objects)||v.objects.length>1024)return false;
 if((v.world==='campaign-v3'||v.world==='campaign-v4')&&(v.field.baseline!==(v.world==='campaign-v4'?WEST_EXPEDITION_MANIFEST:CAMPAIGN_SAMPLE_MANIFEST)||v.field.version!==1||v.field.size!==.25||!Array.isArray(v.field.suppressed))||v.world==='campaign-v2'&&v.field.suppressed!==undefined)return false;
 const objectIds=new Set<string>();for(const object of v.objects){if(!record(object)||!knownKeys(object,['id','open','hp'])||!text(object.id)||objectIds.has(object.id)||typeof object.open!=='boolean'||!number(object.hp,0,100000))return false;objectIds.add(object.id);}
 if(!record(v.water)||!Array.isArray(v.water.volume)||v.water.volume.length!==48*12*48||!number(v.water.injected,0,1e9)||!integer(v.water.phase,0,1e9)||typeof v.water.on!=='boolean')return false;
 for(const amount of v.water.volume)if(!number(amount,0,1.00001))return false;
 if(!record(v.settings)||!number(v.settings.volume,0,1)||!number(v.settings.sensitivity,.5,2)||!['balanced','performance','high'].includes(String(v.settings.graphics))||!record(v.settings.bindings)||!Array.isArray(v.settings.pins)||v.settings.pins.length>12)return false;
 if(v.settings.reducedMotion!==undefined&&typeof v.settings.reducedMotion!=='boolean'||v.settings.textScale!==undefined&&!number(v.settings.textScale,1,1.25))return false;
 if(v.settings.cameraMode!==undefined&&!['first','third'].includes(String(v.settings.cameraMode))||v.settings.cameraDistance!==undefined&&!number(v.settings.cameraDistance,1.4,4))return false;
 const audioMix=v.settings.audioMix;if(audioMix!==undefined&&(!record(audioMix)||!knownKeys(audioMix,['music','effects','ambience'])||!number(audioMix.music,0,1)||!number(audioMix.effects,0,1)||!number(audioMix.ambience,0,1)))return false;
 const keys=new Set<string>();for(const [action,key] of Object.entries(v.settings.bindings)){if(!bindableActions.has(action)||typeof key!=='string'||!/^((Key[A-Z])|(Digit[0-9])|Space|ControlLeft|AltLeft|Delete)$/.test(key)||['KeyW','KeyA','KeyS','KeyD','KeyI','KeyJ','KeyM'].includes(key)||keys.has(key))return false;keys.add(key);}
 const pinIds=new Set<string>();for(const pin of v.settings.pins){if(!record(pin)||!text(pin.id,100)||pinIds.has(pin.id)||!number(pin.x,v.world==='campaign-v4'?-128:-80,v.world==='campaign-v4'?128:80)||!number(pin.z,v.world==='campaign-v4'?-160:-100,v.world==='campaign-v4'?100:30))return false;pinIds.add(pin.id);}return true;
}
export function hydrateCampaign(data:unknown):{sim:CoreSimulation;settings:CampaignSettings}|null{
 if(!isCampaignSave(data))return null;const sim=new CoreSimulation(true,false,data.world!=='campaign-v2',data.world==='campaign-v4');return restoreCampaignInto(sim,data);}
export type CampaignRestoreFailure='not-ready'|'active-companion'|'envelope'|'object-index'|'survival'|'elements'|'campaign'|'home'|'fishing'|'terrain'|'western'|'western-geometry'|`entity-${number}`;
const restoreFailures=new WeakMap<CoreSimulation,CampaignRestoreFailure>();
/** Stage labels only: suitable for error reports without leaking a save or connection details. */
export const getCampaignRestoreFailure=(sim:CoreSimulation):CampaignRestoreFailure|null=>restoreFailures.get(sim)??null;
/** No live state changes until every module, object and terrain decoder has succeeded.
 * Staging reuses the authored field only for reads, never rebuilds the large world. */
export function restoreCampaignInto(sim:CoreSimulation,data:unknown,options:CampaignSnapshotOptions={}):{sim:CoreSimulation;settings:CampaignSettings}|null{
 restoreFailures.delete(sim);const fail=(reason:CampaignRestoreFailure)=>{restoreFailures.set(sim,reason);return null;};
 if(options.includeCompanion!==false&&sim.companion&&sim.player===sim.companion)return fail('active-companion');
 if(!sim.campaignMode||!sim.worldReady)return fail('not-ready');
 if(!isCampaignSave(data)||data.world!==(sim.westernContent?'campaign-v4':sim.streamedWorld?'campaign-v3':'campaign-v2')||sim.enemies.length!==data.enemies.length||sim.enemyElements.length!==data.entities.length)return fail('envelope');
 // Normalize the JSON boundary before component decoding: holes become explicit nulls,
 // unsupported object values disappear, and no caller-owned nested objects are installed.
 try{data=JSON.parse(JSON.stringify(data)) as unknown;}catch{return fail('envelope');}if(!isCampaignSave(data))return fail('envelope');
 const field=sim.arena.field,terrainJson=options.reuseTerrain?JSON.stringify(data.field):'',cached=options.reuseTerrain?terrainCache.get(sim):undefined;
 // A caller can request reuse, never assert trust. Only this module can mint a successful proof.
 const reuseTerrain=!!cached?.validated&&cached.field===field&&cached.revision===field.revision&&cached.json===terrainJson;
 if(data.objects.length!==sim.arena.objects.size||data.objects.some(object=>!sim.arena.objects.has(object.id)))return fail('object-index');
 const survival=new SurvivalSystem(sim.arena.field,sim.water),elements=new ElementSystem(sim.arena.field,sim.water),campaign=new CampaignSystem(survival.inventory),home=new HomesteadSystem(survival.inventory,campaign.state.items),entities:EntityElements[]=[];
 if(!survival.restoreState(data.survival))return fail('survival');
 if(!elements.restoreState(data.elements))return fail('elements');
 if(!campaign.restore(data.campaign))return fail('campaign');
 if(!home.restore(data.home))return fail('home');
 const fishing=new FishingSystem(campaign,sim.arena.field,createFishingWaterProbe(sim.arena.field,sim.water));if(!fishing.restore(data.fishing??createFishingState()))return fail('fishing');
 let stagedWest:WestExpeditionSystem|null=null;
 if(data.world==='campaign-v4'){
  if(!sim.western||!(sim.arena.field instanceof StreamedCampaignField))return fail('western');
  let stagedField=sim.arena.field;if(!reuseTerrain){stagedField=new StreamedCampaignField(sim.arena.field.provider);if(!stagedField.restoreState(data.field))return fail('terrain');}
  const objects=new Map([...sim.arena.objects].map(([id,object])=>[id,{...object}]));for(const saved of data.objects)Object.assign(objects.get(saved.id)!,saved);
  stagedWest=new WestExpeditionSystem(campaign,{field:stagedField,objects},WEST_EXPEDITION_MANIFEST);if(!stagedWest.restore(data.western))return fail('western');
  const state=stagedWest.snapshot();for(const point of [...WEST_POINTS,...WEST_RESOURCES]){const expected=point.id==='west-shortcut-gate'?state.gateOpen:state.claimed.includes(point.id);if(objects.get(point.id)?.open!==expected)return fail('western');}
  for(const entry of WEST_RUNTIME_ENEMIES)if(state.defeated.includes(entry.key)&&data.enemies[entry.slot].hp>0)return fail('western');
  if(!stagedWest.geometryConsistent())return fail('western-geometry');
 }else if(!reuseTerrain&&!sim.arena.field.restoreState(data.field,true))return fail('terrain');
 const entityProofs:EntityCacheEntry[]=[];
 for(let i=0;i<data.entities.length;i++){const value=data.entities[i],json=options.reuseTerrain?JSON.stringify(value):'',proof=cached?.entities?.[i],current=sim.enemyElements[i];
  const reuseBody=!!proof&&proof.body===current&&proof.revision===current.field.revision&&proof.json===json&&JSON.stringify(current.exportState())===json;
  const body=reuseBody?current:new EntityElements();if(!reuseBody&&!body.restoreState(value))return fail(`entity-${i}`);entities.push(body);entityProofs.push({body,revision:body.field.revision,json});
 }
 // Commit is synchronous and contains only the same already-validated DTOs. No callbacks or
 // yields can observe a partially installed state. Preserve shared material/item references.
 if(!reuseTerrain)sim.arena.field.restoreState(data.field);sim.survival.restoreState(survival.exportState());sim.elements.restoreState(elements.exportState());sim.campaign.restore(campaign.snapshot());sim.home.restore(home.snapshot());sim.fishing=new FishingSystem(sim.campaign,sim.arena.field,createFishingWaterProbe(sim.arena.field,sim.water));sim.fishing.restore(fishing.snapshot());
 for(let i=0;i<entities.length;i++)sim.enemyElements[i]=entities[i];
 for(const value of data.objects){const object=sim.arena.objects.get(value.id)!;object.open=value.open;object.hp=value.hp;}
 sim.seconds=data.seconds;sim.worldHour=data.worldHour;sim.worldDay=data.worldDay;sim.cold=data.cold;sim.environment=clonePlayerEnvironmentState(data.environment??createPlayerEnvironmentState());
 Object.assign(sim.player,{position:{...data.player.position},yaw:data.player.yaw,pitch:data.player.pitch,hp:data.player.hp,stamina:data.player.stamina,flasks:data.player.flasks,tool:data.player.tool,vy:0,vx:0,vz:0,phase:'idle',time:0,queued:'',guard:0,hit:false,hitstop:0,impact:0,blockTime:0});
 for(let i=0;i<sim.enemies.length;i++)Object.assign(sim.enemies[i],{hp:data.enemies[i].hp,yaw:data.enemies[i].yaw,summonOwner:i<SUMMON_START||i>=ENEMY_COUNT?undefined:data.enemies[i].summonOwner,position:{...data.enemies[i].position},phase:data.enemies[i].hp>0?'idle':'dead',time:0,vy:0,hit:false,hitstop:0,interrupted:undefined});
 sim.resetEnemyAwareness();
 sim.defeated=sim.enemies.filter(e=>e.hp<=0).length;sim.water.volume.set(data.water.volume);sim.water.injected=data.water.injected;sim.water.phase=data.water.phase;sim.waterOn=data.water.on;if(!reuseTerrain)sim.water.refreshSolids();sim.water.revision++;
 const beforeRepairs=field.revision;ensureCampaignAnchor(sim.arena.field);reconcileRegionalClaims(sim.arena,sim.campaign.state.claimedPoints);if(stagedWest){sim.western!.restore(stagedWest.snapshot());sim.western!.reconcileGeometry();}const repairedGeometry=field.revision!==beforeRepairs;
 if(options.includeCompanion!==false){sim.restoreCompanion(data.partyCompanion??null);sim.companionCanEdit=false;if(sim.companion){sim.companion.vx=0;sim.companion.vz=0;}sim.setCompanionConnected(false);}
 sim.animal.reconcileTerrain({field:sim.arena.field,blockers:[sim.player.position,...(sim.companion?[sim.companion.position]:[]),...sim.enemies.filter(e=>e.hp>0&&sim.enemyActive(e)).map(e=>e.position)]});
 if(sim.player.hp>0&&sim.arena.field.overlaps(sim.player.position))sim.player.position=sim.safePosition(sim.campaign.spawn,true);
 if(options.reuseTerrain)terrainCache.set(sim,{field,revision:field.revision,json:repairedGeometry?JSON.stringify(field.exportState()):terrainJson,validated:true,entities:entityProofs});
 return {sim,settings:{reducedMotion:data.settings.reducedMotion??false,textScale:data.settings.textScale??1,cameraMode:data.settings.cameraMode??'first',cameraDistance:data.settings.cameraDistance??3,audioMix:{...(data.settings.audioMix??DEFAULT_AUDIO_MIX)},volume:data.settings.volume,sensitivity:data.settings.sensitivity,graphics:data.settings.graphics,bindings:Object.fromEntries(Object.entries(data.settings.bindings).filter(([,key])=>key!=='KeyZ')),pins:data.settings.pins.map(pin=>({id:pin.id,x:pin.x,z:pin.z}))}};
}
export const LEGACY_CAMPAIGN_STORE_KEY='ash-campaign-v1',STREAMED_CAMPAIGN_STORE_KEY='ash-campaign-v3',WESTERN_CAMPAIGN_STORE_KEY='ash-campaign-v4';
export const browserCampaignStorage:SaveStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
export const isLegacyCampaignSave=(value:unknown):value is CampaignSave=>isCampaignSave(value)&&value.world==='campaign-v2';
export const isStreamedCampaignSave=(value:unknown):value is CampaignSave=>isCampaignSave(value)&&value.world==='campaign-v3';
export const isWesternCampaignSave=(value:unknown):value is CampaignSave=>isCampaignSave(value)&&value.world==='campaign-v4';
export function createCampaignStore(streamed=false,storage:SaveStorage=browserCampaignStorage,western=false){return new CheckpointStore<CampaignSave>(storage,western?WESTERN_CAMPAIGN_STORE_KEY:streamed?STREAMED_CAMPAIGN_STORE_KEY:LEGACY_CAMPAIGN_STORE_KEY,western?isWesternCampaignSave:streamed?isStreamedCampaignSave:isLegacyCampaignSave);}
