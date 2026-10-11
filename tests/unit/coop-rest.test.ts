import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {legacySimulation} from '../helpers/legacy';
import {newMeadows} from '../../src/game/meadows/state';
import type {BuildingState} from '../../src/game/types';
function fixture(generator:3|4=4){const save=legacySimulation().save();save.generator=generator;save.adventure!.meadows=newMeadows();const room=new SessionAuthority(save),a=room.join('a');room.sim.world.density=p=>p.y;Object.assign(room.sim.player,{x:20,y:0,z:8});Object.assign(a.player,{x:20,y:0,z:8});room.sim.adventure.state.enemies=[];room.sim.adventure.state.resources=[];const bed:BuildingState={id:800,definition:'bed',x:22,y:0,z:8,rotation:0,support:4,contents:{}};room.sim.adventure.state.buildings=[bed,{...bed,id:801,definition:'roof',y:2.5},{...bed,id:802,definition:'fire',x:24,fuel:300}];return {room,a,bed};}
it('rests only the acting player without advancing the shared world clock',()=>{
 const {room,a}=fixture();room.sim.adventure.state.seconds=570;a.adventure.state.seconds=570;a.adventure.state.health=1;const hostHealth=room.sim.adventure.state.health;
 room.action('a',{type:'game-action',action:'rest',id:'800',aim:{x:1,y:0,z:0}});expect(a.adventure.state.spawn).toEqual({x:23.5,y:.5,z:8});expect(a.adventure.state.rested).toBeGreaterThan(0);expect(a.adventure.state.health).toBeGreaterThan(1);expect(room.sim.adventure.state.seconds).toBe(570);expect(a.adventure.state.seconds).toBe(570);expect(room.sim.adventure.state.health).toBe(hostHealth);
});
it('rejects beds and fire on other floors and occluded beds',()=>{
 const {room,a,bed}=fixture();a.player.y=8;expect(()=>room.action('a',{type:'game-action',action:'rest',id:'800',aim:{x:1,y:0,z:0}})).toThrow('ベッド');a.player.y=0;room.sim.tick+=8;room.sim.adventure.state.buildings[2].y=8;expect(()=>room.action('a',{type:'game-action',action:'rest',id:'800',aim:{x:1,y:0,z:0}})).toThrow('火');room.sim.tick+=8;room.sim.adventure.state.buildings[2].y=0;room.sim.world.density=p=>p.x>20.8&&p.x<21.2?-1:p.y;expect(()=>room.action('a',{type:'game-action',action:'rest',id:String(bed.id),aim:{x:1,y:0,z:0}})).toThrow('遮');
});
it('preserves the legacy generator three overnight rest',()=>{
 const {room,a}=fixture(3);room.sim.adventure.state.seconds=570;a.adventure.state.seconds=570;room.action('a',{type:'game-action',action:'rest',id:'800',aim:{x:1,y:0,z:0}});expect(a.adventure.state.seconds).toBeGreaterThan(570);
});
it('rejects gather and merchant operations through floors or walls before inventory changes',()=>{
 const {room,a}=fixture();const s=room.sim.adventure.state;s.buildings=[];s.resources=[{id:850,kind:'berry',x:22,y:8,z:8,amount:2,ready:0},{id:855001,kind:'merchant',x:22,y:8,z:8,amount:1,ready:0}];a.adventure.state.inventory.coins=500;a.adventure.state.inventory.amber=2;
 for(const [action,id] of [['gather','850'],['trade','buy:wood'],['sell','wood']] as const){room.sim.tick+=8;expect(()=>room.action('a',{type:'game-action',action,id,aim:{x:1,y:0,z:0}})).toThrow('近づ');}
 for(const n of s.resources)n.y=0;room.sim.world.density=p=>p.x>20.8&&p.x<21.2?-1:p.y;
 for(const [action,id] of [['gather','850'],['trade','buy:wood'],['sell','wood']] as const){room.sim.tick+=8;expect(()=>room.action('a',{type:'game-action',action,id,aim:{x:1,y:0,z:0}})).toThrow('遮');}expect(a.adventure.state.inventory.coins).toBe(500);expect(a.adventure.state.inventory.amber).toBe(2);expect(s.resources[0].ready).toBe(0);
});
