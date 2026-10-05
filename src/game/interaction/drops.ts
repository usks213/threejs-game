import {ITEM_NAMES} from '../../content/catalog';
import {emptyGear,isEquipment,mintGear,validateGear,GEAR_LIMITS} from '../equipment/items';
import type {GearAllocator,GearContainer} from '../equipment/items';
import type { Adventure } from '../adventure';
import type { ResourceNode,BuildingState } from '../types';
import type { Vec3 } from '../../world/types';
import type { WaterObstacle } from '../../fluid/obstacles';
import { carryAmount } from '../meadows/inventory';
import { reconcileSlots } from '../meadows/inventory-layout';
import { buildingPose, buildingVoxels, localPoint, voxelBounds, worldPoint } from '../voxel/model';
import { voxelSlabs } from '../voxel/obstacles';

const DROP_STACK = 100, DROP_RADIUS = .08, SKIN = 1e-5;
const finitePoint = (point: Vec3) => [point.x, point.y, point.z].every(Number.isFinite);
export const DROP_LIMIT=100000;
/** Pure resource-array plan, including exact equipment holder identity. */
export function planItemDrops(game:Adventure,id:string,count:number,point:Vec3,allocate:GearAllocator,gear?:GearContainer,source=game.state.resources):ResourceNode[]{
 if(!Object.hasOwn(ITEM_NAMES,id)||!Number.isSafeInteger(count)||count<0||count>100000000||!finitePoint(point))throw Error('品物の数や位置が不正です');
 if(!count)return source;
 const equipment=isEquipment(id),resources=[...source],at={x:point.x,y:point.y,z:point.z};
 if(equipment){
  const container=gear?validateGear(gear,{[id]:count}):mintGear(emptyGear(),id,count,allocate);
  if(resources.length+container.lots.length>DROP_LIMIT)throw Error('地面の品物が上限です。空きを作ってください');
  // A homogeneous legacy batch is one physical holder, regardless of its count.
  for(const lot of container.lots){const part=structuredClone(lot);resources.push({id:allocate(),kind:id,amount:lot.count,ready:0,drop:true,...at,velocity:{x:0,y:1,z:0},gearItems:{version:1,revision:0,lots:[part],activeByKind:{[id]:part.id}}});}
  return resources;
 }
 for(let i=0;i<resources.length&&count;i++){const drop=resources[i];if(!drop.drop||drop.kind!==id||drop.gearItems||drop.ready>game.state.seconds||!Number.isSafeInteger(drop.amount)||drop.amount<=0||drop.amount>=DROP_STACK||Math.hypot(drop.x-point.x,drop.y-point.y,drop.z-point.z)>=.75)continue;const add=Math.min(count,DROP_STACK-drop.amount);resources[i]={...drop,amount:drop.amount+add};count-=add;}
 if(resources.length+Math.ceil(count/DROP_STACK)>DROP_LIMIT)throw Error('地面の品物が上限です。空きを作ってください');
 while(count){const amount=Math.min(DROP_STACK,count);resources.push({id:allocate(),kind:id,amount,ready:0,drop:true,...at,velocity:{x:0,y:1,z:0}});count-=amount;}
 return resources;
}
/** Preserve live node/array references only after the entire immutable plan has passed. */
export function commitItemDrops(game:Adventure,planned:ResourceNode[]):void{
 const target=game.state.resources,existing=new Map(target.map(node=>[node.id,node]));
 const committed=planned.map(node=>{const prior=existing.get(node.id);if(!prior||prior===node)return node;Object.assign(prior,node);return prior;});
 target.length=committed.length;for(let i=0;i<committed.length;i++)target[i]=committed[i];
}
/** Newly produced loot; transfers from an existing holder must pass its exact gear container. */
export function dropItem(game:Adventure,id:string,count:number,point:Vec3,gear?:GearContainer):void{
 if(!Object.hasOwn(ITEM_NAMES,id)||!Number.isSafeInteger(count)||count<0||count>100000000||!finitePoint(point))throw Error('品物の数や位置が不正です');
 if(count===0)return;const ids=game.sim.reserveEntityIds(isEquipment(id)?GEAR_LIMITS.lots*2:Math.ceil(count/DROP_STACK)+1),resources=planItemDrops(game,id,count,point,ids.allocate,gear);ids.commit();commitItemDrops(game,resources);
}
export function dropOwnedItem(game:Adventure,selection:string,point:Vec3):string{
 const s=game.state,personal=game.gear.ensure(),{kind,count,lotId}=game.gear.selection(selection,personal,s.inventory,10),ids=game.sim.reserveEntityIds(isEquipment(kind)?GEAR_LIMITS.lots*2:Math.ceil(count/DROP_STACK)+1);
 const transfer=isEquipment(kind)?game.gear.extract(kind,count,ids.allocate,lotId):undefined,resources=planItemDrops(game,kind,count,point,ids.allocate,transfer?.cargo);
 ids.commit();commitItemDrops(game,resources);if(transfer)game.gear.commit(transfer.personal);else{s.inventory[kind]-=count;if(s.meadows)reconcileSlots(s.meadows,s.inventory);}return kind;
}
export function pickupItem(game:Adventure,id:number):number{
 const node=game.state.resources.find(n=>n.id===id&&(n.drop||isEquipment(n.kind))&&n.ready<=game.state.seconds);
 if(!node||!Number.isSafeInteger(node.amount)||node.amount<=0)throw Error('品物はもうありません');
 const player=game.sim.player;if(!finitePoint(node)||Math.hypot(node.x-player.x,node.y-player.y,node.z-player.z)>3.5)throw Error('品物に近づいてください');
 const state=game.state,count=carryAmount(state.inventory,node.kind,node.amount,state.meadows);if(!count)throw Error('持ち物に空きがありません');
 if(isEquipment(node.kind)){game.gear.receive(node,count);return count;}
 state.inventory[node.kind]=(state.inventory[node.kind]??0)+count;node.amount-=count;if(!node.amount)state.resources=state.resources.filter(r=>r!==node);
 if(state.meadows){if(!state.meadows.discovered.includes(node.kind))state.meadows.discovered.push(node.kind);reconcileSlots(state.meadows,state.inventory);}return count;
}
/** Called before deleting a building; all contents and salvage become drops or nothing changes. */
export function releaseBuildingItems(game:Adventure,building:BuildingState,salvage:Record<string,number>):void{
 const total=Object.values(building.contents).concat(Object.values(salvage)).reduce((n,c)=>n+Math.ceil(c/DROP_STACK),0),ids=game.sim.reserveEntityIds(total*2+GEAR_LIMITS.lots*2);
 const gear=game.gear.planHolder(building.contents,building.gearItems,ids.allocate);let resources=game.state.resources;
 for(const[id,count]of Object.entries(salvage))if(count)resources=planItemDrops(game,id,count,building,ids.allocate,undefined,resources);
 for(const[id,count]of Object.entries(building.contents))if(count){const lots=gear.lots.filter(l=>l.kind===id),container=isEquipment(id)?{version:1 as const,revision:0,lots,activeByKind:lots.length?{[id]:lots[0].id}:{}}:undefined;resources=planItemDrops(game,id,count,building,ids.allocate,container,resources);}
 ids.commit();commitItemDrops(game,resources);building.contents={};building.gearItems=emptyGear();building.salvage={};
}

