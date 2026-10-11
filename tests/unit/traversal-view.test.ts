import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createTraversalView} from '../../src/prototype/rendering/traversal-view';
import type {Vec3} from '../../src/prototype/core/voxel';

function setup(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(74,16/9,.035,120);scene.add(camera);camera.position.set(0,1.52,0);
 const sim={gliding:false,grapple:null as Vec3|null,player:{hp:100,position:{x:0,y:0,z:0},yaw:0},campaign:{state:{equipment:{glider:'glider' as string|null}}},fishing:{selected:false}};
 const view=createTraversalView(scene,camera,sim);return {scene,camera,sim,view};
}

function resources(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances=new Set<THREE.InstancedMesh>();
 root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}if(object instanceof THREE.InstancedMesh)instances.add(object);});
 return {geometries,materials,instances};
}

describe('bounded traversal scene visuals',()=>{
 it('shows the rigid wing only for real gliding and the visible third-person body',()=>{
  const {scene,sim,view}=setup();view.update(true);expect(view.stats.wingVisible).toBe(false);expect(view.stats.edgesVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);
  sim.gliding=true;sim.player.position={x:4,y:7,z:-3};sim.player.yaw=.8;view.update(true);
  const wing=scene.getObjectByName('traversal-glider')!;expect(view.stats.wingVisible).toBe(true);expect(view.stats.edgesVisible).toBe(false);expect(wing.position.toArray()).toEqual([4,7,-3]);expect(wing.rotation.y).toBe(.8);
  const fabric=scene.getObjectByName('traversal-glider-cloth') as THREE.Mesh;fabric.geometry.computeBoundingBox();expect(fabric.geometry.boundingBox!.max.x-fabric.geometry.boundingBox!.min.x).toBeCloseTo(3.32);expect(scene.getObjectByName('traversal-glider-frame')).toBeInstanceOf(THREE.InstancedMesh);
  view.update(true,false);expect(view.stats.wingVisible).toBe(false);expect(view.stats.edgesVisible).toBe(false);sim.gliding=false;view.update(true);expect(view.stats.wingVisible).toBe(false);view.dispose();
 });

 it('keeps first-person hints at the upper corners after aspect and FOV changes',()=>{
  const {scene,camera,sim,view}=setup();sim.gliding=true;
  for(const aspect of [1,16/9,21/9])for(const fov of [65,74,90]){
   camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();view.update();scene.updateMatrixWorld(true);
   expect(view.stats.edgesVisible).toBe(true);expect(view.stats.wingVisible).toBe(false);
   const cloth=camera.getObjectByName('traversal-glider-edge-cloth') as THREE.Mesh,vertices=cloth.geometry.getAttribute('position');
   for(let i=0;i<vertices.count;i++){const projected=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(cloth.matrixWorld).project(camera);expect(Math.abs(projected.x)).toBeGreaterThanOrEqual(.72);expect(projected.y).toBeGreaterThanOrEqual(.79);expect(projected.y).toBeLessThanOrEqual(1.05);}
  }
  view.update(true);expect(view.stats.edgesVisible).toBe(false);expect(view.stats.wingVisible).toBe(true);view.dispose();
 });

 it('distinguishes windwoven cloth modestly without creating resources or changing scale',()=>{
  const {scene,sim,view}=setup();sim.gliding=true;view.update(true);
  const cloth=scene.getObjectByName('traversal-glider-cloth') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,trim=scene.getObjectByName('traversal-glider-trim') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,originalColor=cloth.material.color.getHex(),originalTrim=trim.material.color.getHex(),geometry=cloth.geometry;
  sim.campaign.state.equipment.glider='windwoven-glider';view.update(true);expect(cloth.material.color.getHex()).not.toBe(originalColor);expect(trim.material.color.getHex()).not.toBe(originalTrim);expect(cloth.material.emissive.getHex()).toBe(0);expect(cloth.geometry).toBe(geometry);expect(cloth.scale.toArray()).toEqual([1,1,1]);
  sim.campaign.state.equipment.glider='glider';view.update(true);expect(cloth.material.color.getHex()).toBe(originalColor);expect(trim.material.color.getHex()).toBe(originalTrim);view.dispose();
 });

 it('tethers the yaw-transformed player harness to the exact active simulation destination',()=>{
  const {scene,camera,sim,view}=setup();sim.player.position={x:3,y:2,z:-5};sim.player.yaw=Math.PI/2;sim.grapple={x:-8,y:6.25,z:-10};
  for(const thirdPerson of [false,true]){
   camera.position.set(thirdPerson?30:3,7,10);camera.rotation.set(.9,.6,.1);view.update(thirdPerson);scene.updateMatrixWorld(true);
   const tether=scene.getObjectByName('traversal-grapple-tether') as THREE.Mesh,start=new THREE.Vector3(0,-.5,0).applyMatrix4(tether.matrixWorld),end=new THREE.Vector3(0,.5,0).applyMatrix4(tether.matrixWorld);
   expect(view.stats.tetherVisible).toBe(true);expect(start.x).toBeCloseTo(2.81);expect(start.y).toBeCloseTo(3.3);expect(start.z).toBeCloseTo(-5.2);expect(end.x).toBeCloseTo(sim.grapple.x);expect(end.y).toBeCloseTo(sim.grapple.y);expect(end.z).toBeCloseTo(sim.grapple.z);
  }
  sim.grapple={x:1,y:4,z:9};view.update(true);scene.updateMatrixWorld(true);const tether=scene.getObjectByName('traversal-grapple-tether') as THREE.Mesh,end=new THREE.Vector3(0,.5,0).applyMatrix4(tether.matrixWorld);expect(end.x).toBeCloseTo(1);expect(end.y).toBeCloseTo(4);expect(end.z).toBeCloseTo(9);
  sim.grapple=null;view.update(true);expect(view.stats.tetherVisible).toBe(false);view.dispose();
 });

 it('hides both traversal props immediately on death or local fishing',()=>{
  const {sim,view}=setup();sim.gliding=true;sim.grapple={x:2,y:4,z:-6};view.update(true);expect(view.stats.wingVisible).toBe(true);expect(view.stats.tetherVisible).toBe(true);
  sim.player.hp=0;view.update(true);expect(view.stats.wingVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);view.update();expect(view.stats.edgesVisible).toBe(false);
  sim.player.hp=100;sim.fishing.selected=true;view.update();expect(view.stats.edgesVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);view.update(true);expect(view.stats.wingVisible).toBe(false);
  view.update(true,true,false);expect(view.stats.wingVisible).toBe(true);expect(view.stats.tetherVisible).toBe(true);expect(sim.fishing.selected).toBe(true);view.dispose();
 });

 it('rejects non-finite or coincident rope endpoints without invalid transforms',()=>{
  const {scene,sim,view}=setup(),tether=scene.getObjectByName('traversal-grapple-tether') as THREE.Mesh;
  for(const target of [{x:NaN,y:2,z:3},{x:1,y:Infinity,z:3},{x:.2,y:1.3,z:-.19}]){sim.grapple=target;view.update();expect(view.stats.tetherVisible).toBe(false);expect(tether.scale.toArray().every(Number.isFinite)).toBe(true);}
  sim.grapple={x:2,y:4,z:-6};sim.gliding=true;sim.player.position.x=Infinity;view.update(true);expect(view.stats.wingVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);sim.player.position.x=0;sim.player.yaw=NaN;view.update();expect(view.stats.edgesVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);view.dispose();
 });

 it('observes frozen state without mutating simulation or camera and reuses bounded resources',()=>{
  const {scene,camera,sim,view}=setup();sim.gliding=true;sim.grapple={x:2,y:4,z:-6};Object.freeze(sim.grapple);Object.freeze(sim.player.position);Object.freeze(sim.player);Object.freeze(sim.campaign.state.equipment);Object.freeze(sim.campaign.state);Object.freeze(sim.campaign);Object.freeze(sim.fishing);Object.freeze(sim);
  const before=resources(scene),snapshot=JSON.stringify(sim),cameraPosition=camera.position.clone(),cameraQuaternion=camera.quaternion.clone();
  for(let i=0;i<300;i++)view.update(i%2===0,true,i%3===0);
  const after=resources(scene);expect(after.geometries).toEqual(before.geometries);expect(after.materials).toEqual(before.materials);expect(after.instances).toEqual(before.instances);expect(view.stats.geometries).toBe(4);expect(view.stats.materials).toBe(4);expect(JSON.stringify(sim)).toBe(snapshot);expect(camera.position.equals(cameraPosition)).toBe(true);expect(camera.quaternion.equals(cameraQuaternion)).toBe(true);view.dispose();
 });

 it('disposes every unique geometry, material and instance buffer once and removes its roots',()=>{
  const {scene,camera,sim,view}=setup();sim.gliding=true;sim.grapple={x:2,y:4,z:-6};view.update(true);const {geometries,materials,instances}=resources(scene),disposed=vi.fn();for(const resource of geometries)resource.addEventListener('dispose',disposed);for(const resource of materials)resource.addEventListener('dispose',disposed);for(const resource of instances)resource.addEventListener('dispose',disposed);
  view.dispose();view.dispose();view.update(true);expect(disposed).toHaveBeenCalledTimes(geometries.size+materials.size+instances.size);expect(view.stats.disposed).toBe(true);expect(view.stats.wingVisible).toBe(false);expect(view.stats.edgesVisible).toBe(false);expect(view.stats.tetherVisible).toBe(false);expect(scene.getObjectByName('traversal-glider')).toBeUndefined();expect(scene.getObjectByName('traversal-grapple')).toBeUndefined();expect(camera.getObjectByName('traversal-glider-edges')).toBeUndefined();
 });
});
