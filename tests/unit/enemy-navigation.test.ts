import {describe,it,expect,vi} from 'vitest';
import {EnemyLocalNavigation,ENEMY_NAVIGATION_LIMITS,safeEnemyLunge} from '../../src/prototype/core/enemy-navigation';
import {createEnemyTacticState} from '../../src/prototype/core/enemy-tactics';
import {REGIONAL_ENEMIES} from '../../src/prototype/core/regions';
import {VoxelField,type Vec3} from '../../src/prototype/core/voxel';
import {CoreSimulation} from '../../src/prototype/core/simulation';
const idle={x:0,z:0,sprint:false,block:false,water:false};
const fieldWithFloor=()=>{const field=new VoxelField();field.box({x:-8,y:-.5,z:-8},{x:8,y:0,z:8},3,'ground');return field;};
const stateAt=(position:Vec3={x:0,y:.012,z:0},goal:Vec3={x:0,y:.012,z:5})=>{
 const state=createEnemyTacticState({...REGIONAL_ENEMIES[0],position});state.awareness='chase';state.lastSeen={...goal};return state;
};
const desired=(position:Vec3,goal:Vec3,speed=2.1)=>{const n=Math.hypot(goal.x-position.x,goal.z-position.z)||1;return{x:(goal.x-position.x)/n*speed,y:0,z:(goal.z-position.z)/n*speed};};
/** A compact fixture drives the real production tick/move/settle. Terrain is
 * controlled here so path failures are attributable; progression is tested separately. */
const coreFixture=(field:VoxelField,start:Vec3,goal:Vec3)=>{
 const sim=new CoreSimulation(true,false,true);Object.assign(sim.arena,{field});sim.campaign.state.completed.push('ridge');
 for(const enemy of sim.enemies){enemy.hp=0;enemy.position={x:100,y:0,z:100};}
 const enemy=sim.enemies.find(e=>e.regional===101)!;enemy.hp=57;enemy.position={...start};enemy.vy=0;
 const state=stateAt(start,goal);sim.tactics.set(enemy.id,state);sim.player.position={...goal};sim.player.grounded=true;
 return{sim,enemy,state};
};

