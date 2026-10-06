import {buildTarget} from './build-snap';
import {inventoryDefinition,type InventoryDrop} from './inventory';
import {EnemyLocalNavigation,safeEnemyLunge,type EnemyNavigationState} from './enemy-navigation';
import {DawnDuskWait,PLAYER_BED,PLAYER_BED_OBJECT,PLAYER_BED_POSITION,PLAYER_REST_MAX_SECONDS,REST_NEUTRAL,buildPlayerBed,playerBedIntact,playerBedPlacementReason,type RestTarget} from './player-rest';
import {WarmthProbe,type WarmthSource} from './warmth';
import {CollectibleDisplaySystem,DISPLAY_BASE,DISPLAY_ITEM} from './collectible-display';
import {createCombatResources,cloneCombatResources,heavyReady,heavyChargePoseTime,HEAVY_MAX_SECONDS,MAX_MANA,SPELL_MANA,SPELL_CAST_SECONDS} from './combat-resources';
import {type SoilPreview,type SoilContext} from './soil-fill';
import {WatermillSystem,WATERMILL_ID} from './watermill';
import {separatesContact} from './contact-separation';
import {toolPower} from './equipment';
import {BOW_DAMAGE} from './equipment-stats';
import {NpcLife} from './npc-life';
import {WesternNpcLife,WEST_NPC_PROFILES} from './western-npc-life';
import {EchoVaultSystem,VAULT_PROTECTED_IDS} from './echo-vault';
import {HomesteadAnimal,HOMESTEAD_ANIMAL_ID} from './homestead-animal';
import {createPlayerEnvironmentState,clonePlayerEnvironmentState,stepPlayerEnvironment} from './player-environment';
import {LadderTraversal} from './climbing';
import {FishingSystem,createFishingWaterProbe,fishingTargetAlongRay,type FishingActor} from './fishing';
import {createGuardAwareness,updateGuardAwareness,type GuardAwareness} from './guard-awareness';
import {createWesternSamplePrototype} from './western-sample-provider';
import {WEST_EXPEDITION_MANIFEST,WEST_POINTS} from './expedition-west';
import {WestExpeditionSystem,WEST_RUNTIME_ENEMIES,WEST_PROTECTED_OBJECT_IDS,type WestActorContext} from './expedition-west-integration';
import {weatherAt,WeatherReactions} from './weather';
import {createCampaignSamplePrototype} from './campaign-sample-provider';
import {StreamedCampaignField} from './streamed-campaign-field';
import { createArena, creatureVoxels, setDoor } from './world';
import { direction, type Vec3, type Hit } from './voxel';
import { VoxelWater } from './water';
import { ElementSystem,type Element } from './elements';
import { materialDefinition } from './materials';
import { SurvivalSystem,type PlacementPreview,type MaterialDrop } from './survival';
import {HomesteadSystem} from './homestead';
import {CAMPAIGN_ITEMS,CAMPAIGN_POINTS,CampaignSystem,isShrouded,isDeepShroud} from './campaign';
import {createEnemyTacticState,stepEnemyTactic,type EnemyTacticState,gainCombatFocus,spendCombatFocus} from './enemy-tactics';
import {extendRegionalWorld} from './regional-world';
import {REGIONAL_ENEMIES,REGIONAL_POINTS,REGIONAL_WATERS,REGIONAL_UPDRAFTS,regionalHazard,isRegionalOpen} from './regions';
import {ensureCampaignAnchor} from './campaign-repairs';
import {extendCampaignArena} from './campaign-world';
import {createPlayerState,cloneCompanion,validCompanionSnapshot,type PlayerState,type ActorAux,type CompanionSnapshot} from './companion';
import {validGuestInput,freshGuestInput,NEUTRAL_GUEST_INPUT,type GuestInput} from '../network/protocol';
import { EntityElements } from './entity-elements';
import { attacks,meleeDefinition,attackPose,bladeWorld,bodyCapsules,segmentDistance,facing,transformPoint,type AttackKind,type WeaponPose } from './motion';
export interface Controls {x:number;z:number;sprint:boolean;block:boolean;water:boolean}
export type Action='build-snap'|'attack'|'heavy'|'heavy-start'|'heavy-release'|'cancel-combat'|'dodge'|'jump'|'interact'|'heal'|'tool'|'sword'|'chisel'|'element-next'|'cast'|'recipe-next'|'build'|'special'|'dismantle';
export interface Event {kind:'swing'|'hit'|'hurt'|'parry'|'step'|'interact'|'water'|'break';text?:string;hint?:'building';position?:Vec3}
export interface Enemy {id:number;summonOwner?:number;regional?:number;maxHp?:number;name?:string;position:Vec3;yaw:number;hp:number;vy:number;phase:'idle'|'windup'|'strike'|'recover'|'stagger'|'dead';time:number;hit:boolean;attack:AttackKind;hitstop:number;stride:number;interrupted?:WeaponPose}
export interface Target {inventoryDrop?:InventoryDrop;npc?:boolean;npcId?:string;animal?:boolean;hit:Hit;enemy?:Enemy;drop?:MaterialDrop;label:string;action:string}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class CoreSimulation {
 readonly arena:ReturnType<typeof createArena>;readonly water:VoxelWater;readonly watermill:WatermillSystem;
 readonly elements:ElementSystem;readonly survival:SurvivalSystem;readonly ladders:LadderTraversal;
 environment=createPlayerEnvironmentState();selectedElement:Element='fire';private solidRevision:number;private castCooldown=0;
 get selectedRecipe(){return this.survival.selected;}
 private readonly primaryPlayer=createPlayerState();private activePlayer:PlayerState|null=null;private primaryChargeActive=false;get player(){return this.activePlayer??this.primaryPlayer;}
 private companionState:CompanionSnapshot|null=null;private companionInput:GuestInput={...NEUTRAL_GUEST_INPUT};private companionInputAt=-Infinity;private readonly frameBlocking=new WeakMap<PlayerState,boolean>();private primaryInput:Controls={x:0,z:0,sprint:false,block:false,water:false};
 get companion(){return this.companionState?.player??null;}
 get canChangeEquipment(){return [this.primaryPlayer,...(this.companionState?[this.companionState.player]:[])].every(actor=>actor.hp<=0||actor.phase==='idle'&&!(actor===this.player?this.combat:actor===this.primaryPlayer?{charging:this.primaryChargeActive}:this.companionState?.aux.combat)?.charging);}
 get companionEnabled(){return this.companionState!==null;}
 companionSuspended=false;
 setCompanionConnected(connected:boolean){if(this.companionSuspended===!connected)return;this.companionSuspended=!connected;this.neutralCompanionInput();if(!connected&&this.companion){this.companion.vx=0;this.companion.vz=0;}}
 companionCanEdit=false;private get mayEditWorld(){return this.activePlayer!==this.companionState?.player||this.companionCanEdit;}
 private denyWorldEdit(){this.events.push({kind:'interact',text:'同行者の地形編集・属性術はホストの許可が必要'});}

