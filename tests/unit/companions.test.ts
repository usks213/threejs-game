import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {AdventureCompanions,COMPANION_LIMITS,validateCompanions,type CompanionAction} from '../../src/game/companions';
import {legacySimulation} from '../helpers/legacy';
import {newMeadows} from '../../src/game/meadows/state';
import {skyContext} from '../../src/game/skybound/context';
import {validateSave} from '../../src/save/format';
const aim={x:1,y:0,z:0},idle={x:0,z:0,jump:false};
function fixture(){const save=legacySimulation().save();save.generator=4;save.adventure!.meadows=newMeadows();const room=new SessionAuthority(save),sim=room.sim;sim.world.density=p=>p.y;sim.adventure.state.resources=[];sim.adventure.state.enemies=[];sim.adventure.state.buildings=[];sim.skybound.state.parts=[];sim.bodies.length=0;sim.fluid.restore([]);Object.assign(sim.player,{x:20,y:0,z:8});sim.adventure.state.inventory.berry=10;sim.companions.state.creatures=[{id:840001,position:{x:22,y:.02,z:8},heading:0,stamina:100,bond:0,following:false}];return {room,sim,c:sim.companions.state.creatures[0]};}
function act(room:SessionAuthority,owner:string,action:CompanionAction,id='840001'){room.sim.tick+=8;return room.action(owner,{type:'game-action',action,id,aim});}
function tame(room:SessionAuthority){for(let i=0;i<3;i++)act(room,'host','companion-feed');}
it('tames with three real food transactions, rejects theft and uses authoritative movement with stamina',()=>{
 const {room,sim,c}=fixture(),a=room.join('a');Object.assign(a.player,{x:20,y:0,z:9});a.adventure.state.inventory.berry=10;act(room,'host','companion-feed');expect(()=>act(room,'a','companion-feed')).toThrow('別');act(room,'host','companion-feed');act(room,'host','companion-feed');expect(sim.adventure.state.inventory.berry).toBe(7);expect(c.bond).toBe(3);
 act(room,'host','companion-ride');expect(()=>act(room,'a','companion-ride')).toThrow();for(let i=0;i<30;i++)room.step({x:1,z:0,jump:false});expect(c.position.x).toBeGreaterThan(25);expect(sim.player.x).toBeCloseTo(c.position.x);expect(sim.player.y).toBeCloseTo(c.position.y+.95);expect(c.stamina).toBeLessThan(100);act(room,'host','companion-ride');expect(sim.companions.snapshot('host').riding).toBeUndefined();expect(Math.hypot(sim.player.x-c.position.x,sim.player.z-c.position.z)).toBeGreaterThan(1);
});
it('blocks mounting through floors and walls and stops a ridden creature before a solid wall',()=>{
 const {room,sim,c}=fixture();sim.player.y=7;expect(()=>act(room,'host','companion-feed')).toThrow('近づ');sim.player.y=0;sim.world.density=p=>p.x>20.8&&p.x<21.2?-1:p.y;expect(()=>act(room,'host','companion-feed')).toThrow('遮');sim.world.density=p=>p.y;tame(room);act(room,'host','companion-ride');sim.world.density=p=>p.x>24&&p.x<25?-1:p.y;for(let i=0;i<60;i++)room.step({x:1,z:0,jump:false});expect(c.position.x).toBeLessThan(24);expect(sim.player.x).toBeLessThan(24);
});
it('follows by collision-aware walking, waits on toggle, and releases safely on guest disconnect',()=>{
 const {room,sim,c}=fixture();tame(room);sim.player.x=27;act(room,'host','companion-call');for(let i=0;i<30;i++)room.step(idle);expect(c.position.x).toBeGreaterThan(23);act(room,'host','companion-call');const stopped=c.position.x;for(let i=0;i<10;i++)room.step(idle);expect(c.position.x).toBeCloseTo(stopped);
 const a=room.join('a');c.owner='a';Object.assign(a.player,{x:c.position.x-1.5,y:0,z:8});act(room,'a','companion-ride');room.input('a',{x:0,z:1,jump:false},1);for(let i=0;i<5;i++)room.step(idle);room.leave('a');expect(sim.companions.snapshot().creatures[0].rider).toBeUndefined();expect(c.following).toBe(false);const back=room.join('a');expect(Math.hypot(back.player.x-c.position.x,back.player.z-c.position.z)).toBeGreaterThan(1);expect(c.owner).toBe('a');
});
it('pulls a real lightweight rigid assembly and excludes grab, replay and seat races until release',()=>{
 const {room,sim,c}=fixture();tame(room);sim.adventure.state.inventory.wood=50;sim.skybound.action('host','sky-part','block:wood',{x:19,y:.55,z:8},aim,skyContext(sim));const part=sim.skybound.state.parts[0];act(room,'host','companion-lead',`${c.id}:${part.id}`);
 for(const action of ['sky-grab','sky-recall'] as const)expect(()=>sim.skybound.action('host',action,String(part.id),undefined,aim,skyContext(sim))).toThrow('手綱');act(room,'host','companion-ride');const before=part.position.x;for(let i=0;i<35;i++)room.step({x:1,z:0,jump:false});expect(part.position.x).toBeGreaterThan(before+.3);expect(c.stamina).toBeLessThan(100);act(room,'host','companion-lead',`${c.id}:off`);expect(c.tetherPart).toBeUndefined();expect(()=>sim.skybound.action('host','sky-grab',String(part.id),undefined,aim,skyContext(sim))).not.toThrow();
});
it('validates and saves permanent bonds but never resumes a stale rider, preserving unrelated creatures and rocks',()=>{
 const {room,sim,c}=fixture();tame(room);act(room,'host','companion-ride');const saved=validateSave(room.save()),next=new GameSimulation(saved);expect(next.companions.state.creatures[0].owner).toBe('host');expect(next.companions.state.creatures[0].bond).toBe(3);expect(next.companions.snapshot().riding).toBeUndefined();expect(()=>validateCompanions({...sim.companions.save(),version:2})).toThrow();expect(()=>validateCompanions({version:1,creatures:Array.from({length:9},(_,i)=>({...c,id:i+1}))})).toThrow();expect(next.bodies).toHaveLength(sim.bodies.length);
});
it('limits following and motion work to eight creatures with two movement substeps',()=>{
 const {sim}=fixture();const companions=new AdventureCompanions(sim,{version:1,creatures:Array.from({length:8},(_,i)=>({id:i+1,position:{x:30+i*2,y:.02,z:8},heading:0,stamina:100,bond:3,owner:'host',following:true}))});let probes=0;sim.world.density=p=>{probes++;return p.y;};companions.step(1/30);expect(COMPANION_LIMITS.substeps).toBe(2);expect(probes).toBeLessThan(2500);expect(companions.state.creatures).toHaveLength(8);
});
it('restores only valid tow links, drops them on disconnect or new occlusion, and never moves locked assemblies',()=>{
 const {room,sim,c}=fixture();tame(room);sim.adventure.state.inventory.wood=50;sim.skybound.action('host','sky-part','block:wood',{x:19,y:.55,z:8},aim,skyContext(sim));const part=sim.skybound.state.parts[0];sim.skybound.action('host','sky-grab',String(part.id),undefined,aim,skyContext(sim));expect(()=>act(room,'host','companion-lead',`${c.id}:${part.id}`)).toThrow('操作');sim.skybound.release('host');act(room,'host','companion-lead',`${c.id}:${part.id}`);
 const saved=validateSave(room.save()),next=new GameSimulation(saved);next.world.density=p=>p.y;next.adventure.state.resources=[];next.companions.step(1/30);expect(next.companions.state.creatures[0].tetherPart).toBe(part.id);expect(()=>next.skybound.action('host','sky-grab',String(part.id),undefined,aim,skyContext(next))).toThrow('手綱');sim.world.density=p=>p.x>20.8&&p.x<21.2?-1:p.y;sim.companions.step(1/30);expect(c.tetherPart).toBeUndefined();expect(part.velocity.x).toBe(0);
});
it('releases the tow when the assembly becomes overweight and excludes seat boarding while towing',()=>{
 const {room,sim,c}=fixture();tame(room);sim.adventure.state.inventory.wood=50;sim.skybound.action('host','sky-part','seat:wood',{x:19,y:.7,z:8},aim,skyContext(sim));const part=sim.skybound.state.parts[0];act(room,'host','companion-lead',`${c.id}:${part.id}`);expect(()=>sim.skybound.action('host','sky-ride',String(part.id),undefined,aim,skyContext(sim))).toThrow('操作');part.mass=61;sim.companions.step(1/30);expect(c.tetherPart).toBeUndefined();
});
it('neutralizes stale guest input and supports immediate dismount/rope cancellation without action cooldown',()=>{
 const {room,sim,c}=fixture(),a=room.join('a');Object.assign(a.player,{x:20,y:0,z:9});c.owner='a';c.bond=3;act(room,'a','companion-ride');expect(()=>room.action('a',{type:'game-action',action:'companion-ride',id:String(c.id),aim})).not.toThrow();expect(sim.companions.snapshot('a').riding).toBeUndefined();act(room,'a','companion-ride');room.input('a',{x:0,z:1,jump:false},1);for(let i=0;i<16;i++)room.step(idle);const z=c.position.z;for(let i=0;i<20;i++)room.step(idle);expect(c.position.z).toBeCloseTo(z);room.leave('a');expect(sim.companions.snapshot().creatures[0].rider).toBeUndefined();
});
it('spawns the original creatures on valid terrain without removing existing enemies or unlimited rocks',()=>{
 const sim=new GameSimulation();expect(sim.companions.state.creatures).toHaveLength(3);const ctx=skyContext(sim);for(const c of sim.companions.state.creatures){expect(ctx.solid({...c.position,y:c.position.y+.2})).toBe(false);expect(sim.world.density({...c.position,y:c.position.y-.1})).toBeLessThanOrEqual(0);}expect(sim.adventure.state.enemies.length).toBeGreaterThan(0);
});
