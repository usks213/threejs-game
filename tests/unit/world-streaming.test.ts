import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {VoxelField} from '../../src/prototype/core/voxel';
import {WorldMeshes,voxelGeometry} from '../../src/prototype/rendering/meshes';
const spawn={x:0,y:0,z:6};
const create=()=>{const field=new VoxelField();field.box({x:-7,y:-.5,z:-3},{x:7,y:.25,z:10},2);field.box({x:39,y:-.5,z:-3},{x:49,y:.25,z:10},3);return{field,world:new WorldMeshes(field,new THREE.Scene())};};
const fill=(world:WorldMeshes,center=spawn)=>{for(let i=0;i<30;i++){world.sync(center,4);if(!world.lastBuiltChunks)break;}};
const triangleCount=(g:THREE.BufferGeometry)=>(g.index?.count??g.getAttribute('position').count)/3;

describe('view-near world mesh streaming',()=>{
 it('budgets initial work, prioritizes spawn, and leaves distant dirty edits pending',()=>{
  const {field,world}=create();const before=field.cells.size;world.sync();expect(world.lastBuiltChunks).toBe(4);expect(world.chunks.size).toBeLessThanOrEqual(4);
  expect([...world.chunks.keys()].every(id=>Number(id.split(',')[0])<5)).toBe(true);expect([...field.dirty].some(id=>Number(id.split(',')[0])>=9)).toBe(true);expect(field.cells.size).toBe(before);world.dispose();
 });
 it('reuses owner buckets on unchanged frames, including movement and idle calls',()=>{
  const {world}=create();fill(world);expect(world.bucketScans).toBe(1);const count=world.remeshes;
  world.sync();world.sync({x:1,y:0,z:6});expect(world.bucketScans).toBe(1);expect(world.remeshes).toBe(count);world.dispose();
 });
 it('evicts and disposes distant geometry, then builds it again on return',()=>{
  const {world}=create();fill(world);const original=[...world.chunks.values()][0],disposed=vi.fn();original.geometry.addEventListener('dispose',disposed);
  world.sync({x:44,y:0,z:6},1);expect(disposed).toHaveBeenCalledTimes(1);expect(world.scene.children).not.toContain(original);expect(world.lastBuiltChunks).toBe(1);
  fill(world,spawn);expect(world.chunks.size).toBeGreaterThan(0);expect(world.scene.children).not.toContain(original);world.dispose();
 });
 it('matches exact owner geometry and collision samples without loading far chunks',()=>{
  const {world,field}=create(),samples=[...field.cells.values()].map(c=>({...c}));fill(world);
  for(const [id,mesh] of world.chunks){const full=voxelGeometry(field,field.cells.values(),id);expect(triangleCount(mesh.geometry)).toBe(triangleCount(full));expect([...mesh.geometry.getAttribute('position').array]).toEqual([...full.getAttribute('position').array]);full.dispose();}
  expect([...field.cells.values()]).toEqual(samples);expect(field.at({x:44,y:0,z:6})).toBeDefined();world.dispose();
 });
 it('remeshes near edits first and preserves far dirty changes until approached',()=>{
  const {world,field}=create();fill(world);const disposed=vi.fn();for(const mesh of world.chunks.values())mesh.geometry.addEventListener('dispose',disposed);
  field.carve({x:1,y:.25,z:5},.7);field.carve({x:43,y:.25,z:5},.7);const dirtyFar=[...field.dirty].filter(id=>Number(id.split(',')[0])>=9);
  world.sync(spawn,1);expect(disposed).toHaveBeenCalledTimes(1);expect(world.bucketScans).toBe(2);expect(dirtyFar.every(id=>field.dirty.has(id))).toBe(true);
  fill(world,{x:44,y:0,z:6});expect(dirtyFar.every(id=>!field.dirty.has(id))).toBe(true);world.dispose();
 });
 it('keeps edited chunk boundaries identical to full-resolution owner meshing',()=>{
  const {world,field}=create();fill(world);field.carve({x:0,y:.25,z:6},1);fill(world);
  for(const id of ['-1,1','0,1']){const actual=world.chunks.get(id)!.geometry,expected=voxelGeometry(field,field.cells.values(),id);expect([...actual.getAttribute('position').array]).toEqual([...expected.getAttribute('position').array]);expect([...actual.getAttribute('normal').array]).toEqual([...expected.getAttribute('normal').array]);expected.dispose();}
  world.dispose();
 });
 it('removes fully carved geometry and does not rebuild empty chunks every frame',()=>{
  const field=new VoxelField();field.box({x:.5,y:0,z:4.5},{x:1.5,y:1,z:5.5},3);const world=new WorldMeshes(field,new THREE.Scene());fill(world);expect(world.chunks.size).toBeGreaterThan(0);
  field.box({x:-1,y:-1,z:3},{x:3,y:3,z:7},0);fill(world);expect(world.chunks.size).toBe(0);world.sync();expect(world.lastBuiltChunks).toBe(0);world.dispose();
 });
 it('retains geometry in the hysteresis band and respects a zero build budget',()=>{
  const {world}=create();fill(world);const mesh=world.chunks.get('0,1')!;world.sync({x:30,y:0,z:6},0);expect(world.chunks.get('0,1')).toBe(mesh);expect(world.lastBuiltChunks).toBe(0);world.dispose();
 });
});