 readonly dungeon:EchoVaultSystem;
 readonly enemies:Enemy[]=[{id:0,position:{x:0,y:.25,z:-6},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0},{id:1,position:{x:2,y:.25,z:-9},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'overhead',hitstop:0,stride:0}];
 private readonly meleeStaggers=new Map<number,number>();
 private readonly guardAwareness=new Map<number,GuardAwareness>();
 private readonly enemyNavigation=new EnemyLocalNavigation();
 private readonly guardNavigation=new Map<number,EnemyNavigationState>();
 readonly enemyElements=[new EntityElements(),new EntityElements()];readonly campaign:CampaignSystem;fishing:FishingSystem;readonly western:WestExpeditionSystem|null;readonly home:HomesteadSystem;readonly display:CollectibleDisplaySystem;readonly animal:HomesteadAnimal;readonly npc=new NpcLife();readonly westNpcs=new WesternNpcLife();private chainTime=0;worldHour=10;worldDay=0;readonly weatherReactions=new WeatherReactions();cold=0;gliding=false;grapple:Vec3|null=null;grappleTime=0;oxygen=20;swimming=false;deathCause='';readonly arrows:{position:Vec3;velocity:Vec3;life:number;owner?:'host'|'guest'}[]=[];readonly tactics=new Map<number,EnemyTacticState>();combat=createCombatResources();get focus(){return this.combat.focus;}private actionSerial=0;readonly enemyShots:{position:Vec3;velocity:Vec3;life:number;damage:number;radius:number}[]=[];readonly tells:{position:Vec3;radius:number;remaining:number;kind:string}[]=[];readonly lunges=new Map<number,{velocity:Vec3;remaining:number;damage:number;radius:number;hit:boolean}>();
 soilFill=false;
 get rakeSelected(){return this.campaignMode&&this.player.tool&&this.activeTool==='terrain-rake';}
 get soilFilling(){return this.rakeSelected&&this.soilFill&&!this.buildMode;}
 buildSnap=false;buildMode=false;worldReady=true;constructor(readonly campaignMode=false,deferWorld=false,readonly streamedWorld=false,readonly westernContent=false){
  if(westernContent&&(!streamedWorld||!campaignMode))throw new Error('Western content requires a streamed campaign');
  if(streamedWorld&&!campaignMode)throw new Error('Streamed worlds require campaign mode');
  if(streamedWorld){const source=westernContent?createWesternSamplePrototype():createCampaignSamplePrototype();this.arena={field:new StreamedCampaignField(source.provider),objects:source.objects};}else this.arena=createArena();
  this.water=new VoxelWater(this.arena.field);this.elements=new ElementSystem(this.arena.field,this.water);this.survival=new SurvivalSystem(this.arena.field,this.water,this.elements.damagedObjects);this.watermill=new WatermillSystem(this.arena.field,this.water,this.survival.inventory);this.ladders=new LadderTraversal(this.survival,this.arena.field);this.campaign=new CampaignSystem(this.survival.inventory);this.dungeon=new EchoVaultSystem(this.campaign,this.arena);this.survival.onMaterialAcquired=id=>this.campaign.discoverMaterial(id);this.fishing=new FishingSystem(this.campaign,this.arena.field,createFishingWaterProbe(this.arena.field,this.water));this.western=westernContent?new WestExpeditionSystem(this.campaign,this.arena,WEST_EXPEDITION_MANIFEST):null;this.home=new HomesteadSystem(this.survival.inventory,this.campaign.state.items);this.display=new CollectibleDisplaySystem(this.arena.field,this.campaign,this.home);this.animal=new HomesteadAnimal(this.home);this.solidRevision=this.arena.field.revision;this.western?.setNpcLifeProvider(this.westNpcs);
  this.worldReady=streamedWorld||!campaignMode||!deferWorld;if(campaignMode){this.survival.buildBounds={minX:-36,maxX:36,minZ:-55,maxZ:12};if(!streamedWorld){extendCampaignArena(this.arena,!deferWorld);if(!deferWorld)extendRegionalWorld(this.arena);}this.enemies[1].hp=180;this.enemies[1].maxHp=180;for(const [id,x,y,z] of [[2,-14,.25,-5],[3,3,3.25,-30]]){this.enemies.push({id,position:{x,y,z},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());}for(const def of REGIONAL_ENEMIES){const id=this.enemies.length;this.enemies.push({id,regional:def.id,maxHp:def.hp,name:def.name,position:{...def.position},yaw:0,hp:def.hp,vy:0,phase:'idle',time:0,hit:false,attack:def.boss?'overhead':'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());this.tactics.set(id,createEnemyTacticState(def));}for(let i=0;i<3;i++){const id=this.enemies.length;this.enemies.push({id,summonOwner:-1,name:'霧の眷属',maxHp:35,position:{x:0,y:.25,z:-35},yaw:0,hp:0,vy:0,phase:'dead',time:10,hit:false,attack:'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());}if(westernContent){this.survival.buildBounds.minX=-72;for(const entry of WEST_RUNTIME_ENEMIES){const def=entry.definition,id=this.enemies.length;if(id!==entry.slot)throw new Error('Western actor registry mismatch');this.enemies.push({id,regional:def.id,maxHp:def.hp,name:def.name,position:{...def.position},yaw:0,hp:def.hp,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());this.tactics.set(id,createEnemyTacticState(def));}}this.water.refreshSolids();}if(campaignMode)this.protectQuestObjects();if(!streamedWorld)this.arena.field.captureBaseline(campaignMode?(deferWorld?'campaign-v2-hub':'campaign-v2'):'trial-v1');if(campaignMode){this.dungeon.install();this.protectQuestObjects();this.animal.reconcileTerrain({field:this.arena.field,blockers:this.playerBodies()});ensureCampaignAnchor(this.arena.field);for(const e of this.enemies)if(!e.regional&&e.hp>0)this.guardAwareness.set(e.id,createGuardAwareness(e.position));}}
 private actorAux():ActorAux {return {buildSnap:this.buildSnap,combat:cloneCombatResources(this.combat),soilFill:this.soilFill,environment:clonePlayerEnvironmentState(this.environment),selectedElement:this.selectedElement,castCooldown:this.castCooldown,footTime:this.footTime,regenDelay:this.regenDelay,cold:this.cold,gliding:this.gliding,grapple:this.grapple?{...this.grapple}:null,grappleTime:this.grappleTime,oxygen:this.oxygen,swimming:this.swimming,deathCause:this.deathCause,buildMode:this.buildMode,recipe:this.survival.selected,rotation:this.survival.rotation,shroudSeconds:this.campaign.state.shroudSeconds};}
 private applyActorAux(a:ActorAux){this.buildSnap=a.buildSnap??false;this.combat=cloneCombatResources(a.combat??createCombatResources());this.soilFill=a.soilFill??false;this.environment=clonePlayerEnvironmentState(a.environment??createPlayerEnvironmentState());this.selectedElement=a.selectedElement;this.castCooldown=a.castCooldown;this.footTime=a.footTime;this.regenDelay=a.regenDelay;this.cold=a.cold;this.gliding=a.gliding;this.grapple=a.grapple?{...a.grapple}:null;this.grappleTime=a.grappleTime;this.oxygen=a.oxygen;this.swimming=a.swimming;this.deathCause=a.deathCause;this.buildMode=a.buildMode;this.survival.selected=a.recipe;this.survival.rotation=a.rotation;}
 withCompanion<T>(operation:()=>T):T|undefined {const companion=this.companionState;if(!companion)return undefined;if(this.activePlayer===companion.player)return operation();const primary=this.actorAux(),previous=this.activePlayer;this.primaryChargeActive=this.combat.charging;this.activePlayer=companion.player;this.applyActorAux(companion.aux);try{return operation();}finally{const shroud=companion.aux.shroudSeconds;companion.aux=this.actorAux();companion.aux.shroudSeconds=shroud;this.activePlayer=previous;this.applyActorAux(primary);}}
 enableCompanion(position?:Vec3){if(this.companionState)return this.companionState.player;const player=createPlayerState();player.position=this.safePosition(position??this.primaryPlayer.position,true);player.hp=this.campaignMode?this.campaign.maxHp:100;player.stamina=this.campaignMode?this.campaign.maxStamina:100;const aux:ActorAux={buildSnap:false,soilFill:false,combat:createCombatResources(),environment:createPlayerEnvironmentState(),selectedElement:'fire',castCooldown:0,footTime:0,regenDelay:0,cold:0,gliding:false,grapple:null,grappleTime:0,oxygen:20,swimming:false,deathCause:'',buildMode:false,recipe:'workbench',rotation:0,shroudSeconds:this.campaign.shroudMaximum};this.companionSuspended=false;this.companionCanEdit=false;this.companionState={version:1,player,aux};this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;return player;}
 disableCompanion(){if(this.activePlayer===this.companionState?.player)throw new Error('Cannot remove actor during its step');this.companionState=null;this.companionSuspended=false;this.companionCanEdit=false;this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;}
 setCompanionInput(input:GuestInput,receivedAt=Date.now()){if(!this.companionState||this.companionSuspended||!validGuestInput(input)||!Number.isFinite(receivedAt))return false;this.companionInput={...input};this.companionInputAt=receivedAt;this.companionState.player.yaw=input.yaw;this.companionState.player.pitch=input.pitch;return true;}
 private guestControls():Controls {const v=freshGuestInput(this.companionInput,this.companionInputAt,Date.now());return {x:v.x,z:v.z,block:v.block,sprint:v.sprint,water:false};}
 companionAction(action:Action){if(!this.companionState||this.companionSuspended||!['build-snap','attack','heavy','heavy-start','heavy-release','cancel-combat','dodge','jump','interact','heal','tool','sword','chisel','element-next','cast','recipe-next','build','special','dismantle'].includes(action))return false;this.withCompanion(()=>this.action(action,this.guestControls()));return true;}
 companionTick(dt:number){if(!this.companionState||this.companionSuspended||!Number.isFinite(dt)||dt<=0)return;this.withCompanion(()=>this.characterTick(Math.min(.1,dt),this.guestControls()));}
 neutralCompanionInput(){if(this.companionState)this.withCompanion(()=>this.cancelCombat());this.companionInput={...NEUTRAL_GUEST_INPUT,yaw:this.companion?.yaw??0,pitch:this.companion?.pitch??0};this.companionInputAt=-Infinity;}
 companionRespawn(){if(!this.companionState||this.companionSuspended||this.companionState.player.hp>0)return false;this.withCompanion(()=>this.respawn());this.companionState.aux.shroudSeconds=this.campaign.shroudMaximum;return true;}
 getCompanionSnapshot(){return this.companionSnapshot();}
 restoreCompanionSnapshot(value:unknown){return this.restoreCompanion(value);}
 companionSnapshot(){return this.companionState?cloneCompanion(this.companionState):null;}
 restoreCompanion(value:unknown){if(value===null){this.disableCompanion();return true;}if(!validCompanionSnapshot(value,this.westernContent))return false;this.companionState=cloneCompanion(value);this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;return true;}
 private livingPlayers(){return [this.primaryPlayer,...(this.companionState&&!this.companionSuspended?[this.companionState.player]:[])].filter(p=>p.hp>0);}
 private playerBodies(){return this.livingPlayers().map(p=>p.position);}
 private nearestActor(position:Vec3){return this.livingPlayers().sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.y-position.y,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.y-position.y,b.position.z-position.z))[0]??null;}
 private withActor<T>(actor:PlayerState,operation:()=>T):T|undefined{return actor===this.primaryPlayer?operation():this.withCompanion(operation);}
 private actorBlocking(actor:PlayerState){const cached=this.frameBlocking.get(actor);if(cached!==undefined)return cached;const input=actor===this.primaryPlayer?this.primaryInput:this.guestControls();return input.block&&actor.phase==='idle'&&actor.stamina>0&&!actor.tool&&(!this.campaignMode||this.campaign.canGuard);}
 private solidBodies(includeNpc=true){return [...this.playerBodies(),...this.enemies.filter(e=>e.hp>0&&this.enemyActive(e)).map(e=>e.position),...(this.campaignMode&&this.animal.visible?[this.animal.position]:[]),...(includeNpc&&this.campaignMode?this.npcActors.filter(a=>a.visible).flatMap(a=>[a.position,...[-.15,.15].flatMap(x=>[-.15,.15].map(z=>({x:a.position.x+x,y:a.position.y+.15,z:a.position.z+z})))]):[])];}
 protectQuestObjects(){if(this.campaignMode)for(const id of [DISPLAY_BASE,DISPLAY_ITEM])this.elements.protectedObjects.add(id);if(this.campaignMode)for(const id of VAULT_PROTECTED_IDS)this.elements.protectedObjects.add(id);if(this.campaignMode)for(const point of REGIONAL_POINTS)this.elements.protectedObjects.add(point.id);if(this.western)for(const id of WEST_PROTECTED_OBJECT_IDS)this.elements.protectedObjects.add(id);for(const o of this.arena.objects.values())if(['hearth','artisan','cache','gate','anchor'].includes(o.kind))this.elements.protectedObjects.add(o.id);}
 get focusUnlocked(){return this.campaign.skillRank('vigor')>0;}
 get focusWeaponSupported(){return !this.player.tool&&['iron-blade','greatsword','dagger'].includes(this.campaign.equippedWeapon??'');}
 cancelCombat(){const c=this.combat;c.charging=false;c.charge=0;if(c.pending){c.pending=null;c.castRemaining=0;if(this.player.phase==='cast'){this.player.phase='idle';this.player.time=0;}}}
 restoreMana(){if(this.player.phase!=='idle'||this.combat.charging)return {ok:false,message:'動作が終わってから魔力薬を飲む'};if(this.combat.mana>=MAX_MANA)return {ok:false,message:'マナは満タンです'};if(!this.campaign.has('mana-draught'))return {ok:false,message:'草葉2・石1から魔力薬を手作りする'};this.campaign.state.items['mana-draught']--;this.combat.mana=Math.min(MAX_MANA,this.combat.mana+60);return {ok:true,message:'魔力薬でマナを60回復'};}
 get activeTool(){return this.campaignMode?this.campaign.equippedTool:null;}
 get toolHint(){return this.activeTool==='wood-axe'?'木割り斧: 木・草に強い':this.activeTool==='stone-pick'?'つるはし: 石・金属に強い':this.activeTool==='terrain-rake'?(this.soilFilling?'熊手: 盛土（土9） / 強撃で撤去 / Fで削る':'熊手: 土・草の高い面を削る / Fで盛土（土9）'):this.activeTool==='build-hammer'?'建築槌: 攻撃で配置 / 強撃で解体':'鑿で採取';}
 get activeMelee(){return this.campaignMode&&!this.player.tool?this.campaign.meleeArchetype:'sword' as const;}
 get playerAttack(){return meleeDefinition(this.player.attack,this.activeMelee);}
 get npcActors(){return this.western?[this.npc,...this.westNpcs.actors]:[this.npc];}
 npcContextFor(actor:NpcLife){return {field:this.arena.field,hour:this.worldHour,rain:weatherAt(this.worldDay,this.worldHour,actor.position).rain,bed:this.home.state.furniture.includes(actor.profile.bedFurniture),blockers:[...this.playerBodies(),...this.enemies.filter(e=>e.hp>0&&this.enemyActive(e)).map(e=>e.position),...(this.animal.visible?[this.animal.position]:[]),...this.npcActors.filter(other=>other!==actor&&other.visible).map(other=>({...other.position,radius:.44}))]};}
 get npcContext(){return this.npcContextFor(this.npc);}
 reconcileNpc(){if(this.campaignMode){this.npc.reconcile(this.campaign.state.artisanRescued,this.npcContext);this.westNpcs.reconcile(this.western,actor=>this.npcContextFor(actor));}}
 private npcRay(origin:Vec3,d:Vec3,range:number,terrain?:typeof this.arena.field){let nearest:Hit|null=null;for(const actor of this.npcActors){const hit=actor.ray(origin,d,nearest?.distance??range,terrain);if(hit)nearest=hit;}return nearest;}
 get watermillContext(){return {authority:this.player===this.companion?'guest' as const:'host' as const,alive:this.player.hp>0,baseActive:this.campaignMode&&this.campaign.state.flameTier>0,position:this.player.position,blockers:this.solidBodies()};}
 get displayContext(){return {mayEdit:this.campaignMode&&this.mayEditWorld,alive:this.player.hp>0,baseActive:this.campaign.state.flameTier>0,position:this.player.position,blockers:this.solidBodies()};}
 get homeContext(){return {position:this.player.position,basePosition:{x:-3,y:.25,z:4},baseActive:this.campaign.state.flameTier>0,artisanRescued:this.campaign.state.artisanRescued,animalPosition:{...this.animal.position},animalVisible:this.campaignMode&&this.animal.visible&&Math.hypot(this.player.position.x-this.animal.position.x,this.player.position.y-this.animal.position.y,this.player.position.z-this.animal.position.z)<=2.75&&this.animal.visibleFrom(this.eye(),this.arena.field)};}
 readonly bedWait=new DawnDuskWait();private bedRevision=-1;private bedIntact=false;
 playerBedBuildReason(){return playerBedPlacementReason(this.arena.field,this.solidBodies().map(p=>({...p,radius:.55})));}
 playerRestStatus(multiplayer=false){
  const fail=(message:string)=>({ok:false,message}),p=this.player;
  if(multiplayer||this.companionState)return fail('時間を進める休息は単独プレイ専用です。協力部屋から退出してください。');
  if(!this.campaignMode||!this.worldReady)return fail('単独プレイの世界の準備を待ってください。');
  if(p.hp<=0||p.phase!=='idle'||this.combat.charging||this.combat.pending!==null||!p.grounded||this.gliding||this.grapple||this.ladders.active(p)||this.fishing.status.phase!=='idle'||this.buildMode||this.soilFilling||Math.hypot(p.vx,p.vz)>.08)return fail('生きた状態で地面に立ち、移動や作業を終えてから休息してください。');
  if(this.campaign.state.flameTier<=0)return fail('先に拠点の炉を灯してください。');
  if(!this.home.state.furniture.includes(PLAYER_BED))return fail('拠点生活で屋根付きの自分用寝台を設置してください。ナギの寝台では眠れません。');
  if(this.bedRevision!==this.arena.field.revision){this.bedRevision=this.arena.field.revision;this.bedIntact=playerBedIntact(this.arena.field);}
  if(!this.bedIntact)return fail('自分用寝台か屋根が破損しています。拠点生活で修理してください。');
  if(![p.position.x,p.position.y,p.position.z].every(Number.isFinite)||Math.hypot(p.position.x-PLAYER_BED_POSITION.x,p.position.y-PLAYER_BED_POSITION.y,p.position.z-PLAYER_BED_POSITION.z)>2)return fail('炉の東にある自分用寝台の2m以内へ移動してください。');
  if(!this.sheltered||!this.arena.field.ray({...PLAYER_BED_POSITION,y:1.6},{x:0,y:1,z:0},3.5))return fail('自分と寝台の上に屋根がある場所で休息してください。');
  const point={...PLAYER_BED_POSITION,y:.65},eye=this.eye(),d={x:point.x-eye.x,y:point.y-eye.y,z:point.z-eye.z},hit=this.arena.field.ray(eye,d,Math.hypot(d.x,d.y,d.z));
  if(hit&&hit.cell.object!==PLAYER_BED_OBJECT)return fail('寝台が見える場所へ移動してください。');
  if(this.environment.burning>0||this.environment.shock>0||this.swimming||this.cold>=20||this.enemies.some(e=>e.hp>0&&this.enemyActive(e)&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<10)||this.enemyShots.some(s=>Math.hypot(s.position.x-p.position.x,s.position.z-p.position.z)<12)||this.tells.some(s=>Math.hypot(s.position.x-p.position.x,s.position.z-p.position.z)<s.radius+3))return fail('敵や環境の危険が近いため休息できません。');
  return {ok:true,message:'自分用寝台で朝6時・夕方18時まで休息できます。'};
 }
 startPlayerRest(target:RestTarget,multiplayer=false){const status=this.playerRestStatus(multiplayer);return status.ok?this.bedWait.start(target,this.worldHour):status;}
 advancePlayerRest(multiplayer=false,shouldYield:()=>boolean=()=>false){
  const result=this.bedWait.advance(dt=>this.tick(dt,REST_NEUTRAL),()=>this.playerRestStatus(multiplayer),shouldYield);
  if(result.completed){this.campaign.state.restSeconds=Math.min(PLAYER_REST_MAX_SECONDS,180+this.home.restBonusSeconds);result.message=`休息を終えました。${this.campaign.state.restSeconds}秒、スタミナ回復 +40%。`;}
  return result;
 }
 repairPlayerBed(){
  if(!this.home.state.furniture.includes(PLAYER_BED))return {ok:false,message:'先に自分用寝台を設置してください。'};
  if(playerBedIntact(this.arena.field))return {ok:false,message:'寝台は破損していません。'};
  const reason=this.playerBedBuildReason();if(reason)return {ok:false,message:reason};
  if(this.player.hp<=0||!this.homeContext.baseActive||Math.hypot(this.player.position.x+3,this.player.position.y-.25,this.player.position.z-4)>4)return {ok:false,message:'点火済みの炉の4m以内で修理してください。'};
  if(this.survival.inventory[4]<6||this.survival.inventory[10]<2)return {ok:false,message:'修理には木材6・布2が必要です。'};
  this.survival.inventory[4]-=6;this.survival.inventory[10]-=2;this.arena.field.removeObject(PLAYER_BED_OBJECT);buildPlayerBed(this.arena.field);return {ok:true,message:'自分用寝台と屋根を修理しました。'};
 }
 furnitureContext(id:string){const profile=WEST_NPC_PROFILES.find(p=>p.bedFurniture===id);return profile?{...this.homeContext,basePosition:{x:-46.5,y:.75,z:-16},baseActive:!!this.western?.snapshot().campUnlocked&&!!this.western?.snapshot().claimed.includes(profile.id)}:this.homeContext;}
 furnitureBlocked(id:string){
  if(id===PLAYER_BED)return !!this.playerBedBuildReason();
  const bounds:Record<string,number[]>={bed:[-5,2,-3.5,3,.68],table:[-1,3.5,0,4.3,1.05],brazier:[-2,5.5,-1.5,6,.65],rug:[-4,5,-2,6.3,.28]},profile=WEST_NPC_PROFILES.find(p=>p.bedFurniture===id),b=profile?[profile.bed.x-.5,profile.bed.z-.6,profile.bed.x+.5,profile.bed.z+.6,1.18]:bounds[id];if(!b)return false;
  const bodies=[...this.playerBodies().map(position=>({position,radius:.27,height:1.65})),...this.enemies.filter(e=>e.hp>0&&this.enemyActive(e)).map(e=>({position:e.position,radius:.27,height:1.7})),...(this.animal.visible?[{position:this.animal.position,radius:.55,height:1.3}]:[]),...this.npcActors.filter(actor=>actor.visible).map(actor=>({position:actor.position,radius:.44,height:1.9}))];
  return bodies.some(({position:p,radius,height})=>p.y+height>(profile?.75:.25)&&p.y<b[4]+.02&&p.x+radius>b[0]&&p.x-radius<b[2]&&p.z+radius>b[1]&&p.z-radius<b[3]);
 }
 buildFurniture(id:string){if(id===PLAYER_BED){buildPlayerBed(this.arena.field);return;}const f=this.arena.field,base={x:-5,y:.25,z:2},profile=WEST_NPC_PROFILES.find(p=>p.bedFurniture===id);if(profile){const p=profile.bed;f.box({x:p.x-.5,y:.75,z:p.z-.6},{x:p.x+.5,y:1.05,z:p.z+.6},4,profile.bedObject,.08);f.box({x:p.x-.44,y:1.05,z:p.z-.55},{x:p.x+.44,y:1.18,z:p.z+.55},10,profile.bedObject,.04);return;}if(id==='bed'){f.box(base,{x:-3.5,y:.55,z:3},4,'build:home:bed',.1);f.box({x:-4.8,y:.55,z:2.15},{x:-3.7,y:.68,z:2.85},10,'build:home:bed',.06);}if(id==='table'){f.box({x:-1,y:.85,z:3.5},{x:0,y:1.05,z:4.3},4,'build:home:table',.06);f.box({x:-.6,y:.25,z:3.8},{x:-.4,y:.95,z:4},4,'build:home:table');}if(id==='brazier')f.box({x:-2,y:.25,z:5.5},{x:-1.5,y:.65,z:6},3,'build:home:brazier',.12);if(id==='rug')f.box({x:-4,y:.25,z:5},{x:-2,y:.28,z:6.3},10,'build:home:rug',.01);}
 get fishingActor():FishingActor{return {authority:this.player===this.companion?'guest':'host',alive:this.player.hp>0&&this.player.grounded,swimming:this.swimming,position:this.player.position};}
 selectFishingRod(selected:boolean){if(this.player===this.companion)return {ok:false,message:'現在、釣りはホストが操作します'};const result=this.fishing.selectRod(selected);if(result.ok&&selected){this.buildMode=false;this.player.tool=false;}return result;}
 get westActorContext():WestActorContext{return {authority:this.player===this.companion&&!this.companionCanEdit?'guest':'host',alive:this.player.hp>0,position:this.player.position};}
 enemyAwareness(e:Enemy){return e.hp<=0?'dead':e.regional?this.tactics.get(e.id)?.awareness??'patrol':this.guardAwareness.get(e.id)?.mode??'idle';}
 resetEnemyAwareness(){this.enemyNavigation.reset();this.guardNavigation.clear();this.ladders.clear();this.meleeStaggers.clear();for(const [id,state] of this.guardAwareness)this.guardAwareness.set(id,createGuardAwareness(state.home));for(const e of this.enemies){const def=this.enemyDefinition(e);if(def)this.tactics.set(e.id,createEnemyTacticState(def));}}
 enemyDefinition(e:Enemy){return REGIONAL_ENEMIES.find(d=>d.id===e.regional)??(this.western?WEST_RUNTIME_ENEMIES.find(d=>d.definition.id===e.regional)?.definition:undefined);}
 enemyActive(e:Enemy){if(this.western&&e.id>=18&&!this.western.accessible)return false;if(!this.worldReady&&e.id>=2)return false;const def=e.regional?this.enemyDefinition(e):undefined;return !def||this.campaign.regionUnlocked(def.region)&&isRegionalOpen(def.activeHours,this.worldHour);}
 get weather(){return weatherAt(this.worldDay,this.worldHour,this.player.position);}
 get sheltered(){return !!this.arena.field.ray(this.eye(),{x:0,y:1,z:0},3.5);}
 safePosition(position:Vec3,avoidHazards=false){
  const offsets=[[0,1.5],[1.5,0],[-1.5,0],[0,-1.5],[0,0],[2.5,2.5],...(avoidHazards?[[3,0],[-3,0],[0,3],[0,-3],[3,3],[-3,3],[3,-3],[-3,-3],[5,0],[-5,0],[0,5],[0,-5]]:[])];
  for(const origin of avoidHazards?[position,{x:0,y:.25,z:6}]:[position])for(const [x,z] of offsets){const p={x:origin.x+x,y:origin.y+8,z:origin.z+z},h=this.arena.field.ray(p,{x:0,y:-1,z:0},14);if(!h)continue;const candidate={x:p.x,y:h.point.y+.03,z:p.z};if(this.arena.field.overlaps(candidate)||avoidHazards&&this.campaignMode&&(this.animal.overlaps(candidate)||this.npcActors.some(actor=>actor.overlaps(candidate)))||this.companionState&&this.playerBodies().some(b=>Math.abs(b.y-candidate.y)<1.65&&Math.hypot(b.x-candidate.x,b.z-candidate.z)<.6))continue;
   if(avoidHazards&&this.elements.states.size&&stepPlayerEnvironment(createPlayerEnvironmentState(),.1,{position:candidate,field:this.arena.field,elements:this.elements,water:this.water,armorMaterial:this.campaign.armorMaterial}).damage>0)continue;return candidate;
  }
  // Building height is capped at8m. A last-resort elevated return gives control
  // back above blocked spawn geometry rather than trapping the player inside it.
  if(avoidHazards){this.events.push({kind:'interact',text:'周囲の復帰地点が塞がれています。上空から安全な地面へ移動してください'});return {x:0,y:12,z:6};}return {x:0,y:.28,z:6};
 }
 respawn(){this.cancelCombat();this.environment=createPlayerEnvironmentState();this.ladders.release(this.player);if(this.player!==this.companion)this.fishing.cancel('復活で釣りを中断');const p=this.player;if(this.campaignMode){if(this.activePlayer===this.companionState?.player)p.position=this.safePosition(this.campaign.spawn,true);else{this.campaign.die(p.position);p.position=this.safePosition(this.campaign.respawn(),true);}}else p.position={x:0,y:.25,z:6};p.hp=this.campaignMode?this.campaign.maxHp:100;p.stamina=this.campaignMode?this.campaign.maxStamina:100;p.phase='idle';p.time=0;p.vy=p.vx=p.vz=0;p.queued='';this.gliding=false;this.grapple=null;this.oxygen=20;this.deathCause='';}

 readonly events:Event[]=[];seconds=0;waterOn=false;defeated=0;private fluidTime=0;private footTime=0;private regenDelay=0;
 look(dx:number,dy:number){const weight=this.player.phase==='strike'?.28:this.player.phase==='windup'?.65:1;this.player.yaw-=dx*weight;this.player.pitch=clamp(this.player.pitch-dy*weight,-Math.PI/2+.03,Math.PI/2-.03);}
 eye():Vec3{return {...this.player.position,y:this.player.position.y+1.52};}
 target(range=2.75):Target|null {
  const p=this.player,eye=this.eye(),d=direction(p.yaw,p.pitch);let hit=this.arena.field.ray(eye,d,range),enemy:Enemy|undefined,drop:MaterialDrop|undefined,inventoryDrop:InventoryDrop|undefined;
  for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const q={x:e.position.x-eye.x,y:e.position.y+.9-eye.y,z:e.position.z-eye.z},along=q.x*d.x+q.y*d.y+q.z*d.z;if(along<-1.2||along>range+1.2||q.x*q.x+q.y*q.y+q.z*q.z-along*along>1.44)continue;const c=Math.cos(e.yaw),s=Math.sin(e.yaw),rel={x:eye.x-e.position.x,y:eye.y-e.position.y,z:eye.z-e.position.z};
   const local={x:c*rel.x-s*rel.z,y:rel.y,z:s*rel.x+c*rel.z},dir={x:c*d.x-s*d.z,y:d.y,z:s*d.x+c*d.z};const h=this.enemyElements[e.id].field.ray(local,dir,range);
   if(h&&(!hit||h.distance<hit.distance)){hit={...h,point:{x:eye.x+d.x*h.distance,y:eye.y+d.y*h.distance,z:eye.z+d.z*h.distance}};enemy=e;}
  }
  for(const item of this.survival.drops){const q={x:item.position.x-eye.x,y:item.position.y-eye.y,z:item.position.z-eye.z},t=q.x*d.x+q.y*d.y+q.z*d.z;if(t<0||t>range||Math.hypot(q.x-d.x*t,q.y-d.y*t,q.z-d.z*t)>.16||hit&&t>=hit.distance)continue;hit={point:{...item.position},normal:{x:-d.x,y:-d.y,z:-d.z},distance:t,cell:{x:0,y:0,z:0,material:item.material,distance:-.1,object:'drop:'+item.id}};drop=item;enemy=undefined;}
  if(this.campaignMode)for(const bundle of this.campaign.inventory.state.drops){const q={x:bundle.position.x-eye.x,y:bundle.position.y-eye.y,z:bundle.position.z-eye.z},t=q.x*d.x+q.y*d.y+q.z*d.z;if(t<0||t>range||Math.hypot(q.x-d.x*t,q.y-d.y*t,q.z-d.z*t)>.22||hit&&t>=hit.distance)continue;hit={point:{...bundle.position},normal:{x:-d.x,y:-d.y,z:-d.z},distance:t,cell:{x:0,y:0,z:0,material:4,distance:-.1,object:'inventory-drop:'+bundle.id}};inventoryDrop=bundle;drop=undefined;enemy=undefined;}
  const npcHit=this.campaignMode?this.npcRay(eye,d,hit?Math.min(range,hit.distance):range):null;
  const animalHit=this.campaignMode?this.animal.ray(eye,d,Math.min(range,hit?.distance??range,npcHit?.distance??range)):null;if(animalHit&&(!hit||animalHit.distance<hit.distance)){const a=this.home.state.animal;return {hit:animalHit,animal:true,label:(a.tamed?'仲間の山羊':'野の山羊')+' · 保護対象',action:'E / 操作 · '+(!a.tamed?'なつかせる（草葉8）':a.ready?'ミルクを受け取る':a.remaining>0?'餌を食べている':'餌を与える（草葉2）')};}
  if(npcHit){const actor=this.npcActors.find(a=>a.profile.id===npcHit.cell.object)!;return {hit:npcHit,npc:true,npcId:actor.profile.id,label:actor.profile.name+' · '+actor.label,action:'E / 操作 · 話す'};}
  if(!hit)return null;if(inventoryDrop)return {hit,inventoryDrop,label:inventoryDefinition(inventoryDrop.key)!.label+' ×'+inventoryDrop.count,action:'E / 操作 · 落とし物を回収'};if(drop)return {hit,drop,label:materialDefinition(drop.material).name+'の素材 ×'+drop.count,action:'近づいて回収 / 属性で動かす'};if(enemy)return {hit,enemy,label:enemy.name??(this.campaignMode&&enemy.id===1?'銅殻の番人':enemy.id>=2?'尾根の略奪者':'灰の番兵'),action:''};
  if(hit.cell.object===DISPLAY_BASE||hit.cell.object===DISPLAY_ITEM)return {hit,label:'記念展示台 · '+(this.display.state.item?CAMPAIGN_ITEMS[this.display.state.item].label:'空'),action:'拠点生活 → 記念展示台で展示・取り出し · 採掘不可'};
  if(hit.cell.object===PLAYER_BED_OBJECT)return {hit,label:'屋根付きの自分用寝台',action:'拠点生活 → 朝6時・夕方18時まで休息（単独プレイ）'};
  if(hit.cell.object===WATERMILL_ID)return {hit,label:'水車の織機',action:'拠点生活 → 水車 · '+this.watermill.blockedReason};
  if(hit.cell.object?.startsWith('build:ladder:'))return {hit,label:'木の梯子',action:'E / 操作で掴む · 前後で昇降 · 跳躍で離す'};
  if(hit.cell.object?.startsWith('build:door:'))return {hit,label:'建築した扉',action:'E / 操作 · 開閉'};
  const object=hit.cell.object?this.arena.objects.get(hit.cell.object):null;
  if(!object)return {hit,label:materialDefinition(hit.cell.material).name,action:p.tool?this.toolHint:'斬撃で採取'};
  if(this.dungeon.handles(object.id))return {hit,label:object.name,action:this.dungeon.actionLabel(object.id,this.seconds)};
  if(this.western?.handles(object.id))return {hit,label:object.name,action:'E / 操作 · '+(object.kind==='resource'?'回収する':object.kind==='valve'?'運搬門を開く':'調べる')};
  if(this.campaignMode&&(object.id.startsWith('rg-')||['hearth','artisan','cache','gate','anchor','plant'].includes(object.kind)))return {hit,label:object.id==='artisan'&&this.campaign.state.artisanRescued?'鍛冶師ナギ':object.name,action:'E / 操作 · '+(object.kind==='anchor'?'鉤縄で登る':object.kind==='plant'||object.kind==='resource'?'採る':object.kind==='artisan'?'話す':'調べる')};
  const damaged=this.elements.damagedObjects.has(object.id);
  const action=object.kind==='door'?(object.open?'閉じる':'開く'):object.kind==='chest'?(object.open?'回収済み':'補給を取る'):object.kind==='valve'?(this.waterOn?'止水':'放水'):object.kind==='altar'?(this.campaignMode?'読む':'番兵を復活'):p.tool?this.toolHint:'斬る';
  return {hit,label:object.name,action:damaged&&(object.kind==='door'||object.kind==='chest')?'破損 · 攻撃で採取':(object.kind==='tree'||object.kind==='resource')?action:object.kind==='chest'&&object.open?'':'E / 操作 · '+action};
 }
 get buildingHomes(){return this.campaign.state.flameTier?[{id:'hearth',name:'灯守りの炉',position:CAMPAIGN_POINTS.find(p=>p.id==='hearth')!.position},...(this.western?.snapshot().campUnlocked?[WEST_POINTS.find(p=>p.id==='west-return-hearth')!]:[]),...REGIONAL_POINTS.filter(q=>q.kind==='hearth'&&this.campaign.state.claimedPoints.includes(q.id))]:[];}
 withinBuildingTerritory(target:Vec3){return this.buildingHomes.some(h=>Math.hypot(h.position.x-target.x,h.position.z-target.z)<this.campaign.buildingRadius);}
 private buildingPermission(target:Vec3){
  if(!this.mayEditWorld)return '同行者の地形編集はホストの許可が必要';
  if(this.campaignMode){if(!this.campaign.state.flameTier)return '先に灯守りの炉を点火すると盛土できる';
   if(!this.withinBuildingTerritory(target))return `点火した拠点の建築範囲（半径${this.campaign.buildingRadius}m未満）で盛土する`;
  }return '';
 }
 soilContext(target:Vec3):SoilContext{return {player:this.player.position,bodies:[...this.solidBodies().filter(b=>b!==this.player.position),this.primaryPlayer.position,...(this.companion?[this.companion.position]:[]),...(this.campaignMode&&this.animal.visible?[-.4,.27].map(z=>({x:this.animal.position.x+Math.sin(this.animal.yaw)*z,y:this.animal.position.y,z:this.animal.position.z+Math.cos(this.animal.yaw)*z})):[])],bounds:this.survival.buildBounds,protectedObjects:this.elements.protectedObjects,permission:this.buildingPermission(target)};}
 soilPreview():SoilPreview|null{
  const target=this.target(3.2);if(!target)return null;
  const preview=this.survival.soil.preview(target.hit.point,this.soilContext(target.hit.point));
  if(target.enemy||target.drop||target.inventoryDrop||target.animal||target.npc)return {...preview,ok:false,message:'体や素材ではなく、見える地面を狙う'};
  if(target.hit.normal.y<.65)return {...preview,ok:false,message:'壁ではなく地面の上面を狙う'};
  if(this.campaign.gearInfo('terrain-rake').durability===0)return {...preview,ok:false,message:'熊手が破損。持物の装備画面から石で修理する'};
  return preview;
 }
 private soilAction(action:Action){
  const p=this.player;if(p.phase!=='idle')return;
  if(action==='cast'){this.soilFill=false;return;}
  if(!this.mayEditWorld){this.denyWorldEdit();return;}
  if(this.campaign.gearInfo('terrain-rake').durability===0){this.events.push({kind:'interact',text:'熊手が破損。持物の装備画面から石で修理する'});return;}
  let result:{ok:boolean;message:string};
  if(action==='special')result=this.survival.soil.undo(this.soilContext(this.survival.soil.undoTarget??p.position));
  else if(action==='heavy'||action==='dismantle'){const target=this.target(3.2);result=target?this.survival.soil.remove(target.hit.cell.object??'',this.soilContext(target.hit.point)):{ok:false,message:'自分の盛土を狙う'};}
  else {const preview=this.soilPreview(),target=this.target(3.2);result=preview?.ok&&target?this.survival.soil.place(target.hit.point,this.soilContext(target.hit.point)):{ok:false,message:preview?.message??'3m以内の地面を狙う'};}
  if(result.ok){this.campaign.consumeToolDurability();this.syncMaterials();}this.events.push({kind:result.ok?'break':'interact',text:result.message});
 }
 buildPreview():PlacementPreview|null{
  const target=this.target(3.2);if(!target||target.enemy||target.drop||target.inventoryDrop||target.animal||target.npc)return null;
  const placement=buildTarget(target.hit.point,this.buildSnap);
  const preview=this.survival.preview(placement,this.player.position,this.solidBodies().filter(b=>b!==this.player.position));
  if(this.campaignMode){if(!this.campaign.state.flameTier)return {...preview,ok:false,message:'先に灯守りの炉を点火すると建築できる'};
   if(!this.withinBuildingTerritory(placement))return {...preview,ok:false,message:`点火した拠点の建築範囲（半径${this.campaign.buildingRadius}m未満）で設置する`};
  }return preview;
 }
 action(action:Action,input:Controls){
  const p=this.player;let chargedWindup=0;if(action==='cancel-combat'){this.cancelCombat();return;}if(p.hp<=0)return;
  if(action==='heavy-start'){if(p.phase==='idle'&&!input.block&&!this.combat.charging){this.combat.charging=true;this.combat.charge=0;this.events.push({kind:'interact',text:'強撃を溜める · 準備完了後に離す'});}return;}
  if(action==='heavy-release'){const ready=this.combat.charging&&heavyReady(this.combat.charge);chargedWindup=this.chargePoseTime;this.combat.charging=false;this.combat.charge=0;if(!ready){this.events.push({kind:'interact',text:'強撃を中断 · 0.45秒以上長押し'});return;}action='heavy';}
  if(this.combat.charging){this.combat.charging=false;this.combat.charge=0;}if(this.combat.pending){if(action==='dodge'){this.cancelCombat();}else return;}
  if(!this.mayEditWorld&&(action==='cast'&&!this.soilFilling||action==='build'||action==='dismantle'||action==='special'&&(this.buildMode||this.soilFilling)||p.tool&&(action==='attack'||action==='heavy'))){this.denyWorldEdit();return;}if(this.campaignMode&&this.swimming&&this.oxygen<19.9&&['attack','heavy','cast'].includes(action)){this.events.push({kind:'interact',text:'潜水中は攻撃できない。視点を上げて泳ぎ浮上する'});return;}
  if(this.ladders.active(p)){if(action==='interact'||action==='jump'){this.ladders.release(p);if(action==='jump'&&p.stamina>=8){p.vy=4.5;p.stamina-=8;this.regenDelay=.6;}this.events.push({kind:'interact',text:'梯子から手を離した'});return;}if(!['element-next','tool','sword','chisel'].includes(action)){this.events.push({kind:'interact',text:'E / 操作またはジャンプで梯子から離れる'});return;}}
  if(this.fishing.selected&&['tool','sword','chisel','jump','cast','build','recipe-next','dismantle','attack','heavy'].includes(action)&&this.player!==this.companion)this.fishing.selectRod(false);
  if(this.rakeSelected&&!this.buildMode&&action==='element-next'){if(p.phase==='idle'){this.soilFill=!this.soilFill;this.events.push({kind:'interact',text:this.toolHint});}return;}
  if(this.soilFilling&&['attack','heavy','build','dismantle','special','cast'].includes(action)){this.soilAction(action);return;}
  if(this.campaignMode&&p.tool&&this.activeTool==='build-hammer'&&(action==='attack'||action==='heavy')){action=action==='attack'?'build':'dismantle';this.buildMode=true;}
  if(this.campaignMode&&p.tool&&this.activeTool==='build-hammer'&&this.campaign.gearInfo('build-hammer').durability===0&&['build','dismantle'].includes(action)){this.events.push({kind:'interact',text:'建築槌が破損。持物の装備画面から石で修理する'});return;}
  if(action==='special'){if(this.buildMode){const r=this.survival.undo(p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});this.syncMaterials();return;}if(!this.focusUnlocked||!this.focusWeaponSupported){this.events.push({kind:'interact',text:!this.focusUnlocked?'集中技の解放: 丈夫な身体ランク1を習得する':'集中技は剣・両手剣・短剣を装備して使う'});return;}if(!this.campaignMode||p.phase!=='idle'||!spendCombatFocus(this.focus,'special:'+(++this.actionSerial))){this.events.push({kind:'interact',text:'確定命中で集中100を蓄積する'});return;}for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const dx=e.position.x-p.position.x,dz=e.position.z-p.position.z;if(Math.hypot(dx,dz)>3||facing(p.yaw,p.position,e.position)<.1||this.arena.field.ray(this.eye(),{x:dx,y:0,z:dz},Math.max(0,Math.hypot(dx,dz)-.35)))continue;e.hp=Math.max(0,e.hp-70);this.enemyElements[e.id].impulse({x:dx,y:0,z:dz},4);this.finishElementDeath(e);}p.phase='cast';p.time=0;this.events.push({kind:'swing',text:'集中技 · 灯火の一閃'});return;}
  if(action==='element-next'){if(this.buildMode){this.survival.rotate();return;}if(p.phase==='idle'){const order:Element[]=['fire','water','earth','wind','lightning'];this.selectedElement=order[(order.indexOf(this.selectedElement)+1)%order.length];}return;}
  if(action==='build-snap'){if(p.phase==='idle'&&this.buildMode){this.buildSnap=!this.buildSnap;this.events.push({kind:'interact',text:this.buildSnap?'建築: 1.5m格子に吸着':'建築: 自由配置'});}return;}
  if(action==='recipe-next'){if(p.phase==='idle'){this.buildMode=true;this.survival.cycleRecipe();}return;}
  if(action==='dismantle'){if(p.phase!=='idle')return;const t=this.target(3.2);if(!t?.hit.cell.object?.startsWith('build:')){this.events.push({kind:'interact',text:'自分で建てた部材を狙う'});return;}const r=this.survival.dismantle(t.hit.cell.object,p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});if(r.ok&&this.activeTool==='build-hammer')this.campaign.consumeToolDurability();this.syncMaterials();return;}
  if(action==='build'){if(p.phase==='idle'){if(this.campaignMode&&!this.buildMode){this.buildMode=true;this.events.push({kind:'interact',hint:'building',text:'建築: V部品 / F回転 / B設置 / X戻す / G終了'});return;}const preview=this.buildPreview();if(!preview||!preview.ok){this.events.push({kind:'interact',text:preview?.message??'近くの地面に照準を合わせる'});return;}const result=this.survival.place(preview.target,p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:result.ok?'break':'interact',text:result.message});if(result.ok&&this.campaignMode){this.campaign.recordBuild(this.survival.selected);if(this.activeTool==='build-hammer')this.campaign.consumeToolDurability();}this.syncMaterials();}return;}
  if(action==='cast'){
   if(this.buildMode){this.buildMode=false;return;}
   if(p.phase!=='idle'||input.block||this.castCooldown>0)return;
   if(p.stamina<18){this.events.push({kind:'interact',text:'属性術にはスタミナ18が必要'});return;}
   const target=this.target(7);if(!target){this.events.push({kind:'interact',text:'7m以内のVoxelに照準を合わせる'});return;}
   if(target.npc){this.events.push({kind:'interact',text:'住人は保護されています'});return;}
   if(this.combat.mana<SPELL_MANA){this.events.push({kind:'interact',text:'マナ20が必要 · 草葉2・石1で魔力薬を制作する'});return;}
   this.combat.mana-=SPELL_MANA;this.combat.pending=this.selectedElement;this.combat.castRemaining=SPELL_CAST_SECONDS;p.stamina-=18;this.regenDelay=1;this.castCooldown=.7;p.phase='cast';p.time=0;p.queued='';this.events.push({kind:'interact',text:'属性術を詠唱 · 0.45秒 / 回避・被弾・中断で不発'});return;
  }
  if(action==='tool'||action==='sword'||action==='chisel'){this.buildMode=false;if(p.phase==='idle'){p.tool=action==='tool'?!p.tool:action==='chisel';if(p.tool&&this.activeTool==='build-hammer')this.buildMode=true;}return;}
  if(action==='heal'){if(p.phase==='idle'&&p.flasks&&p.hp<(this.campaignMode?this.campaign.maxHp:100)){p.flasks--;p.phase='heal';p.time=0;this.regenDelay=1.6;this.events.push({kind:'interact',text:'回復薬を飲む'});}return;}
  if(action==='interact'){if(p.phase==='idle'){if(this.campaignMode&&this.fishing.selected){if(this.player===this.companion){this.events.push({kind:'interact',text:'釣りはホストが操作中です'});return;}const target=fishingTargetAlongRay(this.eye(),direction(p.yaw,p.pitch),this.fishing.water),result=this.fishing.interact(target,this.fishingActor);this.events.push({kind:'interact',text:result.message});}else this.interact();}return;}
  if(action==='jump'){if(this.campaignMode&&this.swimming){p.vy=3;return;}if(this.campaignMode&&!p.grounded&&this.campaign.canGlide){this.gliding=!this.gliding;return;}if(p.grounded&&p.stamina>=12){p.vy=5;p.grounded=false;p.stamina-=12;this.regenDelay=.6;}return;}
  if(action==='dodge'){if(p.phase!=='idle'||p.stamina<24)return;const m=this.axes(input),length=Math.hypot(m.x,m.z);p.dodgeX=length?m.x/length:Math.sin(p.yaw);p.dodgeZ=length?m.z/length:Math.cos(p.yaw);p.phase='dodge';p.time=0;p.stamina-=24;this.regenDelay=.8;return;}
  if(p.phase!=='idle'){if(p.phase==='recover'&&p.time>this.playerAttack.recover*.55)p.queued=action==='heavy'?'heavy':'attack';return;}
  if(input.block)return;
  if(this.campaignMode&&this.campaign.equippedWeapon==='bow'&&!p.tool){if(p.stamina<8||!this.campaign.consumeAmmo()){this.events.push({kind:'interact',text:'矢とスタミナ8が必要'});return;}this.campaign.consumeAttackDurability();const d=direction(p.yaw,p.pitch);this.arrows.push({owner:this.player===this.companion?'guest':'host',position:this.eye(),velocity:{x:d.x*18,y:d.y*18,z:d.z*18},life:2.5});p.stamina-=8;p.phase='cast';p.time=0;this.events.push({kind:'swing',text:'矢を放った'});return;}
  p.attack=action==='heavy'?'overhead':p.combo%2?'return':'slash';const cost=p.tool?(this.activeTool&&action==='heavy'?18:12):this.playerAttack.cost;
  if(p.stamina<cost){this.events.push({kind:'interact',text:'スタミナ不足'});return;}
  if(this.campaignMode){const wear=p.tool?this.campaign.consumeToolDurability():this.campaign.consumeAttackDurability();if(wear.ok&&wear.message)this.events.push({kind:'interact',text:wear.message});}p.combo++;p.phase='windup';p.time=chargedWindup;p.heavy=action==='heavy';p.hit=false;p.stamina-=cost;this.regenDelay=.85;
 }

 private resolveSpell(){
  const c=this.combat,element=c.pending;c.pending=null;c.castRemaining=0;if(!element)return;
  if(!this.mayEditWorld){this.denyWorldEdit();return;}const target=this.target(7);if(!target||target.npc){this.events.push({kind:'interact',text:target?.npc?'住人は保護されています':'詠唱が届かなかった · 射程7m'});return;}
  const aim=direction(this.player.yaw,this.player.pitch);if(target.animal)this.animal.cast(element,aim);else if(target.enemy)this.castEnemy(target.enemy,element,target.hit);else if(!target.drop&&!target.inventoryDrop)this.elements.cast(element,target.hit,aim);if(this.campaignMode)this.campaign.consumeAttackDurability();this.survival.react(element,target.hit.point,aim);this.events.push({kind:element==='water'?'water':'interact',text:{fire:'火 · 木と草へ延焼',water:'水 · 消火と濡れ',earth:'土 · 衝撃と鎮火',wind:'風 · 風下へ火を運ぶ',lightning:'雷 · 接触した金属へ通電'}[element]});this.syncMaterials();
 }
 private interact(){
  const target=this.target(this.campaignMode&&this.campaign.canGrapple?7:2.75);if(target?.inventoryDrop){const drop=target.inventoryDrop,r=this.campaign.inventory.pickup(drop.id,drop.count,this.player.position,this.arena.field);this.events.push({kind:'interact',text:r.message});return;}if(target?.npc){const actor=this.npcActors.find(a=>a.profile.id===target.npcId)??this.npc,result=actor.talk(this.eye(),this.arena.field);this.events.push({kind:'interact',text:result.message});return;}if(target?.animal){if(!this.mayEditWorld){this.denyWorldEdit();return;}const result=this.animal.interact(this.homeContext);this.events.push({kind:'interact',text:result.message});return;}if(!target||target.enemy||!target.hit.cell.object)return;if(target.hit.cell.object.startsWith('build:ladder:')){const ok=this.ladders.start(target.hit.cell.object,this.player);if(ok){this.gliding=false;this.grapple=null;this.buildMode=false;}this.events.push({kind:'interact',text:ok?'梯子を掴んだ · W/S または左スティック前後で昇降 · E/ジャンプで離す':'梯子の正面か裏へ近づく。破損した梯子には登れない'});return;}if(target.hit.cell.object.startsWith('build:door:')){const r=this.survival.toggleDoor(target.hit.cell.object,this.player.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});this.syncMaterials();return;}const o=this.arena.objects.get(target.hit.cell.object);if(o&&this.dungeon.handles(o.id)){const result=this.dungeon.interact(o.id,{position:this.player.position,alive:this.player.hp>0,mayEdit:this.mayEditWorld,hitPoint:target.hit.point});this.events.push({kind:'interact',text:result.message});return;}if(o&&this.western?.handles(o.id)){const result=this.western.interact(o.id,this.westActorContext);if(result.ok)this.reconcileNpc();this.events.push({kind:'interact',text:result.message});return;}if(!o||o.kind==='tree'||o.kind==='resource'&&!(this.campaignMode&&o.id.startsWith('rg-')))return;
  if((o.kind==='door'||o.kind==='chest')&&this.elements.damagedObjects.has(o.id)){this.events.push({kind:'interact',text:'破損した部材は開閉できない · 攻撃で採取'});return;}
  if(this.campaignMode){if(o.id.startsWith('rg-')&&o.kind!=='anchor'){const r=this.campaign.interactRegional(o.id,this.player.position,this.worldHour);if(r.ok){o.open=true;if(o.kind==='resource'||o.kind==='plant'){this.arena.field.removeObject(o.id);this.syncMaterials();}}this.events.push({kind:'interact',text:r.message});return;}if(o.kind==='anchor'){if(!this.campaign.canGrapple){this.events.push({kind:'interact',text:'登り鉤を制作して装備する'});return;}const rp=REGIONAL_POINTS.find(p=>p.id===o.id);this.grapple=rp?{...rp.position,y:rp.position.y+.1}:{x:7.65,y:3.55,z:-7.45};this.grappleTime=0;this.events.push({kind:'interact',text:'鉤縄で引き寄せる'});return;}
   if(o.kind==='plant'){if(!o.open){o.open=true;this.survival.inventory[7]+=4;this.events.push({kind:'interact',text:'食用草葉 ×4'});}return;}
   if(['hearth','artisan','cache','gate'].includes(o.kind)){if(o.id==='forest-chest'||o.id==='ridge-chest'){if(!o.open){o.open=true;this.survival.inventory[6]+=6;this.survival.inventory[10]+=4;this.events.push({kind:'interact',text:'探索報酬 金属6・布4'});}return;}if(o.id==='artisan'&&this.campaign.state.artisanRescued){this.events.push({kind:'interact',text:'ナギ「炉のそばで装備を整えよう。旅の記録から制作できる」'});return;}const result=this.campaign.interact(o.id,this.player.position);if(result.ok&&o.id==='artisan')this.reconcileNpc();this.events.push({kind:'interact',text:result.message});return;}}
  if(o.kind==='door'){setDoor(this.arena.field,!o.open);
   if(this.playerBodies().some(position=>this.arena.field.overlaps(position))||this.campaignMode&&this.npcActors.some(actor=>actor.visible&&actor.overlapsTerrain(this.arena.field))||this.enemies.some(e=>e.hp>0&&this.arena.field.overlaps(e.position,.27,1.7))){setDoor(this.arena.field,o.open);this.events.push({kind:'interact',text:'扉が体に当たるため動かせない'});return;}
   o.open=!o.open;
  }
  if(o.kind==='chest'&&!o.open){o.open=true;this.player.flasks+=2;this.arena.field.box({x:-3.25,y:1,z:-3.75},{x:-1.75,y:1.25,z:-3},0);this.events.push({kind:'interact',text:'回復薬 ×2'});}
  if(o.kind==='valve')this.waterOn=!this.waterOn;
  if(o.kind==='altar'&&this.campaignMode){this.events.push({kind:'interact',text:'記憶碑「霧晶と番人の核を炉へ。強まった灯が北の道を開く」'});return;}
  if(o.kind==='altar'){for(const e of this.enemies){e.hp=100;e.phase='idle';e.time=0;e.vy=0;e.position={x:e.id*2,y:.25,z:-6-e.id*3};}this.defeated=0;this.player.stamina=100;}
  this.events.push({kind:'interact',text:o.name+' · '+(o.kind==='valve'?(this.waterOn?'放水':'止水'):o.kind==='door'?(o.open?'開く':'閉じる'):'操作')});
 }
 private axes(input:Controls){const p=this.player;return {x:Math.cos(p.yaw)*input.x-Math.sin(p.yaw)*input.z,z:-Math.sin(p.yaw)*input.x-Math.cos(p.yaw)*input.z};}
 private move(position:Vec3,dx:number,dz:number,height=1.65){
  const field=this.arena.field,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.1));
  for(let i=0;i<steps;i++){for(const [axis,delta] of [['x',dx/steps],['z',dz/steps]] as const){const trial={...position,[axis]:position[axis]+delta};if(this.campaignMode&&!this.worldReady&&(Math.abs(trial.x)>11||trial.z<-11||trial.z>9))continue;
   if(this.campaignMode&&(this.animal.overlaps(trial,.27,height)||this.npcActors.some(actor=>actor.overlaps(trial,.27,height)&&!(actor.overlaps(position,.27,height)&&separatesContact(position,trial,actor.position)))))continue;const bodies=this.solidBodies(false);
   if(bodies.some(b=>b!==position&&Math.abs(b.y-trial.y)<1.65&&Math.hypot(b.x-trial.x,b.z-trial.z)<.55))continue;
   if(!field.overlaps(trial,.27,height))position[axis]+=delta;else if(!field.overlaps({...trial,y:trial.y+.26},.27,height)){position[axis]+=delta;position.y+=.25;}}}
 }
 private get chargePoseTime(){return heavyChargePoseTime(this.combat.charge,meleeDefinition('overhead',this.activeMelee).windup);}
 pose(){const p=this.player,pose=attackPose(this.combat.charging?'overhead':p.attack,p.phase==='cast'?'idle':this.combat.charging?'windup':p.phase,this.combat.charging?this.chargePoseTime:p.time,1,this.activeMelee);if(p.phase==='cast'){const t=Math.sin(Math.min(1,p.time/.7)*Math.PI)**2;return {...pose,grip:{...pose.grip,y:pose.grip.y+.12*t,z:pose.grip.z-.08*t},tip:{...pose.tip,y:pose.tip.y+.12*t,z:pose.tip.z-.08*t},lean:-.025*t};}if(p.phase==='heal'){const u=clamp(p.time<.55?p.time/.55:p.time<1.05?1:(1.6-p.time)/.55,0,1),t=u*u*(3-2*u);return {...pose,grip:{x:pose.grip.x+(.1-pose.grip.x)*t,y:pose.grip.y+(1.36-pose.grip.y)*t,z:pose.grip.z+(-.24-pose.grip.z)*t},drink:t};}if(p.phase==='dodge'){const t=Math.sin(p.time/.36*Math.PI);return {...pose,grip:{...pose.grip,y:pose.grip.y-t*.13},lean:t*.08};}return pose;}
 enemyPose(e:Enemy){
  const pose=attackPose(e.attack,e.phase,e.time,1.35);if((e.phase!=='stagger'&&e.phase!=='dead')||!e.interrupted)return pose;
  const u=clamp(e.time/(e.phase==='dead'?.8:.35),0,1),t=u*u*(3-2*u),a=e.interrupted,mix=(x:number,y:number)=>x+(y-x)*t;
  const grip={x:mix(a.grip.x,pose.grip.x),y:mix(a.grip.y,pose.grip.y),z:mix(a.grip.z,pose.grip.z)},raw={x:mix(a.tip.x,pose.tip.x)-grip.x,y:mix(a.tip.y,pose.tip.y)-grip.y,z:mix(a.tip.z,pose.tip.z)-grip.z},scale=attacks[e.attack].reach/(Math.hypot(raw.x,raw.y,raw.z)||1);
  return {grip,tip:{x:grip.x+raw.x*scale,y:grip.y+raw.y*scale,z:grip.z+raw.z*scale},twist:mix(a.twist,pose.twist),lean:mix(a.lean,pose.lean),step:mix(a.step,pose.step)};
 }

 /** Continuous blade sweep: contact follows the rendered edge, including head/body and walls. */
 private melee(before:WeaponPose,after:WeaponPose){
  const p=this.player;if(p.hit)return;
  if(p.tool&&!this.activeTool){if(!this.mayEditWorld){p.hit=true;this.denyWorldEdit();return;}const target=this.target(2.5);if(target?.inventoryDrop){p.hit=true;this.events.push({kind:'interact',text:'落とし物は操作で回収できます'});return;}if(target?.npc){p.hit=true;p.hitstop=.06;this.events.push({kind:'interact',text:'住人は保護されています。採取はできません'});return;}if(target?.animal){this.animal.nudge(direction(p.yaw,p.pitch),.4);p.hit=true;p.hitstop=.06;this.events.push({kind:'interact',text:'山羊は保護されています。採取はできません'});return;}if(target?.drop){this.survival.pushDrops(target.hit.point,direction(p.yaw,p.pitch));p.hit=true;return;}if(target&&!target.enemy){const result=this.elements.damage(target.hit,p.heavy?100:55,p.heavy?.5:.27);p.hit=true;p.hitstop=.07;this.events.push({kind:result.destroyed?'break':'hit',text:result.destroyed?materialDefinition(target.hit.cell.material).name+'のVoxelが砕けた':'材質の耐久値を削った'});}return;}
  const a=bladeWorld(before,p.position,p.yaw,p.pitch),b=bladeWorld(after,p.position,p.yaw,p.pitch),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
  for(let i=0;i<=steps;i++){const t=i/steps,lerp=(u:Vec3,v:Vec3)=>({x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t}),grip=lerp(a.grip,b.grip),tip=lerp(a.tip,b.tip),edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},length=Math.hypot(edge.x,edge.y,edge.z),wall=this.arena.field.ray(grip,edge,length);
   // A forward thrust must not start its edge on the far side of a wall.
   // The hand-to-eye segment is part of the same physical sweep authority.
   const eye=this.eye(),toGrip={x:grip.x-eye.x,y:grip.y-eye.y,z:grip.z-eye.z},armWall=this.arena.field.ray(eye,toGrip,Math.hypot(toGrip.x,toGrip.y,toGrip.z));
   if(armWall){if(p.tool)this.toolContact(armWall);else this.weaponWallContact(armWall);return;}
   const npcHit=this.campaignMode?this.npcRay(grip,edge,wall?Math.min(length,wall.distance):length):null;if(npcHit){p.hit=true;p.hitstop=.06;this.events.push({kind:'interact',text:'住人は保護されています'});return;}
   const animalHit=this.campaignMode?this.animal.ray(grip,edge,wall?Math.min(length,wall.distance):length):null;if(animalHit){this.animal.nudge(edge,.65);p.hit=true;p.hitstop=.06;this.events.push({kind:'interact',text:'山羊は保護されています'});return;}const end=wall?wall.point:tip;for(const drop of this.survival.drops)if(segmentDistance(grip,end,drop.position,drop.position)<.16){if(!this.mayEditWorld){p.hit=true;this.denyWorldEdit();return;}this.survival.pushDrops(drop.position,direction(p.yaw,p.pitch));p.hit=true;this.events.push({kind:'hit',text:'素材を弾いた'});return;}
   if(p.tool&&wall){this.toolContact(wall);return;}
   if(p.tool)continue;
   for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;for(const body of bodyCapsules(e.position,e.yaw,this.enemyPose(e))){if(segmentDistance(grip,end,body.a,body.b)>body.r+.035)continue;
    const bodyState=this.enemyElements[e.id],local=bodyState.local(body.a,e.position,e.yaw),cell=bodyState.field.materialAt(local);if(cell)bodyState.reactions.damage({cell,point:local,normal:{x:0,y:1,z:0},distance:0},p.heavy?65:30,.12);bodyState.impulse(direction(p.yaw,0),this.playerAttack.impulse);
    if(this.campaignMode)gainCombatFocus(this.focus,'melee:'+(++this.actionSerial));const damage=Math.round(this.playerAttack.damage*(this.campaignMode?this.campaign.attackMultiplier:1)*(body.zone==='head'?1.35:1));e.hp=Math.max(0,e.hp-damage);p.hit=true;p.hitstop=.065;p.impact=1;
    if(!e.hp){e.interrupted=this.enemyPose(e);e.phase='dead';e.time=0;this.defeated++;}else if(this.playerAttack.stagger>0){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;this.meleeStaggers.set(e.id,this.playerAttack.stagger);}
    this.events.push({kind:'hit',text:e.hp?(body.zone==='head'?'頭部に命中':'命中'):'番兵を倒した'});return;
   }}
   if(wall){this.weaponWallContact(wall);return;}
  }
 }
 private weaponWallContact(wall:Hit){const p=this.player;p.hit=true;p.hitstop=.08;p.impact=.8;if(!this.mayEditWorld){this.denyWorldEdit();return;}const o=wall.cell.object?this.arena.objects.get(wall.cell.object):null;
  const result=this.elements.damage(wall,p.heavy?48:26,p.heavy?.34:.22);this.events.push({kind:result.destroyed?'break':'hit',text:result.destroyed?materialDefinition(wall.cell.material).name+'を採取できる':'刃が'+(o?.name??materialDefinition(wall.cell.material).name)+'に当たった'});
 }
 private toolContact(hit:Hit){
  const p=this.player;p.hit=true;p.hitstop=.07;if(!this.mayEditWorld){this.denyWorldEdit();return;}
  const tool=this.activeTool,power=this.campaign.toolEfficiency,plane=Math.floor(hit.point.y*4)/4;
  const result=this.elements.damage(hit,150*power,tool==='terrain-rake'?.48:p.heavy?.32:.23,(cell,position)=>tool==='terrain-rake'&&position.y<plane?0:toolPower(tool,cell.material,p.heavy)*power);
  this.events.push({kind:result.destroyed?'break':'hit',text:result.damaged?(tool==='terrain-rake'?'土の高い部分を平らに削った':materialDefinition(hit.cell.material).name+(result.destroyed?'を採取できる':'の耐久を削った')):'この道具では削れない材質です'});
 }
 private settle(position:Vec3,vy:number,dt:number,height=1.65){const field=this.arena.field,next=position.y+vy*dt,trial={...position,y:next};
  if(!field.overlaps(trial,.27,height)){position.y=next;return {vy,grounded:false};}
  if(vy>0)return {vy:0,grounded:false};let lo=next,hi=position.y+.05;for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(field.overlaps({...position,y:mid},.27,height))lo=mid;else hi=mid;}position.y=hi;return {vy:0,grounded:true};
 }
 private characterTick(dt:number,input:Controls){
  const p=this.player;if(p.hp<=0){this.cancelCombat();return;}if(this.combat.charging){if(input.block||p.phase!=='idle')this.cancelCombat();else this.combat.charge=Math.min(HEAVY_MAX_SECONDS,this.combat.charge+dt);}if(this.combat.pending){if(p.phase!=='cast'){this.cancelCombat();this.events.push({kind:'interact',text:'被弾で詠唱を中断'});}else{this.combat.castRemaining=Math.max(0,this.combat.castRemaining-dt);if(this.combat.castRemaining<1e-9)this.resolveSpell();}}this.castCooldown=Math.max(0,this.castCooldown-dt);if(this.castCooldown<1e-9)this.castCooldown=0;
  const climbing=this.ladders.step(p,input.z,input.x,dt,this.playerBodies());if(climbing){this.regenDelay=.45;input={...input,x:0,z:0,sprint:false,block:false};}
  const blocking=input.block&&p.phase==='idle'&&p.stamina>0&&!p.tool&&(!this.campaignMode||this.campaign.canGuard);this.frameBlocking.set(p,blocking);p.blockTime=blocking?p.blockTime+dt:0;
  this.regenDelay=Math.max(0,this.regenDelay-dt);if(!blocking&&!this.gliding&&!this.grapple&&this.regenDelay===0&&p.phase==='idle')p.stamina=Math.min(this.campaignMode?this.campaign.maxStamina:100,p.stamina+27*dt*(this.campaignMode?this.campaign.staminaRegenMultiplier:1));
  p.guard+=(Number(blocking)-p.guard)*(1-Math.exp(-dt*14));p.impact=Math.max(0,p.impact-dt*5);
  const m=this.axes(input),length=Math.hypot(m.x,m.z),speed=(this.campaignMode?this.campaign.moveMultiplier:1)*(this.environment.shock>0?.5:1)*(p.phase==='dodge'?0:blocking?1.05:p.phase!=='idle'||this.combat.charging?.8:input.sprint&&p.stamina>0?3.7:input.z<0?1.7:2.5);
  if(length&&input.sprint&&p.phase==='idle'&&!blocking){p.stamina=Math.max(0,p.stamina-18*dt);this.regenDelay=.45;}
  const k=1-Math.exp(-dt*(length?11:15));p.vx+=(m.x/Math.max(1,length)*speed-p.vx)*k;p.vz+=(m.z/Math.max(1,length)*speed-p.vz)*k;
  const oldPosition={...p.position};if(p.hitstop===0)this.move(p.position,p.vx*dt,p.vz*dt);const travelled=Math.hypot(p.position.x-oldPosition.x,p.position.z-oldPosition.z);p.stride+=travelled*4.5;
  if(travelled>.002&&p.grounded){this.footTime+=travelled;if(this.footTime>.95){this.events.push({kind:'step',position:{...p.position}});this.footTime=0;}}
  if(this.grapple){this.grappleTime+=dt;const d={x:this.grapple.x-p.position.x,y:this.grapple.y-p.position.y,z:this.grapple.z-p.position.z},n=Math.hypot(d.x,d.y,d.z);if(n<.2||this.grappleTime>3||p.stamina<=0)this.grapple=null;else{this.move(p.position,d.x/n*6*dt,d.z/n*6*dt);p.vy=d.y/n*6+14*dt;p.stamina=Math.max(0,p.stamina-8*dt);this.regenDelay=.45;}}
  if(this.gliding&&(!this.campaign.canGlide||p.stamina<=0||p.grounded))this.gliding=false;if(this.gliding){p.vy=Math.max(p.vy,-1.25);const d=direction(p.yaw,0);const wind=this.weather.wind;this.move(p.position,(d.x*3.5*this.campaign.glideSpeedMultiplier+wind.x*.3)*dt,(d.z*3.5*this.campaign.glideSpeedMultiplier+wind.z*.3)*dt);p.stamina=Math.max(0,p.stamina-7*this.campaign.glideStaminaMultiplier*dt);this.regenDelay=.45;}
  const falling=p.vy,vertical=climbing?{vy:0,grounded:false}:this.settle(p.position,p.vy-(this.gliding?2:14)*dt,dt);if(this.campaignMode&&vertical.grounded&&!p.grounded&&falling<-9){this.cancelCombat();p.hp=Math.max(0,p.hp-Math.round((-falling-9)*5));this.deathCause='高所から落下';} p.vy=vertical.vy;p.grounded=vertical.grounded;
  if(p.position.y<-4){p.hp=0;this.events.push({kind:'hurt',text:'落下した'});}
  const before=this.pose(),def=this.playerAttack,oldPhase=p.phase;
  if(p.hitstop>0)p.hitstop=Math.max(0,p.hitstop-dt);else p.time+=dt;
  if(p.phase==='windup'&&p.time>=def.windup){p.phase='strike';p.time-=def.windup;this.events.push({kind:'swing',position:{...p.position}});}
  if(p.phase==='strike'){this.melee(before,this.pose());if(p.time>=def.strike){p.phase='recover';p.time-=def.strike;}}
  const after=this.pose();if(oldPhase==='windup'||oldPhase==='strike'||oldPhase==='recover'){const forward=direction(p.yaw,0),step=after.step-before.step;this.move(p.position,forward.x*step,forward.z*step);}
  if(p.phase==='recover'&&p.time>=def.recover){p.phase='idle';p.time=0;const queued=p.queued;p.queued='';if(queued)this.action(queued,input);}
  if(p.phase==='cast'&&p.time>=.7){p.phase='idle';p.time=0;}
  if(p.phase==='heal'&&p.time>=1.6){p.hp=Math.min(this.campaignMode?this.campaign.maxHp:100,p.hp+55);p.phase='idle';p.time=0;this.events.push({kind:'interact',text:'回復した'});}if(p.phase==='idle'&&p.time>1.2)p.combo=0;
  if(p.phase==='dodge'){this.move(p.position,p.dodgeX*4.1*dt,p.dodgeZ*4.1*dt);if(p.time>=.36){p.phase='idle';p.time=0;}}
 }
 tick(dt:number,input:Controls){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);this.seconds+=dt;this.primaryInput={...input};const p=this.primaryPlayer;
  if(p.hp<=0){this.cancelCombat();this.fishing.cancel('死亡で釣りを中断');if(this.campaignMode)this.campaign.die(p.position);if(!this.companionState||!this.livingPlayers().length)return;}
  this.characterTick(dt,input);this.companionTick(dt);const blocking=this.actorBlocking(p),length=Math.hypot(input.x,input.z);
  if(this.campaignMode&&this.weatherReactions.due(this.seconds))this.weatherReactions.tick(this.seconds,this.worldDay,this.worldHour,this.arena.field,this.elements,this.enemies.map(e=>({position:e.position,hp:e.hp,body:this.enemyElements[e.id],active:this.enemyActive(e)})),this.survival.drops,this.livingPlayers().map(actor=>actor.position));
  for(const e of this.enemies){if(!this.enemyActive(e))continue;if(e.regional){const def=this.enemyDefinition(e)!;if(!this.campaign.regionUnlocked(def.region)||!isRegionalOpen(def.activeHours,this.worldHour))continue;}const actor=this.nearestActor(e.position);if((!actor||Math.hypot(e.position.x-actor.position.x,e.position.z-actor.position.z)>24)&&!this.enemyElements[e.id].reactions.states.size)continue;this.enemyMaterialTick(e,dt);if(actor)this.withActor(actor,()=>{if(e.regional)this.regionalEnemyTick(e,dt,this.actorBlocking(actor));else this.enemyTick(e,dt,this.actorBlocking(actor));});if(e.hp<=0){if(this.campaignMode){if(this.western&&e.id>=18){const entry=WEST_RUNTIME_ENEMIES.find(d=>d.slot===e.id);if(entry)this.western.defeat(entry.key,{slot:e.id,hp:e.hp},this.westActorContext);}else if(e.regional)this.campaign.defeatRegional(e.regional);else if(e.summonOwner===undefined)this.campaign.defeat(e.id,e.id===1?'warden':e.id>=3?'ridge':'scavenger');}this.survival.addDrops(this.enemyElements[e.id].deathDrops(e.position));continue;}const vertical=this.settle(e.position,e.vy-14*dt,dt,1.7);e.vy=vertical.vy;if(e.position.y<-4){e.hp=0;e.phase='dead';this.defeated++;}}
  this.elements.tick(dt);this.chainTime+=dt;if(this.chainTime>=.25){this.chainTime=0;this.contactElements();}this.syncMaterials();const picked=this.survival.tick(dt,p.hp>0?p.position:this.companion?.position??p.position)+this.companionPickup();if(picked)this.events.push({kind:'interact',text:'Voxel素材を回収 ×'+picked});
  this.arrowTick(dt);this.enemyProjectileTick(dt,blocking);for(let i=this.tells.length-1;i>=0;i--){this.tells[i].remaining-=dt;if(this.tells[i].remaining<=0)this.tells.splice(i,1);}
  if(this.campaignMode){for(const actor of this.livingPlayers()){const damage=this.dungeon.trapDamage(actor.position,this.seconds-dt,this.seconds);if(damage){actor.hp=Math.max(0,actor.hp-damage);actor.impact=.7;this.withActor(actor,()=>{this.cancelCombat();this.deathCause='鳴動床';if(actor.phase==='heal'){actor.phase='idle';actor.time=0;}});this.events.push({kind:'hurt',text:'鳴動床が噴出！ 右の白い側道へ退避する'});}}this.worldHour+=dt/90;if(this.worldHour>=24){this.worldHour-=24;this.worldDay++;}this.home.tick(dt);this.campaign.inventory.tick(dt,this.arena.field);this.reconcileNpc();this.npc.tick(dt,this.npcContext);this.westNpcs.tick(dt,actor=>this.npcContextFor(actor));const animalWeather=weatherAt(this.worldDay,this.worldHour,this.animal.position);this.animal.tick(dt,{field:this.arena.field,elements:this.elements,water:this.water,rain:animalWeather.rain,wind:animalWeather.wind,blockers:this.solidBodies().filter(b=>b!==this.animal.position)});for(const event of this.fishing.tick(dt,this.fishingActor))this.events.push({kind:'interact',text:event.message});if(this.western){const result=this.western.observe(this.westActorContext);if(result)this.events.push({kind:'interact',text:result.message});}const status=this.campaign.tick(dt,{position:p.position,resting:!this.bedWait.active&&p.hp>0&&p.phase==='idle'&&length===0,sheltered:this.sheltered});this.actorEnvironmentTick(dt,input,status.damage,status.deep);if(this.companionState?.player.hp&&!this.companionSuspended){this.withCompanion(()=>{const guest=this.player,controls=this.guestControls(),inMist=isShrouded(guest.position),deep=isDeepShroud(guest.position)&&this.campaign.state.flameTier<2;this.actorShroudSeconds=Math.max(0,Math.min(this.campaign.shroudMaximum,this.actorShroudSeconds+(inMist?-dt*(deep?6:1):dt*5)));if(guest.phase==='idle'&&!controls.x&&!controls.z)this.campaign.rest(guest.position,this.sheltered);this.actorEnvironmentTick(dt,controls,inMist&&this.actorShroudSeconds===0?20*dt:0,deep);});}}
  if(p.hp<=0)this.fishing.cancel('死亡で釣りを中断');
  this.fluidTime+=dt;if(this.fluidTime>=.1){this.fluidTime=0;if(this.waterOn||input.water)for(let z=20;z<26;z++)this.water.add(2,10,z,.8);this.water.step();if(this.campaignMode)this.watermill.step(this.solidBodies());}
 }
 private get actorShroudSeconds(){return this.activePlayer===this.companionState?.player?this.companionState!.aux.shroudSeconds:this.campaign.state.shroudSeconds;}
 private set actorShroudSeconds(value:number){if(this.activePlayer===this.companionState?.player)this.companionState!.aux.shroudSeconds=value;else this.campaign.state.shroudSeconds=value;}
 private companionPickup(){const player=this.companion;if(!player||this.companionSuspended||player.hp<=0)return 0;let count=0;const hand={...player.position,y:player.position.y+.85};for(let i=this.survival.drops.length-1;i>=0;i--){const d=this.survival.drops[i],delta={x:d.position.x-hand.x,y:d.position.y-hand.y,z:d.position.z-hand.z},distance=Math.hypot(delta.x,delta.y,delta.z);if(distance>1.65||this.arena.field.distance(d.position)<-.015||this.arena.field.ray(hand,delta,Math.max(0,distance-.05)))continue;this.survival.inventory[d.material]+=d.count;count+=d.count;this.survival.drops.splice(i,1);}return count;}
 private readonly warmthProbes=new WeakMap<PlayerState,WarmthProbe>();
 get warmth(){
  if(!this.campaignMode)return 0;let probe=this.warmthProbes.get(this.player);if(!probe){probe=new WarmthProbe();this.warmthProbes.set(this.player,probe);}
  return probe.sample(this.player.position,this.arena.field,this.seconds,()=>{
   const sources:WarmthSource[]=[],hearth=(object:string,position:Vec3)=>sources.push({object,position:{...position,y:position.y+1},radius:4,strength:1});
   if(this.campaign.state.flameTier>0)hearth('hearth',{x:-3,y:.25,z:4});
   if(this.campaign.state.campUnlocked)hearth('nextcamp',{x:0,y:3.25,z:-31});
   for(const point of REGIONAL_POINTS)if(point.kind==='hearth'&&this.campaign.state.claimedPoints.includes(point.id))hearth(point.id,point.position);
   if(this.western?.snapshot().campUnlocked)hearth('west-return-hearth',{x:-46.5,y:.75,z:-16});
   if(this.campaign.state.flameTier>0&&this.home.state.furniture.includes('brazier'))hearth('build:home:brazier',{x:-1.75,y:.25,z:5.75});
   let visited=0;for(const state of this.elements.states.values()){if(visited++>=256)break;if(state.fire<=0||state.wet>0)continue;const p=state.position,size=this.arena.field.size,cell={x:Math.floor(p.x/size),y:Math.floor(p.y/size),z:Math.floor(p.z/size)};sources.push({position:p,cell,radius:2.5,strength:.7});}
   return sources;
  });
 }
 private actorEnvironmentTick(dt:number,input:Controls,damage:number,deep:boolean){const p=this.player;if(p.hp<=0)return;p.hp=Math.max(0,Math.min(this.campaign.maxHp,p.hp-damage));p.stamina=Math.min(p.stamina,this.campaign.maxStamina);if(damage)this.deathCause=deep?'濃い霧の侵食':'霧の滞在時間切れ';const hazard=regionalHazard(p.position,this.campaign.regionTier),lake=REGIONAL_WATERS.find(w=>p.position.x>w.min.x&&p.position.x<w.max.x&&p.position.z>w.min.z&&p.position.z<w.max.z&&p.position.y+.08>=w.min.y&&p.position.y<w.surfaceY);const exposure=stepPlayerEnvironment(this.environment,dt,{position:p.position,field:this.arena.field,elements:this.elements,water:this.water,armorMaterial:this.campaign.armorMaterial,rain:this.weather.rain,regionalWater:lake});if(exposure.damage>0){p.hp=Math.max(0,p.hp-exposure.damage);this.deathCause=exposure.shockDamage>0?'通電した材質に触れた':'炎上';if(p.phase==='heal'){p.phase='idle';p.time=0;this.events.push({kind:'interact',text:'環境のダメージで回復を中断された'});}}if(exposure.ignited)this.events.push({kind:'hurt',text:'炎上 · 水に入るか水属性で消火する'});if(exposure.extinguished)this.events.push({kind:'water',text:'濡れて火が消えた'});if(exposure.shocked){this.cancelCombat();p.impact=1;p.stamina=Math.max(0,p.stamina-18);this.events.push({kind:'hurt',text:'感電 · 濡れた身体と金属鎧は通電に注意'});}this.cold=Math.max(0,Math.min(100,this.cold+(hazard.coldPerSecond*(this.campaign.state.foodSeconds>0?.5:1)*this.campaign.coldMultiplier-(hazard.coldPerSecond?0:10)-this.warmth*12)*dt));if(this.cold>=100){p.hp=Math.max(0,p.hp-5*dt);this.deathCause='寒冷';}this.swimming=!!lake;if(lake){p.vy=(input.z?Math.sin(p.pitch)*2.2:0)+14*dt;this.oxygen=Math.max(0,Math.min(20,this.oxygen+(p.position.y+1.4<lake.surfaceY?-dt:dt*5)));if(this.oxygen===0){p.hp=Math.max(0,p.hp-12*dt);this.deathCause='水中の酸素切れ';}}else this.oxygen=Math.min(20,this.oxygen+dt*5);if(hazard.shroudDrain>0){this.actorShroudSeconds=Math.max(0,this.actorShroudSeconds-dt*hazard.shroudDrain);if(this.actorShroudSeconds===0){p.hp=Math.max(0,p.hp-15*dt);this.deathCause='灰霧の侵食';}}for(const up of REGIONAL_UPDRAFTS)if(this.gliding&&Math.hypot(p.position.x-up.position.x,p.position.z-up.position.z)<up.radius&&p.position.y<up.position.y+up.height)p.vy=Math.min(5,p.vy+up.strength*dt);const bag=this.campaign.state.deathBag;if(bag&&Math.hypot(bag.position.x-p.position.x,bag.position.y-p.position.y,bag.position.z-p.position.z)<1.5&&!this.arena.field.ray(this.eye(),{x:bag.position.x-p.position.x,y:bag.position.y-this.eye().y,z:bag.position.z-p.position.z},1)){const r=this.campaign.recover(p.position);if(r.ok)this.events.push({kind:'interact',text:r.message});}
 }
 private hurtPlayer(damage:number,from:Vec3,blocking:boolean,radial=false){const p=this.player;if(p.hp<=0||p.phase==='dodge'&&p.time>=.035&&p.time<.27)return;if(blocking&&!radial&&facing(p.yaw,p.position,from)>.35&&p.stamina>=this.campaign.projectileGuardCost){p.stamina-=this.campaign.projectileGuardCost;this.campaign.consumeShieldDurability();this.events.push({kind:'parry',text:'飛び道具を盾で受けた'});return;}this.cancelCombat();p.hp=Math.max(0,p.hp-damage*(1-this.campaign.damageReduction));this.campaign.consumeArmorDurability();this.deathCause='敵の攻撃';this.events.push({kind:'hurt'});}
 private regionalEnemyTick(e:Enemy,dt:number,blocking:boolean){const def=this.enemyDefinition(e)!,state=this.tactics.get(e.id)!;if(this.enemyElements[e.id].shock>0)return;const stun=this.meleeStaggers.get(e.id);if(stun!==undefined&&e.hp>0){state.attack=null;state.cooldown=Math.max(state.cooldown,.35);this.lunges.delete(e.id);e.time+=dt;if(e.time<stun)return;this.meleeStaggers.delete(e.id);e.phase='idle';e.time=0;}const output=stepEnemyTactic(state,{definition:def,position:e.position,targetPosition:this.player.position,hp:e.hp,targetAlive:this.player.hp>0,field:this.arena.field,dt,liveSummons:this.enemies.filter(v=>v.summonOwner===e.id&&v.hp>0).length});if(e.hp<=0){e.time+=dt;return;}const dx=this.player.position.x-e.position.x,dz=this.player.position.z-e.position.z;e.yaw=Math.atan2(-dx,-dz);const navigation=this.enemyNavigation.step(state,e.position,output.velocity,this.arena.field,dt);if(navigation.disengage){state.awareness='return';state.awarenessTime=0;state.attack=null;this.lunges.delete(e.id);}const prev={...e.position};this.move(e.position,navigation.velocity.x*dt,navigation.velocity.z*dt,1.7);e.stride+=Math.hypot(e.position.x-prev.x,e.position.z-prev.z)*5;e.phase=state.attack?'windup':state.cooldown>.2?'recover':'idle';e.time=state.attack?state.attack.duration-state.attack.remaining:Math.max(0,2-state.cooldown);
  const lunge=this.lunges.get(e.id);if(lunge){if(safeEnemyLunge(this.arena.field,e.position,lunge.velocity,dt))this.move(e.position,lunge.velocity.x*dt,lunge.velocity.z*dt,1.7);lunge.remaining-=dt;if(!lunge.hit&&Math.hypot(e.position.x-this.player.position.x,e.position.z-this.player.position.z)<lunge.radius+.27&&!this.arena.field.ray({x:e.position.x,y:e.position.y+1,z:e.position.z},{x:this.player.position.x-e.position.x,y:0,z:this.player.position.z-e.position.z},Math.max(0,Math.hypot(e.position.x-this.player.position.x,e.position.z-this.player.position.z)-.3))){this.hurtPlayer(lunge.damage,e.position,blocking);lunge.hit=true;}if(lunge.remaining<=0)this.lunges.delete(e.id);}
  for(const event of navigation.disengage?[]:output.events){if(event.type==='tell'){if(this.tells.length<24)this.tells.push({position:{...event.position},radius:event.radius,remaining:event.duration,kind:event.kind});this.events.push({kind:'interact',position:{...e.position},text:def.name+' · '+def.telegraph});}
   if(event.type==='projectile'&&this.enemyShots.length<32)this.enemyShots.push({position:{...event.position},velocity:{...event.velocity},life:event.lifetime,damage:event.damage,radius:event.radius});
   if(event.type==='lunge')this.lunges.set(e.id,{velocity:{...event.velocity},remaining:event.duration,damage:event.damage,radius:event.radius,hit:false});
   if(event.type==='melee'||event.type==='burst'){const distance=Math.hypot(dx,dz),d={x:dx,y:this.eye().y-(e.position.y+1.15),z:dz};if(distance<=event.radius&&(event.type!=='melee'||(dx*event.direction.x+dz*event.direction.z)/Math.max(.001,distance)>Math.cos(event.arc))&&!this.arena.field.ray({x:e.position.x,y:e.position.y+1.15,z:e.position.z},d,Math.max(0,Math.hypot(d.x,d.y,d.z)-.3))&&(event.type!=='burst'||this.player.grounded))this.hurtPlayer(event.damage,e.position,blocking,event.type==='burst');}
   if(event.type==='summon'){for(const position of event.positions){const minion=this.enemies.find(v=>v.summonOwner!==undefined&&v.hp<=0);if(!minion)break;minion.summonOwner=e.id;minion.position=this.safePosition(position);minion.hp=35;minion.phase='idle';minion.time=0;this.guardAwareness.set(minion.id,createGuardAwareness(minion.position));this.guardNavigation.delete(minion.id);}}
  }
 }
 private enemyProjectileTick(dt:number,_blocking:boolean){for(let i=this.enemyShots.length-1;i>=0;i--){const shot=this.enemyShots[i],length=Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)*dt,wall=this.arena.field.ray(shot.position,shot.velocity,length),npcHit=this.campaignMode?this.npcRay(shot.position,shot.velocity,wall?Math.min(length,wall.distance):length):null,animalHit=this.campaignMode?this.animal.ray(shot.position,shot.velocity,Math.min(length,wall?.distance??length,npcHit?.distance??length)):null,end=animalHit?.point??npcHit?.point??wall?.point??{x:shot.position.x+shot.velocity.x*dt,y:shot.position.y+shot.velocity.y*dt,z:shot.position.z+shot.velocity.z*dt};let victim:PlayerState|null=null;for(const actor of this.livingPlayers().sort((a,b)=>Math.hypot(a.position.x-shot.position.x,a.position.y-shot.position.y,a.position.z-shot.position.z)-Math.hypot(b.position.x-shot.position.x,b.position.y-shot.position.y,b.position.z-shot.position.z))){const hit=this.withActor(actor,()=>bodyCapsules(actor.position,actor.yaw,this.pose()).some(c=>segmentDistance(shot.position,end,c.a,c.b)<c.r+shot.radius));if(hit){victim=actor;break;}}if(victim)this.withActor(victim,()=>this.hurtPlayer(shot.damage,shot.position,this.actorBlocking(victim!)));if(animalHit&&!victim)this.animal.nudge(shot.velocity,.7);if(victim||animalHit||npcHit||wall||shot.life<=0){this.enemyShots.splice(i,1);continue;}shot.position=end;shot.life-=dt;}for(const e of this.enemies)if(e.summonOwner!==undefined&&e.summonOwner>=0&&this.enemies[e.summonOwner]?.hp<=0){e.hp=0;e.phase='dead';}}
 private arrowTick(dt:number){for(let i=this.arrows.length-1;i>=0;i--){const a=this.arrows[i],distance=Math.hypot(a.velocity.x,a.velocity.y,a.velocity.z)*dt,wall=this.arena.field.ray(a.position,a.velocity,distance);let struck=!!(this.campaignMode&&this.npcRay(a.position,a.velocity,distance,this.arena.field));const animalHit=this.campaignMode?this.animal.ray(a.position,a.velocity,distance,this.arena.field):null;if(animalHit){this.animal.nudge(a.velocity,1);struck=true;this.events.push({kind:'interact',text:'山羊は保護されています'});}if(!struck)for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const b=this.enemyElements[e.id],local=b.local(a.position,e.position,e.yaw),d=b.local({x:e.position.x+a.velocity.x,y:e.position.y+a.velocity.y,z:e.position.z+a.velocity.z},e.position,e.yaw),hit=b.field.ray(local,d,distance);if(hit&&(!wall||hit.distance<wall.distance)){e.hp=Math.max(0,e.hp-BOW_DAMAGE*this.campaign.attackMultiplier);if(a.owner==='guest')this.withCompanion(()=>gainCombatFocus(this.focus,'arrow:'+(++this.actionSerial)));else gainCombatFocus(this.focus,'arrow:'+(++this.actionSerial));b.reactions.damage(hit,35,.08);b.impulse(a.velocity,.6);this.finishElementDeath(e);this.events.push({kind:'hit',position:{...e.position},text:'矢が命中'});struck=true;break;}}if(struck||wall||a.life<=0){this.arrows.splice(i,1);continue;}a.position.x+=a.velocity.x*dt;a.position.y+=a.velocity.y*dt;a.position.z+=a.velocity.z*dt;a.velocity.y-=3*dt;a.life-=dt;}}
 private castEnemy(e:Enemy,element:Element,hit:Hit){const body=this.enemyElements[e.id],point=body.local(hit.point,e.position,e.yaw),worldDirection=direction(this.player.yaw,this.player.pitch),d=body.local({x:e.position.x+worldDirection.x,y:e.position.y+worldDirection.y,z:e.position.z+worldDirection.z},e.position,e.yaw);e.hp=Math.max(0,e.hp-body.cast(element,{...hit,point},d)*(this.campaignMode?this.campaign.spellMultiplier:1));if(element==='wind'||element==='earth')body.impulse(worldDirection,element==='wind'?4:2);if(body.shock>0){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;}this.finishElementDeath(e);}
 private finishElementDeath(e:Enemy){if(e.hp<=0&&e.phase!=='dead'){e.interrupted=this.enemyPose(e);e.phase='dead';e.time=0;this.defeated++;this.events.push({kind:'break',text:'属性で番兵を倒した'});}}
 private enemyMaterialTick(e:Enemy,dt:number){const b=this.enemyElements[e.id];if(e.hp>0){e.hp=Math.max(0,e.hp-b.tick(dt));this.finishElementDeath(e);const old={...e.position};this.move(e.position,b.velocity.x*dt,b.velocity.z*dt,1.7);if(Math.abs(e.position.x-old.x)<.0001)b.velocity.x=0;if(Math.abs(e.position.z-old.z)<.0001)b.velocity.z=0;const drag=Math.exp(-dt*(this.water.surface(e.position.x,e.position.z)>e.position.y?9:4));b.velocity.x*=drag;b.velocity.z*=drag;}else b.tick(dt);
  this.survival.addDrops(b.drain(e.position,e.yaw));}
 private contactElements(){for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const b=this.enemyElements[e.id],center={...e.position,y:e.position.y+.9};let incomingFire=false,incomingCharge=false;
  for(const state of this.elements.states.values()){if(Math.hypot(state.position.x-center.x,state.position.y-center.y,state.position.z-center.z)>1.05)continue;const delta={x:center.x-state.position.x,y:center.y-state.position.y,z:center.z-state.position.z},length=Math.hypot(delta.x,delta.y,delta.z);if(this.arena.field.ray(center,{x:-delta.x,y:-delta.y,z:-delta.z},Math.max(0,length-.3)))continue;incomingFire ||=state.fire>0;incomingCharge ||=state.charge>0;}
  const local={x:0,y:1.1,z:-.16},cell=b.field.materialAt(local);if(!cell)continue;const hit={point:local,cell,normal:{x:0,y:0,z:1},distance:0};if(this.water.surface(e.position.x,e.position.z)>e.position.y+.2)b.cast('water',hit,{x:0,y:1,z:0});
  if(incomingFire&&b.wet<=0)b.cast('fire',hit,{x:0,y:1,z:0});if(incomingCharge)e.hp=Math.max(0,e.hp-b.cast('lightning',hit,{x:0,y:1,z:0}));
  if(b.burning){for(const dir of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:-1,z:0}]){const h=this.arena.field.ray(center,dir,.85);if(h)this.elements.cast('fire',h,dir);}for(const other of this.enemies){if(other===e||other.hp<=0||Math.hypot(other.position.x-e.position.x,other.position.z-e.position.z)>1.1)continue;const delta={x:other.position.x-center.x,y:0,z:other.position.z-center.z};if(this.arena.field.ray(center,delta,Math.hypot(delta.x,delta.z)))continue;const ob=this.enemyElements[other.id],oc=ob.field.materialAt(local);if(oc&&ob.wet<=0)ob.cast('fire',{...hit,cell:oc},{x:0,y:1,z:0});}}
  this.finishElementDeath(e);
 }}
 private syncMaterials(){this.survival.addDrops(this.elements.drainDrops());if(this.solidRevision!==this.arena.field.revision){this.solidRevision=this.arena.field.revision;this.water.refreshSolids();}}
 private enemyTick(e:Enemy,dt:number,blocking:boolean){
  if(e.hp<=0){e.time+=dt;return;}if(this.enemyElements[e.id].shock>0)return;const p=this.player,dx=p.position.x-e.position.x,dz=p.position.z-e.position.z,distance=Math.hypot(dx,dz),def=attacks[e.attack],slow=this.campaignMode&&e.id===1&&e.hp<90?.95:1.35,before=this.enemyPose(e);
  let state=this.guardAwareness.get(e.id);if(!state){state=createGuardAwareness(e.position);this.guardAwareness.set(e.id,state);}
  let sense:ReturnType<typeof updateGuardAwareness>|null=null;
  if(this.campaignMode){sense=updateGuardAwareness(state,e.position,p.position,p.hp>0,this.arena.field,dt);if(sense.noticed)this.events.push({kind:'interact',text:e.id===1?'墓所の番人がこちらに気づいた':'番兵がこちらに気づいた'});}
  else{if(state.mode==='return'&&Math.hypot(e.position.x-state.home.x,e.position.z-state.home.z)<.4)state.mode='idle';if(state.mode!=='return')state.mode=distance<=10?'chase':'idle';if(state.mode==='chase')state.lastSeen={...p.position};}
  let navigationState=this.guardNavigation.get(e.id);if(!navigationState){navigationState={id:e.id,home:state.home,lastSeen:state.lastSeen,awareness:state.mode,patrolIndex:0,attack:null};this.guardNavigation.set(e.id,navigationState);}
  Object.assign(navigationState,{home:state.home,lastSeen:state.lastSeen,awareness:state.mode,attack:e.phase==='idle'?null:true});
  const destination=sense?sense.target:state.mode==='return'?state.home:state.mode==='chase'?p.position:null;
  const mx=destination?destination.x-e.position.x:0,mz=destination?destination.z-e.position.z:0,range=Math.hypot(mx,mz),walking=e.phase==='idle'&&!!destination&&(range>1.45||!!sense&&!sense.canAttack||state.mode==='return'||!!destination&&Math.abs(destination.y-e.position.y)>1.7);
  const desired=walking&&range>.1?{x:mx/range*1.25,y:0,z:mz/range*1.25}:{x:0,y:0,z:0};
  const navigation=this.enemyNavigation.step(navigationState,e.position,desired,this.arena.field,dt);
  if(navigation.disengage&&e.phase==='idle'){state.mode='return';state.time=0;}
  if(e.hitstop>0)e.hitstop=Math.max(0,e.hitstop-dt);else e.time+=dt;
  if(e.phase==='idle'){
   if(navigation.disengage||navigation.holding||!destination)return;e.yaw=Math.atan2(-mx,-mz);
   if(walking){const old={...e.position};this.move(e.position,navigation.velocity.x*dt,navigation.velocity.z*dt,1.7);e.stride+=Math.hypot(e.position.x-old.x,e.position.z-old.z)*5;
   }else{e.phase='windup';e.time=0;e.hit=false;}
  }else if(e.phase==='windup'){
   if((!sense||sense.visible)&&e.time<def.windup*slow*.6){const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-e.yaw),Math.cos(desired-e.yaw));e.yaw+=clamp(delta,-dt*1.6,dt*1.6);}
   if(e.time>=def.windup*slow){e.phase='strike';e.time-=def.windup*slow;this.events.push({kind:'swing',position:{...e.position}});}
  }
  if(e.phase==='strike'){
   const after=this.enemyPose(e),a=bladeWorld(before,e.position,e.yaw),b=bladeWorld(after,e.position,e.yaw),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
   if(!e.hit)for(let i=0;i<=steps;i++){const t=i/steps,grip={x:a.grip.x+(b.grip.x-a.grip.x)*t,y:a.grip.y+(b.grip.y-a.grip.y)*t,z:a.grip.z+(b.grip.z-a.grip.z)*t},tip={x:a.tip.x+(b.tip.x-a.tip.x)*t,y:a.tip.y+(b.tip.y-a.tip.y)*t,z:a.tip.z+(b.tip.z-a.tip.z)*t},edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},wall=this.arena.field.ray(grip,edge,Math.hypot(edge.x,edge.y,edge.z)),npcHit=this.campaignMode?this.npcRay(grip,edge,wall?.distance??Math.hypot(edge.x,edge.y,edge.z)):null,animalHit=this.campaignMode?this.animal.ray(grip,edge,Math.min(wall?.distance??Infinity,npcHit?.distance??Infinity,Math.hypot(edge.x,edge.y,edge.z))):null,end=animalHit?.point??npcHit?.point??wall?.point??tip;
    if(bodyCapsules(p.position,p.yaw,this.pose()).some(c=>segmentDistance(grip,end,c.a,c.b)<c.r+.035)){
     e.hit=true;if(p.phase==='dodge'&&p.time>=.035&&p.time<.27)break;e.hitstop=.06;p.impact=1;
     if(blocking&&p.guard>.5&&facing(p.yaw,p.position,e.position)>.45&&segmentDistance(grip,end,transformPoint({x:-.38+p.guard*.2,y:.865+p.guard*.54,z:-.4-p.guard*.15},p.position,p.yaw),transformPoint({x:-.38+p.guard*.2,y:.865+p.guard*.54,z:-.4-p.guard*.15},p.position,p.yaw))<.44&&p.stamina>=(this.campaignMode?this.campaign.guardCost:18)){p.stamina-=this.campaignMode?this.campaign.guardCost:18;if(this.campaignMode)this.campaign.consumeShieldDurability();this.regenDelay=.8;
      if(p.blockTime<.19){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;this.events.push({kind:'parry',text:'パリィ'});}else this.events.push({kind:'parry',text:'ガード'});
     }else{this.cancelCombat();if(p.phase==='heal'){p.phase='idle';p.time=0;this.events.push({kind:'interact',text:'回復を中断された'});}if(this.campaignMode)this.campaign.consumeArmorDurability();p.hp=Math.max(0,p.hp-(e.attack==='overhead'?38:28)*(this.campaignMode?1-this.campaign.damageReduction:1));this.deathCause='敵の攻撃';p.stamina=Math.max(0,p.stamina-8);this.events.push({kind:'hurt'});}break;
    }if(npcHit){e.hit=true;e.hitstop=.06;this.events.push({kind:'parry',text:'住人は保護されています'});break;}if(animalHit){e.hit=true;e.hitstop=.06;this.animal.nudge(edge,.5);this.events.push({kind:'parry',text:'山羊は保護されています'});break;}if(wall){e.hit=true;e.hitstop=.08;this.elements.damage(wall,e.attack==='overhead'?35:18,.22);this.events.push({kind:'parry',text:'番兵の刃が壁に当たった'});break;}
   }
   if(e.phase==='strike'&&e.time>=def.strike*slow){e.phase='recover';e.time-=def.strike*slow;}
  }
  const after=this.enemyPose(e);if(e.phase==='windup'||e.phase==='strike'||e.phase==='recover'){const f=direction(e.yaw,0),step=after.step-before.step;if(Math.abs(step)>1e-8&&safeEnemyLunge(this.arena.field,e.position,{x:f.x*step/dt,y:0,z:f.z*step/dt},dt))this.move(e.position,f.x*step,f.z*step,1.7);}
  if((e.phase==='recover'&&e.time>=def.recover*slow+.3)||(e.phase==='stagger'&&e.time>=(this.meleeStaggers.get(e.id)??.95))){e.phase='idle';e.time=0;this.meleeStaggers.delete(e.id);}
 }
}
