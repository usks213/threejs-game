import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { makeAdventureEnemy } from '../../src/game/adventure-exploration';
import { stepAdventureEnemy } from '../../src/game/adventure-enemies';
import { hasOrdinaryMeleeTell, inOrdinaryMeleeArc, ordinaryMeleeReach, ORDINARY_MELEE_HALF_ARC } from '../../src/game/combat/ordinary-melee';
import { ordinaryTells } from '../../src/rendering/game/ordinary-tells';
import { createEntities } from '../../src/rendering/game/entities';
import { disposeSurfaceMaps } from '../../src/rendering/materials/pbr';

function fixture(kind = 'walker') {
 const sim = new GameSimulation();
 sim.world.density = point => point.y;
 sim.fluid.restore([]);sim.bodies.length = 0;sim.skybound.state.parts = [];
 sim.adventure.state.resources = [];sim.adventure.state.buildings = [];sim.adventure.state.meadows!.gear = {};
 Object.assign(sim.player,{x:70,y:0,z:1.3,grounded:true,vy:0});
 const enemy = makeAdventureEnemy(sim,kind,{x:70,y:0,z:0});
 enemy.cooldown = 0;sim.adventure.state.enemies = [enemy];
 return {sim,enemy};
}
function brain(sim: GameSimulation,frames: number) {
 for (let i = 0; i < frames; i++) {
  sim.tick++;sim.adventure.state.seconds += 1 / 30;
  for (const enemy of sim.adventure.state.enemies) stepAdventureEnemy(sim.adventure,enemy,1 / 30);
 }
}

it('lets a player evade committed ordinary melee by circling behind or outside the announced sector',()=>{
 for (const point of [{x:70,z:-1.3},{x:71.3,z:0}]) {
  const {sim,enemy} = fixture();brain(sim,1);
  expect(enemy.attackKind).toBe('melee');expect(enemy.windup).toBeGreaterThan(0);
  const yaw = enemy.attackYaw,health = sim.adventure.state.health;
  Object.assign(sim.player,point);brain(sim,20);
  expect(enemy.attackYaw).toBe(yaw);expect(enemy.attackKind).toBe('recover');
  expect(sim.adventure.state.health).toBe(health);
 }
});

it('still damages inside the committed sector, preserves walls and rejects other vertical layers',()=>{
 const {sim,enemy} = fixture();brain(sim,21);expect(sim.adventure.state.health).toBeLessThan(25);
 expect(inOrdinaryMeleeArc(enemy,{x:70,y:5,z:1.3})).toBe(false);
 const blocked = fixture();brain(blocked.sim,1);
 blocked.sim.world.density = p => p.z > .4 && p.z < .6 ? -1 : p.y;
 brain(blocked.sim,20);expect(blocked.sim.adventure.state.health).toBe(25);
});

it('preserves aimed ranged shots and the fixed-yaw cinderunner dash',()=>{
 const ranged = fixture('reedspitter');ranged.sim.player.z = 6;brain(ranged.sim,1);ranged.sim.player.x += 2;brain(ranged.sim,25);
 expect(ranged.sim.adventure.projectiles).toHaveLength(1);
 expect(ranged.sim.adventure.projectiles[0].vx).toBeGreaterThan(0);
 expect(hasOrdinaryMeleeTell(ranged.enemy)).toBe(false);
 const charge = fixture('cinderunner');charge.sim.player.z = 6;brain(charge.sim,1);
 const yaw = charge.enemy.attackYaw;charge.sim.player.x += 4;brain(charge.sim,40);
 expect(charge.enemy.attackYaw).toBe(yaw);expect(charge.enemy.attackKind).toBe('dash');
 expect(charge.enemy.x).toBeCloseTo(70);expect(charge.enemy.z).toBeGreaterThan(0);
});

