import {it,expect} from 'vitest';
import * as THREE from 'three';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {createWatermillView} from '../../src/prototype/rendering/watermill-view';
it('rotor uses only hydraulic angle, keeps fixed GPU geometry, never remeshes terrain and disposes once',()=>{
 const s=new CoreSimulation(true,false,true);Object.assign(s.survival.inventory,{4:8,3:4,6:2});const c={authority:'host' as const,alive:true,baseActive:true,position:{x:2.5,y:.25,z:-1.3},blockers:[]};expect(s.watermill.build(c).ok).toBe(true);
 const scene=new THREE.Scene(),view=createWatermillView(scene,s);view.update();const root=scene.getObjectByName('waterwheel-loom')!,rotor=root.children[0],revision=s.arena.field.revision,geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
 const angle=rotor.rotation.x;for(let i=0;i<10;i++)view.update();expect(rotor.rotation.x).toBe(angle);for(let i=0;i<5;i++){s.water.add(2,10,24,.8);s.water.step();s.watermill.step();view.update();}expect(rotor.rotation.x).toBe(s.watermill.state.angle);expect(rotor.rotation.x).toBeGreaterThan(angle);expect(s.arena.field.revision).toBe(revision);view.dispose();view.dispose();expect(scene.children).toHaveLength(0);expect(disposed).toBe(geometries.size);
});