type Pose = Vec3 & {rotation: number};
interface Collider { pose: Pose; slabs: WaterObstacle[] }
const slabCache = new Map<string, WaterObstacle[]>();
function collidersFor(game: Adventure, point: Vec3, travel: number): Collider[] {
 const colliders: Collider[] = [];
 for (const building of game.state.buildings) {
  const pose = buildingPose(building), model = buildingVoxels(building.definition), bounds = voxelBounds(model);
  const reach = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
  if (Math.hypot(point.x - pose.x, point.z - pose.z) > reach + travel + DROP_RADIUS) continue;
  const key = building.definition + ':' + (building.removed ?? []).join(';');
  let slabs = slabCache.get(key);
  if (!slabs) {
   slabs = voxelSlabs(model, building.removed);
   if (slabCache.size >= 256) slabCache.clear();
   slabCache.set(key, slabs);
  }
  colliders.push({pose, slabs});
 }
 return colliders;
}
interface Hit { time: number; normal: Vec3 }
const axes = ['x', 'y', 'z'] as const;
/** Sweep the small drop body against a slab, so a fast drop cannot cross a thin wall. */
function sweepSlab(from: Vec3, delta: Vec3, slab: WaterObstacle): Hit | null {
 let enter = 0, exit = 1;
 const normal = {x: 0, y: 0, z: 0};
 for (const axis of axes) {
  const half = (axis === 'x' ? slab.hx : axis === 'y' ? slab.hy : slab.hz) + DROP_RADIUS;
  const offset = from[axis] - slab[axis], speed = delta[axis];
  if (Math.abs(speed) < 1e-10) {
   if (Math.abs(offset) >= half) return null;
   continue;
  }
  const a = (-half - offset) / speed, b = (half - offset) / speed;
  const near = Math.min(a, b), far = Math.max(a, b);
  if (near >= enter) {
   enter = near;
   normal.x = normal.y = normal.z = 0;
   normal[axis] = speed > 0 ? -1 : 1;
  }
  exit = Math.min(exit, far);
  if (enter > exit) return null;
 }
 return exit >= 0 && enter <= 1 && (normal.x || normal.y || normal.z) ? {time: enter, normal} : null;
}
function moveDrop(node: ResourceNode, delta: Vec3, colliders: Collider[]): void {
 // A newly produced drop can start inside the remaining cells or a floor. Resolve
 // upward through occupied rows, rather than leaving it trapped inside a solid.
 for (let pass = 0; pass < 8; pass++) {
  let lifted = false;
  for (const {pose, slabs} of colliders) for (const slab of slabs) {
   const p = localPoint(node, pose, pose.rotation);
   if (Math.abs(p.x - slab.x) < slab.hx + DROP_RADIUS && Math.abs(p.z - slab.z) < slab.hz + DROP_RADIUS
    && p.y > slab.y - slab.hy - DROP_RADIUS && p.y < slab.y + slab.hy + DROP_RADIUS) {
    node.y = pose.y + slab.y + slab.hy + DROP_RADIUS + SKIN;
    if (node.velocity!.y < 0) node.velocity!.y = 0;
    lifted = true;
   }
  }
  if (!lifted) break;
 }
 for (let pass = 0; pass < 3; pass++) {
  let first: Hit | null = null;
  for (const {pose, slabs} of colliders) {
   const from = localPoint(node, pose, pose.rotation), direction = localPoint(delta, {x: 0, y: 0, z: 0}, pose.rotation);
   for (const slab of slabs) {
    const hit = sweepSlab(from, direction, slab);
    if (hit && (!first || hit.time < first.time)) first = {time: hit.time, normal: worldPoint(hit.normal, {x: 0, y: 0, z: 0}, pose.rotation)};
   }
  }
  const time = first?.time ?? 1;
  for (const axis of axes) node[axis] += delta[axis] * time;
  if (!first) return;
  const normal = first.normal, velocity = node.velocity!;
  const into = delta.x * normal.x + delta.y * normal.y + delta.z * normal.z;
  const speed = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z;
  for (const axis of axes) {
   node[axis] += normal[axis] * SKIN;
   delta[axis] = (delta[axis] - normal[axis] * Math.min(0, into)) * (1 - time);
   velocity[axis] -= normal[axis] * Math.min(0, speed);
  }
 }
}
export function stepDrops(game: Adventure, dt: number): void {
 if (!Number.isFinite(dt) || dt <= 0) return;
 const centers = game.sim.targets.length ? game.sim.targets.map(t => t.player) : [game.sim.player];
 for (const node of game.state.resources) {
  if (!node.drop || node.ready > game.state.seconds || !centers.some(p => Math.hypot(node.x - p.x, node.z - p.z) <= 48)) continue;
  const velocity = node.velocity ?? (node.velocity = {x: 0, y: 0, z: 0});
  const water = game.sim.fluid.immersion(node, .3), flow = water ? game.sim.fluid.current(node, .3) : {x: 0, z: 0};
  velocity.x += (flow.x - velocity.x) * Math.min(1, dt * (water ? 8 : 4));
  velocity.z += (flow.z - velocity.z) * Math.min(1, dt * (water ? 8 : 4));
  velocity.y = Math.max(-12, velocity.y + (-9.8 + water * 12) * dt);
  const delta = {x: velocity.x * dt, y: velocity.y * dt, z: velocity.z * dt};
  moveDrop(node, delta, collidersFor(game, node, Math.hypot(delta.x, delta.z)));
  const floor = game.sim.groundAt(node.x, node.z,node.y) + DROP_RADIUS;
  if (node.y < floor) { node.y = floor; velocity.y = 0; }
 }
}
