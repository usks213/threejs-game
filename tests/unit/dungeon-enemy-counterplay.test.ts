import {describe,expect,it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {blocked,distance} from '../../src/dungeon/world';
import type {Actor,Enemy} from '../../src/dungeon/types';

function encounter(weapon:'sword'|'greatsword'='sword'){
 const sim=new DungeonSimulation(),profile=sim.join('a'.repeat(64),'Explorer')!;
 sim.command(profile.actor.id,1,{kind:'ready'});
 sim.command(profile.actor.id,2,{kind:'start'});
 const enemy=sim.state.enemies.find(e=>e.weapon===weapon)!;
 // Isolate an existing sentinel; retain its normal HP, weapon and timing.
 sim.state.enemies=[enemy];
 const player=profile.actor;
 player.position={x:enemy.position.x,y:0,z:enemy.position.z-1.4};
 return {sim,player,enemy};
}

function inputStep(sim:DungeonSimulation,player:Actor,x=0,z=0){
 expect(sim.input(player.id,player.seq+1,{x,z,yaw:0,pitch:0,block:false,crouch:false})).toBe(true);
 sim.step();
}

function finishSwing(sim:DungeonSimulation,player:Actor,enemy:Enemy,x=0){
 const phases=new Set([enemy.phase]);
 let ticks=0;
 while(enemy.phase!=='idle'&&ticks++<50){
  inputStep(sim,player,x);
  phases.add(enemy.phase);
 }
 expect(enemy.phase).toBe('idle');
 expect(phases).toEqual(new Set(['windup','strike','recover','idle']));
}

describe('sentinel windup commitment and ordinary movement counterplay',()=>{
 it.each(['sword','greatsword'] as const)('keeps %s facing and feet committed until recovery ends',weapon=>{
  const {sim,player,enemy}=encounter(weapon);
  inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  const yaw=enemy.yaw,position={...enemy.position},phases=new Set([enemy.phase]);
  for(let ticks=0;enemy.phase!=='idle'&&ticks<50;ticks++){
   inputStep(sim,player,1);
   expect(enemy.yaw).toBe(yaw);
   expect(enemy.position).toEqual(position);
   const shown=sim.snapshot(player.id).enemies[0];
   expect([shown.yaw,shown.phase,shown.time]).toEqual([enemy.yaw,enemy.phase,enemy.time]);
   phases.add(enemy.phase);
  }
  expect(phases).toEqual(new Set(['windup','strike','recover','idle']));
  expect(player.position.x-position.x).toBeGreaterThan(3);
  expect(enemy.hp).toBe(70);
 });

 it.each([['sword',32],['greatsword',48]] as const)('still lands normal %s damage on a stationary player, once per swing',(weapon,damage)=>{
  const {sim,player,enemy}=encounter(weapon),hp=player.hp;
  inputStep(sim,player);
  finishSwing(sim,player,enemy);
  expect(player.hp).toBe(hp-damage);
  expect(enemy.hit).toEqual([player.id]);
  expect(enemy.hp).toBe(70);
 });

 it.each([
  ['sword',-1],['sword',1],['greatsword',-1],['greatsword',1]
 ] as const)('lets a player sidestep the visible %s windup with strafe=%s', (weapon,x)=>{
  const {sim,player,enemy}=encounter(weapon),hp=player.hp;
  inputStep(sim,player);
  // React after two further normal server ticks rather than before the tell.
  inputStep(sim,player);inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  finishSwing(sim,player,enemy,x);
  expect(player.hp).toBe(hp);
  expect(player.damageTaken).toBe(0);
  expect(enemy.hit).toEqual([]);
 });

 it.each(['sword','greatsword'] as const)('reacquires, pursues and attacks again after a missed %s swing',weapon=>{
  const {sim,player,enemy}=encounter(weapon);
  inputStep(sim,player);
  const yaw=enemy.yaw,position={...enemy.position};
  finishSwing(sim,player,enemy,1);
  const separation=distance(player.position,enemy.position);
  inputStep(sim,player);
  expect(enemy.yaw).not.toBe(yaw);
  expect(distance(position,enemy.position)).toBeCloseTo(1.65*.05);
  expect(distance(player.position,enemy.position)).toBeLessThan(separation);
  for(let ticks=0;enemy.phase==='idle'&&ticks<100;ticks++)inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  expect(enemy.hit).toEqual([]);
  const hp=player.hp;
  finishSwing(sim,player,enemy);
  expect(player.hp).toBeLessThan(hp);
 });

 it('finishes recovery before returning home after its target leaves the raid',()=>{
  const {sim,player,enemy}=encounter();
  const observer=sim.join('b'.repeat(64),'Observer')!.actor;
  observer.status='alive';observer.position={x:12,y:0,z:12};
  enemy.home={x:enemy.position.x+3,y:0,z:enemy.position.z};
  inputStep(sim,player);
  const yaw=enemy.yaw,position={...enemy.position};
  player.status='extracted';
  for(let ticks=0;enemy.phase!=='idle'&&ticks<50;ticks++){
   sim.step();
   expect(enemy.yaw).toBe(yaw);
   expect(enemy.position).toEqual(position);
  }
  expect(enemy.phase).toBe('idle');
  sim.step();
  expect(enemy.yaw).not.toBe(yaw);
  expect(distance(position,enemy.position)).toBeCloseTo(1.2*.05);
  expect(distance(enemy.position,enemy.home)).toBeLessThan(3);
 });
});

describe('committed sentinel attacks still obey dungeon walls',()=>{
 it('pursues a visible player when the nearer player is behind a closed door',()=>{
  const {sim,player,enemy}=encounter();
  const visible=sim.join('b'.repeat(64),'Visible explorer')!.actor;
  visible.status='alive';visible.position={x:0,y:0,z:-2.2};
  enemy.position={x:0,y:0,z:-4};enemy.home={...enemy.position};
  player.position={x:0,y:0,z:-5.4};
  expect(distance(enemy.position,player.position)).toBeLessThan(distance(enemy.position,visible.position));
  inputStep(sim,player);
  expect(enemy.alert).toBe(4);
  expect(enemy.position.z).toBeGreaterThan(-4);
  for(let ticks=0;enemy.phase==='idle'&&ticks<20;ticks++)inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  finishSwing(sim,player,enemy);
  expect(visible.hp).toBeLessThan(visible.maxHp);
  expect(player.hp).toBe(player.maxHp);
  expect(enemy.hit).toEqual([visible.id]);
 });

 it('stops its return-home movement at a closed door instead of clipping through',()=>{
  const {sim,player,enemy}=encounter('greatsword');
  // A north sentinel can be lured through the open doorway before it closes.
  enemy.position={x:0,y:0,z:-4};player.position={x:12,y:0,z:12};
  for(let ticks=0;ticks<80;ticks++){
   inputStep(sim,player);
   expect(blocked(enemy.position,sim.state.seed,sim.state.doors)).toBe(false);
  }
  expect(enemy.position.z).toBeLessThan(-4);
  expect(enemy.position.z).toBeGreaterThanOrEqual(-4.3);
  expect(enemy.phase).toBe('idle');
  const door=sim.state.doors.find(d=>d.id==='door-north')!;
  door.open=true;
  for(let ticks=0;ticks<20;ticks++)inputStep(sim,player);
  expect(enemy.position.z).toBeLessThan(door.position.z-.45);
 });

 it.each(['sword','greatsword'] as const)('cannot hit or pursue through a door closed during the %s windup',weapon=>{
  const {sim,player,enemy}=encounter(weapon),door=sim.state.doors.find(d=>d.id==='door-north')!;
  enemy.position={x:0,y:0,z:-4};enemy.home={...enemy.position};
  player.position={x:0,y:0,z:-5.4};
  door.open=true;
  inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  expect(sim.command(player.id,3,{kind:'interact',target:door.id})).toBe('扉を閉じました');
  const hp=player.hp,position={...enemy.position};
  finishSwing(sim,player,enemy);
  for(let ticks=0;ticks<40;ticks++){
   inputStep(sim,player);
   expect(enemy.phase).toBe('idle');
   expect(blocked(enemy.position,sim.state.seed,sim.state.doors)).toBe(false);
  }
  expect(enemy.position).toEqual(position);
  expect(player.hp).toBe(hp);
  expect(enemy.hit).toEqual([]);
  expect(sim.command(player.id,4,{kind:'interact',target:door.id})).toBe('扉を開きました');
  inputStep(sim,player);
  expect(enemy.phase).toBe('windup');
  finishSwing(sim,player,enemy);
  expect(player.hp).toBeLessThan(hp);
 });
});
