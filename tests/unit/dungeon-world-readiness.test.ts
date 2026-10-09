import {describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {dungeonAuthoringSteps,dungeonBucketSteps,DungeonWorldLoader} from '../../src/dungeon/world-loader';
import {dungeonField} from '../../src/dungeon/world';
import {voxelGeometry} from '../../src/prototype/rendering/meshes';
import type {VoxelField} from '../../src/prototype/core/voxel';
import type {Door} from '../../src/dungeon/types';

const doors=(mask=0):Door[]=>[{id:'north',position:{x:0,y:0,z:-4.75},open:!!(mask&1)},{id:'south',position:{x:0,y:0,z:5.25},open:!!(mask&2)}];
const description=(seed=7919,mask=0)=>({you:'p1',raid:1,seed,doors:doors(mask)});
const finish=<T>(steps:Generator<void,T>)=>{for(;;){const result=steps.next();if(result.done)return result.value;}};
function hash(field:VoxelField){const digest=createHash('sha256');for(const [key,c]of field.cells)digest.update(JSON.stringify([key,c.distance,c.material,c.object??null]));return digest.digest('hex');}
const fast=()=>{let now=0;return {now:()=>++now,yieldTask:async()=>{}};};
async function settled(loader:DungeonWorldLoader){let previous:Promise<void>;do{previous=loader.completion;await previous;}while(previous!==loader.completion);}
function equalGeometry(actual:THREE.BufferGeometry,expected:THREE.BufferGeometry){
 for(const name of ['position','normal','color','voxelSurface'])expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array);
 expect(actual.index?.array).toEqual(expected.index?.array);
}

describe('exact cooperative dungeon surfaces',()=>{
 it.each([1,2].flatMap(seed=>[0,1,2,3].map(mask=>({seed,mask}))))('preserves every authored sample and owner boundary for $seed / $mask',({seed,mask})=>{
  const actual=finish(dungeonAuthoringSteps(seed,doors(mask))),expected=dungeonField(seed,doors(mask));
  expect(hash(actual)).toBe(hash(expected));expect([...actual.dirty].sort()).toEqual([...expected.dirty].sort());
  const buckets=finish(dungeonBucketSteps(actual));
  for(const id of ['-1,-2','0,-2','-1,1','0,1']){
   const a=voxelGeometry(actual,buckets.get(id),id),b=voxelGeometry(expected,expected.cells.values(),id);
   equalGeometry(a,b);a.dispose();b.dispose();
  }
 });
 it('stages the full owner manifest before any playable frame, including far corners',async()=>{
  const scene=new THREE.Scene(),changed=vi.fn(),loader=new DungeonWorldLoader(scene,{...fast(),changed});
  loader.request(description());expect(loader.field).toBeNull();expect(loader.state).toBe('authoring');expect(loader.presentable).toBe(false);
  loader.show();loader.rendered();expect(loader.ready).toBe(false);
  await settled(loader);expect(loader.state).toBe('awaiting-frame');expect(loader.ready).toBe(false);expect(loader.presentable).toBe(true);
  const buckets=finish(dungeonBucketSteps(loader.field!));expect([...loader.meshes.keys()].sort()).toEqual([...buckets.keys()].sort());
  expect(loader.meshes.size).toBe(81);expect(loader.meshes.has('-5,-5')).toBe(true);expect(loader.meshes.has('3,3')).toBe(true);
  expect(scene.children[0].visible).toBe(false);
  // A hidden tab performs no successful draw; completing CPU work alone stays gated.
  await Promise.resolve();expect(loader.ready).toBe(false);
  loader.show();expect(scene.children[0].visible).toBe(true);expect(loader.ready).toBe(false);
  loader.rendered();expect(loader.state).toBe('ready');expect(loader.ready).toBe(true);
  const field=loader.field;const count=changed.mock.calls.length;loader.request(description());await settled(loader);
  expect(loader.field).toBe(field);expect(changed).toHaveBeenCalledTimes(count);
  loader.dispose();expect(scene.children).toHaveLength(0);
 });
});

