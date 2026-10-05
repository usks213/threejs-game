import {describe,it,expect,vi} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {VoxelField,type Vec3} from '../../src/prototype/core/voxel';
const idle={x:0,z:0,sprint:false,block:false,water:false};
const floor=()=>{const field=new VoxelField();field.box({x:-8,y:-.5,z:-10},{x:8,y:.25,z:3},3,'ground');return field;};
function fixture(field:VoxelField,summon=false){
 const sim=new CoreSimulation(true,false,true);Object.assign(sim.arena,{field});
 for(const enemy of sim.enemies){enemy.hp=0;enemy.position={x:100,y:.25,z:100};}
 const enemy=summon?sim.enemies.find(e=>e.summonOwner!==undefined)!:sim.enemies[0];enemy.hp=summon?35:73;enemy.phase='idle';enemy.position={x:0,y:.25,z:-6};
 if(summon){enemy.summonOwner=11;sim.enemies[11].hp=320;}
 sim.player.position={x:0,y:.25,z:-1};sim.player.grounded=true;
 return{sim,enemy};
}
const advance=(sim:CoreSimulation,frames:number)=>{for(let i=0;i<frames;i++)sim.tick(1/60,idle);};

describe('ordinary sentry and summoned melee navigation through Core',()=>{
 it.each([false,true])('routes %s around a real tree after losing direct sight, without phasing',summon=>{
  const field=floor(),{sim,enemy}=fixture(field,summon);advance(sim,36);expect(sim.enemyAwareness(enemy)).toBe('chase');
  field.box({x:-.35,y:.25,z:-4.5},{x:.35,y:3,z:-3.9},4,'tree');let detour=0;
  for(let i=0;i<420;i++){sim.tick(1/60,idle);detour=Math.max(detour,Math.abs(enemy.position.x));expect(field.overlaps(enemy.position,.27,1.7)).toBe(false);}
  expect(detour).toBeGreaterThan(.6);expect(enemy.position.z).toBeGreaterThan(-3.2);expect(enemy.hp).toBe(summon?35:73);
 });
 it.each([false,true])('keeps %s on supported ground across a cliff gap and returns without healing/rewards',summon=>{
  const field=new VoxelField();field.box({x:-4,y:-.5,z:-9},{x:4,y:.25,z:-4.6},3);field.box({x:-4,y:-.5,z:-2.5},{x:4,y:.25,z:3},3);
  const {sim,enemy}=fixture(field,summon),claimed=[...sim.campaign.state.claimedEnemies];let returned=false,cameHome=false,maxZ=-6;
  for(let i=0;i<720;i++){sim.tick(1/60,idle);maxZ=Math.max(maxZ,enemy.position.z);returned ||=sim.enemyAwareness(enemy)==='return';cameHome ||=returned&&Math.hypot(enemy.position.x,enemy.position.z+6)<.65;expect(enemy.position.y).toBeGreaterThan(.15);}
  expect(maxZ).toBeLessThan(-4.75);expect(returned).toBe(true);expect(cameHome).toBe(true);expect(enemy.hp).toBe(summon?35:73);expect(sim.campaign.state.claimedEnemies).toEqual(claimed);expect(sim.defeated).toBe(0);
 });
 it('stops repeatedly pushing an unreachable home wall and waits at a supported location',()=>{
  const field=floor(),{sim,enemy}=fixture(field);enemy.position.z=-4;advance(sim,40);
  field.box({x:-8,y:.25,z:-5.4},{x:8,y:3,z:-4.8},3,'home-wall');field.box({x:-8,y:.25,z:-2.5},{x:8,y:3,z:-2},3,'sight-wall');
  const calls=vi.spyOn(sim as unknown as {move(position:Vec3,dx:number,dz:number,height?:number):void},'move');let quiet=0,longestQuiet=0,returned=false;
  for(let i=0;i<900;i++){const start=calls.mock.calls.length;sim.tick(1/60,idle);returned ||=sim.enemyAwareness(enemy)==='return';const pushed=calls.mock.calls.slice(start).some(([p,x,z])=>p===enemy.position&&Math.hypot(x,z)>.0001);quiet=returned&&!pushed?quiet+1:0;longestQuiet=Math.max(longestQuiet,quiet);expect(field.overlaps(enemy.position,.27,1.7)).toBe(false);}
  expect(returned).toBe(true);expect(longestQuiet).toBeGreaterThan(150);expect(enemy.position.z).toBeGreaterThan(-4.6);expect(enemy.hp).toBe(73);expect(sim.defeated).toBe(0);
 });
 it('keeps authored windup/strike/recovery while stopping the weapon step at a ledge',()=>{
  const field=new VoxelField();field.box({x:-4,y:-.5,z:-9},{x:4,y:.25,z:-4.6},3);field.box({x:-4,y:-.5,z:-3.9},{x:4,y:.25,z:3},3);
  const {sim,enemy}=fixture(field);enemy.position.z=-4.83;sim.player.position.z=-3.55;const phases=new Set<string>();let maxZ=enemy.position.z;
  for(let i=0;i<240;i++){sim.tick(1/60,{...idle,block:true});phases.add(enemy.phase);maxZ=Math.max(maxZ,enemy.position.z);expect(enemy.position.y).toBeGreaterThan(.1);}
  expect([...phases]).toEqual(expect.arrayContaining(['windup','strike','recover']));expect(maxZ).toBeLessThan(-4.79);expect(enemy.hp).toBe(73);
 });
 it('leaves an unreachable elevated target rather than swinging at empty air forever',()=>{
  const field=floor();field.box({x:-.3,y:.25,z:-1.3},{x:.3,y:3.25,z:-.7},3,'tower');const {sim,enemy}=fixture(field);sim.player.position={x:0,y:3.25,z:-1};let returned=false;
  for(let i=0;i<1200;i++){sim.tick(1/60,idle);returned ||=sim.enemyAwareness(enemy)==='return';expect(enemy.position.y).toBeLessThan(.6);}
  expect(returned).toBe(true);expect(enemy.hp).toBe(73);expect(sim.player.hp).toBe(100);
 });
});
