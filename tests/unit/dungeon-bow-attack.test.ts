import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import type {Action,ClassId} from '../../src/dungeon/types';

function encounter(classId:ClassId='hunter'){
 const sim=new DungeonSimulation(),profile=sim.join('a'.repeat(64),'Archer')!,target=sim.join('b'.repeat(64),'Target')!;
 sim.command(profile.actor.id,1,{kind:'class',classId});
 sim.command(profile.actor.id,2,{kind:'ready'});
 sim.command(target.actor.id,1,{kind:'ready'});
 sim.command(profile.actor.id,3,{kind:'start'});
 sim.state.enemies=[];
 profile.actor.position={x:0,y:0,z:2};target.actor.position={x:0,y:0,z:.6};
 const attack=(action:Action)=>sim.command(profile.actor.id,profile.lastAction+1,action);
 return {sim,actor:profile.actor,target:target.actor,attack};
}
function ticks(sim:DungeonSimulation,count:number){for(let i=0;i<count;i++)sim.step();}

describe('ordinary bow attack uses the existing finite-ammo shot',()=>{
 it('draws and releases a real arrow without an invisible melee sweep',()=>{
  const {sim,actor,target,attack}=encounter(),hp=target.hp;
  expect(attack({kind:'attack'})).toBe('弓を引いています');
  expect(actor.phase).toBe('heal');expect(actor.cast).toBe(-.55);expect(actor.arrows).toBe(12);
  ticks(sim,10);
  expect(target.hp).toBe(hp);expect(actor.hit).toEqual([]);expect(sim.state.shots).toEqual([]);
  for(let i=0;actor.cast!==0&&i<10;i++)sim.step();
  expect(actor.arrows).toBe(11);
  expect(sim.state.shots).toHaveLength(1);
  expect(sim.state.shots[0]).toMatchObject({owner:actor.id,damage:28,magic:false});
  ticks(sim,10);
  expect(target.hp).toBe(hp-28);expect(actor.hit).toEqual([]);
 });

 it('matches the F/shoot alias, including the draw clock, ammunition and projectile',()=>{
  const normal=encounter(),alias=encounter();
  normal.target.position.z=alias.target.position.z=-3;
  expect(normal.attack({kind:'attack'})).toBe(alias.attack({kind:'shoot'}));
  for(let i=0;i<30;i++){
   normal.sim.step();alias.sim.step();
   expect(normal.sim.state).toEqual(alias.sim.state);
  }
 });

 it('spends its last arrow once and refuses further normal attacks without refilling',()=>{
  const {sim,actor,attack}=encounter();actor.arrows=1;
  attack({kind:'attack'});
  expect(attack({kind:'attack'})).toContain('動作の終了');
  ticks(sim,30);
  expect(actor.arrows).toBe(0);expect(actor.phase).toBe('idle');
  const before=structuredClone(actor);
  expect(attack({kind:'attack'})).toBe('弓と矢が必要です');
  expect(actor).toEqual(before);
  ticks(sim,30);
  expect(actor.arrows).toBe(0);expect(actor.cast).toBe(0);expect(sim.state.shots).toEqual([]);
 });

 it('refuses heavy bow attacks without a swing, draw, ammo cost or interrupted interaction',()=>{
  const {sim,actor,attack}=encounter();actor.interaction='chest0';actor.extract=.5;
  const before=structuredClone(actor);
  expect(attack({kind:'attack',heavy:true})).toContain('弓では強攻撃できません');
  expect(actor).toEqual(before);expect(sim.state.shots).toEqual([]);
 });

 it.each(['bastion','arcanist'] as const)('retains the existing %s melee attack behavior',classId=>{
  const {sim,actor,target,attack}=encounter(classId),hp=target.hp;
  expect(attack({kind:'attack'})).toBe('攻撃');
  expect(actor.phase).toBe('windup');expect(actor.cast).toBe(0);
  ticks(sim,30);
  expect(target.hp).toBeLessThan(hp);expect(actor.hit).toEqual([target.id]);
  expect(actor.arrows).toBe(12);expect(sim.state.shots).toEqual([]);
 });
});
