import {deckPassengers,passengersClear,carryPassengers} from './platform';
import type {EquipmentFusionBridge} from '../equipment/items';
import {CAMP_LIMITS, assertCampRange, campAccess, campArrival, hasCargo, storageView, transferCargo} from './camp';
import {wheelSupports,wheelDriveWrench,WHEEL_TRACTION_LIMITS} from './wheel-traction';
import {transferAssemblyContacts,skyPartsOverlap,skyPartOverlapsCapsule,type ContactAssembly} from './assembly-contacts';
import {assemblyBuoyancy} from './buoyancy';
import { collideSkyPlayer } from './character';
import { stepRigid, impulse, wrench, massProperties } from './rigid';
import { global as partWorld, local as partLocal, orientation, yawQuaternion, inverse, multiply, rotate, heading, increment, scale } from './orientation';
import type { Vec3 } from '../../world/types';
import { finiteVec, insideBounds } from '../../world/types';
import { localPoint, worldPoint } from '../voxel/model';
import type { AscendPreview, SkyAction, SkyboundSave, SkyboundSnapshot, SkyContext, SkyFusion, SkyLease, SkyMaterial, SkyPart, SkyPartKind, SkyEffect, SkyElement, SkyTrialTemplate, SkyContactEvent } from './types';
import { ENVIRONMENT_LIMITS, MATERIAL_ITEM, MATERIAL_MASS, PART_COST, PART_HALF, SKY_LIMITS } from './types';
import { validateSkybound } from './validation';

const clearanceProbeCache=new Map<SkyPartKind,Vec3[]>();
function clearanceProbes(kind:SkyPartKind):readonly Vec3[]{const cached=clearanceProbeCache.get(kind);if(cached)return cached;const h=PART_HALF[kind],nx=Math.ceil(h.x*2/.125),ny=Math.ceil(h.y*2/.125),nz=Math.ceil(h.z*2/.125),points:Vec3[]=[];for(let ix=0;ix<=nx;ix++)for(let iy=0;iy<=ny;iy++)for(let iz=0;iz<=nz;iz++)points.push({x:-h.x+1e-6+(2*h.x-2e-6)*ix/nx,y:-h.y+1e-6+(2*h.y-2e-6)*iy/ny,z:-h.z+1e-6+(2*h.z-2e-6)*iz/nz});clearanceProbeCache.set(kind,points);return points;}

export const FUSION_RECIPES: Readonly<Record<string, {damage: number; durability: number; effect: SkyFusion['effect']}>> = {
 stone: {damage: 6, durability: 30, effect: 'impact'}, resin: {damage: 4, durability: 20, effect: 'fire'}, crystal: {damage: 8, durability: 20, effect: 'frost'},
};
const fuseEquipment = new Set(['sword','axe','flintAxe','flintKnife','flintSpear','spear','crudeBow','ironSword','crystalSword','bow','shield','towerShield','club']);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const zero = (): Vec3 => ({x: 0, y: 0, z: 0});
const yaw = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
type Pose = Pick<SkyPart, 'position' | 'rotation' | 'velocity' | 'q' | 'angularVelocity'>;
interface HistoryFrame extends Pose { tick: number; epoch: number }
interface Recall { starts: Map<number, Vec3>; owner: string; frames: {tick: number; poses: Map<number, HistoryFrame>}[]; ids: number[] }
export interface SkyResult { message: string; exit?: Vec3; drops?: {id: string; count: number; point: Vec3}[] }

/** One room owns these transactions. No inventory or world time is included in object history. */
export class SkyboundPowers {
 readonly state: SkyboundSave;
 private readonly equipmentBridges=new Map<string,EquipmentFusionBridge>();
 bindEquipment(owner:string,bridge:EquipmentFusionBridge|undefined):void{if(bridge){this.equipmentBridges.set(owner,bridge);delete this.state.fusions[owner];}else this.equipmentBridges.delete(owner);}
 readonly leases = new Map<number, SkyLease>();
 private readonly tows = new Map<number,string>();
 private readonly history = new Map<number, HistoryFrame[]>();
 private readonly recalls = new Map<string, Recall>();
 private readonly previews = new Map<string, AscendPreview>();
 private nextId = 1;
 private readonly lastSafeSeat = new Map<string,Vec3>();
 private readonly riders = new Map<string, number>();
 private readonly controls = new Map<string, {x: number; z: number}>();
 private readonly powered = new Set<number>();
 private readonly emissionTicks = new Map<number, number>();
 private readonly shortTicks = new Map<number, number>();
 private readonly contactEvents:SkyContactEvent[]=[];
 private readonly contactTicks=new Map<number,number>();
 private readonly contactEpoch=crypto.randomUUID();
 private contactSequence=0;
 private effectSequence = 0;
 private effectTick = -1;
 private effectsIssued = 0;
 private readonly farSleeping = new Set<number>();
 private readonly quiet = new Map<number,number>();
 private lastTerrainRevision=-1;
 private readonly metrics={activeAssemblies:0,sleepingParts:0,contacts:0,dynamicContacts:0,historyFrames:0};
 constructor(saved?: SkyboundSave) {
  this.state = saved ? validateSkybound(saved) : {version: 2, parts: [], blueprints: [], fusions: {}};
  // Old sky-site loans had an isolated anchored emitter that could never be
  // wired by a player. Unlock only that impossible loan, keeping every pose,
  // inventory, custom part and valid connected circuit. Load starts new history.
  for(const part of this.state.parts)if(part.loan?.site===850003&&part.kind==='emitter'&&part.anchored&&part.links.length===0){part.anchored=false;part.epoch=Number.isSafeInteger(part.epoch+1)?part.epoch+1:0;part.sleeping=false;}
  this.nextId = this.state.nextId??Math.max(0, ...this.state.parts.map(p => p.id), ...this.state.blueprints.map(p => p.id)) + 1;
 }
 private requireIds(count:number):void{if(!Number.isSafeInteger(this.nextId+count))throw new Error('部品IDの上限に達しました');}
 isRiding(owner:string):boolean{return this.riders.has(owner);}
 isPowered(id:number):boolean { return this.powered.has(id); }
 save(): SkyboundSave { return structuredClone({...this.state,nextId:Math.max(this.nextId,...this.state.parts.map(p=>p.id+1),...this.state.blueprints.map(p=>p.id+1))}); }
 /** Replica collision state is replaced by a validated authority snapshot, never merged into a local save. */
 applyReplica(snapshot: SkyboundSnapshot): void {
  const parts = snapshot.parts.map(({lease: _lease, recalling: _recalling, powered: _powered, lightRadius: _lightRadius, ...part}) => part);
  this.state.parts = validateSkybound({version: 1, parts, blueprints: [], fusions: {}}, {replica: true}).parts;delete this.state.storage;delete this.state.storageGear;delete this.state.camps;this.nextId=Math.max(this.nextId,...this.state.parts.map(p=>p.id+1));
 }

