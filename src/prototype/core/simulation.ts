import { createArena, creatureVoxels, setDoor } from './world';
import { direction, type Vec3, type Hit } from './voxel';
import { VoxelWater } from './water';
import { ElementSystem,type Element } from './elements';
import { materialDefinition } from './materials';
import { SurvivalSystem,type PlacementPreview,type MaterialDrop } from './survival';
import {HomesteadSystem} from './homestead';
import {CampaignSystem,isShrouded,isDeepShroud} from './campaign';
import {createEnemyTacticState,stepEnemyTactic,type EnemyTacticState,createCombatFocus,gainCombatFocus,spendCombatFocus} from './enemy-tactics';
import {extendRegionalWorld} from './regional-world';
import {REGIONAL_ENEMIES,REGIONAL_POINTS,REGIONAL_WATERS,REGIONAL_UPDRAFTS,regionalHazard,isRegionalOpen} from './regions';
import {extendCampaignArena} from './campaign-world';
import {createPlayerState,cloneCompanion,validCompanionSnapshot,type PlayerState,type ActorAux,type CompanionSnapshot} from './companion';
import {validGuestInput,freshGuestInput,NEUTRAL_GUEST_INPUT,type GuestInput} from '../network/protocol';
import { EntityElements } from './entity-elements';
import { attacks,attackPose,bladeWorld,bodyCapsules,segmentDistance,facing,transformPoint,type AttackKind,type WeaponPose } from './motion';
export interface Controls {x:number;z:number;sprint:boolean;block:boolean;water:boolean}
export type Action='attack'|'heavy'|'dodge'|'jump'|'interact'|'heal'|'tool'|'sword'|'chisel'|'element-next'|'cast'|'recipe-next'|'build'|'special'|'dismantle';
export interface Event {kind:'swing'|'hit'|'hurt'|'parry'|'step'|'interact'|'water'|'break';text?:string}
export interface Enemy {id:number;summonOwner?:number;regional?:number;maxHp?:number;name?:string;position:Vec3;yaw:number;hp:number;vy:number;phase:'idle'|'windup'|'strike'|'recover'|'stagger'|'dead';time:number;hit:boolean;attack:AttackKind;hitstop:number;stride:number;interrupted?:WeaponPose}
export interface Target {hit:Hit;enemy?:Enemy;drop?:MaterialDrop;label:string;action:string}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class CoreSimulation {
 readonly arena=createArena();readonly water=new VoxelWater(this.arena.field);
 readonly elements=new ElementSystem(this.arena.field,this.water);readonly survival=new SurvivalSystem(this.arena.field,this.water,this.elements.damagedObjects);
 selectedElement:Element='fire';private solidRevision=this.arena.field.revision;private castCooldown=0;
 get selectedRecipe(){return this.survival.selected;}
 private readonly primaryPlayer=createPlayerState();private activePlayer:PlayerState|null=null;get player(){return this.activePlayer??this.primaryPlayer;}
 private companionState:CompanionSnapshot|null=null;private companionInput:GuestInput={...NEUTRAL_GUEST_INPUT};private companionInputAt=-Infinity;private readonly frameBlocking=new WeakMap<PlayerState,boolean>();private primaryInput:Controls={x:0,z:0,sprint:false,block:false,water:false};
 get companion(){return this.companionState?.player??null;}
 get companionEnabled(){return this.companionState!==null;}
 companionSuspended=false;
 setCompanionConnected(connected:boolean){if(this.companionSuspended===!connected)return;this.companionSuspended=!connected;this.neutralCompanionInput();if(!connected&&this.companion){this.companion.vx=0;this.companion.vz=0;}}
 companionCanEdit=false;private get mayEditWorld(){return this.activePlayer!==this.companionState?.player||this.companionCanEdit;}
 private denyWorldEdit(){this.events.push({kind:'interact',text:'同行者の地形編集・属性術はホストの許可が必要'});}

