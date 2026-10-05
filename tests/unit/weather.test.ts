import {describe,it,expect} from 'vitest';
import {weatherAt,WeatherReactions} from '../../src/prototype/core/weather';
import {VoxelField} from '../../src/prototype/core/voxel';
import {VoxelWater} from '../../src/prototype/core/water';
import {ElementSystem} from '../../src/prototype/core/elements';
import {EntityElements} from '../../src/prototype/core/entity-elements';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import type {MaterialDrop} from '../../src/prototype/core/survival';

const origin={x:0,y:0,z:0},neutral={x:0,z:0,sprint:false,block:false,water:false};
function setup(){const field=new VoxelField(.25),water=new VoxelWater(field);water.volume.fill(0);return {field,elements:new ElementSystem(field,water),weather:new WeatherReactions()};}
describe('bounded systemic weather',()=>{
 it('uses the saved clock, starts clear and varies with actual biome',()=>{
  expect(weatherAt(0,10,origin).kind).toBe('clear');expect(weatherAt(0,11,origin).kind).toBe('rain');expect(weatherAt(0,13,origin).kind).toBe('wind');
  expect(weatherAt(1,11,origin)).toEqual(weatherAt(0,35,origin));
  expect(weatherAt(NaN,Infinity,origin).kind).toBe('clear');
  expect(weatherAt(0,11,{x:-29,y:3.25,z:-27}).kind).toBe('wind');
 });
 it('rain extinguishes exposed enemies and loose materials, but the real SDF roof shelters them',()=>{
  const {field,elements,weather}=setup(),outside=new EntityElements(),inside=new EntityElements();outside.burning=inside.burning=1;
  field.box({x:3,y:2.5,z:-1},{x:5,y:2.8,z:1},4,'roof');
  const drops:MaterialDrop[]=[{id:1,material:4,count:3,position:{x:0,y:.5,z:0},fire:2},{id:2,material:4,count:2,position:{x:4,y:.5,z:0},fire:2}];
  weather.tick(1,0,11,field,elements,[{position:origin,hp:100,body:outside,active:true},{position:{x:4,y:0,z:0},hp:100,body:inside,active:true}],drops,[origin]);
  expect(outside.wet).toBe(2);expect(outside.burning).toBe(0);expect(inside.wet).toBe(0);expect(inside.burning).toBe(1);
  expect(drops[0].fire).toBe(0);expect(drops[0].wet).toBe(2);expect(drops[1].fire).toBe(2);expect(drops.reduce((n,d)=>n+d.count,0)).toBe(5);
 });
 it('rain alters actual burning sample states without spawning drops or fluid',()=>{
  const {field,elements,weather}=setup();elements.states.set('0,0,0',{position:{x:0,y:.5,z:0},fire:1,wet:0,charge:0});
  weather.tick(.5,0,11,field,elements,[],[],[origin]);expect(elements.states.get('0,0,0')).toMatchObject({fire:0,wet:2});expect(elements.drainDrops()).toEqual([]);expect(elements.water.total()).toBe(0);
 });
 it('visits at most16 roofs per half-second and never catches up unloaded time',()=>{
  const {field,elements,weather}=setup();for(let i=0;i<256;i++)elements.states.set(String(i),{position:{x:i%10,y:1,z:0},fire:1,wet:0,charge:0});
  const body=new EntityElements(),actors=Array.from({length:40},()=>({position:origin,hp:100,body,active:true})),drops=Array.from({length:80},(_,id)=>({id,material:4,count:1,position:{...origin}}));
  weather.tick(1,0,11,field,elements,actors,drops,[origin]);expect(weather.lastRayCount).toBe(16);const wet=[...elements.states.values()].filter(s=>s.wet).length;
  weather.tick(1.4,0,11,field,elements,actors,drops,[origin]);expect([...elements.states.values()].filter(s=>s.wet)).toHaveLength(wet);
  weather.tick(100000,0,11,field,elements,actors,drops,[origin]);expect(weather.lastRayCount).toBe(16);expect([...elements.states.values()].filter(s=>s.wet)).toHaveLength(wet+8);
 });
 it('ignores distant/inactive actors and caps mass-aware horizontal impulse',()=>{
  const {field,elements,weather}=setup(),body=new EntityElements();const drops:MaterialDrop[]=[{id:1,material:4,count:10,position:{...origin}},{id:2,material:6,count:10,position:{...origin}}];
  weather.tick(.5,0,13,field,elements,[],drops,[origin]);expect(drops[0].velocity!.x).toBeCloseTo(drops[1].velocity!.x*3);
  for(let t=1;t<100;t+=.5)weather.tick(t,0,13,field,elements,[],drops,[origin]);expect(Math.abs(drops[0].velocity!.x)).toBeLessThanOrEqual(3);expect(drops[0].position).toEqual(origin);expect(drops[0].count).toBe(10);
  weather.tick(101,0,11,field,elements,[{position:{x:40,y:0,z:0},hp:100,body,active:true},{position:origin,hp:100,body,active:false}],[],[origin]);expect(body.wet).toBe(0);
 });
 it('is connected to campaign ticks and preserves the schedule across a real save restore',()=>{
  const sim=new CoreSimulation(true,false,true);sim.worldHour=11;sim.enemies[0].position={x:10,y:.25,z:5};sim.player.position={x:10,y:.25,z:6};
  sim.tick(1/60,neutral);expect(sim.enemyElements[0].wet).toBeGreaterThan(0);expect(sim.weather.kind).toBe('rain');
  const save=captureCampaign(sim,defaultSettings()),restored=new CoreSimulation(true,false,true);expect(!!restoreCampaignInto(restored,save)).toBe(true);expect(restored.weather).toEqual(sim.weather);
  const trial=new CoreSimulation();trial.worldHour=11;trial.tick(1/60,neutral);expect(trial.weatherReactions.lastRayCount).toBe(0);
 },15000);
});
