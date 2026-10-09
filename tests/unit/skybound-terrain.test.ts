import { it, expect } from 'vitest';
import { SdfWorld } from '../../src/world/density';
import { directVisibleBricks } from '../../src/world/field-streaming';
import { SKY_ISLANDS, CHASMS, skyboundLayer } from '../../src/world/skybound-terrain';
it('contains distinct solid sky islands, surface and a connected underground airspace',()=>{
 const world=new SdfWorld(undefined,4);
 expect(world.density({x:0,y:-7,z:8})).toBeGreaterThan(0);
 expect(world.density({x:0,y:-12,z:8})).toBeLessThan(0);
 expect(world.density({x:0,y:0,z:8})).toBeLessThan(0);
 for(const island of SKY_ISLANDS){expect(world.density({x:island.x,y:island.y-.5,z:island.z})).toBeLessThan(0);expect(world.density({x:island.x,y:island.y+.5,z:island.z})).toBeGreaterThan(0);}
 for(const chasm of CHASMS)for(const y of[0,-2,-5,-8])expect(world.density({x:chasm.x,y,z:chasm.z})).toBeGreaterThanOrEqual(0);
 expect([skyboundLayer(25),skyboundLayer(2),skyboundLayer(-7)]).toEqual(['sky','surface','depths']);
});
it('edits the same density on sky and underground surfaces and streams both vertical bands',()=>{
 const world=new SdfWorld(undefined,4),island=SKY_ISLANDS[0],point={x:island.x,y:island.y-.3,z:island.z};
 world.apply({id:1,tick:1,kind:'dig',material:'stone',position:point,radius:1});expect(world.density(point)).toBeGreaterThan(0);
 const bricks=directVisibleBricks({x:0,y:2,z:8},world.bounds,4);
 expect([...bricks.values()].some(b=>b.origin.y>=24)).toBe(true);expect([...bricks.values()].some(b=>b.origin.y<=-8)).toBe(true);
 const old=new SdfWorld(undefined,3);expect(old.density({x:island.x,y:island.y-.5,z:island.z})).toBeGreaterThan(0);
});
