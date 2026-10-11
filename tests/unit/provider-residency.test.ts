import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {SurvivalSystem} from '../../src/prototype/core/survival';
import {VoxelField,type Cell} from '../../src/prototype/core/voxel';
import {SampleManifestRecorder} from '../../src/prototype/core/sample-provider';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
import {ProviderResidency,samplesForObject} from '../../src/prototype/rendering/provider-residency';
import {WorldMeshes,voxelGeometry} from '../../src/prototype/rendering/meshes';
const author=(f:VoxelField)=>{f.box({x:-6,y:-1,z:-3},{x:6,y:.25,z:9},2);f.box({x:-1,y:.25,z:3},{x:1,y:2,z:5},4,'wood');f.box({x:3,y:0,z:3},{x:5,y:3,z:5},3);f.box({x:3.5,y:.2,z:2.5},{x:4.5,y:2,z:4.5},0);};
const pair=()=>{const original=new VoxelField(),recorder=new SampleManifestRecorder();author(original);author(recorder);return{original,field:new SparseOverlayField(recorder.createProvider('residency',4))};};
const settle=(world:WorldMeshes,center={x:0,y:.25,z:6})=>{for(let n=0;n<80;n++){world.sync(center,4);if(!world.lastBuiltChunks)return;}throw new Error('Mesh queue did not settle');};
const canon=(g:THREE.BufferGeometry)=>{const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color');return Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)].join(',')).sort();};
const sorted=(cells:Iterable<Cell>)=>[...cells].map(c=>[c.x,c.y,c.z,c.distance,c.material,c.object].join(',')).sort();

describe('bounded provider-backed rendering',()=>{
 it('enumerates exact owner corners and meshes equivalent positions/normals/materials without global cells',()=>{
  const {original,field}=pair();field.cells.values=vi.fn(()=>{throw new Error('Global cells scan forbidden');});const world=new WorldMeshes(field,new THREE.Scene());settle(world);
  expect(world.residency).not.toBeNull();expect(world.bucketScans).toBe(0);expect(world.chunks.size).toBeGreaterThan(0);
  for(const [id,mesh] of world.chunks){const expected=voxelGeometry(original,original.cells.values(),id);expect(canon(mesh.geometry)).toEqual(canon(expected));expect(mesh.geometry.index?.count).toBe(expected.index?.count);expected.dispose();}
  expect(world.stats.provider!.numericCacheBytes).toBeLessThanOrEqual(4*4096*12);world.dispose();
 });
 it('finds tall new construction outside all authored bounds and removes its ghost geometry',()=>{
  const {field}=pair(),world=new WorldMeshes(field,new THREE.Scene()),center={x:50,y:30,z:5};field.box({x:49,y:30,z:4},{x:51,y:34,z:6},4,'build:tall');settle(world,center);expect(world.chunks.size).toBeGreaterThan(0);expect([...world.chunks.values()].some(mesh=>mesh.geometry.boundingSphere!.center.y>25)).toBe(true);
  field.removeObject('build:tall');settle(world,center);expect(world.chunks.size).toBe(0);world.dispose();
 });
 it('preserves exact seam geometry after a cross-boundary terrain edit',()=>{
  const {original,field}=pair(),world=new WorldMeshes(field,new THREE.Scene());settle(world);for(const f of [original,field])f.carve({x:0,y:.25,z:6},1);settle(world);
  for(const id of ['-1,1','0,1']){const expected=voxelGeometry(original,original.cells.values(),id);expect(canon(world.chunks.get(id)!.geometry)).toEqual(canon(expected));expected.dispose();}world.dispose();
 });
 it('retains bounded numeric caches across distant eviction and restores collisions and geometry',()=>{
  const {field}=pair(),world=new WorldMeshes(field,new THREE.Scene());settle(world);const original=world.stats.triangles,ground=field.distance({x:4,y:0,z:6});
  for(let i=0;i<20;i++){world.sync({x:50+i*8,y:0,z:5},1);field.sample(200+i*32,0,0);expect(world.stats.provider!.numericCacheBytes).toBeLessThanOrEqual(4*4096*12);}
  expect(world.chunks.size).toBe(0);expect(field.distance({x:4,y:0,z:6})).toBe(ground);settle(world);expect(world.stats.triangles).toBe(original);world.dispose();
 });
 it('returns exact composed object signatures, including positive bands and occlusion',()=>{
  const {original,field}=pair();for(const f of [original,field]){f.box({x:0,y:1,z:3},{x:2,y:3,z:5},6,'build:cover');f.carve({x:0,y:.8,z:4},.5);}
  for(const id of ['wood','build:cover'])expect(sorted(samplesForObject(field,id))).toEqual(sorted(samplesForObject(original,id)));
  field.removeObject('wood');expect([...samplesForObject(field,'wood')]).toHaveLength(0);
 });
 it('restores changed layer order without incorrectly taking the baseline fast path',()=>{
  const recorder=new SampleManifestRecorder();for(const id of ['first','second'])recorder.box({x:0,y:0,z:4},{x:2,y:2,z:6},id==='first'?4:6,id);
  const field=new SparseOverlayField(recorder.createProvider('ties'));expect(field.get(2,2,18)?.object).toBe('first');const saved=field.exportOverlay();saved.order.reverse();const world=new WorldMeshes(field,new THREE.Scene());settle(world);field.dirty.clear();
  expect(field.restoreOverlay(saved)).toBe(true);expect(field.get(2,2,18)?.object).toBe('second');expect(field.dirty.size).toBeGreaterThan(0);const before=world.remeshes;settle(world);expect(world.remeshes).toBeGreaterThan(before);world.dispose();
 });
 it('derives finite sample bounds from metadata without evaluating samples',()=>{
  const {field}=pair(),helper=new ProviderResidency(field);expect([...field.provider.authoredChunkKeys()].length).toBeGreaterThan(0);expect(helper.nearChunkKeys({x:0,y:0,z:6},24).length).toBeGreaterThan(0);expect(helper.boundsForOwner('0,1')).toBeDefined();expect(field.provider.stats.evaluations).toBe(0);expect([...helper.samples('999,999')]).toHaveLength(0);expect(field.provider.stats.evaluations).toBe(0);
 });
});

describe('provider building signatures across eviction',()=>{
 const setup=()=>{const recorder=new SampleManifestRecorder();recorder.box({x:-9,y:-1,z:-9},{x:9,y:.25,z:9},3);const field=new SparseOverlayField(recorder.createProvider('builds',2)),system=new SurvivalSystem(field);system.inventory[4]=200;expect(system.place({x:0,y:.25,z:0},{x:0,y:.25,z:2.2}).ok).toBe(true);return{field,system};};
 const target={x:2,y:.25,z:0},player={x:2,y:.25,z:2.2};
 it('undo refunds an unchanged wall exactly once after all numeric caches are evicted',()=>{const {field,system}=setup();system.selected='wall';expect(system.place(target,player).ok).toBe(true);field.provider.clearCache();expect(system.undo(player).ok).toBe(true);expect(system.inventory[4]).toBe(192);expect(field.distance({x:2,y:1,z:0})).toBeGreaterThan(0);expect(system.undo(player).ok).toBe(false);});
 it('a mined wall cannot gain an intact refund after cache eviction',()=>{const {field,system}=setup();system.selected='wall';system.place(target,player);const build=system.exportState().buildings.at(-1)!;field.carve({x:2,y:1,z:0},.3);field.provider.clearCache();expect(system.undo(player).ok).toBe(false);const held=system.inventory[4];expect(system.dismantle(build.id,player).ok).toBe(true);expect(system.inventory[4]).toBe(held);});
 it('opens and closes built doors after eviction with the same positive-band signature',()=>{const {field,system}=setup();system.selected='door';expect(system.place(target,player).ok).toBe(true);const build=system.exportState().buildings.at(-1)!;field.provider.clearCache();expect(system.toggleDoor(build.id,player).ok).toBe(true);field.provider.clearCache();expect(system.toggleDoor(build.id,player).ok).toBe(true);expect(field.distance({x:2,y:1,z:0})).toBeLessThan(0);});
});
