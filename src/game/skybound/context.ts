import {createHullWaterSampler} from './hull-water';
import {canCarry} from '../meadows/inventory';
import {foodEffect} from '../../content/adventure-food';
import { adventureEnvironment } from '../../environment/adventure';
import { protectedVolumes, intersectsProtection } from './protection';
import type { GameSimulation } from '../../simulation/game-simulation';
import { TREE_KINDS } from '../../content/meadows/data';
import { buildingPose, buildingVoxels, localPoint, occupied, treeVoxels } from '../voxel/model';
import type { VoxelModel } from '../voxel/model';
import type { Vec3 } from '../../world/types';
import type { SkyContext } from './types';
interface Collider { position: Vec3; rotation: number; model: VoxelModel; removed: Set<string> }
/** Reuses carved voxel models; the per-operation broad phase avoids scanning every tree per sample. */
export function skyContext(sim: GameSimulation): SkyContext {
 const protections=protectedVolumes(sim);
 let colliders: Map<string, Collider[]> | undefined;
 const key = (p: Vec3) => Math.floor(p.x / 8) + ',' + Math.floor(p.z / 8);
 const build = () => {
  const grid = new Map<string, Collider[]>();
  const add = (collider: Collider, radius: number) => {
   const p = collider.position;
   for (let x = Math.floor((p.x - radius) / 8); x <= Math.floor((p.x + radius) / 8); x++) for (let z = Math.floor((p.z - radius) / 8); z <= Math.floor((p.z + radius) / 8); z++) { const key = x + ',' + z, list = grid.get(key) ?? []; list.push(collider); grid.set(key, list); }
  };
  for (const b of sim.adventure.state.buildings) { const pose = buildingPose(b); add({position: pose, rotation: pose.rotation, model: buildingVoxels(b.definition), removed: new Set(b.removed)}, 5); }
  for (const node of sim.adventure.state.resources) if (TREE_KINDS.has(node.kind) && node.ready <= sim.adventure.state.seconds) add({position: node, rotation: 0, model: treeVoxels(node.kind, node.id), removed: new Set(node.removed)}, 3);
  return grid;
 };
 const solid=(point:Vec3)=>{
   if (sim.world.density(point) <= 0) return true;
   colliders ??= build();
   return (colliders.get(key(point)) ?? []).some(collider => occupied(collider.model, localPoint(point, collider.position, collider.rotation), collider.removed));
 };
 const hullWaterFraction=createHullWaterSampler(sim.fluid,solid);
 return {prepareEquipmentTransfer:(direction,items,gearItems,selection)=>sim.adventure.gear.prepareStorage(direction,items,gearItems,selection),hullWaterFraction,canReceiveItem:(id,count)=>canCarry(sim.adventure.state.inventory,id,count,sim.adventure.state.meadows),canRest:sim.player.grounded&&sim.adventure.attack<=0&&sim.adventure.dodge<=0&&!sim.adventure.traversal.climbing&&!sim.adventure.traversal.gliding&&!sim.skybound.isRiding(sim.adventure.owner)&&!sim.companions?.isRiding(sim.adventure.owner)&&!sim.adventure.state.meadows?.riding,unsafeCamp:point=>{const s=sim.adventure.state,temperature=adventureEnvironment(s.seconds,point).temperature??20;return s.enemies.some(e=>e.health>0&&Math.hypot(e.x-point.x,e.y-point.y,e.z-point.z)<12)||sim.skybound.state.parts.some(p=>(p.burning??0)>0&&Math.hypot(p.position.x-point.x,p.position.y-point.y,p.position.z-point.z)<3)||temperature<0&&!foodEffect(s,'warmth')||temperature>38&&!foodEffect(s,'cooling');},energyCapacity:100+25*Math.min(3,sim.adventure.state.siteWorld?.completed.length??0),tick: sim.tick, bounds: sim.world.bounds, player: sim.player, inventory: sim.adventure.state.inventory,
  actors: (sim.targets.length ? sim.targets : [{player: sim.player, adventure: sim.adventure}]).map(actor => ({id: actor.adventure.owner, position: actor.player})),
  occupied: point => sim.bodies.some(body => Math.hypot(point.x - body.position.x, point.y - body.position.y, point.z - body.position.z) < body.radius),
  protected: point => intersectsProtection(point,0,protections),
  temperature: sim.world.generator===4?point=>adventureEnvironment(sim.adventure.state.seconds,point).temperature??10:undefined,
  wind: sim.world.generator===4?point=>{const wind=adventureEnvironment(sim.adventure.state.seconds,point).wind;return{x:wind?.x??0,y:0,z:wind?.z??0};}:undefined,
  terrainEdits: sim.world.edits,
  current: point => ({...sim.fluid.current(point),y:0}),
  immersion: point => sim.fluid.immersion(point, 1),
  waterFraction:(point,height)=>sim.fluid.immersion(point,height),
  solid,
 };
}
