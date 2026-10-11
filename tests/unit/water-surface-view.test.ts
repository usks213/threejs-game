import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {VoxelField} from '../../src/prototype/core/voxel';
import {VoxelWater} from '../../src/prototype/core/water';
import {waterGeometry,waterSurfaceHeights} from '../../src/prototype/rendering/meshes';
import {createWaterSurfaceView} from '../../src/prototype/rendering/water-surface-view';

function setup(now?:()=>number){
 const field=new VoxelField(),water=new VoxelWater(field);water.volume.fill(0);water.volume[water.index(12,0,24)]=.5;
 const camera=new THREE.PerspectiveCamera(74,16/9,.035,120);camera.position.set(6,2,4);camera.lookAt(6,0,-2);camera.updateProjectionMatrix();
 const material=new THREE.MeshPhysicalMaterial({roughness:.16,clearcoat:1,transparent:true}),view=createWaterSurfaceView(water,camera,material,now);
 view.update(0);return {field,water,camera,material,view};
}
function change(water:VoxelWater){water.volume[water.index(12,0,24)]+=.1;water.revision++;}
function expectCurrent(s:ReturnType<typeof setup>){const expected=waterGeometry(s.water),actual=s.view.mesh.geometry;expect(actual.index?.array).toEqual(expected.index?.array);for(const name of Object.keys(expected.attributes))expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array);expected.dispose();}
function dispose(s:ReturnType<typeof setup>){s.view.dispose();s.material.dispose();}

