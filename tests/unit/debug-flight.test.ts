import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SessionAuthority} from '../../src/simulation/session';
import {validateSave} from '../../src/save/format';
import {safeSavedRespawn} from '../../src/game/respawn-safety';
const idle={x:0,z:0,jump:false},aim={x:0,y:0,z:-1};
function setup(){const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.enemies=[];sim.adventure.state.resources=[];sim.adventure.state.buildings=[];sim.world.density=p=>p.y;sim.world.surfaceDistance=(p,n)=>{if(n)Object.assign(n,{x:0,y:1,z:0});return p.y;};sim.world.heightAt=()=>0;Object.assign(sim.player,{x:0,y:.04,z:8,vy:0,grounded:true});return sim;}
function enable(sim:GameSimulation){sim.adventure.action('debug-flight','on');}
it('flies and hovers with glide-speed steering at zero stamina without altering ordinary glide',()=>{
 const sim=setup(),game=sim.adventure;game.state.stamina=0;game.state.meadows!.sprinting=true;enable(sim);
 expect(game.traversal.snapshot()).toMatchObject({debugFlying:true,gliding:false,debugFlightAvailable:true});
 for(let i=0;i<60;i++){const stamina=game.state.stamina;sim.step({...idle,x:1,debugVertical:1});expect(game.state.stamina).toBeGreaterThanOrEqual(stamina);}
 expect(sim.player.x).toBeCloseTo(10.2,1);expect(sim.player.y).toBeGreaterThan(8);expect(game.state.stamina).toBeGreaterThanOrEqual(0);
 const y=sim.player.y;for(let i=0;i<30;i++)sim.step(idle);expect(sim.player.y).toBeCloseTo(y,5);
 for(let i=0;i<15;i++)sim.step({...idle,debugVertical:-1});expect(sim.player.y).toBeLessThan(y-2);
 game.traversal.debug.action('off');game.state.meadows!.sprinting=false;game.state.stamina=30;Object.assign(sim.player,{y:8,grounded:false});game.action('glide','on');const before=game.state.stamina;sim.step(idle);expect(game.state.stamina).toBeLessThan(before);expect(game.traversal.debug.active).toBe(false);
});
it('leaves movement stamina untouched even for simultaneous run, crouch and swimming inputs',()=>{
 const sim=setup(),game=sim.adventure;enable(sim);game.state.stamina=9;game.state.meadows!.sprinting=true;game.state.meadows!.sneaking=true;sim.fluid.immersion=()=>.7;Object.assign(sim.player,{y:6,grounded:false});
 for(let i=0;i<20;i++){game.traversal.beforeMove({...idle,x:1,debugVertical:1},1/30);expect(game.state.stamina).toBe(9);}
});
it('sweeps flight into walls and ceilings without tunnelling and clamps finite inputs/world limits',()=>{
 const sim=setup();enable(sim);Object.assign(sim.player,{x:0,y:3,z:8});sim.world.density=p=>Math.min(p.y,1-p.x,6-p.y);
 for(let i=0;i<50;i++)sim.adventure.traversal.beforeMove({...idle,x:1,debugVertical:1},.1);
 expect(sim.player.x).toBeLessThan(.71);expect(sim.player.y).toBeLessThan(4.5);
 sim.world.density=p=>p.y;Object.assign(sim.player,{x:999.5,y:46,z:999.5});for(let i=0;i<10;i++)sim.adventure.traversal.beforeMove({...idle,x:100,z:100,debugVertical:100},10);
 expect(sim.player.x).toBeLessThanOrEqual(999.6);expect(sim.player.z).toBeLessThanOrEqual(999.6);expect(sim.player.y).toBeLessThanOrEqual(46.36);
 const before={...sim.player};sim.adventure.traversal.beforeMove({...idle,x:NaN,z:Infinity,debugVertical:NaN},NaN);expect(sim.player).toEqual(before);
});
it('ends at a safe landing with no fall damage, is idempotent and rejects malformed toggle requests',()=>{
 const sim=setup();enable(sim);Object.assign(sim.player,{x:3,y:40,z:8,vy:-12});const health=sim.adventure.state.health;
 expect(()=>sim.adventure.action('debug-flight','toggle')).toThrow('不正');expect(sim.adventure.traversal.debug.active).toBe(true);
 sim.adventure.action('debug-flight','off');expect(sim.player.y).toBeLessThan(.1);for(let i=0;i<30;i++)sim.step(idle);expect(sim.adventure.state.health).toBeGreaterThanOrEqual(health);expect(()=>sim.adventure.action('debug-flight','off')).not.toThrow();
});
it('saves a safe launch point rather than flight ability or airborne altitude and recovers after terrain/water change',()=>{
 const sim=setup();enable(sim);Object.assign(sim.player,{x:10,y:35,z:8});let save=validateSave(sim.save());expect(save.player.y).toBeLessThan(.1);expect((save.adventure as unknown as Record<string,unknown>).traversal).toBeUndefined();expect(new GameSimulation(save).adventure.traversal.debug.active).toBe(false);
 // Flood the old launch position after takeoff; persistence finds dry support below the new position.
 sim.fluid.immersion=p=>Math.abs(p.x)<2&&p.y<2?1:0;save=validateSave(sim.save());expect(save.player.x).toBe(10);expect(save.player.y).toBeLessThan(.1);expect(safeSavedRespawn(sim,save.player,'host')).toBe(true);expect(sim.player.y).toBe(35);
 // Removing that floor too must fall back to the protected start's next safe ring.
 sim.world.density=p=>Math.abs(p.x-10)<1?1:p.y;save=validateSave(sim.save());expect(save.player.x).not.toBe(10);expect(safeSavedRespawn(sim,save.player,'host')).toBe(true);
});
it('keeps flight active and refuses unsafe serialization/disable if every landing is removed',()=>{
 const sim=setup();enable(sim);Object.assign(sim.player,{y:30});sim.world.density=()=>1;sim.fluid.immersion=()=>0;
 expect(()=>sim.save()).toThrow('安全な保存先');expect(()=>sim.adventure.action('debug-flight','off')).toThrow('安全な保存先');expect(sim.adventure.traversal.debug.active).toBe(true);expect(sim.player.y).toBe(30);
});
it('cleans up on death, return, reset and reload while preventing accidental glide/climb or raft transitions',()=>{
 for(const reason of['death','return','reset']){const sim=setup();enable(sim);Object.assign(sim.player,{y:8});if(reason==='death')sim.adventure.hurtPlayer(10000,'physical');else if(reason==='return')sim.adventure.action('return');else sim.resetPlayer();expect(sim.adventure.traversal.debug.active).toBe(false);}
 const sim=setup();enable(sim);for(const action of['glide','climb','sky-ride','sky-ascend','companion-ride'] as const)expect(()=>sim.adventure.action(action,'off')).toThrow('デバッグ飛行');
 sim.adventure.state.buildings.push({id:99,definition:'raft',x:0,y:0,z:8,rotation:0,support:1,contents:{}});for(const id of['','99','b:99'])expect(()=>sim.adventure.action('interact',id)).toThrow('デバッグ飛行');expect(sim.adventure.traversal.debug.active).toBe(true);
});
it('rejects debug actions and forged vertical input in shared/dedicated rooms, including their host',()=>{
 const room=new SessionAuthority(null,true),guest=room.join('guest');for(const id of['host',guest.id]){
  expect(()=>room.action(id,{type:'game-action',action:'debug-flight',id:'on',aim})).toThrow('ひとりプレイ専用');
  room.input(id,{...idle,debugVertical:1},1);expect(room.actors.get(id)!.sequence).toBe(0);expect(room.view(id).adventure.traversal?.debugFlightAvailable).toBe(false);
 }
 expect(()=>guest.adventure.action('debug-flight','on')).toThrow('ひとりプレイ専用');
});
it('safely ends standalone flight before a local peer joins and does not grant it to a guest',()=>{
 const room=new SessionAuthority(setup().save());room.sim.adventure.state.enemies=[];room.action('host',{type:'game-action',action:'debug-flight',id:'on',aim});Object.assign(room.sim.player,{y:40});const guest=room.join('guest');expect(room.sim.adventure.traversal.debug.active).toBe(false);expect(room.sim.player.y).toBeLessThan(10);expect(room.sim.debugFlightAllowed).toBe(false);expect(()=>room.action(guest.id,{type:'game-action',action:'debug-flight',id:'on',aim})).toThrow('ひとりプレイ専用');
});
it('validates standalone vertical input and makes off available immediately after on',()=>{
 const room=new SessionAuthority(setup().save());room.sim.adventure.state.enemies=[];room.action('host',{type:'game-action',action:'debug-flight',id:'on',aim});room.input('host',{...idle,debugVertical:1},1);expect(room.actors.get('host')!.input.debugVertical).toBe(1);
 for(const value of[NaN,Infinity,2])room.input('host',{...idle,debugVertical:value},2);expect(room.actors.get('host')!.sequence).toBe(1);
 expect(()=>room.action('host',{type:'game-action',action:'debug-flight',id:'off',aim})).not.toThrow();
});