 snapshot(owner: string): SkyboundSnapshot {
  const seat = this.riders.get(owner), riding = seat !== undefined ? {seat, driver: this.driver(this.group(seat)) === owner} : undefined;
  return structuredClone({contactEvents:this.contactEvents,storage: storageView(this.state, owner), camp: this.state.camps?.[owner] ? {bed: this.state.camps[owner]} : undefined, physics:{...this.metrics}, riding, parts: this.state.parts.map(p => ({...p, lease: this.leases.get(p.id), powered: this.powered.has(p.id), lightRadius: p.kind === 'lamp' && this.powered.has(p.id) ? 4 : 0, recalling: [...this.recalls.values()].some(r => r.ids.includes(p.id))})), blueprints: this.state.blueprints.filter(p => p.owner === owner), fusions: this.equipmentBridges.get(owner)?.list()??(Object.hasOwn(this.state.fusions,owner)?this.state.fusions[owner]:[]), ascendPreview: this.previews.get(owner)});
 }
 private part(id: number): SkyPart { const part = this.state.parts.find(p => p.id === id); if (!part) throw new Error('創作部品が見つかりません'); return part; }
 private group(id: number): SkyPart[] {
  const ids = new Set<number>(), pending = [id];
  while (pending.length) { const next = pending.pop()!; if (ids.has(next)) continue; ids.add(next); pending.push(...this.part(next).links); }
  return [...ids].map(key => this.part(key));
 }
 private reachable(part: SkyPart, context: SkyContext): void {
  if (distance(part.position, context.player) > 7) throw new Error('部品へ近づいてください');
  const eye = {...context.player, y: context.player.y + 1}, length = distance(eye, part.position);
  for (let d = .2; d < length - .7; d += .2) { const t = d / length; if (context.solid({x: eye.x + (part.position.x - eye.x) * t, y: eye.y + (part.position.y - eye.y) * t, z: eye.z + (part.position.z - eye.z) * t})) throw new Error('部品が地形や建物に遮られています'); }
 }
 private expire(tick: number): void {
  const owners = new Set([...this.leases.values()].filter(lease => lease.expiresTick <= tick).map(lease => lease.owner));
  for (const owner of owners) this.release(owner);
  for (const [owner, preview] of this.previews) if (preview.expiresTick <= tick) this.previews.delete(owner);
 }
 private assertCampOwnership(owner: string, parts: SkyPart[]): void {
  if(parts.some(p=>(p.kind==='storage'||p.kind==='bed')&&!campAccess(p,owner)))throw Error('この移動拠点は作成者の私物です。共有の許可が必要です');
 }
 private assertAvailable(owner: string, parts: SkyPart[], checkOwnership=true): void {
  if(checkOwnership)this.assertCampOwnership(owner,parts);
  if(parts.some(p=>this.tows.has(p.id)))throw new Error('手綱を外してから部品を操作してください');
  if ([...this.riders.values()].some(id => parts.some(p => p.id === id))) throw new Error('搭乗中の構造物は操作できません');
  if (parts.some(p => this.leases.has(p.id) && this.leases.get(p.id)!.owner !== owner)) throw new Error('別の冒険者が操作しています');
  if ([...this.recalls.values()].some(r => r.ids.some(id => parts.some(p => p.id === id)))) throw new Error('軌跡を戻している途中です');
 }
 private lease(owner: string, parts: SkyPart[], tick: number): void {
  this.assertAvailable(owner, parts);
  for (const part of parts) {part.sleeping=false;this.quiet.delete(part.id);}
  for (const part of parts) this.leases.set(part.id, {owner, expiresTick: tick + SKY_LIMITS.leaseTicks});
 }
 private owned(owner: string, id: number, tick: number): SkyPart[] {
  const parts = this.group(id); this.assertAvailable(owner, parts);
  if (parts.some(p => this.leases.get(p.id)?.owner !== owner)) throw new Error('先に部品を掴んでください');
  return parts;
 }
 release(owner: string): void {
  this.setTow(owner);
  for (const [id, lease] of this.leases) if (lease.owner === owner) this.leases.delete(id);
  this.recalls.delete(owner); this.previews.delete(owner); this.riders.delete(owner); this.controls.delete(owner); this.lastSafeSeat.delete(owner);
 }
 private invalidate(parts: SkyPart[]): void { for (const part of parts) { part.epoch++;part.sleeping=false;this.quiet.delete(part.id); this.history.delete(part.id); } }
 private contains(part: SkyPart, point: Vec3, margin = 0): boolean {
  const local = partLocal(point,part), half = PART_HALF[part.kind];
  return Math.abs(local.x) < half.x + margin && Math.abs(local.y) < half.y + margin && Math.abs(local.z) < half.z + margin;
 }
 private volumeClear(part: SkyPart, context: SkyContext, ignore: Set<number>, checkActors = true): boolean {
  const half = PART_HALF[part.kind], radius = Math.hypot(half.x, half.y, half.z);
  const neighbors = this.state.parts.filter(other => !ignore.has(other.id) && distance(part.position, other.position) < radius + Math.hypot(PART_HALF[other.kind].x, PART_HALF[other.kind].y, PART_HALF[other.kind].z));
  if(neighbors.some(other=>skyPartsOverlap(part,other)))return false;
  // Include both sides to a 1µm contact tolerance; the old +.01 lattice omitted the far skin.
  for(const local of clearanceProbes(part.kind)){
   const p=partWorld(local,part);
   if(!insideBounds(p,context.bounds,.01)||context.solid(p)||context.occupied?.(p)||context.protected?.(p))return false;
  }
  if(checkActors)for(const actor of context.actors.filter(a=>!ignore.has(this.riders.get(a.id)??-1)))if(skyPartOverlapsCapsule(part,actor.position,.3,(actor.position as Vec3&{crouching?:boolean}).crouching?1:1.7))return false;
  return true;
 }
 private requireClear(parts: SkyPart[], context: SkyContext, ignored = new Set(parts.map(p => p.id))): void {
  if (parts.some(p => !this.volumeClear(p, context, ignored))) throw new Error('地形・建物・人・保護領域と重なっています');
 }
 private spend(cost: Record<string, number>, inventory: Record<string, number>): void {
  for (const [id, count] of Object.entries(cost)) if (!Number.isSafeInteger(count) || count < 0 || (inventory[id] ?? 0) < count) throw new Error('設計に必要な素材が足りません');
  for (const [id, count] of Object.entries(cost)) inventory[id] -= count;
 }
 private destination(target: Vec3 | undefined, context: SkyContext): Vec3 {
  if (!target || !finiteVec(target) || distance(target, context.player) > 7) throw new Error('近くの設置位置を選んでください');
  return {x: Math.round(target.x * 8) / 8, y: Math.round(target.y * 8) / 8, z: Math.round(target.z * 8) / 8};
 }
 private assemblyPoses(parts: SkyPart[], root: SkyPart, position: Vec3, rotation: number): SkyPart[] {
  const delta = yaw(rotation - root.rotation),dq=yawQuaternion(delta);
  return parts.map(p => {const q=multiply(dq,orientation(p));return {...p, position: worldPoint({x:p.position.x-root.position.x,y:p.position.y-root.position.y,z:p.position.z-root.position.z},position,delta),q,rotation:heading(q),velocity:zero(),angularVelocity:zero()};});
 }
 private applyPoses(poses: SkyPart[]): void { for (const pose of poses) { const part = this.part(pose.id); part.position = {...pose.position}; part.rotation = pose.rotation;part.q={...orientation(pose)};part.angularVelocity={...(pose.angularVelocity??zero())}; part.velocity = {...pose.velocity}; } }
 action(owner: string, action: SkyAction, id: string, target: Vec3 | undefined, aim: Vec3, context: SkyContext): SkyResult {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(owner) || ['__proto__','constructor','prototype'].includes(owner)) throw new Error('操作する冒険者が不正です');
  this.expire(context.tick);
  if(action==='sky-plan-rename'||action==='sky-plan-delete'){
   const split=id.indexOf(':'),planId=Number(split<0?id:id.slice(0,split)),plan=this.state.blueprints.find(p=>p.id===planId&&p.owner===owner);
   if(!plan)throw Error('自分の設計を選んでください');
   if(action==='sky-plan-delete'){this.state.blueprints=this.state.blueprints.filter(p=>p!==plan);return {message:'設計帳の記録を削除しました。組み立て済みの部品は残っています'};}
   const name=split<0?'':id.slice(split+1).trim();if(!name||name.length>40||/[\x00-\x1f]/.test(name))throw Error('設計名は40文字以内で入力してください');plan.name=name;return {message:'設計名を変更しました'};
  }
  if(action==='sky-camp-clear'){if(this.state.camps)delete this.state.camps[owner];return {message:'移動拠点の復活地点を解除しました'};}
  if (action === 'sky-ascend-preview') {
   const exit = this.findExit(context); this.previews.set(owner, {from: {...context.player}, exit, expiresTick: context.tick + SKY_LIMITS.previewTicks});
   return {message: '天抜けの出口を確認しました。確定で上昇します'};
  }
  if (action === 'sky-ascend') {
   const preview = this.previews.get(owner);
   if (!preview || distance(preview.from, context.player) > .5 || !this.exitClear(preview.exit, context) || !this.hasCeiling(context.player, preview.exit, context)) { this.previews.delete(owner); throw new Error('出口が変わりました。もう一度確認してください'); }
   this.previews.delete(owner); return {message: '天抜けで上層へ移動しました', exit: {...preview.exit}};
  }
  if (action === 'sky-fuse' || action === 'sky-unfuse') {
   const [equipment, material] = id.split(':');
   if(action==='sky-fuse'&&equipment==='woodArrow'&&material==='resin'){
    if(!Number.isSafeInteger(context.inventory.fireArrow??0)||(context.inventory.fireArrow??0)>=1e9||context.canReceiveItem?.('fireArrow',1)===false)throw Error('火の矢を受け取る持ち物の空きが必要です');
    this.spend({woodArrow:1,resin:1},context.inventory);context.inventory.fireArrow=(context.inventory.fireArrow??0)+1;return{message:'木の矢1本と樹脂1個を合成し、火の矢1本を作りました。発射で消費します'};
   }
   if (!fuseEquipment.has(equipment) || !(context.inventory[equipment] > 0)) throw new Error('持っている武器か盾を選んでください');
   const bridge=this.equipmentBridges.get(owner),list=bridge?.list()??this.state.fusions[owner]??[];
   if (action === 'sky-unfuse') { if (!list.some(f => f.equipment === equipment)) throw new Error('この装備は合成されていません'); if(bridge)bridge.prepare(equipment,undefined)();else this.state.fusions[owner] = list.filter(f => f.equipment !== equipment); return {message: '合成を解除しました。使った素材は戻りません'}; }
   if (!Object.hasOwn(FUSION_RECIPES, material) || list.some(f => f.equipment === equipment)) throw new Error('素材を選ぶか、現在の合成を解除してください');
   const fusion={equipment,material,...FUSION_RECIPES[material]},commit=bridge?.prepare(equipment,fusion);
   this.spend({[material]: 1}, context.inventory);
   if(commit)commit();else this.state.fusions[owner] = [...list,fusion];
   return {message: '継ぎ装で素材を合成しました'};
  }
  if (action === 'sky-part') {this.requireIds(1);
   const [kind, material] = id.split(':') as [SkyPartKind, SkyMaterial];
   if (!Object.hasOwn(PART_HALF, kind) || !Object.hasOwn(MATERIAL_MASS, material)) throw new Error('部品と素材を選んでください');
   if (this.state.parts.length >= SKY_LIMITS.parts) throw new Error('部品はルーム内64個までです');
   const part: SkyPart = {id: this.nextId, kind, material, position: this.destination(target, context), rotation: 0, q:yawQuaternion(0),angularVelocity:zero(),sleeping:false, velocity: zero(), mass: MATERIAL_MASS[material] * PART_COST[kind], links: [], epoch: 0, creator: owner, shared: false, ...(kind === 'battery' ? {energy: 0} : {}), enabled: false};
   this.requireClear([part], context); this.spend({[MATERIAL_ITEM[material]]: PART_COST[kind]}, context.inventory);
   this.nextId++; this.state.parts.push(part); return {message: '創作部品を作りました'};
  }
  if (action === 'sky-rebuild') {this.requireIds(SKY_LIMITS.assembly);
   const blueprint = this.state.blueprints.find(p => p.id === Number(id) && p.owner === owner); if (!blueprint) throw new Error('自分の設計を選んでください');
   if (this.state.parts.length + blueprint.parts.length > SKY_LIMITS.parts) throw new Error('部品の上限を超えます');
   const at = this.destination(target, context), start = this.nextId, cost: Record<string, number> = {};
   const parts = blueprint.parts.map((p, i): SkyPart => { const item = MATERIAL_ITEM[p.material]; cost[item] = (cost[item] ?? 0) + PART_COST[p.kind]; return {id: start + i, kind: p.kind, material: p.material, position: {x: at.x + p.offset.x, y: at.y + p.offset.y, z: at.z + p.offset.z}, rotation: p.rotation,q:p.q?{...p.q}:yawQuaternion(p.rotation),angularVelocity:zero(),sleeping:false, velocity: zero(), mass: MATERIAL_MASS[p.material] * PART_COST[p.kind], links: p.links.map(index => start + index), epoch: 0, creator: owner, shared: false, ...(p.kind === 'battery' ? {energy: 0} : {}), enabled: false}; });
   this.requireClear(parts, context); this.spend(cost, context.inventory); this.nextId += parts.length; this.state.parts.push(...parts);
   return {message: '設計帳から構造物を再建しました'};
  }
  const numericId = Number(id.split(':')[0]); if (!Number.isSafeInteger(numericId) || numericId < 1) throw new Error('対象の部品を選んでください');
  const root = this.part(numericId);
  if (action === 'sky-release') { if (this.leases.get(root.id)?.owner !== owner) throw new Error('この部品を操作していません'); this.release(owner); return {message: '部品を放しました'}; }
  this.reachable(root, context);
  if(action==='sky-store'||action==='sky-take'){
   const parts=this.group(root.id);assertCampRange(root,context);this.assertAvailable(owner,parts,false);
   if(parts.some(p=>!Number.isSafeInteger(p.epoch+1)))throw Error('部品の履歴が上限に達しました');
   transferCargo(this.state,root,owner,action==='sky-store'?'store':'take',id,context);this.invalidate(parts);
   return {message:action==='sky-store'?'移動倉庫へ預けました。荷物の重さが乗り物に加わります':'移動倉庫から取り出しました'};
  }
  if(action==='sky-camp'){
   assertCampRange(root,context);const parts=this.group(root.id);this.assertAvailable(owner,parts,false);
   if(parts.some(p=>this.leases.has(p.id))||context.canRest===false||!campArrival(owner,root,parts,this.state.parts,context))throw Error('地上に停めた安全な移動拠点で、収納・板・寝床を接着してください。動力を止め、敵・水・障害物から離してください');
   if(!Object.hasOwn(this.state.camps??{},owner)&&Object.keys(this.state.camps??{}).length>=CAMP_LIMITS.players)throw Error('移動拠点の利用記録が上限です');
   this.state.camps??={};this.state.camps[owner]=root.id;
   return {message:'移動拠点の寝床を登録しました。安全に停車している時だけ復活できます。時刻や体力は変わりません'};
  }
  if(action==='sky-share'){if(root.creator!==owner)throw new Error('作成者だけが解体共有を変更できます');const mode=id.split(':')[1];if(mode!=='on'&&mode!=='off')throw new Error('共有をon/offで選んでください');const parts=this.group(root.id);this.assertAvailable(owner,parts,false);if(mode==='off'&&(root.kind==='storage'||root.kind==='bed')&&parts.some(p=>p.creator&&p.creator!==owner))throw Error('他の作成者の部品から接着を外してから専用にしてください');if(parts.some(p=>!Number.isSafeInteger(p.epoch+1)))throw Error('部品の履歴が上限に達しました');root.shared=mode==='on';this.invalidate(parts);return {message:root.shared?'仲間による使用と解体を許可しました':'作成者だけが使用と解体できます'};}
  if (action === 'sky-ride') {
   if (root.kind !== 'seat') throw new Error('搭乗席を選んでください');
   if (this.riders.get(owner) === root.id) {
    const exit = this.dismount(root, context); this.riders.delete(owner); this.controls.delete(owner); this.lastSafeSeat.delete(owner); return {message: '安全な場所へ降りました', exit};
   }
   if ([...this.riders.values()].includes(root.id)) throw new Error('この席には冒険者がいます');
   const parts = this.group(root.id);this.assertCampOwnership(owner,parts);
   if (parts.some(p => this.leases.has(p.id)||this.tows.has(p.id)) || [...this.recalls.values()].some(r => r.ids.includes(root.id))) throw new Error('操作中の構造物には乗れません');
   if ([...this.leases.values()].some(lease => lease.owner === owner) || this.recalls.has(owner)) throw new Error('操作中の部品を放してから搭乗してください');
   if (!this.mountClear(owner, root, context)) throw new Error('搭乗席の上が塞がれています');
   this.lastSafeSeat.set(owner,{...context.player});this.riders.set(owner, root.id); return {message: '搭乗しました。移動入力で操縦します'};
  }
  if (action === 'sky-element') {
   if (root.kind !== 'emitter' || !['fire','frost','shock'].includes(id.split(':')[1])) throw new Error('放射器の火・霜・電気を選んでください');
   this.assertAvailable(owner, this.group(root.id)); root.element = id.split(':')[1] as SkyElement; return {message: '放射器の属性を変更しました'};
  }
  if (action === 'sky-toggle' || action === 'sky-charge') {
   const parts = this.group(root.id);this.assertCampOwnership(owner,parts);
   if (parts.some(p => this.leases.has(p.id) && this.leases.get(p.id)!.owner !== owner) || [...this.recalls.values()].some(r => r.ids.includes(root.id))) throw new Error('別の操作が進行しています');
   if (action === 'sky-charge') {
    if (root.kind !== 'battery' || (root.energy ?? 0) > (context.energyCapacity??100)-25) throw new Error(`電池は残量${(context.energyCapacity??100)-25}以下のとき充電できます`);
    this.spend({resin: 1}, context.inventory); root.energy = (root.energy ?? 0) + 25; return {message: '樹脂1個で電池を25充電しました'};
   }
   if (!['switch','wheel','thruster','sail','lamp','emitter'].includes(root.kind)) throw new Error('作動する装置を選んでください');
   root.enabled = !root.enabled;
   if (root.kind === 'switch') for (const part of parts) if (['wheel','thruster','sail','lamp','emitter'].includes(part.kind)) part.enabled = root.enabled;
   return {message: root.enabled ? '装置を作動しました' : '装置を停止しました'};
  }
  if (action === 'sky-grab') {
   const parts = this.group(root.id); if(parts.some(p=>p.anchored))throw new Error('固定された試練設備は掴めません'); this.assertAvailable(owner, parts);
   if ([...this.leases.entries()].some(([key, lease]) => lease.owner === owner && !parts.some(p => p.id === key))) throw new Error('今の部品を放してから掴んでください');
   this.lease(owner, parts, context.tick); for (const part of parts){part.velocity=zero();part.angularVelocity=zero();} return {message: '組み手で掴みました'};
  }
  if (action === 'sky-recall') {
   const parts = this.group(root.id); if(parts.some(p=>p.anchored))throw new Error('固定された試練設備は掴めません'); this.assertAvailable(owner, parts);
   if (this.recalls.has(owner) || [...this.leases.entries()].some(([key, lease]) => lease.owner === owner && !parts.some(p => p.id === key))) throw new Error('操作できる構造物は一つです');
   const frames = (this.history.get(root.id) ?? []).filter(frame => frame.epoch === root.epoch).map(frame => ({tick: frame.tick, poses: new Map(parts.map(part => [part.id, this.history.get(part.id)?.find(p => p.tick === frame.tick && p.epoch === part.epoch)]).filter((entry): entry is [number, HistoryFrame] => !!entry[1]))})).filter(frame => frame.poses.size === parts.length).reverse();
   if (frames.length < 2) throw new Error('戻せる軌跡がまだありません');
   this.lease(owner, parts, context.tick); this.recalls.set(owner, {starts: new Map(parts.map(p => [p.id, {...p.position}])), owner, frames, ids: parts.map(p => p.id)}); return {message: '物体の軌跡を戻しています'};
  }
  if (action === 'sky-blueprint') {this.requireIds(1);
   const parts = this.group(root.id), name = id.slice(id.indexOf(':') + 1).trim(); this.assertAvailable(owner, parts);
   if (!id.includes(':') || !name || name.length > 40 || this.state.blueprints.filter(b => b.owner === owner).length >= SKY_LIMITS.blueprints) throw new Error('40文字以内の名前を付けてください。設計は16件までです');
   this.state.blueprints.push({id: this.nextId++, owner, name, parts: parts.map(p => ({kind: p.kind, material: p.material, offset: {x: p.position.x - root.position.x, y: p.position.y - root.position.y, z: p.position.z - root.position.z}, rotation: p.rotation,q:{...orientation(p)}, links: p.links.map(key => parts.findIndex(v => v.id === key))}))});
   return {message: '設計帳に保存しました'};
  }
  const parts = this.owned(owner, root.id, context.tick);
  if(action==='sky-throw'){
   const length=Math.hypot(aim.x,aim.y,aim.z);if(!finiteVec(aim)||!Number.isFinite(length)||length<.1)throw Error('投げる方向を照準で選んでください');
   const force=Math.min(60,parts.reduce((n,p)=>n+p.mass,0)*6);impulse(parts,{x:aim.x/length*force,y:aim.y/length*force,z:aim.z/length*force},root.position);this.release(owner);return{message:'保持していた部品を投げました。重い構造物ほど初速が小さくなります'};
  }
  if(action==='sky-upright'){
   const rootQ=orientation(root),upright=yawQuaternion(root.rotation),relative=multiply(upright,inverse(rootQ)),center=massProperties(parts).center;
   const final=parts.map(p=>{const q=multiply(relative,orientation(p)),offset=rotate({x:p.position.x-center.x,y:p.position.y-center.y,z:p.position.z-center.z},relative);return{...p,q,rotation:heading(q),position:{x:center.x+offset.x,y:center.y+offset.y+.3,z:center.z+offset.z},velocity:zero(),angularVelocity:zero()};});
   // Preview every fixed angular increment; never teleport an overturned assembly through a wall.
   for(let i=1;i<=36;i++){const t=i/36,q=multiply(yawQuaternion(root.rotation),inverse(rootQ));const sign=q.w<0?-1:1,blended={x:q.x*sign*t,y:q.y*sign*t,z:q.z*sign*t,w:1+(q.w*sign-1)*t},n=Math.hypot(blended.x,blended.y,blended.z,blended.w);const turn={x:blended.x/n,y:blended.y/n,z:blended.z/n,w:blended.w/n};const poses=parts.map(p=>{const orientationQ=multiply(turn,orientation(p)),offset=rotate({x:p.position.x-center.x,y:p.position.y-center.y,z:p.position.z-center.z},turn);return{...p,q:orientationQ,rotation:heading(orientationQ),position:{x:center.x+offset.x,y:center.y+offset.y+.3*t,z:center.z+offset.z}};});this.requireClear(poses,context);}
   this.applyPoses(final);this.invalidate(parts);this.lease(owner,parts,context.tick);return{message:'姿勢を起こしました。部品を放して接地を確認してください'};
  }
  if (action === 'sky-move') {
   const position = this.destination(target, context), rotation = Math.hypot(aim.x, aim.z) > .01 ? Math.round(Math.atan2(aim.x, aim.z) / (Math.PI / 12)) * Math.PI / 12 : root.rotation;
   const steps = Math.max(1, Math.ceil(distance(root.position, position) / .125), Math.ceil(Math.abs(yaw(rotation - root.rotation)) / (Math.PI / 24)));
   let poses = parts;
   for (let i = 1; i <= steps; i++) { const t = i / steps; poses = this.assemblyPoses(parts, root, {x: root.position.x + (position.x - root.position.x) * t, y: root.position.y + (position.y - root.position.y) * t, z: root.position.z + (position.z - root.position.z) * t}, root.rotation + yaw(rotation - root.rotation) * t); this.requireClear(poses, i===steps?context:{...context,protected:undefined}); }
   for(const pose of poses){const part=this.part(pose.id);part.carried=Math.min(1000000,(part.carried??0)+distance(part.position,pose.position));}
   this.applyPoses(poses); this.lease(owner,parts,context.tick); return {message: '部品の位置と向きを調整しました'};
  }
  if (action === 'sky-glue') {
   const other = this.part(Number(id.split(':')[1])), more = this.group(other.id); this.reachable(other, context); this.assertAvailable(owner, more);
   const campParts=[...parts,...more].filter(p=>p.kind==='bed'||p.kind==='storage');if(campParts.length&&[...parts,...more].some(p=>p.creator&&p.creator!==owner&&!p.shared))throw Error('移動拠点へ接着する他の作成者の部品は共有の許可が必要です');
   if(campParts.some(p=>!p.shared)&&[...parts,...more].some(p=>p.creator&&p.creator!==owner))throw Error('別の作成者の構造物につなぐ移動拠点の部品は、先に共有してください');
   if([...parts,...more].some(p=>p.wrecked))throw Error('残骸を回収して新しい収納を作ってください');
   if(more.some(p=>p.anchored))throw new Error('固定された試練足場には接着できません');
   if (parts.some(p => p.id === other.id)) throw new Error('既に接着されています');
   if (parts.length + more.length > SKY_LIMITS.assembly) throw new Error('一つの構造物は16部品までです');
   const half = PART_HALF[root.kind], otherHalf = PART_HALF[other.kind]; let close = false;
   for (let x = -half.x; x <= half.x; x += .125) for (let y = -half.y; y <= half.y; y += .125) for (let z = -half.z; z <= half.z; z += .125) {
    const p = partLocal(partWorld({x,y,z},root),other);
    if (Math.hypot(Math.max(0, Math.abs(p.x) - otherHalf.x), Math.max(0, Math.abs(p.y) - otherHalf.y), Math.max(0, Math.abs(p.z) - otherHalf.z)) <= .2) close = true;
   }
   if (!close) throw new Error('接着する部品を近づけてください');
   root.links.push(other.id); other.links.push(root.id); const combined = [...parts, ...more]; this.invalidate(combined); this.lease(owner, combined, context.tick); return {message: '部品を接着しました。以前の軌跡を破棄しました'};
  }
  if (action === 'sky-salvage') {
   if(hasCargo(this.state,root.id))throw Error('解体する前に移動倉庫を空にしてください');
   if(root.creator&&root.creator!==owner&&!root.shared)throw new Error('この部品の解体は作成者が許可する必要があります');
   if(parts.some(p=>!Number.isSafeInteger(p.epoch+1)))throw Error('部品の履歴が上限に達しました');
   const drops=[{id:MATERIAL_ITEM[root.material],count:root.trial||root.loan?0:Math.floor(PART_COST[root.kind]*(root.integrity??100)/100),point:{x:Math.max(context.bounds.minX+1,Math.min(context.bounds.maxX-1,root.position.x)),y:Math.max(context.bounds.minY+1,Math.min(context.bounds.maxY-1,root.position.y)),z:Math.max(context.bounds.minZ+1,Math.min(context.bounds.maxZ-1,root.position.z))}}].filter(drop=>drop.count>0);
   // Planning and ID/capacity checks happen while the intact source remains authoritative.
   // The synchronous drop commit is followed only by in-memory, non-fallible graph deletion.
   const commit=drops.length?context.prepareDrops?.(drops):undefined;commit?.();
   for (const part of parts) part.links = part.links.filter(key => key !== root.id);
   this.state.parts = this.state.parts.filter(part => part.id !== root.id);this.removeCampRecords(new Set([root.id])); this.history.delete(root.id); this.invalidate(parts.filter(p => p.id !== root.id)); this.release(owner);
   return {message:'部品を解体し、素材を地面へ戻しました',drops:commit?[]:drops};
  }
  if (action === 'sky-unglue') { for (const key of root.links) { const other = this.part(key); other.links = other.links.filter(key => key !== root.id); } root.links = []; this.invalidate(parts); this.release(owner); return {message: '接着を外しました'}; }
  throw new Error('能力の操作が不正です');
 }
 private supportSolid(point:Vec3,context:SkyContext):boolean { return context.solid(point)||this.state.parts.some(part=>part.anchored&&this.contains(part,point)); }
 private hasCeiling(from: Vec3, exit: Vec3, context: SkyContext): boolean { for (let y = from.y + 1.7; y < exit.y; y += .125) if (this.supportSolid({x: from.x, y, z: from.z},context)) return true; return false; }
 private exitClear(exit: Vec3, context: SkyContext): boolean {
  if (!insideBounds(exit, context.bounds, .4) || exit.y + 1.8 >= context.bounds.maxY) return false;
  for (const x of [-.28, 0, .28]) for (const z of [-.28, 0, .28]) {
   if (!this.supportSolid({x: exit.x + x, y: exit.y - .04, z: exit.z + z},context)) return false;
   for (let y = .04; y < 1.8; y += .1) { const p = {x: exit.x + x, y: exit.y + y, z: exit.z + z}; if (context.solid(p) || context.occupied?.(p) || context.protected?.(p) || this.state.parts.some(part => this.contains(part, p, .05))) return false; }
  }
  return !context.actors.some(a => distance(a.position, context.player) > .01 && Math.hypot(a.position.x - exit.x, a.position.z - exit.z) < .65 && Math.abs(a.position.y - exit.y) < 1.7);
 }
 private findExit(context: SkyContext): Vec3 {
  for (let y = Math.ceil((context.player.y + 1.8) * 8) / 8; y <= Math.min(context.player.y + 12, context.bounds.maxY - 2); y += .125) {
   const x=context.player.x,z=context.player.z;
   if(this.supportSolid({x,y,z},context)||!this.supportSolid({x,y:y-.125,z},context))continue;
   let low=y-.125,high=y;for(let i=0;i<8;i++){const mid=(low+high)/2;if(this.supportSolid({x,y:mid,z},context))low=mid;else high=mid;}
   const exit={x,y:high+.01,z};if(this.exitClear(exit,context)&&this.hasCeiling(context.player,exit,context))return exit;
  }
  throw new Error('真上に安全な出口が見つかりません');
 }
 private contact(part:SkyPart,tick:number,position:Vec3,strength:number,kind:SkyContactEvent['kind']='collision'):void{
  if(kind==='collision'&&(strength<1||tick<(this.contactTicks.get(part.id)??-Infinity)+12))return;
  if(this.contactEvents.filter(e=>e.tick===tick).length>=16)return;
  this.contactTicks.set(part.id,tick);this.contactEvents.push({id:`contact:${this.contactEpoch}:${tick}:${this.contactSequence++}`,tick,part:part.id,position:{...position},material:part.material,strength:Math.min(12,strength),kind});
  while(this.contactEvents.length>64)this.contactEvents.shift();
 }
 private effect(effects: SkyEffect[], context: SkyContext, source: SkyPart, owner: string, element: SkyElement, origin: Vec3, direction: Vec3, range: number, radius: number, damage: number): void {
  if (this.effectTick !== context.tick) { this.effectTick = context.tick; this.effectsIssued = 0; }
  if (effects.length >= ENVIRONMENT_LIMITS.effectsPerTick || this.effectsIssued >= ENVIRONMENT_LIMITS.effectsPerTick) return;
  this.effectsIssued++;
  effects.push({id: `sky:${context.tick}:${this.effectSequence++}`, tick: context.tick, sourcePart: source.id, owner, element, origin: {...origin}, direction: {...direction}, range, radius, damage, targets: 'enemies'});
 }
 /** External authoritative hits can affect a part; they never mutate player inventories or health. */
 affect(id: number, element: SkyElement, amount: number, context: SkyContext, owner = 'host'): SkyEffect[] {
  if (!['fire','frost','shock'].includes(element) || !Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error('属性反応が不正です');
  const effects: SkyEffect[] = []; this.react(id, element, amount, context, effects, owner); return effects;
 }
 private elementVisible(from:Vec3,to:Vec3,context:SkyContext):boolean{const n=Math.ceil(distance(from,to)/.125);for(let i=1;i<n;i++){const p={x:from.x+(to.x-from.x)*i/n,y:from.y+(to.y-from.y)*i/n,z:from.z+(to.z-from.z)*i/n};if(context.solid(p)||context.occupied?.(p))return false;}return true;}
 private react(id: number, element: SkyElement, amount: number, context: SkyContext, effects: SkyEffect[], owner: string): void {
  const pending = [id], seen = new Set<number>();
  while (pending.length && seen.size < ENVIRONMENT_LIMITS.chainParts) {
   const next = pending.shift()!; if (seen.has(next)) continue; seen.add(next);
   const part = this.part(next);if((part.trial||part.loan)&&part.anchored&&part.kind==='slab')continue;const wet = (part.wet ?? 0) > 0 || (context.immersion?.(part.position) ?? 0) > .05;
   if (element === 'fire') {
    if(!wet)part.heated=true;
    if (wet) { part.burning = 0; part.wet = Math.max(0, (part.wet ?? 0) - amount * .1); continue; }
    if ((part.frozen ?? 0) > 0) { part.frozen = Math.max(0, part.frozen! - amount * .5); continue; }
    if(part.kind==='battery'&&(part.energy??0)>=10){const energy=part.energy!;part.energy=0;this.contact(part,context.tick,part.position,Math.min(12,energy/5),'explosion');part.integrity=Math.max(0,(part.integrity??100)-20);this.effect(effects,context,part,owner,'fire',part.position,zero(),0,3,Math.min(24,8+energy*.16));
     for(const other of this.state.parts.slice().sort((a,b)=>a.id-b.id))if(!seen.has(other.id)&&distance(other.position,part.position)<=3&&pending.length<ENVIRONMENT_LIMITS.chainParts&&this.elementVisible(part.position,other.position,context))pending.push(other.id);
    }
    if (part.material === 'wood') part.burning = Math.max(part.burning ?? 0, 6);
    part.integrity = Math.max(0, (part.integrity ?? 100) - amount * .2);
   } else if (element === 'frost') {
    part.burning = 0; part.frozen = Math.max(part.frozen ?? 0, wet ? 7 : 4); part.velocity = zero();
   } else {
    const conductive = wet || part.material === 'metal' || part.kind === 'battery';
    if (!conductive) continue;
    part.integrity = Math.max(0, (part.integrity ?? 100) - amount * .1);
    this.effect(effects, context, part, owner, 'shock', part.position, zero(), 0, 1.2, amount);
    for (const linked of part.links) { const other = this.part(linked); if (!seen.has(linked) && (other.material === 'metal' || (other.wet ?? 0) > 0 || other.kind === 'battery')) pending.push(linked); }
   }
  }
 }
 private environment(dt: number, context: SkyContext, effects: SkyEffect[]): void {
  let spread = 0; const burning = new Set(this.state.parts.filter(p => (p.burning ?? 0) > 0).map(p => p.id));
  for (const part of this.state.parts) {
   if((part.trial||part.loan)&&part.anchored&&part.kind==='slab'){part.integrity=100;part.burning=0;part.frozen=0;}
   const immersed = (context.immersion?.(part.position) ?? 0) > .05;
   part.integrity ??= 100; part.wet = immersed ? 5 : Math.max(0, (part.wet ?? 0) - dt);
   // Water wins over ignition; warmth thaws; object histories contain none of these fields.
   if (part.wet > 0) part.burning = 0;
   if(part.wet>0&&(context.temperature?.(part.position)??10)<0&&!part.anchored)part.frozen=Math.max(part.frozen??0,2);
   part.frozen = Math.max(0, (part.frozen ?? 0) - dt * ((context.temperature?.(part.position) ?? 10) > 20 ? 2 : 1));
   if ((part.burning ?? 0) > 0) {
    part.burning = Math.max(0, part.burning! - dt); part.integrity = Math.max(0, part.integrity - dt * 6);
    if(burning.has(part.id)&&context.tick%15===0){const wind=context.wind?.(part.position)??zero(),windSpeed=Math.hypot(wind.x,wind.z),downwind=windSpeed>.2?this.state.parts.filter(p=>p.id!==part.id&&distance(p.position,part.position)<2&&(p.position.x-part.position.x)*wind.x+(p.position.z-part.position.z)*wind.z>.4&&this.elementVisible(part.position,p.position,context)).map(p=>p.id):[];
    for (const linked of new Set([...part.links,...downwind])) {
     if (spread >= ENVIRONMENT_LIMITS.spreadPerTick) break;
     const neighbor = this.part(linked);
     if (neighbor.material === 'wood' && !(neighbor.wet ?? 0) && !(neighbor.frozen ?? 0) && !(neighbor.burning ?? 0)) { neighbor.burning = 6; spread++; }
    }}
   }
   if (part.kind === 'battery' && immersed && (part.energy ?? 0) > 0 && context.tick >= (this.shortTicks.get(part.id) ?? 0)) {
    part.energy = Math.max(0, part.energy! - 1); this.shortTicks.set(part.id, context.tick + 30); this.react(part.id, 'shock', 4, context, effects, 'host');
   }
  }
  const destroyed = new Set(this.state.parts.filter(p => (p.integrity ?? 100) <= 0 && (!p.wrecked || !hasCargo(this.state,p.id))).map(p => p.id));
  if (destroyed.size) {
   for (const id of destroyed) { const lease = this.leases.get(id); if (lease) this.release(lease.owner); }
   for (const part of this.state.parts) if (part.links.some(id => destroyed.has(id))) { part.links = part.links.filter(id => !destroyed.has(id)); this.invalidate([part]); }
   for (const [owner, seat] of this.riders) if (destroyed.has(seat)) this.release(owner);
   for (const recall of [...this.recalls.values()]) if (recall.ids.some(id => destroyed.has(id))) this.release(recall.owner);
   for (const id of destroyed) { this.history.delete(id); this.leases.delete(id); this.emissionTicks.delete(id); this.shortTicks.delete(id); }
   const retained=new Set<number>();
   for(const part of this.state.parts)if(destroyed.has(part.id)&&hasCargo(this.state,part.id)){
    // One physical, owner-protected wreck retains the same inventory and ID. No duplicated drops.
    retained.add(part.id);part.wrecked=true;part.enabled=false;part.burning=0;part.links=[];this.invalidate([part]);
   }
   const removed=new Set([...destroyed].filter(id=>!retained.has(id)));
   this.state.parts = this.state.parts.filter(p => !removed.has(p.id));this.removeCampRecords(removed);
  }
 }
 /** Fixed-budget authority integration: contacts, angular motion, power and environment. */
 step(dt: number, context: SkyContext): SkyEffect[] {
  while(this.contactEvents.length&&this.contactEvents[0].tick<context.tick-30)this.contactEvents.shift();
  for(const id of this.contactTicks.keys())if(!this.state.parts.some(p=>p.id===id))this.contactTicks.delete(id);
  this.expire(context.tick); this.powered.clear();this.metrics.activeAssemblies=0;this.metrics.contacts=0;this.metrics.dynamicContacts=0;
  if(context.terrainEdits){if(this.lastTerrainRevision<0)this.wakeAround();else for(const edit of context.terrainEdits.slice(this.lastTerrainRevision))this.wakeAround(edit.position,edit.radius);this.lastTerrainRevision=context.terrainEdits.length;}
  const effects: SkyEffect[] = []; this.environment(dt, context, effects);
  const recalled = new Set<number>();
  for (const [owner, recall] of this.recalls) {
   recall.ids.forEach(id => recalled.add(id)); const frame = recall.frames.shift();
   if (!frame) { this.release(owner); continue; }
   const parts=recall.ids.map(id=>this.part(id)),passengers=deckPassengers(parts,context.actors,new Set(this.riders.keys())),passengerIds=new Set(passengers.map(p=>p.id)),movementContext=passengers.length?{...context,actors:context.actors.filter(a=>!passengerIds.has(a.id))}:context;
   const poses = recall.ids.map(id => ({...this.part(id), ...frame.poses.get(id)!}));
   if (poses.some(p => !this.volumeClear(p, movementContext, new Set(recall.ids)))||!passengersClear(passengers,poses,this.state.parts,context)) { this.release(owner); this.invalidate(poses.map(p => this.part(p.id))); continue; }
   this.applyPoses(poses);carryPassengers(passengers,poses);
   if (!recall.frames.length) { for(const id of recall.ids){const p=this.part(id);p.recalled=Math.min(1000000,(p.recalled??0)+distance(recall.starts.get(id)!,p.position));} this.release(owner); this.invalidate(poses.map(p => this.part(p.id))); for (const id of recall.ids) {this.part(id).velocity=zero();this.part(id).angularVelocity=zero();} }
  }
  const contactSeen=new Set<number>(),contactGroups:ContactAssembly[]=[];
  for(const root of this.state.parts){if(contactSeen.has(root.id))continue;const parts=this.group(root.id);parts.forEach(p=>contactSeen.add(p.id));const unavailable=parts.some(p=>recalled.has(p.id)||this.leases.has(p.id)||this.tows.has(p.id))||!!this.driver(parts)||(context.actors.length>0&&!context.actors.some(a=>distance(a.position,root.position)<48));contactGroups.push({parts,unavailable});}
  this.metrics.dynamicContacts=transferAssemblyContacts(contactGroups,dt,(part,point,speed)=>this.contact(part,context.tick,point,speed)).contacts;
  const done = new Set<number>();
  for (const root of this.state.parts) {
   if (done.has(root.id) || recalled.has(root.id)) continue;
   const parts = this.group(root.id); parts.forEach(p => done.add(p.id));
   if (parts.some(p => this.leases.has(p.id))) continue;
   const far=context.actors.length>0&&!context.actors.some(a=>distance(a.position,root.position)<48),driver=this.driver(parts);
   // Far assemblies retain their environment/power bookkeeping below, but their
   // sleeping physics cannot use buoyancy, so do not spend the hull-query budget.
   const water=far&&!driver?{force:zero(),torque:zero(),wet:0}:assemblyBuoyancy(parts,context),wet=water.wet,velocity = {...root.velocity};
   if (parts.some(p => (p.frozen ?? 0) > 0)) { for (const p of parts) p.velocity = zero(); continue; }
   const input = driver ? this.controls.get(driver) ?? {x: 0, z: 0} : {x: 0, z: 0};
   let supports=wheelSupports(parts,context);
   const consumers = parts.filter(p => p.enabled && (['thruster','lamp','emitter'].includes(p.kind)||p.kind==='wheel'&&!!driver&&Math.abs(input.z)>.01&&supports.some(s=>s.partId===p.id))), batteries = parts.filter(p => p.kind === 'battery');
   const needed = consumers.reduce((n, p) => n + (p.kind === 'thruster' ? 3 : p.kind === 'emitter' ? 2 : p.kind==='wheel'?WHEEL_TRACTION_LIMITS.energyPerSecond:.25) * dt, 0);
   if (needed > 0 && batteries.reduce((n, p) => n + (p.energy ?? 0), 0) >= needed) {
    let left = needed; for (const battery of batteries) { const used = Math.min(left, battery.energy ?? 0); battery.energy = (battery.energy ?? 0) - used; left -= used; }
    for (const consumer of consumers) this.powered.add(consumer.id);
   }
   if(far&&!driver){for(const p of parts)p.sleeping=true;this.farSleeping.add(root.id);continue;}
   const passengers=deckPassengers(parts,context.actors,new Set(this.riders.keys())),passengerIds=new Set(passengers.map(p=>p.id)),movementContext=passengers.length?{...context,actors:context.actors.filter(a=>!passengerIds.has(a.id))}:context;
   const mass = parts.reduce((n, p) => n + p.mass, 0), thrust = parts.filter(p => p.kind === 'thruster' && this.powered.has(p.id)).length;
   const wheelContact=supports.length>0;
   if (driver && Math.abs(input.x) > .01 && (wheelContact || wet > .1)) {
    const poses = this.assemblyPoses(parts, root, root.position, root.rotation + input.x * dt * 1.3);
    if (poses.every(p => this.volumeClear(p, movementContext, new Set(parts.map(p => p.id))))&&passengersClear(passengers,poses,this.state.parts,context)) {const linear={...root.velocity},spin={...(root.angularVelocity??zero())};this.applyPoses(poses);for(const p of parts){p.velocity={...linear};p.angularVelocity={...spin};}supports=wheelSupports(parts,context);carryPassengers(passengers,parts);}
   }
   const sail = parts.filter(p => p.kind === 'sail' && p.enabled).length;
   for (const part of parts) {
    if (part.kind === 'sail' && part.enabled && wet > .1) this.powered.add(part.id);
    if (part.kind === 'emitter' && effects.length < ENVIRONMENT_LIMITS.effectsPerTick && this.powered.has(part.id) && context.tick >= (this.emissionTicks.get(part.id) ?? 0)) {
     this.emissionTicks.set(part.id, context.tick + 15);
     const direction = rotate({x:0,y:0,z:1},orientation(part));
     const origin = {x: part.position.x + direction.x * .6, y: part.position.y+direction.y*.6, z: part.position.z + direction.z * .6};
     let range = 6, hit: SkyPart | undefined;
     for (let d = .125; d <= 6; d += .125) { const point = {x: origin.x + direction.x * d, y: origin.y+direction.y*d, z: origin.z + direction.z * d}; if (context.solid(point) || context.occupied?.(point)) { range = d; break; } hit = this.state.parts.find(p => p.id !== part.id && this.contains(p, point)); if (hit) { range = d; break; } }
     this.effect(effects, context, part, driver ?? 'host', part.element ?? 'fire', origin, direction, range, .15, 6);
     if (hit) this.react(hit.id, part.element ?? 'fire', 6, context, effects, driver ?? 'host');
    }
   }
   for(const thruster of parts.filter(p=>p.kind==='thruster'&&this.powered.has(p.id))){const force=rotate({x:0,y:0,z:55*(driver?-input.z:1)*dt},orientation(thruster));impulse(parts,force,thruster.position);}
   const motor=wheelDriveWrench(parts,supports,this.powered,input.z,!!driver);if(motor.driven.length)wrench(parts,scale(motor.force,dt),scale(motor.torque,dt));
   if(wet>0)wrench(parts,scale(water.force,dt),scale(water.torque,dt));
   if(thrust||motor.driven.length||wet>0)Object.assign(velocity,root.velocity);
   const wind=context.wind?.(root.position)??{x:Math.sin(context.tick/1800),y:0,z:Math.cos(context.tick/1800)};
   velocity.x += (wet>.1?wind.x*sail*10/mass:0)*dt;
   velocity.z += (wet>.1?wind.z*sail*10/mass:0)*dt;
   const drag = Math.exp(-dt * (wet > .1 ? .8 : wheelContact ? .3 : .15)); velocity.x *= drag; velocity.z *= drag;
   const horizontal = Math.hypot(velocity.x, velocity.z); if (horizontal > 8) { velocity.x *= 8 / horizontal; velocity.z *= 8 / horizontal; }
   if(parts.some(p=>p.anchored))velocity.x=velocity.y=velocity.z=0;
   velocity.y = parts.some(p=>p.anchored)?0:Math.max(-12, velocity.y + -9.8 * dt);
   const flow=context.current?.(root.position)??zero(),movingWater=wet>.1&&Math.hypot(flow.x,flow.z)>.1;
   if(movingWater){velocity.x+=(flow.x-velocity.x)*Math.min(1,wet*dt*3);velocity.z+=(flow.z-velocity.z)*Math.min(1,wet*dt*3);}
   const nearWake=this.farSleeping.delete(root.id);
   if(thrust||movingWater||driver||nearWake)for(const p of parts)p.sleeping=false;
   if(parts.every(p=>p.sleeping))continue;
   this.metrics.activeAssemblies++;
   const ignore=new Set(parts.map(p=>p.id)),neighbors=this.state.parts.filter(p=>!ignore.has(p.id));
   const solid=(point:Vec3)=>context.solid(point)||!!context.occupied?.(point)||!!context.protected?.(point)||neighbors.some(p=>this.contains(p,point));
   const result=stepRigid(parts,velocity,dt,context,solid,poses=>poses.every(p=>this.volumeClear(p,movementContext,ignore))&&passengersClear(passengers,poses,this.state.parts,context));this.metrics.contacts+=result.contacts;if(result.contacts)this.contact(root,context.tick,root.position,Math.hypot(velocity.x-root.velocity.x,velocity.y-root.velocity.y,velocity.z-root.velocity.z));carryPassengers(passengers,parts);
   const resting=result.supported&&parts.every(p=>Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z)<.06&&Math.hypot(p.angularVelocity?.x??0,p.angularVelocity?.y??0,p.angularVelocity?.z??0)<.06)&&!thrust&&!driver;
   const quiet=resting?(this.quiet.get(root.id)??0)+1:0;this.quiet.set(root.id,quiet);if(quiet>=60)for(const p of parts){p.sleeping=true;p.velocity=zero();p.angularVelocity=zero();}
   for (const actor of context.actors) { const seatId=this.riders.get(actor.id),seat=parts.find(p=>p.id===seatId);if(!seat)continue;
    if(rotate({x:0,y:1,z:0},orientation(seat)).y<.4||!this.mountClear(actor.id,seat,context)){
     try{const exit=this.dismount(seat,context);Object.assign(actor.position,exit,{vy:0,grounded:true});this.release(actor.id);}catch{const safe=this.safeEjection(actor.id,seat,parts,context);if(safe){Object.assign(actor.position,safe,{vy:0,grounded:false});this.release(actor.id);}else this.controls.set(actor.id,{x:0,z:0});}
    }else{Object.assign(actor.position,this.seatPosition(seat));this.lastSafeSeat.set(actor.id,{...actor.position});}
   }
  }
  for (const part of this.state.parts) if (!recalled.has(part.id)&&!part.sleeping) {
   const frames = this.history.get(part.id) ?? []; frames.push({tick: context.tick, epoch: part.epoch, position: {...part.position}, rotation: part.rotation,q:{...orientation(part)},angularVelocity:{...(part.angularVelocity??zero())}, velocity: {...part.velocity}});
   while (frames.length && frames[0].tick < context.tick - SKY_LIMITS.historyTicks) frames.shift(); this.history.set(part.id, frames);
  }
  for(const [id,frames]of this.history){while(frames.length&&frames[0].tick<context.tick-SKY_LIMITS.historyTicks)frames.shift();if(!frames.length)this.history.delete(id);}
  this.metrics.sleepingParts=this.state.parts.filter(p=>p.sleeping).length;this.metrics.historyFrames=[...this.history.values()].reduce((n,frames)=>n+frames.length,0);
  return effects;
 }
 /** Transient exclusive towing claim; inventory, health and poses are never changed here. */
 towParts(owner:string,id:number):SkyPart[]{
  const parts=this.group(id);
  if(parts.length>8||parts.reduce((n,p)=>n+p.mass,0)>60)throw new Error('手綱は8部品・質量60までの小構造物用です');
  if(parts.some(p=>p.anchored||p.trial||p.creator&&p.creator!==owner&&!p.shared))throw new Error('固定設備や他の冒険者の私物は牽引できません');
  if(parts.some(p=>this.leases.has(p.id)||this.tows.has(p.id)&&this.tows.get(p.id)!==owner)||[...this.riders.values()].some(id=>parts.some(p=>p.id===id))||[...this.recalls.values()].some(r=>r.ids.some(id=>parts.some(p=>p.id===id))))throw new Error('操作・搭乗中の構造物は牽引できません');
  return parts;
 }
 setTow(owner:string,id?:number):void{const parts=id===undefined?[]:this.towParts(owner,id);for(const [key,value]of this.tows)if(value===owner)this.tows.delete(key);for(const p of parts)this.tows.set(p.id,owner);}
 wakeAround(point?:Vec3,radius=0):void {for(const p of this.state.parts)if(!point||distance(p.position,point)<radius+Math.hypot(PART_HALF[p.kind].x,PART_HALF[p.kind].y,PART_HALF[p.kind].z)+1)for(const child of this.group(p.id)){child.sleeping=false;this.quiet.delete(child.id);}}
 applyImpulse(id:number,force:Vec3,point?:Vec3):void {if(!finiteVec(force)||Math.hypot(force.x,force.y,force.z)>10000)throw new Error('力が不正です');const parts=this.group(id);impulse(parts,force,point??this.part(id).position);this.wakeAround(this.part(id).position,4);}
 /** Recreates only authored loaned parts; no inventory refund or custom part deletion. */
 resetTrial(trial: number, templates: SkyTrialTemplate[], context: SkyContext): number[] {
  if(!Number.isInteger(trial)||trial<825001||trial>825007||!templates.length||templates.length>16)throw new Error('試練の部品定義が不正です');
  const old=this.state.parts.filter(p=>p.trial===trial),oldIds=new Set(old.map(p=>p.id));
  if(old.some(p=>this.leases.has(p.id))||[...this.riders.values()].some(id=>oldIds.has(id)))throw new Error('仲間が試練の部品を操作中です。放してから初期化してください');
  if(this.state.parts.length-old.length+templates.length>SKY_LIMITS.parts)throw new Error('部品上限です。自作部品を解体して空きを作ってください');
  this.requireIds(templates.length);const start=this.nextId,parts:SkyPart[]=templates.map((t,i)=>({id:start+i,kind:t.kind,material:t.material,position:{...t.position},rotation:t.rotation??0,q:yawQuaternion(t.rotation??0),angularVelocity:zero(),sleeping:false,velocity:zero(),mass:MATERIAL_MASS[t.material]*PART_COST[t.kind],links:t.links.map(j=>start+j),epoch:0,trial,anchored:t.anchored??false,enabled:false,...(t.kind==='battery'?{energy:t.energy??0}:{}),...(t.frozen?{frozen:t.frozen}:{})}));
  this.requireClear(parts,context,new Set([...oldIds,...parts.map(p=>p.id)]));
  for(const p of this.state.parts)if(!oldIds.has(p.id)&&p.links.some(id=>oldIds.has(id))){p.links=p.links.filter(id=>!oldIds.has(id));this.invalidate([p]);}
  for(const p of old){this.history.delete(p.id);this.emissionTicks.delete(p.id);this.shortTicks.delete(p.id);}
  this.state.parts=this.state.parts.filter(p=>!oldIds.has(p.id));this.state.parts.push(...parts);this.nextId+=parts.length;
  return parts.map(p=>p.id);
 }
 /** Recreate only a site's loan set. A reset never refunds inventory or edits custom terrain. */
 resetSiteLoan(site:number,templates:SkyTrialTemplate[],context:SkyContext):number[]{
  if(![850001,850002,850003].includes(site)||!templates.length||templates.length>6)throw new Error('拠点貸出品が不正です');
  const old=this.state.parts.filter(p=>p.loan?.site===site),oldIds=new Set(old.map(p=>p.id));
  if(old.some(p=>this.leases.has(p.id)||this.tows.has(p.id))||[...this.riders.values()].some(id=>oldIds.has(id)))throw new Error('貸出品の操作・搭乗・牽引を終えてください');
  if(this.state.parts.length-old.length+templates.length>SKY_LIMITS.parts)throw new Error('貸出品を戻す部品枠を空けてください');
  this.requireIds(templates.length);const start=this.nextId,parts:SkyPart[]=templates.map((t,i)=>({id:start+i,kind:t.kind,material:t.material,position:{...t.position},rotation:t.rotation??0,q:yawQuaternion(t.rotation??0),angularVelocity:zero(),sleeping:false,velocity:zero(),mass:MATERIAL_MASS[t.material]*PART_COST[t.kind],links:t.links.map(j=>start+j),epoch:0,loan:{site,role:site===850001?'cargo':'device'},anchored:t.anchored??false,enabled:false,...(t.kind==='battery'?{energy:t.energy??0}:{}),...(t.frozen?{frozen:t.frozen}:{})}));
  this.requireClear(parts,context,new Set([...oldIds,...parts.map(p=>p.id)]));
  for(const p of this.state.parts)if(!oldIds.has(p.id)&&p.links.some(id=>oldIds.has(id))){p.links=p.links.filter(id=>!oldIds.has(id));this.invalidate([p]);}
  for(const p of old){this.history.delete(p.id);this.emissionTicks.delete(p.id);this.shortTicks.delete(p.id);}
  this.state.parts=this.state.parts.filter(p=>!oldIds.has(p.id));this.state.parts.push(...parts);this.nextId+=parts.length;return parts.map(p=>p.id);
 }
 private removeCampRecords(ids: ReadonlySet<number>): void {
  for(const id of ids){if(this.state.storage)delete this.state.storage[id];if(this.state.storageGear)delete this.state.storageGear[id];}
  for(const [owner,id]of Object.entries(this.state.camps??{}))if(ids.has(id))delete this.state.camps![owner];
 }
 /** Called at the actual respawn tick, never at save/load time. Unsafe moving camps return no position. */
 campRespawn(owner: string, context: SkyContext): Vec3 | undefined {
  const id=this.state.camps?.[owner],bed=this.state.parts.find(p=>p.id===id&&p.kind==='bed');if(!bed)return;
  const parts=this.group(bed.id);
  if(parts.some(p=>this.leases.has(p.id)||this.tows.has(p.id))||[...this.riders.values()].some(id=>parts.some(p=>p.id===id))||[...this.recalls.values()].some(r=>r.ids.some(id=>parts.some(p=>p.id===id))))return;
  return campArrival(owner,bed,parts,this.state.parts,context);
 }
 private driver(parts: SkyPart[]): string | undefined {
  const seats = parts.filter(p => p.kind === 'seat').sort((a, b) => a.id - b.id);
  for (const seat of seats) { const rider = [...this.riders].find(([, id]) => id === seat.id); if (rider) return rider[0]; }
  return undefined;
 }
 /** Returns true when the normal character motor should be skipped for this tick. */
 drive(owner: string, input: {x: number; z: number}, player: Vec3 & {heading: number; vy: number; grounded: boolean}): boolean {
  const id = this.riders.get(owner); if (id === undefined) return false;
  const seat = this.state.parts.find(p => p.id === id); if (!seat) { this.release(owner); return false; }
  this.controls.set(owner, {x: Math.max(-1, Math.min(1, Number.isFinite(input.x) ? input.x : 0)), z: Math.max(-1, Math.min(1, Number.isFinite(input.z) ? input.z : 0))});
  Object.assign(player, {...this.seatPosition(seat),heading:seat.rotation,vy:0,grounded:true});return true;
 }
 private seatPosition(seat:SkyPart):Vec3{return partWorld({x:0,y:PART_HALF.seat.y+.01,z:0},seat);}
 private mountClear(owner: string, seat: SkyPart, context: SkyContext): boolean {
  const foot=this.seatPosition(seat);
  if (context.actors.some(a => a.id !== owner && Math.hypot(a.position.x - foot.x, a.position.z - foot.z) < .65 && Math.abs(a.position.y - foot.y) < 1.7)) return false;
  for (const x of [-.28,0,.28]) for (const z of [-.28,0,.28]) for (let y = .04; y < 1.8; y += .125) {
   const point = {x: foot.x + x, y: foot.y + y, z: foot.z + z};
   if (!insideBounds(point, context.bounds, .01) || context.solid(point) || context.occupied?.(point) || context.protected?.(point) || this.state.parts.some(p => p.id !== seat.id && this.contains(p, point))) return false;
  }
  return true;
 }
 private safeEjection(owner:string,seat:SkyPart,parts:SkyPart[],context:SkyContext):Vec3|undefined {
  const top=Math.max(...parts.map(p=>p.position.y+Math.hypot(PART_HALF[p.kind].x,PART_HALF[p.kind].y,PART_HALF[p.kind].z))),previous=this.lastSafeSeat.get(owner);
  const candidates=[{x:seat.position.x,y:top+.4,z:seat.position.z},...(previous&&distance(previous,seat.position)<8?[previous]:[])];
  for(const foot of candidates){let clear=true;for(const x of [-.28,0,.28])for(const z of [-.28,0,.28])for(let y=.05;y<1.8;y+=.15){const p={x:foot.x+x,y:foot.y+y,z:foot.z+z};if(!insideBounds(p,context.bounds,.01)||context.solid(p)||context.occupied?.(p)||this.state.parts.some(part=>this.contains(part,p))||context.actors.some(a=>a.id!==owner&&Math.hypot(a.position.x-p.x,a.position.z-p.z)<.6&&p.y>=a.position.y&&p.y<a.position.y+1.5))clear=false;}if(clear)return {...foot};}
  return undefined;
 }
 private dismount(seat: SkyPart, context: SkyContext): Vec3 {
  for (const dx of [-1.25, 1.25, 0]) for (const dz of [-1.25, 1.25, 0]) {
   if (!dx && !dz) continue;
   for (let down = 0; down <= 3; down += .125) {
    const exit = {x: seat.position.x + dx, y: Math.round((seat.position.y + 1 - down) * 8) / 8, z: seat.position.z + dz};
    if (this.exitClear(exit, context)) return exit;
   }
  }
  throw new Error('安全な降車場所がありません。平らな場所へ移動してください');
 }
 collidePlayer(player: Vec3 & {crouching?:boolean;vy: number; grounded: boolean}, previousY: number): void { collideSkyPlayer(this.state.parts,player,previousY); }

 fusion(owner: string, equipment: string): SkyFusion | undefined { const bridge=this.equipmentBridges.get(owner);if(bridge)return bridge.get(equipment);return (Object.hasOwn(this.state.fusions,owner)?this.state.fusions[owner]:[])?.find(f => f.equipment === equipment && f.durability > 0); }
 wearFusion(owner: string, equipment: string): void { const bridge=this.equipmentBridges.get(owner);if(bridge){bridge.wear(equipment);return;}const fusion = this.fusion(owner, equipment); if (fusion) fusion.durability = Math.max(0, fusion.durability - 1); }
}
