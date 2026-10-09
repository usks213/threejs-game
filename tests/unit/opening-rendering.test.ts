import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {BEACONS} from '../../src/content/adventure-world';
import {interactionTarget} from '../../src/game/interaction/target';
import {assertInteractionReach} from '../../src/game/interaction/reach';
import {GameSimulation} from '../../src/simulation/game-simulation';
import type {Snapshot} from '../../src/simulation/protocol';
import {createBeaconAssets} from '../../src/rendering/game/beacon-model';
import {createLandmarks} from '../../src/rendering/game/landmarks';
import {createResources} from '../../src/rendering/game/resources';
import {disposeSurfaceMaps} from '../../src/rendering/materials/pbr';
import {createTerrainMaterial} from '../../src/rendering/voxel/material';
import {fieldFragmentShader} from '../../src/rendering/voxel/field-shader';
import {openingSurfaceShader} from '../../src/rendering/voxel/opening-surface';
import {createAtmosphere} from '../../src/rendering/environment/atmosphere';
import {captureProbe} from '../../src/rendering/environment/probe';

vi.mock('../../src/rendering/environment/probe',()=>({captureProbe:vi.fn()}));
beforeEach(()=>{const context=new Proxy({},{get:()=>()=>{},set:()=>true});vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});});
afterEach(()=>{disposeSurfaceMaps();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('readable permanent beacon',()=>{
 it('keeps five shared PBR pieces inside the existing target, with distinct inactive/lit states and reduced motion',()=>{
  const box=new THREE.BoxGeometry(),assets=createBeaconAssets(box),model=assets.create(810001);
  try{
   expect(model.group.children).toHaveLength(5);
   for(const child of model.group.children){const mesh=child as THREE.Mesh;expect(mesh.geometry).toBe(box);expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);expect(mesh.castShadow&&mesh.receiveShadow).toBe(true);}
   const stone=(model.group.children[0] as THREE.Mesh).material;
   for(const active of [false,true])for(const seconds of [0,1,10,100]){
    assets.update(model,active,seconds,false);model.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-1);expect(bounds.max.x).toBeLessThanOrEqual(1);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-1);expect(bounds.max.z).toBeLessThanOrEqual(1);
    expect(bounds.min.y).toBeGreaterThanOrEqual(0);expect(bounds.max.y).toBeLessThanOrEqual(2);
    expect((model.group.children[0] as THREE.Mesh).material).toBe(stone);
    expect(model.light.material.emissiveIntensity).toBe(active?1.35:.2);
   }
   assets.update(model,false,1,true);const inactive=model.light.material;
   assets.update(model,true,500,true);expect(model.light.material).not.toBe(inactive);
   expect(model.light.rotation.y).toBe(0);expect(model.light.position.y).toBe(1.12);
  }finally{assets.dispose();box.dispose();}
 });

 it('uses saved node coordinates, preserves the save, and aligns visible stone with authority targeting',()=>{
  const sim=new GameSimulation(),scene=new THREE.Scene(),view=createLandmarks(scene),local=new THREE.Group();
  const state={adventure:sim.adventure.snapshot()} as Snapshot;
  const before=JSON.stringify(sim.save());
  const node=state.adventure.resources.find(n=>n.id===BEACONS[0].id)!;
  // A renderer must also respect an existing saved position, not silently
  // restore the content definition's x/z when decorating it.
  node.x+=.25;node.z+=.25;
  const snapshotBefore=JSON.stringify(state);
  try{
   view.update(state,local,new Map());expect(JSON.stringify(state)).toBe(snapshotBefore);
   const model=scene.getObjectByName('beacon:'+node.id)!;expect(model.position.toArray()).toEqual([node.x,node.y,node.z]);
   model.updateMatrixWorld(true);
   const origin=new THREE.Vector3(node.x+.65,node.y+1,node.z+3),direction=new THREE.Vector3(0,0,-1),player={x:node.x,y:node.y,z:node.z+3};
   const visibleHit=new THREE.Raycaster(origin,direction).intersectObject(model,true)[0];expect(visibleHit.object.name).toBe('beacon-right');
   state.adventure.resources=[node];state.adventure.buildings=[];
   const target=interactionTarget(state.adventure,player,origin,direction)!;
   expect(target.id).toBe('r:'+node.id);
   expect(()=>assertInteractionReach(state.adventure,player,target.id,visibleHit.point,()=>1)).not.toThrow();
   node.ready=1e10;view.update(state,local,new Map());expect(model.visible).toBe(true);expect(model.children).toHaveLength(5);
   expect(JSON.stringify(sim.save())).toBe(before);
   state.adventure.resources=[];view.update(state,local,new Map());expect(model.visible).toBe(false);
  }finally{view.dispose();expect(scene.children).toHaveLength(0);}
 });

 it('suppresses only duplicate adventure beacons, leaving ordinary runestones and older generators intact',()=>{
  const sim=new GameSimulation(),state=sim.adventure.snapshot(),scene=new THREE.Scene(),view=createResources(scene);
  const node=state.resources.find(n=>n.id===BEACONS[0].id)!;
  const count=()=>scene.children.reduce((sum,o)=>sum+(o instanceof THREE.InstancedMesh?o.count:0),0);
  try{
   state.resources=[node];view.update(state);expect(count()).toBe(0);
   state.resources=[{...node,id:987654}];view.update(state);expect(count()).toBe(1);
   state.resources=[node];state.generator=3;view.update(state);expect(count()).toBe(1);
  }finally{view.dispose();}
 });
});

