import {seedInventory} from '../helpers/equipment';
import { it, expect } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { SessionAuthority } from '../../src/simulation/session';
import { validateSave } from '../../src/save/format';
import { BEACONS, adventureObjective } from '../../src/content/adventure-world';
const forward={x:0,y:0,z:-1};
it('starts an original three-layer journey, retains shared supplies and restores its save',()=>{
 const sim=new GameSimulation();expect(sim.world.generator).toBe(4);expect(sim.adventure.state.inventory.glider).toBe(1);
 expect(sim.adventure.state.resources.filter(n=>BEACONS.some(b=>b.id===n.id))).toHaveLength(4);
 expect(adventureObjective(sim.adventure.state)).toContain('風原');expect(validateSave(sim.save()).generator).toBe(4);
 const room=new SessionAuthority(sim.save(),true),guest=room.join('visitor');expect(guest.adventure.state.inventory.glider).toBe(1);
});
it('glides with authoritative stamina drain, catches wind, and cannot start without the wing',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);const game=sim.adventure;
 Object.assign(sim.player,{x:0,y:12,z:8,grounded:false,vy:-9});game.action('glide','on',undefined,forward);
 const before=game.state.stamina;game.traversal.beforeMove({x:1,z:0,jump:false},.1);expect(sim.player.vy).toBeGreaterThan(-3);expect(game.state.stamina).toBeLessThan(before);
 Object.assign(sim.player,{x:10,z:-15});game.traversal.beforeMove({x:0,z:0,jump:false},.1);expect(sim.player.vy).toBeGreaterThan(0);
 game.traversal.stop();const {glider:_wing,...withoutWing}=game.state.inventory;seedInventory(game,withoutWing);expect(()=>game.action('glide','on',undefined,forward)).toThrow('翼');
});
it('climbs only a reachable wall, drains stamina and releases on exhaustion',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);const game=sim.adventure;
 Object.assign(sim.player,{x:0,y:3,z:8,grounded:false,heading:Math.PI});sim.world.density=p=>p.z<7.5?-1:1;
 game.action('climb','on',undefined,forward);const y=sim.player.y;expect(game.traversal.beforeMove({x:0,z:-1,jump:false},.1).handled).toBe(true);expect(sim.player.y).toBeGreaterThan(y);
 game.state.stamina=0;game.traversal.beforeMove({x:0,z:0,jump:false},.1);expect(game.traversal.climbing).toBe(false);
});
it('requires the shared construction demonstration before activating the first beacon',()=>{
 const sim=new GameSimulation(),game=sim.adventure,node=game.state.resources.find(n=>n.id===810001)!;
 Object.assign(sim.player,{x:node.x,y:node.y,z:node.z+2});
 expect(()=>game.action('gather',String(node.id),undefined,forward)).toThrow('接着');
 sim.skybound.state.parts.push({id:1,kind:'beam',material:'wood',position:{x:node.x+2,y:node.y+1,z:node.z},velocity:{x:0,y:0,z:0},rotation:0,mass:4,links:[2],epoch:0},{id:2,kind:'beam',material:'wood',position:{x:node.x+3,y:node.y+1,z:node.z},velocity:{x:0,y:0,z:0},rotation:0,mass:4,links:[1],epoch:0});
 expect(game.action('gather',String(node.id),undefined,forward).message).toContain('輝き');expect(game.action('gather',String(node.id),undefined,forward).message).toContain('すでに');expect(adventureObjective(game.state)).toContain('空の');
 const restored=new GameSimulation(sim.save());expect(restored.adventure.state.resources.find(n=>n.id===node.id)?.ready).toBe(1e10);
});
it('does not regenerate away gliding costs during a full authority tick',()=>{const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];Object.assign(sim.player,{x:0,y:16,z:8,grounded:false,vy:-1});sim.adventure.action('glide','on',undefined,forward);const before=sim.adventure.state.stamina;for(let i=0;i<15;i++)sim.step({x:0,z:0,jump:false});expect(sim.adventure.state.stamina).toBeLessThan(before-2);});
it('can ride the first thermal and glide to the next higher island with the starting stamina budget',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];sim.adventure.state.resources=[];
 Object.assign(sim.player,{x:10,y:26,z:-15,grounded:false,vy:0});sim.adventure.action('glide','on',undefined,forward);
 for(let i=0;i<240&&sim.player.y<42;i++)sim.step({x:0,z:0,jump:false});expect(sim.player.y).toBeGreaterThan(41);
 const target={x:-22,z:-30};for(let i=0;i<270&&Math.hypot(sim.player.x-target.x,sim.player.z-target.z)>2;i++){const dx=target.x-sim.player.x,dz=target.z-sim.player.z,n=Math.hypot(dx,dz);sim.step({x:dx/n,z:dz/n,jump:false});}
 expect(Math.hypot(sim.player.x-target.x,sim.player.z-target.z)).toBeLessThan(3);expect(sim.player.y).toBeGreaterThan(34);expect(sim.adventure.state.stamina).toBeGreaterThan(0);
},10000);
