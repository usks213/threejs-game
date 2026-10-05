import { expect, it } from 'vitest';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import { MATERIAL_MASS, PART_COST } from '../../src/game/skybound/types';
import type { SkyContext, SkyPart, SkyPartKind } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
const aim = {x: 0, y: 0, z: 1};
function vehicle() {
 const kinds: SkyPartKind[] = ['slab','seat','seat','wheel','thruster','battery'];
 const positions = [{x: 3,y: .65,z: 0},{x: 2.5,y: 1,z: 0},{x: 3.5,y: 1,z: 0},{x: 3,y: .5,z: -.8},{x: 3,y: .65,z: .8},{x: 3,y: .8,z: -.5}];
 const parts: SkyPart[] = kinds.map((kind, i) => ({id: i + 1, kind, material: 'wood', mass: MATERIAL_MASS.wood * PART_COST[kind], position: positions[i], velocity: {x: 0,y: 0,z: 0}, rotation: 0, epoch: 0, links: i ? [1] : kinds.slice(1).map((_, i) => i + 2), ...(kind === 'battery' ? {energy: 25} : {}), enabled: kind === 'thruster'}));
 const powers = new SkyboundPowers({version: 1,parts,blueprints: [],fusions: {}});
 const context: SkyContext = {tick: 0,bounds: WORLD,player: {x: 0,y: 0,z: 0},inventory: {resin: 2},actors: [],solid: p => p.y < 0};
 return {powers,context};
}
it('has one driver and two occupied seats, consumes connected power once and moves passengers together', () => {
 const {powers,context} = vehicle();
 powers.action('a','sky-ride','2',undefined,aim,context); powers.action('b','sky-ride','3',undefined,aim,context);
 expect(powers.snapshot('a').riding).toEqual({seat: 2, driver: true}); expect(powers.snapshot('b').riding).toEqual({seat: 3, driver: false});
 const a = {x: 0,y: 0,z: 0,heading: 0,vy: 0,grounded: true}, b = {...a};
 context.actors = [{id: 'a',position: a},{id: 'b',position: b}];
 powers.drive('a',{x: 0,z: -1},a); powers.drive('b',{x: 1,z: 1},b);
 const before = powers.state.parts[0].position.z;
 for (let i = 0; i < 30; i++) { context.tick++; powers.step(1 / 30,context); }
 expect(powers.state.parts.find(p => p.kind === 'battery')!.energy).toBeCloseTo(22,8);
 expect(powers.state.parts[0].position.z).toBeGreaterThan(before + .2);
 expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeCloseTo(1,8);
 expect(powers.snapshot('a').parts.find(p => p.kind === 'thruster')!.powered).toBe(true);
 powers.release('a'); expect(powers.snapshot('b').riding?.driver).toBe(true);
});
it('serializes charge but not seats or power control, blocks lease/recall/mount conflicts', () => {
 const {powers,context} = vehicle();
 powers.action('a','sky-grab','1',undefined,aim,context);
 expect(() => powers.action('b','sky-ride','2',undefined,aim,context)).toThrow('操作中'); powers.release('a');
 context.tick++; powers.step(1 / 30,context); context.tick++; powers.step(1 / 30,context);
 powers.action('a','sky-recall','1',undefined,aim,context);
 expect(() => powers.action('b','sky-ride','2',undefined,aim,context)).toThrow('操作中'); powers.release('a');
 powers.action('b','sky-ride','2',undefined,aim,context);
 expect(() => powers.action('a','sky-grab','1',undefined,aim,context)).toThrow('搭乗中');
 expect(() => powers.action('a','sky-recall','1',undefined,aim,context)).toThrow('搭乗中');
 expect(() => powers.action('a','sky-ride','2',undefined,aim,context)).toThrow('この席');
 const restored = new SkyboundPowers(powers.save()); expect(restored.snapshot('b').riding).toBeUndefined();
 expect(restored.state.parts.find(p => p.kind === 'battery')!.energy).toBeCloseTo(24.8,8);
});
it('charges atomically, stops output when empty, and blueprint reconstruction never clones battery energy', () => {
 const {powers,context} = vehicle(), battery = powers.state.parts.find(p => p.kind === 'battery')!;
 battery.energy = 0; context.tick++; powers.step(1 / 30,context);
 expect(powers.snapshot('a').parts.find(p => p.kind === 'thruster')!.powered).toBe(false);
 powers.action('a','sky-charge',String(battery.id),undefined,aim,context); expect(battery.energy).toBe(25); expect(context.inventory.resin).toBe(1);
 battery.energy = 90; expect(() => powers.action('a','sky-charge',String(battery.id),undefined,aim,context)).toThrow(); expect(context.inventory.resin).toBe(1);
 powers.action('a','sky-blueprint','1:車の設計',undefined,aim,context); context.inventory.wood = 100;
 powers.action('a','sky-rebuild',String(powers.state.blueprints[0].id),{x: 0,y: 2,z: 4},aim,context);
 expect(powers.state.parts.filter(p => p.kind === 'battery').map(p => p.energy)).toEqual([90,0]);
});
it('does not mount through a blocked roof, and dismounts only to validated floor space', () => {
 const {powers,context} = vehicle(); context.solid = p => p.y < 0 || p.y > 2;
 expect(() => powers.action('a','sky-ride','2',undefined,aim,context)).toThrow('塞がれて');
 context.solid = p => p.y < 0; powers.action('a','sky-ride','2',undefined,aim,context);
 const result = powers.action('a','sky-ride','2',undefined,aim,context); expect(result.exit?.y).toBe(0); expect(powers.snapshot('a').riding).toBeUndefined();
});
it('bounds powered emitter events and stops emitting when the battery runs out', () => {
 const {powers,context} = vehicle(), emitter = powers.state.parts.find(p => p.kind === 'thruster')!;
 emitter.kind = 'emitter'; emitter.mass = MATERIAL_MASS.wood * PART_COST.emitter;
 let shots = 0;
 for (let i = 0; i < 30; i++) { context.tick++; shots += powers.step(1 / 30,context).filter(effect => effect.range > 0).length; }
 expect(shots).toBe(2);
 powers.state.parts.find(p => p.kind === 'battery')!.energy = 0;
 for (let i = 0; i < 30; i++) { context.tick++; shots += powers.step(1 / 30,context).filter(effect => effect.range > 0).length; }
 expect(shots).toBe(2);
});