describe('bounded regional SDF navigation',()=>{
 it('routes around a low wall visible over its top using real Core movement',()=>{
  const field=fieldWithFloor();field.box({x:-1.2,y:0,z:1.7},{x:1.2,y:.85,z:2.3},3,'wall');
  const {sim,enemy}=coreFixture(field,{x:0,y:.012,z:0},{x:0,y:.012,z:5});let detour=0;
  for(let i=0;i<360;i++){sim.tick(1/60,idle);detour=Math.max(detour,Math.abs(enemy.position.x));expect(field.overlaps(enemy.position,.27,1.7)).toBe(false);}
  expect(detour).toBeGreaterThan(1.4);expect(enemy.position.z).toBeGreaterThan(3.1);expect(enemy.hp).toBe(57);
 });
 it('follows a stable side around a tree, preserving a usable narrow passage',()=>{
  const field=fieldWithFloor();field.box({x:-.4,y:0,z:1.4},{x:.4,y:2.5,z:2},4,'tree');
  field.box({x:-2,y:0,z:-1},{x:-1.1,y:3,z:6},3,'left');field.box({x:1.1,y:0,z:-1},{x:2,y:3,z:6},3,'right');
  const {sim,enemy,state}=coreFixture(field,{x:0,y:.012,z:0},{x:0,y:.012,z:5});state.unseenTime=0;
  const sides:number[]=[];
  for(let i=0;i<360;i++){sim.tick(1/60,idle);if(Math.abs(enemy.position.x)>.4)sides.push(Math.sign(enemy.position.x));expect(field.overlaps(enemy.position,.27,1.7)).toBe(false);}
  expect(new Set(sides).size).toBe(1);expect(enemy.position.z,JSON.stringify({position:enemy.position,player:sim.player.position,state})).toBeGreaterThan(2.8);
 });
 it('halts before a sheer ledge, disengages, and returns without healing or reward changes',()=>{
  const field=new VoxelField();field.box({x:-4,y:-1,z:-3},{x:4,y:0,z:1.4},3,'near');field.box({x:-4,y:-1,z:3.5},{x:4,y:0,z:7},3,'far');
  const {sim,enemy,state}=coreFixture(field,{x:0,y:.012,z:0},{x:0,y:.012,z:5});const before=sim.campaign.snapshot();let returned=false,cameHome=false,maxZ=0;
  for(let i=0;i<900;i++){sim.tick(1/60,idle);maxZ=Math.max(maxZ,enemy.position.z);returned ||=state.awareness==='return';cameHome ||=returned&&Math.hypot(enemy.position.x,enemy.position.z)<.65;expect(enemy.position.y).toBeGreaterThan(-.05);}
  expect(maxZ).toBeLessThan(1.3);expect(returned).toBe(true);expect(cameHome).toBe(true);expect(enemy.hp).toBe(57);expect(sim.campaign.state.claimedEnemies).toEqual(before.claimedEnemies);expect(sim.defeated).toBe(0);
 });
 it('crosses a quarter-meter supported step but refuses a high step and an undersized gap',()=>{
  const field=fieldWithFloor();field.box({x:-1,y:0,z:1},{x:1,y:.25,z:3},3,'step');
  const {sim,enemy}=coreFixture(field,{x:0,y:.012,z:0},{x:0,y:.262,z:2.9});
  for(let i=0;i<120;i++)sim.tick(1/60,idle);
  expect(enemy.position.z).toBeGreaterThan(1);expect(enemy.position.y).toBeGreaterThan(.2);
  field.box({x:-8,y:.25,z:3},{x:8,y:1.25,z:4},3,'high');
  expect(safeEnemyLunge(field,{x:0,y:.262,z:2.5},{x:0,y:0,z:12},.1)).toBe(false);
  const narrow=fieldWithFloor();narrow.box({x:-2,y:0,z:1},{x:-.2,y:3,z:2},3);narrow.box({x:.2,y:0,z:1},{x:2,y:3,z:2},3);
  expect(safeEnemyLunge(narrow,{x:0,y:.012,z:.8},{x:0,y:0,z:12},.1)).toBe(false);
 });
 it('stops an authored lunge at walls and cliffs without redirecting its locked attack',()=>{
  const field=fieldWithFloor();field.box({x:-2,y:0,z:1},{x:2,y:3,z:1.5},3,'wall');
  expect(safeEnemyLunge(field,{x:0,y:.012,z:.3},{x:0,y:0,z:12},.1)).toBe(false);
  field.removeObject('wall');expect(safeEnemyLunge(field,{x:0,y:.012,z:.3},{x:0,y:0,z:12},.1)).toBe(true);
  expect(safeEnemyLunge(field,{x:0,y:.012,z:7.4},{x:0,y:0,z:12},.1)).toBe(false);
 });
 it('runs a charge telegraph through Core and stops its released lunge at the real ledge',()=>{
  const field=new VoxelField();field.box({x:-4,y:-1,z:-3},{x:4,y:0,z:1.4},3);field.box({x:-4,y:-1,z:3.5},{x:4,y:0,z:7},3);
  const start={x:0,y:.012,z:0},{sim,enemy}=coreFixture(field,start,{x:0,y:.012,z:5});
  const definition={...REGIONAL_ENEMIES.find(e=>e.tactic==='charge')!,position:start};enemy.regional=definition.id;
  sim.campaign.state.unlockedRegions.push(definition.region);sim.tactics.set(enemy.id,createEnemyTacticState(definition));
  let told=false,released=false,maxZ=0;
  for(let i=0;i<180;i++){sim.tick(1/60,idle);told ||=sim.tells.some(t=>t.kind==='lunge');released ||=sim.lunges.has(enemy.id);maxZ=Math.max(maxZ,enemy.position.z);expect(enemy.position.y).toBeGreaterThan(-.05);}
  expect(told).toBe(true);expect(released).toBe(true);expect(maxZ).toBeGreaterThan(.5);expect(maxZ).toBeLessThan(1.3);expect(sim.player.hp).toBe(100);expect(enemy.hp).toBe(57);
 });
 it('observes real displacement so another actor can block a route without infinite pushing',()=>{
  const field=fieldWithFloor(),position={x:0,y:.012,z:0},state=stateAt(position),nav=new EnemyLocalNavigation();let disengaged=false;
  for(let i=0;i<240;i++){const result=nav.step(state,position,{x:0,y:0,z:2.1},field,1/60);disengaged ||=result.disengage;}
  expect(disengaged).toBe(true);
 });
 it('bounds spatial queries and caches unobstructed decisions instead of scanning every frame',()=>{
  const field=fieldWithFloor(),ray=vi.spyOn(field,'ray'),position={x:0,y:.012,z:0},state=stateAt(position),nav=new EnemyLocalNavigation();
  for(let i=0;i<60;i++){const result=nav.step(state,position,desired(position,state.lastSeen),field,1/60);position.x+=result.velocity.x/60;position.z+=result.velocity.z/60;}
  expect(ray.mock.calls.length).toBeLessThan(240);
  field.box({x:-8,y:0,z:position.z+.6},{x:8,y:3,z:position.z+1.2},3,'wall');ray.mockClear();
  nav.step(state,position,desired(position,state.lastSeen),field,1/60);
  expect(ray.mock.calls.length).toBeLessThanOrEqual(ENEMY_NAVIGATION_LIMITS.surfaceProbes*5);
 });
 it('disengages from an unreachable target directly overhead even when planar pursuit is zero',()=>{
  const field=fieldWithFloor(),position={x:0,y:.012,z:0},state=stateAt(position,{x:0,y:3,z:0}),nav=new EnemyLocalNavigation();let disengaged=false;
  state.home.x=-2;
  for(let i=0;i<600;i++)disengaged ||=nav.step(state,position,{x:0,y:0,z:0},field,1/60).disengage;
  expect(disengaged).toBe(true);
 });
 it('holds a failed decision between safety probes and retries its bounded search at most twice a second',()=>{
  const field=new VoxelField(),ray=vi.spyOn(field,'ray'),position={x:0,y:.012,z:0},state=stateAt(position),nav=new EnemyLocalNavigation();
  for(let i=0;i<60;i++)expect(nav.step(state,position,{x:0,y:0,z:2.1},field,1/60).velocity).toEqual({x:0,y:0,z:0});
  // Each search sees eight unsupported neighboring edges; cached pauses must not
  // rerun even these small failed queries at the simulation's 60 Hz.
  expect(ray.mock.calls.length).toBeLessThan(40);
 });
 it('keeps telegraph pauses stationary and never counts them as a stuck pursuit',()=>{
  const field=fieldWithFloor(),position={x:0,y:.012,z:0},state=stateAt(position),nav=new EnemyLocalNavigation();
  for(let i=0;i<1200;i++)expect(nav.step(state,position,{x:0,y:0,z:0},field,1/60)).toMatchObject({velocity:{x:0,y:0,z:0},disengage:false});
  expect(nav.step(state,position,{x:0,y:0,z:2.1},field,1/60).velocity.z).toBeGreaterThan(0);
 });
 it('revalidates edited terrain immediately instead of walking off newly removed support',()=>{
  const field=fieldWithFloor(),position={x:0,y:.012,z:0},state=stateAt(position),nav=new EnemyLocalNavigation();
  expect(nav.step(state,position,{x:0,y:0,z:2.1},field,1/60).velocity.z).toBeGreaterThan(0);
  field.removeObject('ground');expect(nav.step(state,position,{x:0,y:0,z:2.1},field,1/60).velocity).toEqual({x:0,y:0,z:0});
 });
});