it('draws the same world-sized locked sector as the hit test and retires it after the tell',()=>{
 const {sim,enemy} = fixture();brain(sim,1);enemy.attackYaw = Math.PI / 2;
 const scene = new THREE.Scene(),tells = ordinaryTells(scene);
 tells.update(sim.adventure.snapshot());expect(scene.children).toHaveLength(1);
 const mesh = scene.children[0] as THREE.Mesh;
 expect(mesh.rotation.y).toBe(enemy.attackYaw);expect(mesh.scale.toArray()).toEqual([1,1,1]);
 const points = mesh.geometry.getAttribute('position');
 for (let i = 0; i < points.count; i++) {
  expect(Math.hypot(points.getX(i),points.getZ(i))).toBeLessThanOrEqual(ordinaryMeleeReach(enemy)+1e-6);
  expect(Math.abs(Math.atan2(points.getX(i),points.getZ(i)))).toBeLessThanOrEqual(ORDINARY_MELEE_HALF_ARC+1e-6);
 }
 enemy.windup = 0;tells.update(sim.adventure.snapshot());expect(scene.children).toHaveLength(0);
 tells.dispose();
});

it('faces the creature toward its authoritative committed yaw while the old circular melee warning stays hidden',()=>{
 const context = new Proxy({},{get:(_target,key)=>key==='createRadialGradient'?()=>({addColorStop:()=>{}}):()=>{},set:()=>true});
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
 const {sim,enemy} = fixture();brain(sim,1);enemy.attackYaw = .7;enemy.heading = -.3;
 const scene = new THREE.Scene(),entities = createEntities(scene);
 try {
 entities.update(sim.adventure.snapshot(),sim.player);
 const group = scene.children.find(child=>child.getObjectByName('health') && child.getObjectByName('warning'))!;
 expect(group.rotation.y).toBeCloseTo(.7+Math.PI);
 expect(group.getObjectByName('warning')!.visible).toBe(false);
 enemy.windup = 0;enemy.heading = 1.1;entities.update(sim.adventure.snapshot(),sim.player);
 expect(group.rotation.y).toBeCloseTo(1.1+Math.PI);
 } finally {entities.dispose();disposeSurfaceMaps();vi.unstubAllGlobals();}
});

it('blocks incoming enemy shots only from the shield-facing side with the normal stamina and wear costs',()=>{
 for (const front of [true,false]) {
  const {sim} = fixture(),game = sim.adventure;game.state.enemies = [];
  game.gear.craft('shield',1,{...game.state.inventory});game.state.meadows!.gear.offhand = 'shield';
  game.action('guard','on',undefined,{x:0,y:0,z:1});
  const p = sim.player,health = game.state.health,stamina = game.state.stamina;
  const shot = {id:sim.allocateEntityId(),owner:'enemy:900001',x:p.x,y:p.y+.7,z:p.z+(front?.75:-.75),vx:0,vy:0,vz:front?-8:8,life:1,damage:9,element:'physical',radius:.16};
  game.projectiles.push(shot);game.step(1/30);
  expect(game.state.health).toBe(front?health:health-9);
  expect(game.state.stamina).toBeCloseTo(front?stamina-3.6:stamina);
  expect(game.gear.selected('shield')!.durability).toBe(front?199:200);
  expect(game.projectiles).toHaveLength(0);
 }
});
it('retains an above-ground direction cue when a ramp occludes the floor sector',()=>{
 const sim=new GameSimulation(),enemy=fixture().enemy;Object.assign(enemy,{x:10,y:3+(8+10)*.58,z:-10,windup:1,attackKind:'melee',attackYaw:Math.PI});sim.adventure.state.enemies=[enemy];
 expect(sim.world.density({x:10,y:enemy.y+.08,z:-11})).toBeLessThan(0);
 const scene=new THREE.Scene(),tells=ordinaryTells(scene);tells.update(sim.adventure.snapshot());scene.updateMatrixWorld(true);
 const arrow=scene.getObjectByName('attack-direction') as THREE.Mesh;expect(arrow).toBeDefined();
 const position=arrow.geometry.getAttribute('position'),point=new THREE.Vector3();
 for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(arrow.matrixWorld);expect(sim.world.density(point)).toBeGreaterThan(0);}
 expect((arrow.material as THREE.MeshBasicMaterial).depthTest).toBe(true);tells.dispose();
});
