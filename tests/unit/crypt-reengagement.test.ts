import {describe,it,expect} from 'vitest';
import {cryptReengagementWaypoint,cryptRetreatWaypoint,type CryptWaypoint} from '../e2e/helpers/crypt-reengagement';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {createCampaignSamplePrototype} from '../../src/prototype/core/campaign-sample-provider';
import {StreamedCampaignField} from '../../src/prototype/core/streamed-campaign-field';
import {createGuardAwareness,updateGuardAwareness} from '../../src/prototype/core/guard-awareness';
import {createArena,setDoor} from '../../src/prototype/core/world';

const field=createArena().field;setDoor(field,true);
function clear(from:{x:number;z:number},to:{x:number;z:number},terrain=field){
 const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.05);
 for(let i=0;i<=steps;i++){
  const t=steps?i/steps:0;
  const position={x:from.x+(to.x-from.x)*t,y:.25,z:from.z+(to.z-from.z)*t};
  // Production movement accepts a clear body or its existing .26m step-up.
  if(terrain.overlaps(position,.27,1.65)&&terrain.overlaps({...position,y:.51},.27,1.65))return false;
 }
 return true;
}
describe('physical crypt reengagement waypoints',()=>{
 it.each([{x:-1.5,z:5.3},{x:3.2,z:6},{x:-12.881772098149394,z:4.907279779469794},{x:5.59,z:8.18}])('centers a displaced courtyard fighter before crossing the wall: %j',player=>{
  expect(clear(player,{x:0,z:0})).toBe(false);
  for(let i=0;i<5&&Math.hypot(player.x,player.z)>.18;i++){
   const waypoint=cryptReengagementWaypoint(player,{x:0,z:-9});
   expect(clear(player,waypoint),`Clear segment ${JSON.stringify(player)} to ${JSON.stringify(waypoint)}`).toBe(true);
   player=waypoint;
  }
  expect(player).toEqual({x:0,z:0});
 });
 it('re-enters the unchanged warden sight range through the centered doorway',()=>{
  const home={x:2,y:.25,z:-9},state=createGuardAwareness(home);let player={x:5.59,z:8.18};
  for(let i=0;i<40;i++)updateGuardAwareness(state,home,{...player,y:.25},true,field,.1);
  expect(state.mode).toBe('idle');expect(state.visible).toBe(false);
  for(let leg=0;leg<5&&Math.hypot(player.x,player.z)>.18;leg++)player=cryptReengagementWaypoint(player,home);
  for(let i=0;i<10;i++)updateGuardAwareness(state,home,{...player,y:.25},true,field,.1);
  expect(player).toEqual({x:0,z:0});expect(state.mode).toBe('chase');expect(state.visible).toBe(true);
 });
 it('moves down the clear aisle into attack range of the returning warden',()=>{
  let player={x:0,z:0};const enemy={x:0,z:-9};
  for(let i=0;i<8;i++){const approach=cryptReengagementWaypoint(player,enemy);expect(Math.hypot(approach.x-player.x,approach.z-player.z)).toBeLessThanOrEqual(1);expect(clear(player,approach)).toBe(true);player=approach;}
  expect(player).toEqual({x:0,z:-7.6});expect(Math.hypot(player.x-enemy.x,player.z-enemy.z)).toBeLessThan(1.45);
 });
 it('centers an indoor displacement before following a warden along the aisle',()=>{
  const player={x:1.5,z:-1},enemy={x:0,z:-9},center=cryptReengagementWaypoint(player,enemy);
  expect(center).toEqual({x:0,z:-1});expect(clear(player,center)).toBe(true);
 });
 it('advances after settling within the existing doorway tolerance',()=>{
  const player={x:.08,z:.1},next=cryptReengagementWaypoint(player,{x:2,z:-9});
  expect(Math.hypot(next.x-player.x,next.z-player.z)).toBeGreaterThan(.18);
  expect(next.z).toBeLessThan(0);expect(clear(player,next)).toBe(true);
 });
 it('keeps the approach south of the solid altar and within the clear aisle',()=>{
  const approach=cryptReengagementWaypoint({x:0,z:-7},{x:4,z:-12});
  expect(approach).toEqual({x:0,z:-8});expect(clear({x:0,z:-3},approach)).toBe(true);
 });
});

