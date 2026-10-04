import { describe,expect,it } from 'vitest';
import { BUILDINGS } from '../../src/content/catalog';
import type { BuildingState } from '../../src/game/types';
import { blockedByBuilding,sees,touchesBuildingVoxels } from '../../src/game/meadows/obstacles';
import { buildingPose,buildingVoxels,worldPoint } from '../../src/game/voxel/model';
import { buildingsOverlap,placementIssue,snapBuilding } from '../../src/game/placement';
import { GameSimulation } from '../../src/simulation/game-simulation';

const piece=(definition='wall',overrides:Partial<BuildingState>={}):BuildingState=>({id:1,definition,x:0,y:0,z:0,rotation:0,support:4,contents:{},...overrides});
const definition=(id:string)=>BUILDINGS.find(b=>b.id===id)!;
const inventory={wood:100,stone:100};
const player={x:0,y:0,z:4};

describe('shared occupied building cells',()=>{
 it('leaves intact portal, high stairs, and roof interiors empty',()=>{
  expect(blockedByBuilding(piece('portal'),0,0,0)).toBe(false);
  expect(blockedByBuilding(piece('portal'),.8,0,0)).toBe(true);
  expect(blockedByBuilding(piece('stairs'),0,0,.85,.1)).toBe(false);
  expect(blockedByBuilding(piece('stairs'),0,0,-.5,.1)).toBe(true);
  expect(blockedByBuilding(piece('roof45'),0,0,.85,.1)).toBe(false);
  expect(blockedByBuilding(piece('roof45'),0,1.75,.85,.1,.2)).toBe(true);
 });
 it('honors requested body radius, height, rotation and tangential contact',()=>{
  const wall=piece('wall',{x:2,y:3,z:-4,rotation:Math.PI/4});
  const point=worldPoint({x:0,y:.2,z:.55},wall,wall.rotation);
  expect(blockedByBuilding(wall,point.x,point.y,point.z,.1)).toBe(false);
  expect(blockedByBuilding(wall,point.x,point.y,point.z,.7)).toBe(true);
  expect(touchesBuildingVoxels(piece('floor'),0,.25,0)).toBe(false);
  expect(touchesBuildingVoxels(piece('wall'),0,-1,0,.3,.8)).toBe(false);
  expect(touchesBuildingVoxels(piece('wall'),0,-1,0,.3,1.1)).toBe(true);
  expect(blockedByBuilding(piece('wall'),0,0,.425,.3)).toBe(false);
 });
 it('uses removed cells without restoring an invisible bounding box',()=>{
  const wall=piece('wall');
  wall.removed=[...buildingVoxels('wall').cells.values()].filter(c=>Math.abs((c.x+.5)*.125)<.5).map(c=>c.key);
  expect(blockedByBuilding(wall,0,0,0,.3)).toBe(false);
  expect(blockedByBuilding(wall,.75,0,0,.1)).toBe(true);
  expect(blockedByBuilding({...wall,rotation:Math.PI/2},0,0,-.75,.1)).toBe(true);
 });
 it('moves open door collision around the same hinge as its visible model',()=>{
  const closed=piece('door'),open={...closed,open:true},pose=buildingPose(open);
  expect(pose.x).toBeCloseTo(-.5);expect(pose.z).toBeCloseTo(-.5);expect(pose.rotation).toBeCloseTo(Math.PI/2);
  expect(blockedByBuilding(closed,0,0,0,.2)).toBe(true);
  expect(blockedByBuilding(open,0,0,0,.2)).toBe(false);
  expect(blockedByBuilding(open,pose.x,0,pose.z,.2)).toBe(true);
  expect(blockedByBuilding(piece('wall',{open:true}),0,0,0)).toBe(true);
  const rotated=piece('gate',{x:3,z:2,rotation:Math.PI/3,open:true}),rotatedPose=buildingPose(rotated);
  const fixedHinge=worldPoint({x:-1,y:0,z:0},rotated,rotated.rotation),openHinge=worldPoint({x:-1,y:0,z:0},rotatedPose,rotatedPose.rotation);
  expect(openHinge.x).toBeCloseTo(fixedHinge.x);expect(openHinge.z).toBeCloseTo(fixedHinge.z);
 });
 it('blocks sight at thin intervening walls but sees through an eye-height carved window',()=>{
  const sim=new GameSimulation();sim.world.density=()=>1;
  const wall=piece('wall',{z:.45});sim.adventure.state.buildings=[wall];
  const a={x:0,y:0,z:-3},b={x:0,y:0,z:3};
  expect(sees(sim,a,b)).toBe(false);
  wall.removed=[...buildingVoxels('wall').cells.values()].filter(c=>Math.abs((c.x+.5)*.125)<.5&&(c.y+.5)*.125>.5&&(c.y+.5)*.125<1.5).map(c=>c.key);
  expect(sees(sim,a,b)).toBe(true);
  expect(sees(sim,{...a,x:.8},{...b,x:.8})).toBe(false);
  sim.adventure.state.buildings=[piece('door',{open:true})];
  expect(sees(sim,a,b)).toBe(true);
  expect(sees(sim,{x:-2,y:0,z:-.5},{x:2,y:0,z:-.5})).toBe(false);
 });
});

