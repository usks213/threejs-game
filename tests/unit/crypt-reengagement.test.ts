import {describe,it,expect} from 'vitest';
import {cryptReengagementWaypoint} from '../e2e/helpers/crypt-reengagement';
import {createGuardAwareness,updateGuardAwareness} from '../../src/prototype/core/guard-awareness';
import {createArena,setDoor} from '../../src/prototype/core/world';

const field=createArena().field;setDoor(field,true);
function clear(from:{x:number;z:number},to:{x:number;z:number}){
 const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.05);
 for(let i=0;i<=steps;i++){
  const t=steps?i/steps:0;
  const position={x:from.x+(to.x-from.x)*t,y:.25,z:from.z+(to.z-from.z)*t};
  // Production movement accepts a clear body or its existing .26m step-up.
  if(field.overlaps(position,.27,1.65)&&field.overlaps({...position,y:.51},.27,1.65))return false;
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
