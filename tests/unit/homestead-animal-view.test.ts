import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {HomesteadSystem} from '../../src/prototype/core/homestead';
import {HomesteadAnimal,HOMESTEAD_ANIMAL_ID} from '../../src/prototype/core/homestead-animal';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {createHomesteadAnimalView} from '../../src/prototype/rendering/homestead-animal-view';
import {createCampaignDecor} from '../../src/prototype/rendering/campaign-decor';
import {voxelAppearance} from '../../src/prototype/rendering/meshes';

function setup(campaignMode=true){
 const scene=new THREE.Scene(),home=new HomesteadSystem({}),animal=new HomesteadAnimal(home),sim={campaignMode,animal},surfaceRead=vi.spyOn(animal,'bodySurface','get'),view=createHomesteadAnimalView(scene,sim);
 const mesh=()=>scene.getObjectByName(HOMESTEAD_ANIMAL_ID) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 return {scene,home,animal,sim,view,mesh,surfaceRead};
}

describe('physical homestead animal view without WebGL',()=>{
 it('uses the exact immutable sampled positions, normals and shared material colours',()=>{
  const {scene,animal,view,mesh}=setup(),body=mesh(),surface=animal.bodySurface,geometry=body.geometry;
  expect(scene.children).toEqual([body]);expect(body.userData.protected).toBe(true);expect(body.material.vertexColors).toBe(true);expect(body.castShadow&&body.receiveShadow).toBe(true);
  expect(geometry.getAttribute('position').array).toEqual(new Float32Array(surface.positions));expect(geometry.getAttribute('normal').array).toEqual(new Float32Array(surface.normals));expect(geometry.index).toBeNull();
  const colors=geometry.getAttribute('color'),expected=new Float32Array(surface.positions.length),appearance=voxelAppearance(10,0,0,0,0);
  for(let i=0;i<surface.materials.length;i++){const offset=i*3;voxelAppearance(surface.materials[i],surface.positions[offset],surface.positions[offset+1],surface.positions[offset+2],surface.normals[offset+1],appearance);expected[offset]=appearance.color.r;expected[offset+1]=appearance.color.g;expected[offset+2]=appearance.color.b;}
  expect(colors.array).toEqual(expected);expect(colors.count).toBe(surface.materials.length);expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);expect(Object.isFrozen(surface.positions)).toBe(true);expect(Object.isFrozen(surface.normals)).toBe(true);view.dispose();
 });
 it('shows the wild animal before taming, and hides only recovery in the campaign',()=>{
  const {home,animal,view,mesh}=setup(),body=mesh();expect(home.state.animal.tamed).toBe(false);expect(body.visible).toBe(true);
  home.state.animal.tamed=true;home.state.animal.ready=true;view.update();expect(body.visible).toBe(true);
  animal.state.recovering=true;view.update();expect(body.visible).toBe(false);
  home.state.animal.tamed=false;home.state.animal.ready=false;animal.state.recovering=false;view.update();expect(body.visible).toBe(true);view.dispose();
 });
 it('copies only the real position and yaw so render triangles agree with actor rays',()=>{
  const {animal,view,mesh}=setup(),body=mesh(),origin=new THREE.Vector3(),direction=new THREE.Vector3(),raycaster=new THREE.Raycaster();
  for(const [x,y,z,yaw] of [[-5.6,.3,2.5,0],[-4.8,1.2,1.8,Math.PI/2],[-5.7,.7,2.2,-.9]]){
   Object.assign(animal.position,{x,y,z});animal.state.yaw=yaw;view.update();expect(body.position.toArray()).toEqual([x,y,z]);expect(body.rotation.x).toBe(0);expect(body.rotation.y).toBe(yaw);expect(body.rotation.z).toBe(0);expect(body.scale.toArray()).toEqual([1,1,1]);
   body.updateMatrixWorld(true);origin.set(0,.61,2).applyMatrix4(body.matrixWorld);direction.set(0,0,-1).transformDirection(body.matrixWorld);raycaster.set(origin,direction);const visibleHit=raycaster.intersectObject(body,false)[0],actorHit=animal.ray(origin,direction,3);
   expect(visibleHit).toBeDefined();expect(actorHit).not.toBeNull();expect(visibleHit.distance).toBeCloseTo(actorHit!.distance,2);
   const fixed=body.matrixWorld.clone();for(let i=0;i<120;i++)view.update();body.updateMatrixWorld(true);expect(body.matrixWorld.equals(fixed)).toBe(true);
  }
  view.dispose();
 });
 it('reuses one geometry and one material for every temporary protected status',()=>{
  const {animal,view,mesh,surfaceRead}=setup(),body=mesh(),geometry=body.geometry,material=body.material,position=geometry.getAttribute('position') as THREE.BufferAttribute,normal=geometry.getAttribute('normal') as THREE.BufferAttribute,color=geometry.getAttribute('color') as THREE.BufferAttribute,before=Array.from(position.array),surface=animal.bodySurface,reads=surfaceRead.mock.calls.length;
  const state=animal.state,calm={color:material.color.getHex(),roughness:material.roughness,emissive:material.emissive.getHex(),intensity:material.emissiveIntensity};
  animal.cast('fire',{x:1,y:0,z:0});view.update();expect(body.userData.status).toBe('burning');expect(material.emissive.r).toBeGreaterThan(material.emissive.b);expect(material.emissiveIntensity).toBeGreaterThan(.3);
  animal.cast('water',{x:0,y:0,z:0});view.update();expect(body.userData.status).toBe('wet');expect(material.roughness).toBeLessThan(calm.roughness);expect(material.color.b).toBeGreaterThan(material.color.r);expect(material.emissiveIntensity).toBe(0);
  animal.cast('lightning',{x:1,y:0,z:0});view.update();expect(body.userData.status).toBe('shock');expect(material.emissive.b).toBeGreaterThan(material.emissive.r);expect(material.emissiveIntensity).toBeGreaterThan(.3);expect(material.roughness).toBeLessThan(calm.roughness);
  state.shock=0;state.wet=0;state.fright=1;view.update();expect(body.userData.status).toBe('fright');expect(material.emissiveIntensity).toBeGreaterThan(0);
  state.fright=0;view.update();expect(body.userData.status).toBe('calm');expect({color:material.color.getHex(),roughness:material.roughness,emissive:material.emissive.getHex(),intensity:material.emissiveIntensity}).toEqual(calm);
  for(let i=0;i<120;i++)view.update();expect(body.geometry).toBe(geometry);expect(body.material).toBe(material);expect(geometry.getAttribute('position')).toBe(position);expect(geometry.getAttribute('normal')).toBe(normal);expect(geometry.getAttribute('color')).toBe(color);expect(Array.from(position.array)).toEqual(before);expect(position.version).toBe(0);expect(normal.version).toBe(0);expect(color.version).toBe(0);expect(surfaceRead).toHaveBeenCalledTimes(reads);expect(animal.bodySurface).toBe(surface);view.dispose();
 });
 it('does not read or allocate the sampled body, geometry, or material in trial mode',()=>{
  const {scene,view,surfaceRead}=setup(false);for(let i=0;i<120;i++)view.update();expect(surfaceRead).not.toHaveBeenCalled();expect(scene.children).toHaveLength(0);view.dispose();view.dispose();view.update();expect(surfaceRead).not.toHaveBeenCalled();expect(scene.children).toHaveLength(0);
 });
 it('can disable and re-enable the view without duplicating animal resources',()=>{
  const {scene,sim,view,mesh,surfaceRead}=setup(),body=mesh(),geometry=body.geometry,material=body.material;sim.campaignMode=false;view.update();expect(body.visible).toBe(false);sim.campaignMode=true;view.update();expect(body.visible).toBe(true);expect(scene.children).toEqual([body]);expect(body.geometry).toBe(geometry);expect(body.material).toBe(material);expect(surfaceRead).toHaveBeenCalledOnce();view.dispose();
 });
 it('disposes each owned resource once, removes the mesh, and stays inert afterward',()=>{
  const {scene,animal,view,mesh,surfaceRead}=setup(),body=mesh(),geometryDisposed=vi.fn(),materialDisposed=vi.fn();body.geometry.addEventListener('dispose',geometryDisposed);body.material.addEventListener('dispose',materialDisposed);const before=body.position.clone();
  view.dispose();view.dispose();animal.position.x+=1;view.update();expect(geometryDisposed).toHaveBeenCalledOnce();expect(materialDisposed).toHaveBeenCalledOnce();expect(scene.children).toHaveLength(0);expect(body.position.equals(before)).toBe(true);expect(surfaceRead).toHaveBeenCalledOnce();
 });
 it('wires campaign decor to the real actor, without touching terrain or showing a trial goat',()=>{
  for(const campaign of [true,false]){
   const sim=new CoreSimulation(campaign,true),scene=new THREE.Scene(),read=vi.spyOn(sim.animal,'bodySurface','get'),field=sim.arena.field,revision=field.revision,dirty=[...field.dirty],decor=createCampaignDecor(scene,sim);
   sim.animal.position.x+=.3;sim.animal.state.yaw=.4;sim.seconds=120;decor.update();const body=scene.getObjectByName(HOMESTEAD_ANIMAL_ID);
   if(campaign){expect(body).toBeInstanceOf(THREE.Mesh);expect(body!.visible).toBe(true);expect(body!.position.x).toBe(sim.animal.position.x);expect(body!.rotation.y).toBe(.4);expect(read).toHaveBeenCalledOnce();}
   else{expect(body).toBeUndefined();expect(read).not.toHaveBeenCalled();}
   expect(field.revision).toBe(revision);expect([...field.dirty]).toEqual(dirty);decor.dispose();expect(scene.getObjectByName(HOMESTEAD_ANIMAL_ID)).toBeUndefined();
  }
 });
});
