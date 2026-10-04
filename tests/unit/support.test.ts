import {it,expect} from 'vitest';
import {SdfWorld} from '../../src/world/density';
import {detachedVoxels} from '../../src/world/support';
const box=(p:{x:number;y:number;z:number},cx:number,cy:number,cz:number)=>Math.max(Math.abs(p.x-cx)-0.9,Math.abs(p.y-cy)-0.9,Math.abs(p.z-cz)-0.9);
it('detects a disconnected solid component while retaining ground',()=>{
 const world=new SdfWorld();world.heightAt=()=>0;world.density=p=>Math.min(p.y,box(p,2,4,2));
 const components=detachedVoxels(world,{x:2,y:3,z:2},5);expect(components).toHaveLength(1);expect(components[0]).toHaveLength(8);
});
it('retains fragments attached to a pillar and unknown components crossing the search boundary',()=>{
 const world=new SdfWorld();world.heightAt=()=>0;world.density=p=>Math.min(p.y,Math.max(Math.abs(p.x-2)-0.9,Math.abs(p.z-2)-0.9,p.y-5));
 expect(detachedVoxels(world,{x:2,y:3,z:2},5)).toHaveLength(0);
});
it('keeps natural floating islands anchored',()=>{
 const world=new SdfWorld();expect(world.isAnchor({x:13,y:15,z:-17})).toBe(true);
});