describe('voxel placement and face sockets',()=>{
 it('rejects overlapping volumes even when centers are more than 0.6 meters apart',()=>{
  expect(placementIssue(definition('floor'),player,{x:1,y:0,z:0},[piece('floor')],inventory)).toContain('別の場所');
  expect(placementIssue(definition('floor'),player,{x:2,y:0,z:0},[piece('floor')],inventory)).toBe('');
  expect(placementIssue(definition('wall'),player,{x:0,y:0,z:.8},[piece('wall')],inventory,Math.PI/2)).toContain('別の場所');
  expect(placementIssue(definition('wall'),player,{x:0,y:0,z:.8},[piece('wall')],inventory)).toBe('');
 });
 it('allows existing empty interiors and removed-cell gaps to be filled',()=>{
  expect(buildingsOverlap(piece('shortPole'),piece('portal'))).toBe(false);
  const wall=piece('wall');wall.removed=[...buildingVoxels('wall').cells.values()].filter(c=>Math.abs((c.x+.5)*.125)<.25).map(c=>c.key);
  expect(buildingsOverlap(piece('pillar'),wall)).toBe(false);
  expect(buildingsOverlap(piece('pillar',{x:.5}),wall)).toBe(true);
 });
 it('rejects player intersections using occupied shape and full piece size',()=>{
  expect(placementIssue(definition('raft'),{x:1.8,y:0,z:0},{x:0,y:0,z:0},[],{wood:30,leatherScraps:10,resin:10})).toContain('自分');
  expect(placementIssue(definition('portal'),{x:0,y:0,z:0},{x:0,y:0,z:0},[],{wood:10,crystal:2})).toBe('');
  expect(placementIssue(definition('floor'),{x:0,y:.25,z:0},{x:0,y:0,z:0},[],inventory)).toBe('');
 });
 it('stacks floors and roofs on their visible cell boundaries',()=>{
  const floor=piece('floor'),top=snapBuilding('floor',floor,{x:0,y:1,z:0},0,floor);
  expect(top.y).toBe(.25);
  expect(placementIssue(definition('floor'),player,top,[floor],inventory)).toBe('');
  const roof=piece('roof'),roofTop=snapBuilding('floor',roof,{x:0,y:1,z:0},0,roof);
  expect(roofTop.y).toBe(1.25);
  expect(buildingsOverlap(piece('floor',roofTop),roof)).toBe(false);
  const wall=piece('wall'),side=snapBuilding('wall',wall,{x:0,y:0,z:1},0,wall);
  expect(side.z).toBe(.25);
  expect(placementIssue(definition('wall'),player,side,[wall],inventory)).toBe('');
 });
 it('keeps rotated side sockets touching without overlap',()=>{
  const anchor=piece('wall',{rotation:Math.PI/4}),normal={x:Math.SQRT1_2,y:0,z:-Math.SQRT1_2};
  for(const rotation of [0,Math.PI/4,Math.PI/2]){
   const at=snapBuilding('wall',anchor,normal,rotation,anchor),next=piece('wall',{...at,rotation});
   expect(buildingsOverlap(next,anchor)).toBe(false);
   next.x-=normal.x*.01;next.z-=normal.z*.01;
   expect(buildingsOverlap(next,anchor)).toBe(true);
  }
 });
 it('rejects invalid placement input and preserves distance/material errors',()=>{
  expect(placementIssue(definition('wall'),player,{x:NaN,y:0,z:0},[],inventory)).toContain('近く');
  expect(placementIssue(definition('wall'),player,{x:0,y:8,z:0},[],inventory)).toContain('近く');
  expect(placementIssue(definition('wall'),player,{x:0,y:0,z:0},[],{})).toContain('素材');
 });
});