 readonly enemies:Enemy[]=[{id:0,position:{x:0,y:.25,z:-6},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0},{id:1,position:{x:2,y:.25,z:-9},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'overhead',hitstop:0,stride:0}];
 readonly enemyElements=[new EntityElements(),new EntityElements()];readonly campaign=new CampaignSystem(this.survival.inventory);readonly home=new HomesteadSystem(this.survival.inventory,this.campaign.state.items);private chainTime=0;worldHour=10;worldDay=0;cold=0;gliding=false;grapple:Vec3|null=null;grappleTime=0;oxygen=20;swimming=false;deathCause='';readonly arrows:{position:Vec3;velocity:Vec3;life:number}[]=[];readonly tactics=new Map<number,EnemyTacticState>();readonly focus=createCombatFocus();private actionSerial=0;readonly enemyShots:{position:Vec3;velocity:Vec3;life:number;damage:number;radius:number}[]=[];readonly tells:{position:Vec3;radius:number;remaining:number;kind:string}[]=[];readonly lunges=new Map<number,{velocity:Vec3;remaining:number;damage:number;radius:number;hit:boolean}>();
 buildMode=false;worldReady=true;constructor(readonly campaignMode=false,deferWorld=false){this.worldReady=!campaignMode||!deferWorld;if(campaignMode){this.survival.buildBounds={minX:-36,maxX:36,minZ:-55,maxZ:12};extendCampaignArena(this.arena,!deferWorld);if(!deferWorld)extendRegionalWorld(this.arena);this.enemies[1].hp=180;this.enemies[1].maxHp=180;for(const [id,x,y,z] of [[2,-14,.25,-5],[3,3,3.25,-30]]){this.enemies.push({id,position:{x,y,z},yaw:0,hp:100,vy:0,phase:'idle',time:0,hit:false,attack:'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());}for(const def of REGIONAL_ENEMIES){const id=this.enemies.length;this.enemies.push({id,regional:def.id,maxHp:def.hp,name:def.name,position:{...def.position},yaw:0,hp:def.hp,vy:0,phase:'idle',time:0,hit:false,attack:def.boss?'overhead':'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());this.tactics.set(id,createEnemyTacticState(def));}for(let i=0;i<3;i++){const id=this.enemies.length;this.enemies.push({id,summonOwner:-1,name:'霧の眷属',maxHp:35,position:{x:0,y:.25,z:-35},yaw:0,hp:0,vy:0,phase:'dead',time:10,hit:false,attack:'slash',hitstop:0,stride:0});this.enemyElements.push(new EntityElements());}this.water.refreshSolids();}if(campaignMode)this.protectQuestObjects();this.arena.field.captureBaseline(campaignMode?(deferWorld?'campaign-v2-hub':'campaign-v2'):'trial-v1');}
 private actorAux():ActorAux {return {selectedElement:this.selectedElement,castCooldown:this.castCooldown,footTime:this.footTime,regenDelay:this.regenDelay,cold:this.cold,gliding:this.gliding,grapple:this.grapple?{...this.grapple}:null,grappleTime:this.grappleTime,oxygen:this.oxygen,swimming:this.swimming,deathCause:this.deathCause,buildMode:this.buildMode,recipe:this.survival.selected,rotation:this.survival.rotation,shroudSeconds:this.campaign.state.shroudSeconds};}
 private applyActorAux(a:ActorAux){this.selectedElement=a.selectedElement;this.castCooldown=a.castCooldown;this.footTime=a.footTime;this.regenDelay=a.regenDelay;this.cold=a.cold;this.gliding=a.gliding;this.grapple=a.grapple?{...a.grapple}:null;this.grappleTime=a.grappleTime;this.oxygen=a.oxygen;this.swimming=a.swimming;this.deathCause=a.deathCause;this.buildMode=a.buildMode;this.survival.selected=a.recipe;this.survival.rotation=a.rotation;}
 withCompanion<T>(operation:()=>T):T|undefined {const companion=this.companionState;if(!companion)return undefined;if(this.activePlayer===companion.player)return operation();const primary=this.actorAux(),previous=this.activePlayer;this.activePlayer=companion.player;this.applyActorAux(companion.aux);try{return operation();}finally{const shroud=companion.aux.shroudSeconds;companion.aux=this.actorAux();companion.aux.shroudSeconds=shroud;this.activePlayer=previous;this.applyActorAux(primary);}}
 enableCompanion(position?:Vec3){if(this.companionState)return this.companionState.player;const player=createPlayerState();player.position=this.safePosition(position??this.primaryPlayer.position);player.hp=this.campaignMode?this.campaign.maxHp:100;player.stamina=this.campaignMode?this.campaign.maxStamina:100;const aux:ActorAux={selectedElement:'fire',castCooldown:0,footTime:0,regenDelay:0,cold:0,gliding:false,grapple:null,grappleTime:0,oxygen:20,swimming:false,deathCause:'',buildMode:false,recipe:'workbench',rotation:0,shroudSeconds:this.campaign.shroudMaximum};this.companionSuspended=false;this.companionCanEdit=false;this.companionState={version:1,player,aux};this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;return player;}
 disableCompanion(){if(this.activePlayer===this.companionState?.player)throw new Error('Cannot remove actor during its step');this.companionState=null;this.companionSuspended=false;this.companionCanEdit=false;this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;}
 setCompanionInput(input:GuestInput,receivedAt=Date.now()){if(!this.companionState||this.companionSuspended||!validGuestInput(input)||!Number.isFinite(receivedAt))return false;this.companionInput={...input};this.companionInputAt=receivedAt;this.companionState.player.yaw=input.yaw;this.companionState.player.pitch=input.pitch;return true;}
 private guestControls():Controls {const v=freshGuestInput(this.companionInput,this.companionInputAt,Date.now());return {x:v.x,z:v.z,block:v.block,sprint:v.sprint,water:false};}
 companionAction(action:Action){if(!this.companionState||this.companionSuspended||!['attack','heavy','dodge','jump','interact','heal','tool','sword','chisel','element-next','cast','recipe-next','build','special','dismantle'].includes(action))return false;this.withCompanion(()=>this.action(action,this.guestControls()));return true;}
 companionTick(dt:number){if(!this.companionState||this.companionSuspended||!Number.isFinite(dt)||dt<=0)return;this.withCompanion(()=>this.characterTick(Math.min(.1,dt),this.guestControls()));}
 neutralCompanionInput(){this.companionInput={...NEUTRAL_GUEST_INPUT,yaw:this.companion?.yaw??0,pitch:this.companion?.pitch??0};this.companionInputAt=-Infinity;}
 companionRespawn(){if(!this.companionState||this.companionSuspended||this.companionState.player.hp>0)return false;this.withCompanion(()=>this.respawn());this.companionState.aux.shroudSeconds=this.campaign.shroudMaximum;return true;}
 getCompanionSnapshot(){return this.companionSnapshot();}
 restoreCompanionSnapshot(value:unknown){return this.restoreCompanion(value);}
 companionSnapshot(){return this.companionState?cloneCompanion(this.companionState):null;}
 restoreCompanion(value:unknown){if(value===null){this.disableCompanion();return true;}if(!validCompanionSnapshot(value))return false;this.companionState=cloneCompanion(value);this.companionInput={...NEUTRAL_GUEST_INPUT};this.companionInputAt=-Infinity;return true;}
 private livingPlayers(){return [this.primaryPlayer,...(this.companionState&&!this.companionSuspended?[this.companionState.player]:[])].filter(p=>p.hp>0);}
 private playerBodies(){return this.livingPlayers().map(p=>p.position);}
 private nearestActor(position:Vec3){return this.livingPlayers().sort((a,b)=>Math.hypot(a.position.x-position.x,a.position.y-position.y,a.position.z-position.z)-Math.hypot(b.position.x-position.x,b.position.y-position.y,b.position.z-position.z))[0]??null;}
 private withActor<T>(actor:PlayerState,operation:()=>T):T|undefined{return actor===this.primaryPlayer?operation():this.withCompanion(operation);}
 private actorBlocking(actor:PlayerState){const cached=this.frameBlocking.get(actor);if(cached!==undefined)return cached;const input=actor===this.primaryPlayer?this.primaryInput:this.guestControls();return input.block&&actor.phase==='idle'&&actor.stamina>0&&!actor.tool;}
 private solidBodies(){return [...this.playerBodies(),...this.enemies.filter(e=>e.hp>0&&this.enemyActive(e)).map(e=>e.position)];}
 protectQuestObjects(){for(const o of this.arena.objects.values())if(['hearth','artisan','cache','gate','anchor'].includes(o.kind))this.elements.protectedObjects.add(o.id);}
 get homeContext(){return {position:this.player.position,basePosition:{x:-3,y:.25,z:4},baseActive:this.campaign.state.flameTier>0,artisanRescued:this.campaign.state.artisanRescued};}
 buildFurniture(id:string){const f=this.arena.field,base={x:-5,y:.25,z:2};if(id==='bed'){f.box(base,{x:-3.5,y:.55,z:3},4,'build:home:bed',.1);f.box({x:-4.8,y:.55,z:2.15},{x:-3.7,y:.68,z:2.85},10,'build:home:bed',.06);}if(id==='table'){f.box({x:-1,y:.85,z:3.5},{x:0,y:1.05,z:4.3},4,'build:home:table',.06);f.box({x:-.6,y:.25,z:3.8},{x:-.4,y:.95,z:4},4,'build:home:table');}if(id==='brazier')f.box({x:-2,y:.25,z:5.5},{x:-1.5,y:.65,z:6},3,'build:home:brazier',.12);if(id==='rug')f.box({x:-4,y:.25,z:5},{x:-2,y:.28,z:6.3},10,'build:home:rug',.01);}
 enemyActive(e:Enemy){if(!this.worldReady&&e.id>=2)return false;const def=e.regional?REGIONAL_ENEMIES.find(d=>d.id===e.regional):undefined;return !def||this.campaign.regionUnlocked(def.region)&&isRegionalOpen(def.activeHours,this.worldHour);}
 get sheltered(){return !!this.arena.field.ray(this.eye(),{x:0,y:1,z:0},3.5);}
 safePosition(position:Vec3){for(const [x,z] of [[0,1.5],[1.5,0],[-1.5,0],[0,-1.5],[0,0],[2.5,2.5]]){const p={x:position.x+x,y:position.y+8,z:position.z+z},h=this.arena.field.ray(p,{x:0,y:-1,z:0},14);if(!h)continue;const candidate={x:p.x,y:h.point.y+.03,z:p.z};if(!this.arena.field.overlaps(candidate)&&(!this.companionState||!this.playerBodies().some(b=>Math.abs(b.y-candidate.y)<1.65&&Math.hypot(b.x-candidate.x,b.z-candidate.z)<.6)))return candidate;}return {x:0,y:.28,z:6};}
 respawn(){const p=this.player;if(this.campaignMode){if(this.activePlayer===this.companionState?.player)p.position=this.safePosition(this.campaign.spawn);else{this.campaign.die(p.position);p.position=this.safePosition(this.campaign.respawn());}}else p.position={x:0,y:.25,z:6};p.hp=this.campaignMode?this.campaign.maxHp:100;p.stamina=this.campaignMode?this.campaign.maxStamina:100;p.phase='idle';p.time=0;p.vy=p.vx=p.vz=0;p.queued='';this.gliding=false;this.grapple=null;this.oxygen=20;this.deathCause='';}

 readonly events:Event[]=[];seconds=0;waterOn=false;defeated=0;private fluidTime=0;private footTime=0;private regenDelay=0;
 look(dx:number,dy:number){const weight=this.player.phase==='strike'?.28:this.player.phase==='windup'?.65:1;this.player.yaw-=dx*weight;this.player.pitch=clamp(this.player.pitch-dy*weight,-Math.PI/2+.03,Math.PI/2-.03);}
 eye():Vec3{return {...this.player.position,y:this.player.position.y+1.52};}
 target(range=2.75):Target|null {
  const p=this.player,eye=this.eye(),d=direction(p.yaw,p.pitch);let hit=this.arena.field.ray(eye,d,range),enemy:Enemy|undefined,drop:MaterialDrop|undefined;
  for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const c=Math.cos(e.yaw),s=Math.sin(e.yaw),rel={x:eye.x-e.position.x,y:eye.y-e.position.y,z:eye.z-e.position.z};
   const local={x:c*rel.x-s*rel.z,y:rel.y,z:s*rel.x+c*rel.z},dir={x:c*d.x-s*d.z,y:d.y,z:s*d.x+c*d.z};const h=this.enemyElements[e.id].field.ray(local,dir,range);
   if(h&&(!hit||h.distance<hit.distance)){hit={...h,point:{x:eye.x+d.x*h.distance,y:eye.y+d.y*h.distance,z:eye.z+d.z*h.distance}};enemy=e;}
  }
  for(const item of this.survival.drops){const q={x:item.position.x-eye.x,y:item.position.y-eye.y,z:item.position.z-eye.z},t=q.x*d.x+q.y*d.y+q.z*d.z;if(t<0||t>range||Math.hypot(q.x-d.x*t,q.y-d.y*t,q.z-d.z*t)>.16||hit&&t>=hit.distance)continue;hit={point:{...item.position},normal:{x:-d.x,y:-d.y,z:-d.z},distance:t,cell:{x:0,y:0,z:0,material:item.material,distance:-.1,object:'drop:'+item.id}};drop=item;enemy=undefined;}
  if(!hit)return null;if(drop)return {hit,drop,label:materialDefinition(drop.material).name+'の素材 ×'+drop.count,action:'近づいて回収 / 属性で動かす'};if(enemy)return {hit,enemy,label:enemy.name??(this.campaignMode&&enemy.id===1?'銅殻の番人':enemy.id>=2?'尾根の略奪者':'灰の番兵'),action:''};
  if(hit.cell.object?.startsWith('build:door:'))return {hit,label:'建築した扉',action:'E / 操作 · 開閉'};
  const object=hit.cell.object?this.arena.objects.get(hit.cell.object):null;
  if(!object)return {hit,label:materialDefinition(hit.cell.material).name,action:p.tool?'鑿で採取':'斬撃で採取'};
  if(this.campaignMode&&['hearth','artisan','cache','gate','anchor','plant'].includes(object.kind))return {hit,label:object.id==='artisan'&&this.campaign.state.artisanRescued?'鍛冶師ナギ':object.name,action:'E / 操作 · '+(object.kind==='anchor'?'鉤縄で登る':object.kind==='plant'?'採る':object.kind==='artisan'?'話す':'調べる')};
  const damaged=this.elements.damagedObjects.has(object.id);
  const action=object.kind==='door'?(object.open?'閉じる':'開く'):object.kind==='chest'?(object.open?'回収済み':'補給を取る'):object.kind==='valve'?(this.waterOn?'止水':'放水'):object.kind==='altar'?'番兵を復活':p.tool?'削る':'斬る';
  return {hit,label:object.name,action:damaged&&(object.kind==='door'||object.kind==='chest')?'破損 · 攻撃で採取':(object.kind==='tree'||object.kind==='resource')?action:object.kind==='chest'&&object.open?'':'E / 操作 · '+action};
 }
 buildPreview():PlacementPreview|null{
  const target=this.target(3.2);if(!target||target.enemy||target.drop)return null;
  const preview=this.survival.preview(target.hit.point,this.player.position,this.solidBodies().filter(b=>b!==this.player.position));
  if(this.campaignMode){if(!this.campaign.state.flameTier)return {...preview,ok:false,message:'先に灯守りの炉を点火すると建築できる'};
   const homes=[{position:{x:-3,y:.25,z:4}},...REGIONAL_POINTS.filter(q=>q.kind==='hearth'&&this.campaign.state.claimedPoints.includes(q.id))];
   if(!homes.some(h=>Math.hypot(h.position.x-target.hit.point.x,h.position.z-target.hit.point.z)<10+this.campaign.state.flameTier*3))return {...preview,ok:false,message:'点火した拠点の建築範囲内で設置する'};
  }return preview;
 }
 action(action:Action,input:Controls){
  const p=this.player;if(p.hp<=0)return;if(!this.mayEditWorld&&(action==='cast'||action==='build'||action==='dismantle'||action==='special'&&this.buildMode||p.tool&&(action==='attack'||action==='heavy'))){this.denyWorldEdit();return;}if(this.campaignMode&&this.swimming&&this.oxygen<19.9&&['attack','heavy','cast'].includes(action)){this.events.push({kind:'interact',text:'潜水中は攻撃できない。視点を上げて泳ぎ浮上する'});return;}
  if(action==='special'){if(this.buildMode){const r=this.survival.undo(p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});this.syncMaterials();return;}if(!this.campaignMode||p.phase!=='idle'||!spendCombatFocus(this.focus,'special:'+(++this.actionSerial))){this.events.push({kind:'interact',text:'確定命中で集中100を蓄積する'});return;}for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const dx=e.position.x-p.position.x,dz=e.position.z-p.position.z;if(Math.hypot(dx,dz)>3||facing(p.yaw,p.position,e.position)<.1||this.arena.field.ray(this.eye(),{x:dx,y:0,z:dz},Math.max(0,Math.hypot(dx,dz)-.35)))continue;e.hp=Math.max(0,e.hp-70);this.enemyElements[e.id].impulse({x:dx,y:0,z:dz},4);this.finishElementDeath(e);}p.phase='cast';p.time=0;this.events.push({kind:'swing',text:'集中技 · 灯火の一閃'});return;}
  if(action==='element-next'){if(this.buildMode){this.survival.rotate();return;}if(p.phase==='idle'){const order:Element[]=['fire','water','earth','wind','lightning'];this.selectedElement=order[(order.indexOf(this.selectedElement)+1)%order.length];}return;}
  if(action==='recipe-next'){if(p.phase==='idle'){this.buildMode=true;this.survival.cycleRecipe();}return;}
  if(action==='dismantle'){if(p.phase!=='idle')return;const t=this.target(3.2);if(!t?.hit.cell.object?.startsWith('build:')){this.events.push({kind:'interact',text:'自分で建てた部材を狙う'});return;}const r=this.survival.dismantle(t.hit.cell.object,p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});this.syncMaterials();return;}
  if(action==='build'){if(p.phase==='idle'){if(this.campaignMode&&!this.buildMode){this.buildMode=true;this.events.push({kind:'interact',text:'建築: V部品 / F回転 / B設置 / X戻す / G終了'});return;}const preview=this.buildPreview();if(!preview||!preview.ok){this.events.push({kind:'interact',text:preview?.message??'近くの地面に照準を合わせる'});return;}const result=this.survival.place(preview.target,p.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:result.ok?'break':'interact',text:result.message});if(result.ok&&this.campaignMode)this.campaign.recordBuild(this.survival.selected);this.syncMaterials();}return;}
  if(action==='cast'){
   if(this.buildMode){this.buildMode=false;return;}
   if(p.phase!=='idle'||input.block||this.castCooldown>0)return;
   if(p.stamina<18){this.events.push({kind:'interact',text:'属性術にはスタミナ18が必要'});return;}
   const target=this.target(7);if(!target){this.events.push({kind:'interact',text:'7m以内のVoxelに照準を合わせる'});return;}
   if(target.enemy)this.castEnemy(target.enemy,this.selectedElement,target.hit);else if(!target.drop)this.elements.cast(this.selectedElement,target.hit,direction(p.yaw,p.pitch));if(this.campaignMode)this.campaign.consumeAttackDurability();this.survival.react(this.selectedElement,target.hit.point,direction(p.yaw,p.pitch));p.stamina-=18;this.regenDelay=1;this.castCooldown=.7;p.phase='cast';p.time=0;p.queued='';this.events.push({kind:this.selectedElement==='water'?'water':'interact',text:{fire:'火 · 木と草へ延焼',water:'水 · 消火と濡れ',earth:'土 · 衝撃と鎮火',wind:'風 · 風下へ火を運ぶ',lightning:'雷 · 接触した金属へ通電'}[this.selectedElement]});this.syncMaterials();return;
  }
  if(action==='tool'||action==='sword'||action==='chisel'){this.buildMode=false;if(p.phase==='idle')p.tool=action==='tool'?!p.tool:action==='chisel';return;}
  if(action==='heal'){if(p.phase==='idle'&&p.flasks&&p.hp<100){p.flasks--;p.phase='heal';p.time=0;this.regenDelay=1.6;this.events.push({kind:'interact',text:'回復薬を飲む'});}return;}
  if(action==='interact'){if(p.phase==='idle')this.interact();return;}
  if(action==='jump'){if(this.campaignMode&&this.swimming){p.vy=3;return;}if(this.campaignMode&&!p.grounded&&this.campaign.canGlide){this.gliding=!this.gliding;return;}if(p.grounded&&p.stamina>=12){p.vy=5;p.grounded=false;p.stamina-=12;this.regenDelay=.6;}return;}
  if(action==='dodge'){if(p.phase!=='idle'||p.stamina<24)return;const m=this.axes(input),length=Math.hypot(m.x,m.z);p.dodgeX=length?m.x/length:Math.sin(p.yaw);p.dodgeZ=length?m.z/length:Math.cos(p.yaw);p.phase='dodge';p.time=0;p.stamina-=24;this.regenDelay=.8;return;}
  if(p.phase!=='idle'){if(p.phase==='recover'&&p.time>attacks[p.attack].recover*.55)p.queued=action==='heavy'?'heavy':'attack';return;}
  if(input.block)return;
  if(this.campaignMode&&this.campaign.equippedWeapon==='bow'&&!p.tool){if(p.stamina<8||!this.campaign.consumeAmmo()){this.events.push({kind:'interact',text:'矢とスタミナ8が必要'});return;}this.campaign.consumeAttackDurability();const d=direction(p.yaw,p.pitch);this.arrows.push({position:this.eye(),velocity:{x:d.x*18,y:d.y*18,z:d.z*18},life:2.5});p.stamina-=8;p.phase='cast';p.time=0;this.events.push({kind:'swing',text:'矢を放った'});return;}
  p.attack=action==='heavy'?'overhead':p.combo%2?'return':'slash';const cost=p.tool?12:attacks[p.attack].cost;
  if(p.stamina<cost){this.events.push({kind:'interact',text:'スタミナ不足'});return;}
  if(this.campaignMode){const wear=this.campaign.consumeAttackDurability();if(wear.message)this.events.push({kind:'interact',text:wear.message});}p.combo++;p.phase='windup';p.time=0;p.heavy=action==='heavy';p.hit=false;p.stamina-=cost;this.regenDelay=.85;
 }

 private interact(){
  const target=this.target(this.campaignMode&&this.campaign.canGrapple?7:2.75);if(!target||target.enemy||!target.hit.cell.object)return;if(target.hit.cell.object.startsWith('build:door:')){const r=this.survival.toggleDoor(target.hit.cell.object,this.player.position,this.solidBodies().filter(b=>b!==this.player.position));this.events.push({kind:'interact',text:r.message});this.syncMaterials();return;}const o=this.arena.objects.get(target.hit.cell.object);if(!o||o.kind==='tree'||o.kind==='resource')return;
  if((o.kind==='door'||o.kind==='chest')&&this.elements.damagedObjects.has(o.id)){this.events.push({kind:'interact',text:'破損した部材は開閉できない · 攻撃で採取'});return;}
  if(this.campaignMode){if(o.id.startsWith('rg-')&&o.kind!=='anchor'){const r=this.campaign.interactRegional(o.id,this.player.position,this.worldHour);this.events.push({kind:'interact',text:r.message});return;}if(o.kind==='anchor'){if(!this.campaign.canGrapple){this.events.push({kind:'interact',text:'登り鉤を制作して装備する'});return;}const rp=REGIONAL_POINTS.find(p=>p.id===o.id);this.grapple=rp?{...rp.position,y:rp.position.y+.1}:{x:7,y:3.4,z:-6.8};this.grappleTime=0;this.events.push({kind:'interact',text:'鉤縄で引き寄せる'});return;}
   if(o.kind==='plant'){if(!o.open){o.open=true;this.survival.inventory[7]+=4;this.events.push({kind:'interact',text:'食用草葉 ×4'});}return;}
   if(['hearth','artisan','cache','gate'].includes(o.kind)){if(o.id==='forest-chest'||o.id==='ridge-chest'){if(!o.open){o.open=true;this.survival.inventory[6]+=6;this.survival.inventory[10]+=4;this.events.push({kind:'interact',text:'探索報酬 金属6・布4'});}return;}if(o.id==='artisan'&&this.campaign.state.artisanRescued){this.events.push({kind:'interact',text:'ナギ「炉のそばで装備を整えよう。旅の記録から制作できる」'});return;}const result=this.campaign.interact(o.id,this.player.position);if(result.ok&&o.id==='artisan'){this.arena.field.removeObject('artisan');this.arena.field.box({x:-4.15,y:.25,z:4.6},{x:-3.75,y:1.55,z:5},10,'artisan',.16);this.arena.field.box({x:-4.1,y:1.5,z:4.65},{x:-3.8,y:1.85,z:4.95},5,'artisan',.1);}this.events.push({kind:'interact',text:result.message});return;}}
  if(o.kind==='door'){setDoor(this.arena.field,!o.open);
   if(this.playerBodies().some(position=>this.arena.field.overlaps(position))||this.enemies.some(e=>e.hp>0&&this.arena.field.overlaps(e.position,.27,1.7))){setDoor(this.arena.field,o.open);this.events.push({kind:'interact',text:'扉が体に当たるため動かせない'});return;}
   o.open=!o.open;
  }
  if(o.kind==='chest'&&!o.open){o.open=true;this.player.flasks+=2;this.arena.field.box({x:-3.25,y:1,z:-3.75},{x:-1.75,y:1.25,z:-3},0);this.events.push({kind:'interact',text:'回復薬 ×2'});}
  if(o.kind==='valve')this.waterOn=!this.waterOn;
  if(o.kind==='altar'&&this.campaignMode){this.events.push({kind:'interact',text:'古い祭壇。番兵を倒すと先の門を開ける'});return;}
  if(o.kind==='altar'){for(const e of this.enemies){e.hp=100;e.phase='idle';e.time=0;e.vy=0;e.position={x:e.id*2,y:.25,z:-6-e.id*3};}this.defeated=0;this.player.stamina=100;}
  this.events.push({kind:'interact',text:o.name+' · '+(o.kind==='valve'?(this.waterOn?'放水':'止水'):o.kind==='door'?(o.open?'開く':'閉じる'):'操作')});
 }
 private axes(input:Controls){const p=this.player;return {x:Math.cos(p.yaw)*input.x-Math.sin(p.yaw)*input.z,z:-Math.sin(p.yaw)*input.x-Math.cos(p.yaw)*input.z};}
 private move(position:Vec3,dx:number,dz:number,height=1.65){
  const field=this.arena.field,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.1));
  for(let i=0;i<steps;i++){for(const [axis,delta] of [['x',dx/steps],['z',dz/steps]] as const){const trial={...position,[axis]:position[axis]+delta};if(this.campaignMode&&!this.worldReady&&(Math.abs(trial.x)>11||trial.z<-11||trial.z>9))continue;
   const bodies=this.solidBodies();
   if(bodies.some(b=>b!==position&&Math.abs(b.y-trial.y)<1.65&&Math.hypot(b.x-trial.x,b.z-trial.z)<.55))continue;
   if(!field.overlaps(trial,.27,height))position[axis]+=delta;else if(!field.overlaps({...trial,y:trial.y+.26},.27,height)){position[axis]+=delta;position.y+=.25;}}}
 }
 pose(){const p=this.player,pose=attackPose(p.attack,p.phase==='cast'?'idle':p.phase,p.time);if(p.phase==='cast'){const t=Math.sin(Math.min(1,p.time/.7)*Math.PI)**2;return {...pose,grip:{...pose.grip,y:pose.grip.y+.12*t,z:pose.grip.z-.08*t},tip:{...pose.tip,y:pose.tip.y+.12*t,z:pose.tip.z-.08*t},lean:-.025*t};}if(p.phase==='heal'){const u=clamp(p.time<.55?p.time/.55:p.time<1.05?1:(1.6-p.time)/.55,0,1),t=u*u*(3-2*u);return {...pose,grip:{x:pose.grip.x+(.1-pose.grip.x)*t,y:pose.grip.y+(1.36-pose.grip.y)*t,z:pose.grip.z+(-.24-pose.grip.z)*t},drink:t};}if(p.phase==='dodge'){const t=Math.sin(p.time/.36*Math.PI);return {...pose,grip:{...pose.grip,y:pose.grip.y-t*.13},lean:t*.08};}return pose;}
 enemyPose(e:Enemy){
  const pose=attackPose(e.attack,e.phase,e.time,1.35);if((e.phase!=='stagger'&&e.phase!=='dead')||!e.interrupted)return pose;
  const u=clamp(e.time/(e.phase==='dead'?.8:.35),0,1),t=u*u*(3-2*u),a=e.interrupted,mix=(x:number,y:number)=>x+(y-x)*t;
  const grip={x:mix(a.grip.x,pose.grip.x),y:mix(a.grip.y,pose.grip.y),z:mix(a.grip.z,pose.grip.z)},raw={x:mix(a.tip.x,pose.tip.x)-grip.x,y:mix(a.tip.y,pose.tip.y)-grip.y,z:mix(a.tip.z,pose.tip.z)-grip.z},scale=attacks[e.attack].reach/(Math.hypot(raw.x,raw.y,raw.z)||1);
  return {grip,tip:{x:grip.x+raw.x*scale,y:grip.y+raw.y*scale,z:grip.z+raw.z*scale},twist:mix(a.twist,pose.twist),lean:mix(a.lean,pose.lean),step:mix(a.step,pose.step)};
 }

 /** Continuous blade sweep: contact follows the rendered edge, including head/body and walls. */
 private melee(before:WeaponPose,after:WeaponPose){
  const p=this.player;if(p.hit)return;
  if(p.tool){if(!this.mayEditWorld){p.hit=true;this.denyWorldEdit();return;}const target=this.target(2.5);if(target?.drop){this.survival.pushDrops(target.hit.point,direction(p.yaw,p.pitch));p.hit=true;return;}if(target&&!target.enemy){const result=this.elements.damage(target.hit,p.heavy?100:55,p.heavy?.5:.27);p.hit=true;p.hitstop=.07;this.events.push({kind:result.destroyed?'break':'hit',text:result.destroyed?materialDefinition(target.hit.cell.material).name+'のVoxelが砕けた':'材質の耐久値を削った'});}return;}
  const a=bladeWorld(before,p.position,p.yaw,p.pitch),b=bladeWorld(after,p.position,p.yaw,p.pitch),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
  for(let i=0;i<=steps;i++){const t=i/steps,lerp=(u:Vec3,v:Vec3)=>({x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t}),grip=lerp(a.grip,b.grip),tip=lerp(a.tip,b.tip),edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},length=Math.hypot(edge.x,edge.y,edge.z),wall=this.arena.field.ray(grip,edge,length);
   const end=wall?wall.point:tip;for(const drop of this.survival.drops)if(segmentDistance(grip,end,drop.position,drop.position)<.16){if(!this.mayEditWorld){p.hit=true;this.denyWorldEdit();return;}this.survival.pushDrops(drop.position,direction(p.yaw,p.pitch));p.hit=true;this.events.push({kind:'hit',text:'素材を弾いた'});return;}
   for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;for(const body of bodyCapsules(e.position,e.yaw,this.enemyPose(e))){if(segmentDistance(grip,end,body.a,body.b)>body.r+.035)continue;
    const bodyState=this.enemyElements[e.id],local=bodyState.local(body.a,e.position,e.yaw),cell=bodyState.field.materialAt(local);if(cell)bodyState.reactions.damage({cell,point:local,normal:{x:0,y:1,z:0},distance:0},p.heavy?65:30,.12);bodyState.impulse(direction(p.yaw,0),p.heavy?2.4:.8);
    if(this.campaignMode)gainCombatFocus(this.focus,'melee:'+(++this.actionSerial));const damage=Math.round(attacks[p.attack].damage*(this.campaignMode?this.campaign.attackMultiplier:1)*(body.zone==='head'?1.35:1));e.hp=Math.max(0,e.hp-damage);p.hit=true;p.hitstop=.065;p.impact=1;
    if(!e.hp){e.interrupted=this.enemyPose(e);e.phase='dead';e.time=0;this.defeated++;}else if(p.heavy){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;}
    this.events.push({kind:'hit',text:e.hp?(body.zone==='head'?'頭部に命中':'命中'):'番兵を倒した'});return;
   }}
   if(wall){p.hit=true;p.hitstop=.08;p.impact=.8;if(!this.mayEditWorld){this.denyWorldEdit();return;}const o=wall.cell.object?this.arena.objects.get(wall.cell.object):null;
    const result=this.elements.damage(wall,p.heavy?48:26,p.heavy?.34:.22);this.events.push({kind:result.destroyed?'break':'hit',text:result.destroyed?materialDefinition(wall.cell.material).name+'を採取できる':'刃が'+(o?.name??materialDefinition(wall.cell.material).name)+'に当たった'});return;
   }
  }
 }
 private settle(position:Vec3,vy:number,dt:number,height=1.65){const field=this.arena.field,next=position.y+vy*dt,trial={...position,y:next};
  if(!field.overlaps(trial,.27,height)){position.y=next;return {vy,grounded:false};}
  if(vy>0)return {vy:0,grounded:false};let lo=next,hi=position.y+.05;for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(field.overlaps({...position,y:mid},.27,height))lo=mid;else hi=mid;}position.y=hi;return {vy:0,grounded:true};
 }
 private characterTick(dt:number,input:Controls){
  const p=this.player;if(p.hp<=0)return;this.castCooldown=Math.max(0,this.castCooldown-dt);
  const blocking=input.block&&p.phase==='idle'&&p.stamina>0&&!p.tool;this.frameBlocking.set(p,blocking);p.blockTime=blocking?p.blockTime+dt:0;
  this.regenDelay=Math.max(0,this.regenDelay-dt);if(!blocking&&this.regenDelay===0&&p.phase==='idle')p.stamina=Math.min(this.campaignMode?this.campaign.maxStamina:100,p.stamina+27*dt*(this.campaignMode?this.campaign.staminaRegenMultiplier:1));
  p.guard+=(Number(blocking)-p.guard)*(1-Math.exp(-dt*14));p.impact=Math.max(0,p.impact-dt*5);
  const m=this.axes(input),length=Math.hypot(m.x,m.z),speed=(this.campaignMode?this.campaign.moveMultiplier:1)*(p.phase==='dodge'?0:blocking?1.05:p.phase!=='idle'?.8:input.sprint&&p.stamina>0?3.7:input.z<0?1.7:2.5);
  if(length&&input.sprint&&p.phase==='idle'&&!blocking){p.stamina=Math.max(0,p.stamina-18*dt);this.regenDelay=.45;}
  const k=1-Math.exp(-dt*(length?11:15));p.vx+=(m.x/Math.max(1,length)*speed-p.vx)*k;p.vz+=(m.z/Math.max(1,length)*speed-p.vz)*k;
  const oldPosition={...p.position};if(p.hitstop===0)this.move(p.position,p.vx*dt,p.vz*dt);const travelled=Math.hypot(p.position.x-oldPosition.x,p.position.z-oldPosition.z);p.stride+=travelled*4.5;
  if(travelled>.002&&p.grounded){this.footTime+=travelled;if(this.footTime>.95){this.events.push({kind:'step'});this.footTime=0;}}
  if(this.grapple){this.grappleTime+=dt;const d={x:this.grapple.x-p.position.x,y:this.grapple.y-p.position.y,z:this.grapple.z-p.position.z},n=Math.hypot(d.x,d.y,d.z);if(n<.2||this.grappleTime>3||p.stamina<=0)this.grapple=null;else{this.move(p.position,d.x/n*6*dt,d.z/n*6*dt);p.vy=d.y/n*6+14*dt;p.stamina=Math.max(0,p.stamina-8*dt);}}
  if(this.gliding&&(!this.campaign.canGlide||p.stamina<=0||p.grounded))this.gliding=false;if(this.gliding){p.vy=Math.max(p.vy,-1.25);const d=direction(p.yaw,0);this.move(p.position,d.x*3.5*dt,d.z*3.5*dt);p.stamina=Math.max(0,p.stamina-7*dt);}
  const falling=p.vy,vertical=this.settle(p.position,p.vy-(this.gliding?2:14)*dt,dt);if(this.campaignMode&&vertical.grounded&&!p.grounded&&falling<-9){p.hp=Math.max(0,p.hp-Math.round((-falling-9)*5));this.deathCause='高所から落下';} p.vy=vertical.vy;p.grounded=vertical.grounded;
  if(p.position.y<-4){p.hp=0;this.events.push({kind:'hurt',text:'落下した'});}
  const before=this.pose(),def=attacks[p.attack],oldPhase=p.phase;
  if(p.hitstop>0)p.hitstop=Math.max(0,p.hitstop-dt);else p.time+=dt;
  if(p.phase==='windup'&&p.time>=def.windup){p.phase='strike';p.time-=def.windup;this.events.push({kind:'swing'});}
  if(p.phase==='strike'){this.melee(before,this.pose());if(p.time>=def.strike){p.phase='recover';p.time-=def.strike;}}
  const after=this.pose();if(oldPhase==='windup'||oldPhase==='strike'||oldPhase==='recover'){const forward=direction(p.yaw,0),step=after.step-before.step;this.move(p.position,forward.x*step,forward.z*step);}
  if(p.phase==='recover'&&p.time>=def.recover){p.phase='idle';p.time=0;const queued=p.queued;p.queued='';if(queued)this.action(queued,input);}
  if(p.phase==='cast'&&p.time>=.7){p.phase='idle';p.time=0;}
  if(p.phase==='heal'&&p.time>=1.6){p.hp=Math.min(this.campaignMode?this.campaign.maxHp:100,p.hp+55);p.phase='idle';p.time=0;this.events.push({kind:'interact',text:'回復した'});}if(p.phase==='idle'&&p.time>1.2)p.combo=0;
  if(p.phase==='dodge'){this.move(p.position,p.dodgeX*4.1*dt,p.dodgeZ*4.1*dt);if(p.time>=.36){p.phase='idle';p.time=0;}}
 }
 tick(dt:number,input:Controls){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);this.seconds+=dt;this.primaryInput={...input};const p=this.primaryPlayer;
  if(p.hp<=0){if(this.campaignMode)this.campaign.die(p.position);if(!this.companionState||!this.livingPlayers().length)return;}
  this.characterTick(dt,input);this.companionTick(dt);const blocking=this.actorBlocking(p),length=Math.hypot(input.x,input.z);
  for(const e of this.enemies){if(!this.enemyActive(e))continue;if(e.regional){const def=REGIONAL_ENEMIES.find(d=>d.id===e.regional)!;if(!this.campaign.regionUnlocked(def.region)||!isRegionalOpen(def.activeHours,this.worldHour))continue;}const actor=this.nearestActor(e.position);if((!actor||Math.hypot(e.position.x-actor.position.x,e.position.z-actor.position.z)>24)&&!this.enemyElements[e.id].reactions.states.size)continue;this.enemyMaterialTick(e,dt);if(actor)this.withActor(actor,()=>{if(e.regional)this.regionalEnemyTick(e,dt,this.actorBlocking(actor));else this.enemyTick(e,dt,this.actorBlocking(actor));});if(e.hp<=0){if(this.campaignMode){if(e.regional)this.campaign.defeatRegional(e.regional);else if(e.summonOwner===undefined)this.campaign.defeat(e.id,e.id===1?'warden':e.id>=3?'ridge':'scavenger');}this.survival.addDrops(this.enemyElements[e.id].deathDrops(e.position));continue;}const vertical=this.settle(e.position,e.vy-14*dt,dt,1.7);e.vy=vertical.vy;if(e.position.y<-4){e.hp=0;e.phase='dead';this.defeated++;}}
  this.elements.tick(dt);this.chainTime+=dt;if(this.chainTime>=.25){this.chainTime=0;this.contactElements();}this.syncMaterials();const picked=this.survival.tick(dt,p.hp>0?p.position:this.companion?.position??p.position)+this.companionPickup();if(picked)this.events.push({kind:'interact',text:'Voxel素材を回収 ×'+picked});
  this.arrowTick(dt);this.enemyProjectileTick(dt,blocking);for(let i=this.tells.length-1;i>=0;i--){this.tells[i].remaining-=dt;if(this.tells[i].remaining<=0)this.tells.splice(i,1);}
  if(this.campaignMode){this.worldHour+=dt/90;if(this.worldHour>=24){this.worldHour-=24;this.worldDay++;}this.home.tick(dt);const status=this.campaign.tick(dt,{position:p.position,resting:p.hp>0&&p.phase==='idle'&&length===0,sheltered:this.sheltered});this.actorEnvironmentTick(dt,input,status.damage,status.deep);if(this.companionState?.player.hp&&!this.companionSuspended){this.withCompanion(()=>{const guest=this.player,controls=this.guestControls(),inMist=isShrouded(guest.position),deep=isDeepShroud(guest.position)&&this.campaign.state.flameTier<2;this.actorShroudSeconds=Math.max(0,Math.min(this.campaign.shroudMaximum,this.actorShroudSeconds+(inMist?-dt*(deep?6:1):dt*5)));if(guest.phase==='idle'&&!controls.x&&!controls.z)this.campaign.rest(guest.position,this.sheltered);this.actorEnvironmentTick(dt,controls,inMist&&this.actorShroudSeconds===0?20*dt:0,deep);});}}
  this.fluidTime+=dt;if(this.fluidTime>=.1){this.fluidTime=0;if(this.waterOn||input.water)for(let z=20;z<26;z++)this.water.add(2,10,z,.8);this.water.step();}
 }
 private get actorShroudSeconds(){return this.activePlayer===this.companionState?.player?this.companionState!.aux.shroudSeconds:this.campaign.state.shroudSeconds;}
 private set actorShroudSeconds(value:number){if(this.activePlayer===this.companionState?.player)this.companionState!.aux.shroudSeconds=value;else this.campaign.state.shroudSeconds=value;}
 private companionPickup(){const player=this.companion;if(!player||this.companionSuspended||player.hp<=0)return 0;let count=0;const hand={...player.position,y:player.position.y+.85};for(let i=this.survival.drops.length-1;i>=0;i--){const d=this.survival.drops[i],delta={x:d.position.x-hand.x,y:d.position.y-hand.y,z:d.position.z-hand.z},distance=Math.hypot(delta.x,delta.y,delta.z);if(distance>1.65||this.arena.field.distance(d.position)<-.015||this.arena.field.ray(hand,delta,Math.max(0,distance-.05)))continue;this.survival.inventory[d.material]+=d.count;count+=d.count;this.survival.drops.splice(i,1);}return count;}
 private actorEnvironmentTick(dt:number,input:Controls,damage:number,deep:boolean){const p=this.player;if(p.hp<=0)return;p.hp=Math.max(0,Math.min(this.campaign.maxHp,p.hp-damage));p.stamina=Math.min(p.stamina,this.campaign.maxStamina);if(damage)this.deathCause=deep?'濃い霧の侵食':'霧の滞在時間切れ';const hazard=regionalHazard(p.position,this.campaign.regionTier),lake=REGIONAL_WATERS.find(w=>p.position.x>w.min.x&&p.position.x<w.max.x&&p.position.z>w.min.z&&p.position.z<w.max.z&&p.position.y<w.surfaceY);this.cold=Math.max(0,Math.min(100,this.cold+(hazard.coldPerSecond*(this.campaign.state.foodSeconds>0?.5:1)*(this.campaign.state.equipment.armor?.includes('coat')?.5:1)-(hazard.coldPerSecond?0:10))*dt));if(this.cold>=100){p.hp=Math.max(0,p.hp-5*dt);this.deathCause='寒冷';}this.swimming=!!lake;if(lake){p.vy=(input.z?Math.sin(p.pitch)*2.2:0)+14*dt;this.oxygen=Math.max(0,Math.min(20,this.oxygen+(p.position.y+1.4<lake.surfaceY?-dt:dt*5)));if(this.oxygen===0){p.hp=Math.max(0,p.hp-12*dt);this.deathCause='水中の酸素切れ';}}else this.oxygen=Math.min(20,this.oxygen+dt*5);if(hazard.shroudDrain>0){this.actorShroudSeconds=Math.max(0,this.actorShroudSeconds-dt*hazard.shroudDrain);if(this.actorShroudSeconds===0){p.hp=Math.max(0,p.hp-15*dt);this.deathCause='灰霧の侵食';}}for(const up of REGIONAL_UPDRAFTS)if(this.gliding&&Math.hypot(p.position.x-up.position.x,p.position.z-up.position.z)<up.radius&&p.position.y<up.position.y+up.height)p.vy=Math.min(5,p.vy+up.strength*dt);const bag=this.campaign.state.deathBag;if(bag&&Math.hypot(bag.position.x-p.position.x,bag.position.y-p.position.y,bag.position.z-p.position.z)<1.5&&!this.arena.field.ray(this.eye(),{x:bag.position.x-p.position.x,y:bag.position.y-this.eye().y,z:bag.position.z-p.position.z},1)){const r=this.campaign.recover(p.position);if(r.ok)this.events.push({kind:'interact',text:r.message});}
 }
 private hurtPlayer(damage:number,from:Vec3,blocking:boolean,radial=false){const p=this.player;if(p.hp<=0||p.phase==='dodge'&&p.time>=.035&&p.time<.27)return;if(blocking&&!radial&&facing(p.yaw,p.position,from)>.35&&p.stamina>=14){p.stamina-=14;this.events.push({kind:'parry',text:'飛び道具を盾で受けた'});return;}p.hp=Math.max(0,p.hp-damage*(1-this.campaign.damageReduction));this.campaign.consumeArmorDurability();this.deathCause='敵の攻撃';this.events.push({kind:'hurt'});}
 private regionalEnemyTick(e:Enemy,dt:number,blocking:boolean){const def=REGIONAL_ENEMIES.find(d=>d.id===e.regional)!,state=this.tactics.get(e.id)!;if(this.enemyElements[e.id].shock>0)return;const output=stepEnemyTactic(state,{definition:def,position:e.position,targetPosition:this.player.position,hp:e.hp,targetAlive:this.player.hp>0,field:this.arena.field,dt,liveSummons:this.enemies.filter(v=>v.summonOwner===e.id&&v.hp>0).length});if(e.hp<=0){e.time+=dt;return;}const dx=this.player.position.x-e.position.x,dz=this.player.position.z-e.position.z;e.yaw=Math.atan2(-dx,-dz);const prev={...e.position};this.move(e.position,output.velocity.x*dt,output.velocity.z*dt,1.7);e.stride+=Math.hypot(e.position.x-prev.x,e.position.z-prev.z)*5;e.phase=state.attack?'windup':state.cooldown>.2?'recover':'idle';e.time=state.attack?state.attack.duration-state.attack.remaining:Math.max(0,2-state.cooldown);
  const lunge=this.lunges.get(e.id);if(lunge){this.move(e.position,lunge.velocity.x*dt,lunge.velocity.z*dt,1.7);lunge.remaining-=dt;if(!lunge.hit&&Math.hypot(e.position.x-this.player.position.x,e.position.z-this.player.position.z)<lunge.radius+.27&&!this.arena.field.ray({x:e.position.x,y:e.position.y+1,z:e.position.z},{x:this.player.position.x-e.position.x,y:0,z:this.player.position.z-e.position.z},Math.max(0,Math.hypot(e.position.x-this.player.position.x,e.position.z-this.player.position.z)-.3))){this.hurtPlayer(lunge.damage,e.position,blocking);lunge.hit=true;}if(lunge.remaining<=0)this.lunges.delete(e.id);}
  for(const event of output.events){if(event.type==='tell'){if(this.tells.length<24)this.tells.push({position:{...event.position},radius:event.radius,remaining:event.duration,kind:event.kind});this.events.push({kind:'interact',text:def.name+' · '+def.telegraph});}
   if(event.type==='projectile'&&this.enemyShots.length<32)this.enemyShots.push({position:{...event.position},velocity:{...event.velocity},life:event.lifetime,damage:event.damage,radius:event.radius});
   if(event.type==='lunge')this.lunges.set(e.id,{velocity:{...event.velocity},remaining:event.duration,damage:event.damage,radius:event.radius,hit:false});
   if(event.type==='melee'||event.type==='burst'){const distance=Math.hypot(dx,dz),d={x:dx,y:this.eye().y-(e.position.y+1.15),z:dz};if(distance<=event.radius&&(event.type!=='melee'||(dx*event.direction.x+dz*event.direction.z)/Math.max(.001,distance)>Math.cos(event.arc))&&!this.arena.field.ray({x:e.position.x,y:e.position.y+1.15,z:e.position.z},d,Math.max(0,Math.hypot(d.x,d.y,d.z)-.3))&&(event.type!=='burst'||this.player.grounded))this.hurtPlayer(event.damage,e.position,blocking,event.type==='burst');}
   if(event.type==='summon'){for(const position of event.positions){const minion=this.enemies.find(v=>v.summonOwner!==undefined&&v.hp<=0);if(!minion)break;minion.summonOwner=e.id;minion.position=this.safePosition(position);minion.hp=35;minion.phase='idle';minion.time=0;}}
  }
 }
 private enemyProjectileTick(dt:number,_blocking:boolean){for(let i=this.enemyShots.length-1;i>=0;i--){const shot=this.enemyShots[i],length=Math.hypot(shot.velocity.x,shot.velocity.y,shot.velocity.z)*dt,wall=this.arena.field.ray(shot.position,shot.velocity,length),end=wall?.point??{x:shot.position.x+shot.velocity.x*dt,y:shot.position.y+shot.velocity.y*dt,z:shot.position.z+shot.velocity.z*dt};let victim:PlayerState|null=null;for(const actor of this.livingPlayers().sort((a,b)=>Math.hypot(a.position.x-shot.position.x,a.position.y-shot.position.y,a.position.z-shot.position.z)-Math.hypot(b.position.x-shot.position.x,b.position.y-shot.position.y,b.position.z-shot.position.z))){const hit=this.withActor(actor,()=>bodyCapsules(actor.position,actor.yaw,this.pose()).some(c=>segmentDistance(shot.position,end,c.a,c.b)<c.r+shot.radius));if(hit){victim=actor;break;}}if(victim)this.withActor(victim,()=>this.hurtPlayer(shot.damage,shot.position,this.actorBlocking(victim!)));if(victim||wall||shot.life<=0){this.enemyShots.splice(i,1);continue;}shot.position=end;shot.life-=dt;}for(const e of this.enemies)if(e.summonOwner!==undefined&&e.summonOwner>=0&&this.enemies[e.summonOwner]?.hp<=0){e.hp=0;e.phase='dead';}}
 private arrowTick(dt:number){for(let i=this.arrows.length-1;i>=0;i--){const a=this.arrows[i],distance=Math.hypot(a.velocity.x,a.velocity.y,a.velocity.z)*dt,wall=this.arena.field.ray(a.position,a.velocity,distance);let struck=false;for(const e of this.enemies){if(e.hp<=0||!this.enemyActive(e))continue;const b=this.enemyElements[e.id],local=b.local(a.position,e.position,e.yaw),d=b.local({x:e.position.x+a.velocity.x,y:e.position.y+a.velocity.y,z:e.position.z+a.velocity.z},e.position,e.yaw),hit=b.field.ray(local,d,distance);if(hit&&(!wall||hit.distance<wall.distance)){e.hp=Math.max(0,e.hp-28*this.campaign.attackMultiplier);gainCombatFocus(this.focus,'arrow:'+(++this.actionSerial));b.reactions.damage(hit,35,.08);b.impulse(a.velocity,.6);this.finishElementDeath(e);this.events.push({kind:'hit',text:'矢が命中'});struck=true;break;}}if(struck||wall||a.life<=0){this.arrows.splice(i,1);continue;}a.position.x+=a.velocity.x*dt;a.position.y+=a.velocity.y*dt;a.position.z+=a.velocity.z*dt;a.velocity.y-=3*dt;a.life-=dt;}}
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
  if(e.hitstop>0)e.hitstop=Math.max(0,e.hitstop-dt);else e.time+=dt;
  if(e.phase==='idle'){
   if(distance>10)return;e.yaw=Math.atan2(-dx,-dz);
   if(distance>1.45){const old={...e.position};this.move(e.position,dx/distance*1.25*dt,dz/distance*1.25*dt,1.7);e.stride+=Math.hypot(e.position.x-old.x,e.position.z-old.z)*5;
    if(Math.hypot(e.position.x-old.x,e.position.z-old.z)<.001)this.move(e.position,-dz/distance*.6*dt,dx/distance*.6*dt,1.7);
   }else{e.phase='windup';e.time=0;e.hit=false;}
  }else if(e.phase==='windup'){
   if(e.time<def.windup*slow*.6){const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-e.yaw),Math.cos(desired-e.yaw));e.yaw+=clamp(delta,-dt*1.6,dt*1.6);}
   if(e.time>=def.windup*slow){e.phase='strike';e.time-=def.windup*slow;this.events.push({kind:'swing'});}
  }
  if(e.phase==='strike'){
   const after=this.enemyPose(e),a=bladeWorld(before,e.position,e.yaw),b=bladeWorld(after,e.position,e.yaw),steps=Math.max(1,Math.ceil(Math.hypot(b.tip.x-a.tip.x,b.tip.y-a.tip.y,b.tip.z-a.tip.z)/.035));
   if(!e.hit)for(let i=0;i<=steps;i++){const t=i/steps,grip={x:a.grip.x+(b.grip.x-a.grip.x)*t,y:a.grip.y+(b.grip.y-a.grip.y)*t,z:a.grip.z+(b.grip.z-a.grip.z)*t},tip={x:a.tip.x+(b.tip.x-a.tip.x)*t,y:a.tip.y+(b.tip.y-a.tip.y)*t,z:a.tip.z+(b.tip.z-a.tip.z)*t},edge={x:tip.x-grip.x,y:tip.y-grip.y,z:tip.z-grip.z},wall=this.arena.field.ray(grip,edge,Math.hypot(edge.x,edge.y,edge.z)),end=wall?.point??tip;
    if(bodyCapsules(p.position,p.yaw,this.pose()).some(c=>segmentDistance(grip,end,c.a,c.b)<c.r+.035)){
     e.hit=true;if(p.phase==='dodge'&&p.time>=.035&&p.time<.27)break;e.hitstop=.06;p.impact=1;
     if(blocking&&p.guard>.5&&facing(p.yaw,p.position,e.position)>.45&&segmentDistance(grip,end,transformPoint({x:-.38+p.guard*.2,y:.865+p.guard*.54,z:-.4-p.guard*.15},p.position,p.yaw),transformPoint({x:-.38+p.guard*.2,y:.865+p.guard*.54,z:-.4-p.guard*.15},p.position,p.yaw))<.44&&p.stamina>=18){p.stamina-=18;this.regenDelay=.8;
      if(p.blockTime<.19){e.interrupted=this.enemyPose(e);e.phase='stagger';e.time=0;this.events.push({kind:'parry',text:'パリィ'});}else this.events.push({kind:'parry',text:'ガード'});
     }else{if(p.phase==='heal'){p.phase='idle';p.time=0;this.events.push({kind:'interact',text:'回復を中断された'});}if(this.campaignMode)this.campaign.consumeArmorDurability();p.hp=Math.max(0,p.hp-(e.attack==='overhead'?38:28)*(this.campaignMode?1-this.campaign.damageReduction:1));p.stamina=Math.max(0,p.stamina-8);this.events.push({kind:'hurt'});}break;
    }if(wall){e.hit=true;e.hitstop=.08;this.elements.damage(wall,e.attack==='overhead'?35:18,.22);this.events.push({kind:'parry',text:'番兵の刃が壁に当たった'});break;}
   }
   if(e.phase==='strike'&&e.time>=def.strike*slow){e.phase='recover';e.time-=def.strike*slow;}
  }
  const after=this.enemyPose(e);if(e.phase==='windup'||e.phase==='strike'||e.phase==='recover'){const f=direction(e.yaw,0),step=after.step-before.step;this.move(e.position,f.x*step,f.z*step,1.7);}
  if((e.phase==='recover'&&e.time>=def.recover*slow+.3)||(e.phase==='stagger'&&e.time>=.95)){e.phase='idle';e.time=0;}
 }
}
