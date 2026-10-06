import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createResources} from '../../src/rendering/game/resources';
import {disposeSurfaceMaps} from '../../src/rendering/materials/pbr';
import {GameSimulation} from '../../src/simulation/game-simulation';
import type {ResourceNode} from '../../src/game/types';
import {interactionTarget} from '../../src/game/interaction/target';
let view:ReturnType<typeof createResources>|undefined;
beforeEach(()=>{const context=new Proxy({},{get:()=>()=>{},set:()=>true});vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});});
afterEach(()=>{view?.dispose();view=undefined;disposeSurfaceMaps();vi.unstubAllGlobals();});
function bounds(scene:THREE.Scene){const result=new THREE.Box3(),matrix=new THREE.Matrix4();for(const object of scene.children){if(!(object instanceof THREE.InstancedMesh))continue;object.geometry.computeBoundingBox();for(let i=0;i<object.count;i++){object.getMatrixAt(i,matrix);result.union(object.geometry.boundingBox!.clone().applyMatrix4(matrix));}}return result;}
it('renders actual loose meshes at pickup scale around their physical anchor, leaving natural resources full sized',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),scene=new THREE.Scene();view=createResources(scene);
 for(const kind of ['resin','stone','berry','crystal','club']){
  const node:ResourceNode={id:101,kind,x:2,y:3,z:4,amount:12,ready:0};s.resources=[node];const before=JSON.stringify(node);
  view.update(s);const natural=bounds(scene);node.drop=true;const dropped=JSON.stringify(node);view.update(s);const loose=bounds(scene);
  for(const axis of ['x','y','z'] as const){expect(loose.min[axis]-node[axis]).toBeCloseTo((natural.min[axis]-node[axis])*.4,5);expect(loose.max[axis]-node[axis]).toBeCloseTo((natural.max[axis]-node[axis])*.4,5);}
  expect(JSON.stringify(node)).toBe(dropped);delete node.drop;view.update(s);expect(bounds(scene)).toEqual(natural);expect(JSON.stringify(node)).toBe(before);
 }
});
it('keeps pickup targeting and stack identity/count unchanged despite the smaller visible footprint',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),node:ResourceNode={id:101,kind:'resin',x:0,y:0,z:2,amount:12,ready:0,drop:true};s.resources=[node];s.buildings=[];
 const player={x:0,y:0,z:0},origin={x:.4,y:.5,z:0},direction={x:0,y:0,z:1};
 expect(interactionTarget(s,player,origin,direction)).toMatchObject({id:'r:101',label:'樹脂 ×12を拾う'});
 const scene=new THREE.Scene();view=createResources(scene);view.update(s);expect(node).toEqual({id:101,kind:'resin',x:0,y:0,z:2,amount:12,ready:0,drop:true});
 expect(interactionTarget(s,player,origin,direction)?.id).toBe('r:101');
});

it('keeps hand-sized pickups discoverable and isolates scaling within a mixed update',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),scene=new THREE.Scene();view=createResources(scene);
 for(const kind of ['wood','finewood','branch','flint','mushroom','dandelion','perch','pike']){
  const small:ResourceNode={id:101,kind,x:2,y:3,z:4,amount:1,ready:0};s.resources=[small];view.update(s);const natural=bounds(scene);small.drop=true;view.update(s);expect(bounds(scene)).toEqual(natural);
 }
 const dropped:ResourceNode={id:102,kind:'resin',x:-8,y:0,z:0,amount:12,ready:0,drop:true},natural:ResourceNode={id:103,kind:'stone',x:8,y:0,z:0,amount:12,ready:0};
 s.resources=[dropped];view.update(s);const expected=bounds(scene);s.resources=[natural];view.update(s);expected.union(bounds(scene));
 s.resources=[dropped,natural];view.update(s);expect(bounds(scene)).toEqual(expected);s.resources.reverse();view.update(s);expect(bounds(scene)).toEqual(expected);
});