describe('bounded opening surface and daylight presentation',()=>{
 it('shares causeway/meadow appearance across terrain modes without replacing PBR or changing density/depth',()=>{
  const adventure={value:0},surface=createTerrainMaterial(adventure);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as Parameters<THREE.Material['onBeforeCompile']>[0];
  try{
   surface.material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
   expect(shader.uniforms.terrainAdventure).toBe(adventure);
   expect(shader.fragmentShader).toContain(openingSurfaceShader);expect(fieldFragmentShader).toContain(openingSurfaceShader);
   expect(shader.fragmentShader).toContain('if(terrainAdventure>.5)');expect(fieldFragmentShader).toContain('if(fieldAdventure>.5)');
   for(const source of [shader.fragmentShader,fieldFragmentShader])expect(source).toContain('top-thickness-p.y');
   expect(shader.fragmentShader).toContain('#include <lights_physical_fragment>');expect(shader.fragmentShader).toContain('rockNormal');
   expect(fieldFragmentShader).toContain('gl_FragDepth = depth');
   expect(fieldFragmentShader.indexOf('linearToOutputTexel(vec4(fieldFogColor')).toBeGreaterThan(fieldFragmentShader.indexOf('#include <colorspace_fragment>'));
  }finally{surface.dispose();}
 });

 it('calibrates only the direct daylight backdrop; canonical IBL, full HDR and night colors retain their gain',async()=>{
  const target=new THREE.WebGLRenderTarget(96,128),capture=vi.spyOn(THREE.PMREMGenerator.prototype,'fromScene').mockReturnValue(target);
  vi.spyOn(THREE.CubeCamera.prototype,'update').mockImplementation(()=>{});
  vi.mocked(captureProbe).mockResolvedValue(new THREE.LightProbe());
  const renderer={compile:vi.fn()} as unknown as THREE.WebGLRenderer;
  const sim=new GameSimulation(),state=sim.adventure.snapshot(),scene=new THREE.Scene();scene.userData.direct=true;
  const view=createAtmosphere(scene,renderer),hdrScene=new THREE.Scene(),hdr=createAtmosphere(hdrScene,renderer);
  try{
   const sky=scene.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
   const hdrSky=hdrScene.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
   expect(sky.material.uniforms.skyDisplayGain.value).toBe(.22);expect(hdrSky.material.uniforms.skyDisplayGain.value).toBe(1);
   expect(sky.material.fragmentShader).toContain('mix(skyDisplayGain,1.,nightAmount)');
   view.update(state,new THREE.Vector3());view.prepareDirect();await Promise.resolve();
   const capturedSky=capture.mock.calls[0][0].children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
   expect(capturedSky.material.uniforms.skyDisplayGain.value).toBe(1);
   expect(scene.environment).toBe(target.texture);expect(capture).toHaveBeenCalledTimes(1);
   expect(sky.material.uniforms.skyDisplayGain.value).toBe(.22);
  }finally{view.dispose();hdr.dispose();}
 });
});