describe('dungeon world generations and live doors',()=>{
 it('coalesces doors changed while authoring/meshing without revealing the captured old revision',async()=>{
  let loader:DungeonWorldLoader,changed=false,now=0;
  loader=new DungeonWorldLoader(new THREE.Scene(),{now:()=>++now,yieldTask:async()=>{if(loader.field&&!changed){changed=true;loader.request(description(7919,3));loader.show();loader.rendered();expect(loader.ready).toBe(false);}}});
  const original=description();loader.request(original);original.doors[0].position.x=100;
  await settled(loader);expect(changed).toBe(true);expect(loader.field!.distance({x:0,y:1,z:-4.75})).toBeGreaterThan(0);expect(loader.field!.distance({x:0,y:1,z:5.25})).toBeGreaterThan(0);
  expect(loader.state).toBe('awaiting-frame');loader.show();loader.rendered();expect(loader.ready).toBe(true);loader.dispose();
 });
 it('swaps a complete live door revision without changing readiness or dropping gameplay',async()=>{
  const changed=vi.fn(),scene=new THREE.Scene(),loader=new DungeonWorldLoader(scene,{...fast(),changed});loader.request(description());await settled(loader);loader.show();loader.rendered();
  const old=new Map(loader.meshes),oldDisposed=[...old.values()].map(mesh=>vi.spyOn(mesh.geometry,'dispose'));changed.mockClear();
  loader.request(description(7919,1));expect(loader.ready).toBe(true);expect(loader.presentable).toBe(true);expect(scene.children[0].visible).toBe(true);
  loader.request(description(7919,3));await settled(loader);
  expect(loader.ready).toBe(true);expect(loader.state).toBe('ready');expect(changed).not.toHaveBeenCalled();
  const expected=dungeonField(7919,doors(3));
  for(const id of ['-1,-2','0,-2','-1,1','0,1']){const g=voxelGeometry(expected,expected.cells.values(),id);equalGeometry(loader.meshes.get(id)!.geometry,g);g.dispose();}
  expect(oldDisposed.some(spy=>spy.mock.calls.length===1)).toBe(true);expect(oldDisposed.some(spy=>spy.mock.calls.length===0)).toBe(true);
  const remaining=[...loader.meshes.values()].map(mesh=>vi.spyOn(mesh.geometry,'dispose'));loader.dispose();loader.dispose();expect(remaining.every(spy=>spy.mock.calls.length===1)).toBe(true);
 });
 it.each(['seed','raid','player','clear','dispose'] as const)('cancels stale %s work before it can sample, commit or enable play',async reason=>{
  let resume=()=>{};let hold=true,now=0;
  const scene=new THREE.Scene(),loader=new DungeonWorldLoader(scene,{now:()=>++now,yieldTask:signal=>hold?new Promise<void>(resolve=>{resume=resolve;signal.addEventListener('abort',()=>resolve(),{once:true});}):Promise.resolve()});
  loader.request(description());const stale=loader.completion;hold=false;
  if(reason==='clear')loader.clear();else if(reason==='dispose')loader.dispose();else loader.request({...description(reason==='seed'?2:7919),raid:reason==='raid'?2:1,you:reason==='player'?'p2':'p1'});
  resume();await stale;await settled(loader);
  expect(loader.ready).toBe(false);
  if(reason==='clear'||reason==='dispose'){expect(scene.children).toHaveLength(0);expect(loader.field).toBeNull();expect(loader.state).toBe('idle');}
  else{expect(scene.children).toHaveLength(1);expect(loader.state).toBe('awaiting-frame');expect(hash(loader.field!)).toBe(hash(dungeonField(reason==='seed'?2:7919,doors())));}
  loader.dispose();
 });
 it('cannot re-enable after disposal in the middle of meshing',async()=>{
  let loader:DungeonWorldLoader,now=0;
  loader=new DungeonWorldLoader(new THREE.Scene(),{now:()=>++now,yieldTask:async()=>{if(loader.field)loader.dispose();}});loader.request(description());await settled(loader);
  expect(loader.state).toBe('idle');expect(loader.ready).toBe(false);expect(loader.presentable).toBe(false);expect(loader.meshes.size).toBe(0);loader.rendered();expect(loader.ready).toBe(false);
 });
 it('reports failure without claiming readiness and can restart after explicit reset',async()=>{
  let fail=true;const loader=new DungeonWorldLoader(new THREE.Scene(),{...fast(),yieldTask:async()=>{if(fail)throw new Error('scheduler unavailable');}});
  loader.request(description());await settled(loader);expect(loader.state).toBe('failed');expect(loader.presentable).toBe(false);loader.rendered();expect(loader.ready).toBe(false);
  fail=false;loader.clear();loader.request(description());await settled(loader);expect(loader.state).toBe('awaiting-frame');loader.dispose();
 });
});