const campaignField=new StreamedCampaignField(createCampaignSamplePrototype().provider);setDoor(campaignField,true);
const neutral:Controls={x:0,z:0,sprint:false,block:false,water:false};
function physicalFixture(position:{x:number;y:number;z:number}){
 const sim=new CoreSimulation(true,false,true);setDoor(sim.arena.field,true);
 // Isolate physical routes from combat: these are initial fixture conditions,
 // while every route step below uses the production look/action/tick paths.
 for(const enemy of sim.enemies)enemy.hp=0;
 Object.assign(sim.player.position,position);
 for(let i=0;i<5;i++)sim.tick(1/60,neutral);
 return sim;
}
function followWaypoint(sim:CoreSimulation,waypoint:CryptWaypoint){
 const p=sim.player;let jumped=false;
 for(let frame=0;frame<600;frame++){
  const dx=waypoint.x-p.position.x,dz=waypoint.z-p.position.z;
  if(Math.hypot(dx,dz)<.15){for(let i=0;i<15;i++)sim.tick(1/60,neutral);return;}
  const yaw=Math.atan2(-dx,-dz),error=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
  sim.look(-error,p.pitch);
  if(waypoint.jump&&!jumped&&p.grounded){sim.action('jump',neutral);jumped=true;}
  sim.tick(1/60,{...neutral,z:1});
  expect(p.hp,'Ordinary recovery must stay on supported terrain').toBeGreaterThan(0);
 }
 throw Error(`Ordinary movement stalled at ${JSON.stringify(p.position)} toward ${JSON.stringify(waypoint)}`);
}
describe('campaign crypt exterior and safe retreat routes',()=>{
 it.each([{x:5.13,y:-.502,z:-3.475},{x:7.167,y:-.502,z:-.105}])('routes an actual east-basin failure through one ordinary jump: %j',start=>{
  const sim=physicalFixture(start),enemy={x:2,z:-9},route:CryptWaypoint[]=[];
  expect(cryptReengagementWaypoint(start,enemy)).toEqual({x:5.5,z:.5});
  for(let leg=0;leg<5&&Math.hypot(sim.player.position.x,sim.player.position.z)>=.18;leg++){
   const waypoint=cryptReengagementWaypoint(sim.player.position,enemy);route.push(waypoint);followWaypoint(sim,waypoint);
  }
  expect(route.filter(w=>w.jump)).toEqual([{x:5.5,z:1.8,jump:true}]);
  expect(Math.hypot(sim.player.position.x,sim.player.position.z),JSON.stringify(route)).toBeLessThan(.18);
  expect(sim.player.position.y).toBeGreaterThan(.1);expect(sim.player.hp).toBe(100);
 });
 it('uses the ordinary 12-stamina jump at the staged basin curb',()=>{
  const sim=physicalFixture({x:5.5,y:-.502,z:.5}),stamina=sim.player.stamina;
  expect(sim.player.grounded).toBe(true);
  const next=cryptReengagementWaypoint(sim.player.position,{x:2,z:-9});
  expect(next).toEqual({x:5.5,z:1.8,jump:true});
  sim.action('jump',neutral);expect(sim.player.vy).toBe(5);expect(sim.player.stamina).toBe(stamina-12);
  followWaypoint(sim,{x:next.x,z:next.z});expect(sim.player.position.y).toBeGreaterThan(.1);
 });
 it.each([{x:-12.881772098149394,z:4.907279779469794},{x:-8,z:-1},{x:-8,z:-4},{x:-6,z:-5},{x:-8.394,z:7.218}])('avoids the campaign western trees, berries, rock, and hearth: %j',player=>{
  const route:CryptWaypoint[]=[];
  for(let leg=0;leg<5&&Math.hypot(player.x,player.z)>=.18;leg++){
   const next=cryptReengagementWaypoint(player,{x:2,z:-9});route.push(next);
   expect(clear(player,next,campaignField),`Campaign segment ${JSON.stringify(player)} to ${JSON.stringify(next)}`).toBe(true);player=next;
  }
  expect(player,JSON.stringify(route)).toEqual({x:0,z:0});
 });
 it('first backs north from the west doorway pin, then centers and exits south',()=>{
  const enemy={x:0,z:1.5},sim=physicalFixture({x:-1,y:.25,z:.5}),route:CryptWaypoint[]=[];
  for(let leg=0;leg<3;leg++){
   const next=cryptRetreatWaypoint(sim.player.position,enemy);route.push(next);followWaypoint(sim,next);
  }
  expect(route[0]).toEqual({x:-1,z:0});expect(route[1]).toEqual({x:0,z:0});expect(route[2]).toEqual({x:0,z:5.3});
  expect(Math.hypot(sim.player.position.x,sim.player.position.z-5.3)).toBeLessThan(.18);
 });
 it.each([{x:0,z:5.3},{x:0,z:7.759}])('recovers laterally on a bounded clear lane without backstepping toward a cliff: %j',player=>{
  const enemy={x:0,z:player.z-1.25},next=cryptRetreatWaypoint(player,enemy);
  expect(next.x).toBe(4.8);expect(next.z).toBeGreaterThanOrEqual(player.z);expect(next.z).toBeLessThanOrEqual(8.4);
  expect(clear(player,next,campaignField)).toBe(true);
  expect(cryptRetreatWaypoint(next,enemy)).toEqual(next);
 });
});