describe('exact fluid mesh scheduling',()=>{
 it('retains the visible refresh cadence and identical SDF/PBR geometry',()=>{
  const now=vi.fn<()=>number>().mockReturnValueOnce(100).mockReturnValueOnce(108),s=setup(now),old=s.view.mesh.geometry;
  change(s.water);s.view.update(.1);s.view.update(.1);expect(s.view.mesh.geometry).toBe(old);s.view.update(.10001);
  expect(s.view.mesh.geometry).not.toBe(old);expect(s.view.mesh.material).toBe(s.material);expectCurrent(s);
  expect(s.view.stats).toMatchObject({builds:2,lastBuildMs:8,maxBuildMs:8,inView:true});dispose(s);
 });
 it('skips exact unchanged surfaces despite solver revisions, including hidden lower volumes',()=>{
  const s=setup(),old=s.view.mesh.geometry;for(let i=0;i<6;i++){s.water.revision++;s.view.update(.31);}
  expect(s.view.mesh.geometry).toBe(old);expect(s.view.stats.unchangedSkips).toBe(7);
  s.water.volume[s.water.index(12,5,24)]=.5;s.water.revision++;s.view.update(.31);const upper=s.view.mesh.geometry;
  s.water.volume[s.water.index(12,0,24)]=.3;s.water.revision++;s.view.update(.31);expect(s.view.mesh.geometry).toBe(upper);expectCurrent(s);dispose(s);
 });
 it('defers offscreen flowing water and catches up before its first visible frame',()=>{
  const s=setup(),old=s.view.mesh.geometry,initial=s.water.total();s.camera.lookAt(6,2,20);let legacyElapsed=0,legacyBuilds=0;
  for(let i=0;i<20;i++){s.water.step();s.view.update(.1);legacyElapsed+=.1;if(legacyElapsed>.3){legacyBuilds++;legacyElapsed=0;}}
  expect(s.water.total()).toBeCloseTo(initial,7);expect(s.view.mesh.geometry).toBe(old);expect(s.view.stats.offscreenSkips).toBe(20);
  expect(legacyBuilds).toBe(6);expect(s.view.stats.builds).toBe(1);
  s.camera.lookAt(6,0,-2);s.view.update(0);expect(s.view.mesh.geometry).not.toBe(old);expectCurrent(s);dispose(s);
 });
 it('does not remesh a genuinely settled full basin after real solver steps',()=>{
  const field=new VoxelField(),water=new VoxelWater(field);water.volume.fill(1);const camera=new THREE.PerspectiveCamera(74,16/9,.035,120);camera.position.set(6,3,4);camera.lookAt(6,0,-2);
  const material=new THREE.MeshPhysicalMaterial(),view=createWaterSurfaceView(water,camera,material),mass=water.total(),before=waterSurfaceHeights(water);view.update(0);
  for(let i=0;i<20;i++){water.step();view.update(.1);}
  expect(water.revision).toBe(20);expect(waterSurfaceHeights(water)).toEqual(before);expect(water.total()).toBe(mass);expect(view.stats.builds).toBe(1);view.dispose();material.dispose();
 });
 it('rebuilds visible solid edits immediately without waiting for a water revision',()=>{
  const s=setup(),old=s.view.mesh.geometry,revision=s.water.revision;
  s.field.box({x:5.5,y:-.5,z:-2},{x:5.625,y:-.4,z:-1.875},3);s.water.refreshSolids();s.view.update(0);
  expect(s.water.revision).toBe(revision);expect(s.view.mesh.geometry).not.toBe(old);expectCurrent(s);dispose(s);
 });
 it('uses full basin bounds for dry/newly filled columns and cameras inside the basin',()=>{
  const s=setup();s.water.volume.fill(0);s.water.revision++;s.view.update(.31);const empty=s.view.mesh.geometry;
  s.camera.lookAt(6,2,20);s.view.update(0);s.water.volume[s.water.index(47,0,47)]=.8;s.water.revision++;
  s.camera.position.set(9.75,.2,.75);s.camera.lookAt(10,-.5,1);s.view.update(0);
  expect(s.view.stats.inView).toBe(true);expect(s.view.mesh.geometry).not.toBe(empty);expectCurrent(s);dispose(s);
 });
 it('refreshes after camera far-plane or mesh visibility restoration',()=>{
  const s=setup(),old=s.view.mesh.geometry;s.camera.far=.1;s.camera.updateProjectionMatrix();change(s.water);s.view.update(.31);
  expect(s.view.mesh.geometry).toBe(old);s.camera.far=120;s.camera.updateProjectionMatrix();s.view.update(0);expectCurrent(s);
  const current=s.view.mesh.geometry;s.view.mesh.visible=false;change(s.water);s.view.update(.31);expect(s.view.mesh.geometry).toBe(current);
  s.view.mesh.visible=true;s.view.update(0);expect(s.view.mesh.geometry).not.toBe(current);expectCurrent(s);dispose(s);
 });
 it('never advances physics or changes masses, transfers, solids or save data',()=>{
  const s=setup();s.water.add(2,10,24,.8);s.water.step();const volume=s.water.volume.slice(),blocked=s.water.blocked.slice(),mass=s.water.total(),injected=s.water.injected,revision=s.water.revision,phase=s.water.phase,transfer=s.water.downwardTransfer(2,10,24),solid=s.field.exportState();
  const step=vi.spyOn(s.water,'step'),add=vi.spyOn(s.water,'add');s.view.update(.31);s.camera.lookAt(6,2,20);s.view.update(10);s.camera.lookAt(6,0,-2);s.view.update(0);
  expect(step).not.toHaveBeenCalled();expect(add).not.toHaveBeenCalled();expect(s.water.volume).toEqual(volume);expect(s.water.blocked).toEqual(blocked);
  expect(s.water.total()).toBe(mass);expect(s.water.injected).toBe(injected);expect(s.water.revision).toBe(revision);expect(s.water.phase).toBe(phase);expect(s.water.downwardTransfer(2,10,24)).toBe(transfer);expect(s.field.exportState()).toEqual(solid);dispose(s);
 });
 it('replaces geometry atomically, disposes each owned buffer once, and leaves material ownership alone',()=>{
  const s=setup(),scene=new THREE.Scene();scene.add(s.view.mesh);const old=s.view.mesh.geometry,onOld=vi.fn(),onMaterial=vi.fn();old.addEventListener('dispose',onOld);s.material.addEventListener('dispose',onMaterial);
  change(s.water);s.view.update(.31);expect(onOld).toHaveBeenCalledTimes(1);const onNew=vi.fn();s.view.mesh.geometry.addEventListener('dispose',onNew);
  s.view.dispose();s.view.dispose();change(s.water);s.view.update(10);expect(onOld).toHaveBeenCalledTimes(1);expect(onNew).toHaveBeenCalledTimes(1);expect(onMaterial).not.toHaveBeenCalled();expect(s.view.mesh.parent).toBeNull();s.material.dispose();
 });
 it('keeps the existing Float32 free-surface input and ignores invalid elapsed time',()=>{
  const s=setup(),heights=waterSurfaceHeights(s.water);expect(heights).toBeInstanceOf(Float32Array);expect(heights[12+24*s.water.nx]).toBe(Math.fround(-.5+.5*.125));
  const old=s.view.mesh.geometry;change(s.water);for(const dt of [NaN,Infinity,-1,0])s.view.update(dt);expect(s.view.mesh.geometry).toBe(old);s.view.update(.31);expectCurrent(s);dispose(s);
 });
});
