import {characterHeight} from '../physics/character-shape';
import {PROGRESSION_ACTIONS} from '../game/adventure-progression';
import {SITE_ACTIONS} from '../game/sites';
import {COMPANION_ACTIONS} from '../game/companions';
import {assertBuildingTerrain} from '../game/building-permissions';
import { protectedVolumes, intersectsProtection } from '../game/skybound/protection';
import { BUILDINGS } from '../content/catalog';
import { buildingVoxels, worldPoint } from '../game/voxel/model';
import { ReviveCoordinator } from '../game/coop-revive';
import { SKY_ACTIONS } from '../game/skybound/types';
import { driveRaft } from '../game/meadows/facilities';
import { movementSpeed, payJump } from '../game/meadows/movement';
import { newMeadows } from '../game/meadows/state';
import { GameSimulation, TICK_RATE } from './game-simulation';
import { CharacterMotor } from '../physics/character';
import { collidePlayerRocks } from '../physics/contacts';
import { Adventure } from '../game/adventure';
import type { WorldSave } from '../save/format';
import type { AdventureSave, GameAction } from '../game/types';
import type { ClientMessage, PlayerInput, PlayerState } from './protocol';
import { finiteVec } from '../world/types';
export const INPUT_TIMEOUT_TICKS = 15;
export const MAX_RECORDED_MEMBERS = 256;
const gameActions = new Set<GameAction>([...PROGRESSION_ACTIONS,'race','map-pin-share','map-pin-remove', ...SITE_ACTIONS, ...COMPANION_ACTIONS, ...SKY_ACTIONS, 'building-share', 'terrain-undo', 'talk', 'dialogue', 'trial', 'trial-reset', 'revive', 'return', 'debug-flight', 'glide', 'climb','gather','attack','heavy','charge-start','charge-release','charge-cancel','guard','dodge','craft','build','remove','spell','summon','eat','equip','travel','rest','chest','portal','repair','upgrade','cook','fuel','interact','feed','power','offer','drop','plant','sneak','sprint','fish','trade','repairBuilding','split','move','pin','unpin','label','store','take','landscape','sell']);
function shareField<T extends object, K extends keyof T>(state: T, shared: T, key: K): void {
 Object.defineProperty(state, key, { enumerable: true, configurable: true,
  get: () => shared[key], set: (value: T[K]) => { shared[key] = value; } });
}
const prototypeNames=new Set(Object.getOwnPropertyNames(Object.prototype));
const itemLookupActions=new Set(['equip','spell','eat','upgrade','drop','craft','cook','store','take','chest','plant','landscape','split','move','trade','fuel']);
const idle: PlayerInput = { x: 0, z: 0, jump: false };
export interface SessionActor { id: string; player: PlayerState; adventure: Adventure; input: PlayerInput; motor: CharacterMotor; sequence: number; lastAction: number; lastHoldTick?: number; lastInputTick: number }
export class SessionAuthority {
 readonly sim: GameSimulation;
 private readonly revives = new ReviveCoordinator();
 private readonly dormant = new Map<string, { player: PlayerState; adventure: AdventureSave }>();
 readonly actors = new Map<string, SessionActor>();
 constructor(save?: WorldSave | null, readonly dedicated = false) { this.sim = new GameSimulation(save); this.sim.debugFlightAllowed=!dedicated; this.sim.sessionSpawns=()=>[...this.actors.values()].flatMap(a=>a.adventure.state.spawn?[a.adventure.state.spawn]:[]).concat([...this.dormant.values()].flatMap(a=>a.adventure.spawn?[a.adventure.spawn]:[])); this.actors.set('host', { id: 'host', player: this.sim.player, adventure: this.sim.adventure, input: { ...idle }, motor: new CharacterMotor(this.sim.world), sequence: 0, lastAction: -100, lastInputTick: this.sim.tick }); for (const member of save?.members ?? []) this.dormant.set(member.id, { player: { ...member.player, heading: 0, vy: 0, grounded: false,crouching:this.sim.world.generator===4&&(member.player.crouching===true||!!member.adventure.meadows?.sneaking) }, adventure: Adventure.personalSave(member.adventure) }); this.syncTargets(); }
 hasRecordedPlayer(id:string):boolean{return this.actors.has(id)||this.dormant.has(id);}
 canRecordPlayer(id:string):boolean{return this.hasRecordedPlayer(id)||this.dormant.size+this.actors.size-1<MAX_RECORDED_MEMBERS;}
 join(id: string): SessionActor {
  if (typeof id !== 'string' || id === 'host' || prototypeNames.has(id) || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid peer');
  const existing = this.actors.get(id); if (existing) return existing;
  if (this.actors.size >= (this.dedicated ? 9 : 8)) throw new Error('セッションは8人までです');
  const stored = this.dormant.get(id);
  if(!stored && this.dormant.size+this.actors.size-1>=MAX_RECORDED_MEMBERS)throw new Error('この部屋の参加記録は256人までです。既存の参加者は再接続できます');
  if(this.sim.adventure.traversal.debug.active)this.sim.adventure.traversal.debug.action('off');this.sim.debugFlightAllowed=false;
  const saved = this.sim.adventure.save(false);
  const personal: AdventureSave = stored?.adventure ?? { ...saved, inventory: this.sim.world.generator===4?{ragTunic:1,club:1,glider:1,berry:6}:saved.meadows?{ragTunic:1}:{berry:3}, equipment: 'hands', ...(saved.meadows?{meadows:newMeadows()}:{}), health: saved.meadows?25:100, stamina: saved.meadows?50:100, mana: 70, food: 0, rested: 0, spawn: null, death: null, grave: {},gearItems:undefined,graveGear:undefined,gearFlights:undefined, poison: 0, chill: 0, downed: undefined, trialJournal: [], siteJournal: [],race:undefined,progression:undefined };
  const p = this.sim.player;
  const actor = { id, player: stored?.player ?? { ...p, x: p.x + this.actors.size * 0.8, grounded: false }, adventure: new Adventure(this.sim, personal), input: { ...idle }, motor: new CharacterMotor(this.sim.world), sequence: 0, lastAction: -100, lastInputTick: this.sim.tick };
  this.bindWorld(actor.adventure.state);
  actor.adventure.owner = id;actor.adventure.freshEquipment=!stored;actor.adventure.gear.ensure(); actor.adventure.projectiles = this.sim.adventure.projectiles;
  this.dormant.delete(id); this.actors.set(id, actor); this.syncTargets(); return actor;
 }
 leave(id: string): void { this.revives.cancel(id, this.actors); const actor = this.actors.get(id); if (id !== 'host' && actor) { this.sim.companions.release(id,actor.player);actor.adventure.sites.release(id);this.dormant.set(id, { player: { ...actor.player }, adventure: actor.adventure.save(false) }); this.actors.delete(id); this.sim.forgetActor(id); this.sim.skybound.release(id);this.sim.skybound.bindEquipment(id,undefined); } this.syncTargets(); }
 /** Reassigning an entity array must update the one world, including callbacks from projectile hits. */
 private bindWorld(state: AdventureSave): void {
  const shared = this.actors.get('host')!.adventure.state;
  for (const key of ['gearFlights','resources', 'enemies', 'buildings', 'unlocked', 'defeated', 'waterSeeds', 'trialWorld', 'siteWorld', 'exploration'] as const) {
   shareField(state, shared, key);
  }
  const personalMeadow = state.meadows, worldMeadow = shared.meadows;
  if (personalMeadow && worldMeadow) for (const key of ['worldTiles', 'pendingWaterTiles', 'raid', 'raidAt', 'raidCenter', 'raidSpawn', 'raidKind'] as const) {
   shareField(personalMeadow, worldMeadow, key);
  }
 }
 private syncTargets(): void { this.sim.targets = [...this.actors.values()].filter(a => !this.dedicated || a.id !== 'host').map(a => ({ player: a.player, adventure: a.adventure })); }
 input(id: string, input: PlayerInput, sequence: number): void {
  const actor = this.actors.get(id); if (!actor || !Number.isSafeInteger(sequence) || sequence <= actor.sequence || !input || !Number.isFinite(input.x) || !Number.isFinite(input.z) || Math.abs(input.x) > 1 || Math.abs(input.z) > 1 || typeof input.jump !== 'boolean'||input.debugVertical!==undefined&&(!Number.isFinite(input.debugVertical)||Math.abs(input.debugVertical)>1||input.debugVertical!==0&&(!this.sim.debugFlightAllowed||id!=='host'))) return;
  actor.sequence = sequence; actor.lastInputTick = this.sim.tick; actor.input = { ...(input.debugVertical!==undefined?{debugVertical:input.debugVertical}:{}), x:input.x, z:input.z, jump: actor.input.jump || input.jump };
 }
 private withActor<T>(actor: SessionActor, callback: () => T): T {
  if (actor.id === 'host') return callback();
  const mainPlayer = { ...this.sim.player,crouching:!!this.sim.player.crouching }, mainAdventure = this.sim.adventure, mainTargets = this.sim.targets, state = actor.adventure.state, shared = mainAdventure.state;
  state.seconds = shared.seconds;
  Object.assign(this.sim.player, actor.player,{crouching:!!actor.player.crouching}); this.sim.adventure = actor.adventure;
  this.sim.targets = mainTargets.map(target => target.adventure === mainAdventure ? {...target, player: mainPlayer} : target.adventure === actor.adventure ? {...target, player: this.sim.player} : target);
  try { return callback(); } finally { Object.assign(actor.player, this.sim.player); Object.assign(this.sim.player, mainPlayer); this.sim.adventure = mainAdventure; this.sim.targets = mainTargets; }
 }
 action(id: string, message: ClientMessage): { dirty: string[]; message: string } {
  const actor = this.actors.get(id); if (!actor) throw new Error('Unknown peer');
  if (!message || typeof message !== 'object' || (message.type !== 'action' && message.type !== 'game-action')) throw new Error('この操作は許可されていません');
  const allowed=message.type==='game-action'?['type','action','id','target','aim','expectedRevision','expectedEpoch']:['type','tool','target','expectedRevision'];
  if(Object.keys(message).some(key=>!allowed.includes(key)))throw new Error('未知の操作フィールドです');
  if (message.type === 'game-action') {
   if (!gameActions.has(message.action) || (message.id !== undefined && (typeof message.id !== 'string' || message.id.length > 256))) throw new Error('操作データが不正です');
   if (itemLookupActions.has(message.action)&&(message.id??'').split(/[:|]/).some(id=>prototypeNames.has(id)))throw new Error('品物の識別子が不正です');
   if (!message.aim || !finiteVec(message.aim) || Math.hypot(message.aim.x, message.aim.y, message.aim.z) > 1.5) throw new Error('照準データが不正です');
   if (message.target !== undefined && (!message.target || !finiteVec(message.target))) throw new Error('対象の位置が不正です');
  } else if (!['dig', 'add', 'water', 'rock'].includes(message.tool) || !message.target || !finiteVec(message.target)) throw new Error('操作データが不正です');
  const expected=(message as ClientMessage & {expectedRevision?:unknown;expectedEpoch?:unknown});
  if(expected.expectedRevision!==undefined&&(!Number.isSafeInteger(expected.expectedRevision)||expected.expectedRevision!==this.sim.world.edits.length))throw new Error('地形が更新されています。同期してから再試行してください');
  if(expected.expectedEpoch!==undefined){const partId=message.type==='game-action'?Number(message.id?.split(':')[0]):NaN;const part=this.sim.skybound.state.parts.find(p=>p.id===partId);if(!part||!Number.isSafeInteger(expected.expectedEpoch)||part.epoch!==expected.expectedEpoch)throw new Error('構造物が更新されています。同期してから再試行してください');}
  const vector=(p:{x:number;y:number;z:number})=>({x:p.x,y:p.y,z:p.z});
  message=message.type==='action'?{type:'action',tool:message.tool,target:vector(message.target)}:{type:'game-action',action:message.action,id:message.id,target:message.target?vector(message.target):undefined,aim:vector(message.aim)};
  if(message.type==='game-action'&&message.action==='debug-flight'&&(!this.sim.debugFlightAllowed||id!=='host'))throw Error('デバッグ飛行はひとりプレイ専用です。協力プレイでは使えません');
  this.guardProtected(actor,message);
  if(message.type==='game-action'&&message.action==='revive'&&!message.id){this.revives.cancelHelper(id,this.actors);return {dirty:[],message:'救助を中断しました'};}
  // A hold heartbeat has no gameplay effect beyond an existing lease. Give it
  // its own bounded cadence, so it cannot consume attack/move input or cancel
  // a rescue when it happens to arrive in the same simulation tick.
  if(message.type==='game-action'&&message.action==='sky-hold'){
   if(this.sim.tick-(actor.lastHoldTick??-100)<15)throw Error('保持の更新間隔を空けてください');
   actor.lastHoldTick=this.sim.tick;
   return this.withActor(actor,()=>this.sim.adventure.action('sky-hold',message.id,message.target,message.aim));
  }
  const waterAction = message.type === 'action' && message.tool === 'water';
  const releaseAction = message.type === 'game-action' && (['charge-release','charge-cancel'].includes(message.action)||message.action==='sky-release'||message.action==='companion-lead'&&(!message.id?.split(':')[1]||message.id.endsWith(':off'))||message.action==='companion-ride'&&this.sim.companions.snapshot(id).riding===Number(message.id)||message.id === 'off' && ['guard','sprint','glide','climb','debug-flight'].includes(message.action));
  if (!waterAction && !releaseAction && this.sim.tick - actor.lastAction < 4) throw new Error('操作の間隔を空けてください');
  if (!waterAction && !releaseAction) actor.lastAction = this.sim.tick;
  if(message.type==='game-action'&&message.action==='revive'){this.revives.start(id,message.id??'',this.actors,this.sim);return {dirty:[],message:'救助中です。3秒間、近くで操作を続けてください'};}
  this.revives.cancelHelper(id,this.actors);
  return this.withActor(actor, () => message.type === 'action' ? this.sim.act(message.tool, message.target, actor.id) : this.sim.adventure.action(message.action, message.id, message.target, message.aim));
 }
 private guardProtected(actor:SessionActor,message:ClientMessage):void {
  if(this.sim.world.generator!==4)return;
  const volumes=protectedVolumes(this.sim),p=actor.player;
  const check=(point:{x:number;y:number;z:number},radius:number,terrain=true)=>{if(terrain)this.withActor(actor,()=>assertBuildingTerrain(actor.adventure,point,radius));if(intersectsProtection(point,radius,volumes))throw new Error('開始・復帰地点と案内標の小さな保護範囲には設置・地形編集できません');};
  if(message.type==='action'&&message.tool!=='water'){check(message.target,message.tool==='rock'?.55:1.7);return;}
  if(message.type!=='game-action')return;
  const ground=message.target??{x:p.x+message.aim.x*2.5,y:p.y,z:p.z+message.aim.z*2.5};
  if(message.action==='spell'&&(message.id==='quake'||message.id==='raise'))check(ground,2.3);
  if(message.action==='landscape'){
   const h=this.sim.groundAt(ground.x,ground.z),height=message.id==='raise'?h+.5:message.id==='path'?h:Math.max(h-.75,Math.min(h+.75,p.y));
   // Both capped CSG operations occupy the same 1.5m footprint and 3m vertical extent.
   for(const offset of [-1.5,0,1.5])check({...ground,y:height+offset},1.5);
  }
  if(message.action==='build'&&BUILDINGS.some(b=>b.id===message.id))for(const cell of buildingVoxels(message.id!).cells.values()){const size=.125,point=worldPoint({x:(cell.x+.5)*size,y:(cell.y+.5)*size,z:(cell.z+.5)*size},ground,Math.atan2(message.aim.x,message.aim.z));check(point,.11,false);}
 }
 step(hostInput?: PlayerInput): void {
  const started = performance.now();
  for (const actor of this.actors.values()) if (this.sim.tick - actor.lastInputTick >= INPUT_TIMEOUT_TICKS) actor.input = { ...idle };
  const host = this.actors.get('host')!; if(hostInput)host.lastInputTick=this.sim.tick; this.sim.step(hostInput ?? host.input); host.input.jump = false;
  for (const actor of this.actors.values()) if (actor.id !== 'host') this.withActor(actor, () => {
   const input = actor.input, p = this.sim.player, dt = 1 / TICK_RATE, riding=this.sim.companions.drive(actor.id,actor.input,this.sim.player)||this.sim.skybound.drive(actor.id,actor.input,this.sim.player),traversal=actor.adventure.traversal.beforeMove(actor.input,1/TICK_RATE), wasGrounded=p.grounded, impactVy=p.vy, length = Math.max(1, Math.hypot(input.x, input.z)), water = this.sim.fluid.immersion(p, characterHeight(p)), speed = traversal.speed * movementSpeed(actor.adventure,!!(input.x||input.z),water,dt);
   const flow = this.sim.fluid.current(p);
   const beforeY = p.y, dx = (traversal.wind?.x??0)*dt+input.x / length * speed * dt + flow.x * Math.min(1, water * 3) * dt, dz = (traversal.wind?.z??0)*dt+input.z / length * speed * dt + flow.z * Math.min(1, water * 3) * dt;
   if(!riding&&!traversal.handled&&!driveRaft(actor.adventure,input.x,input.z,dt))actor.motor.step(p, dx, dz, payJump(actor.adventure,input.jump,p.grounded), dt, water); input.jump = false;
   if (dx || dz) p.heading = Math.atan2(dx, dz);
   collidePlayerRocks(p, this.sim.bodies, dx, dz, dt);
   const ice = this.sim.fluid.iceHeight(p); if (ice !== null && p.vy <= 0 && beforeY >= ice - 0.1 && p.y <= ice) { p.y = ice; p.vy = 0; p.grounded = true; }
   actor.adventure.collidePlayer(beforeY); actor.motor.reconcile(p);this.sim.applyLanding(wasGrounded,impactVy,water,actor.adventure);
   p.x = Math.max(-999, Math.min(999, p.x)); p.z = Math.max(-999, Math.min(999, p.z));
   actor.adventure.stepPersonal(dt); if (p.y < -15) this.sim.resetPlayer();
  });
  this.revives.step(1/TICK_RATE,this.actors,this.sim);
  this.sim.metrics.tickMs = performance.now() - started;
 }
 save(): WorldSave {
  const members = new Map([...this.dormant].map(([id, member]) => [id, {player:{...member.player},adventure:Adventure.personalSave(member.adventure)}]));
  for (const actor of this.actors.values()) if (actor.id !== 'host') members.set(actor.id, { player: { ...actor.player }, adventure: actor.adventure.save(false) });
  return { ...this.sim.save(), members: [...members].map(([id, member]) => ({ id, player: member.player, adventure: member.adventure })) };
 }
 view(id: string) {
  const actor = this.actors.get(id); if (!actor) throw new Error('Unknown peer');
  const personal = this.withActor(actor, () => ({ player: { ...this.sim.player }, adventure: this.sim.adventure.snapshot() }));
  // The host player aliases sim.player, so read peers only after withActor restores it.
  return { ...personal, peers: [...this.actors.values()].filter(a => a.id !== id && (!this.dedicated || a.id !== 'host')).map(a => ({ id: a.id, player: { ...a.player }, appearance: { downed: !!a.adventure.state.downed, reviveProgress: a.adventure.receivingHelp?.seconds ?? 0, ...a.adventure.traversal.snapshot(),crouching:!!a.player.crouching, equipment: a.adventure.state.equipment, attack: a.adventure.attack, guarding: a.adventure.guarding, dodging: a.adventure.dodge > 0, shield: !!a.adventure.state.inventory.shield } })) };
 }
}
