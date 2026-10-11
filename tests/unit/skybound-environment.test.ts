import { expect, it } from 'vitest';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import type { SkyContext, SkyPart, SkyEffect } from '../../src/game/skybound/types';
import { ENVIRONMENT_LIMITS, MATERIAL_MASS, PART_COST } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
function fixture(count = 3, metal = false) {
 const parts: SkyPart[] = Array.from({length: count}, (_, i) => ({id: i + 1, kind: 'block', material: metal ? 'metal' : 'wood', mass: (metal ? MATERIAL_MASS.metal : MATERIAL_MASS.wood) * PART_COST.block, position: {x: 2 + i, y: 2, z: 0}, velocity: {x: 0,y: 0,z: 0}, rotation: 0, epoch: 0, links: [i, i + 2].filter(id => id >= 1 && id <= count)}));
 const powers = new SkyboundPowers({version: 1,parts,blueprints: [],fusions: {}});
 const context: SkyContext = {tick: 0,bounds: WORLD,player: {x: 0,y: 0,z: 0},inventory: {wood: 12},actors: [],solid: p => p.y < 0};
 return {powers,context};
}
it('prioritizes wet extinguishing over ignition and melts frost before burning wood', () => {
 const {powers,context} = fixture(), part = powers.state.parts[0];
 powers.affect(part.id,'fire',10,context); expect(part.burning).toBe(6);
 context.immersion = () => .4; context.tick++; powers.step(1 / 30,context); expect(part.burning).toBe(0); expect(part.wet).toBe(5);
 powers.affect(part.id,'fire',10,context); expect(part.burning).toBe(0);
 powers.affect(part.id,'frost',10,context); expect(part.frozen).toBe(7);
 context.immersion = () => 0; part.wet = 0; powers.affect(part.id,'fire',6,context); expect(part.frozen).toBe(4); expect(part.burning).toBe(0);
 powers.affect(part.id,'fire',10,context); expect(part.frozen).toBe(0); expect(part.burning).toBe(0);
 powers.affect(part.id,'fire',6,context); expect(part.burning).toBe(6);
});
it('limits conductive chains and shared per-tick effects, always excludes friendly damage', () => {
 const {powers,context} = fixture(16,true);
 const first = powers.affect(1,'shock',6,context,'a');
 expect(first).toHaveLength(ENVIRONMENT_LIMITS.chainParts); expect(first.every(effect => effect.targets === 'enemies' && effect.owner === 'a')).toBe(true);
 expect(new Set(first.map(effect => effect.sourcePart)).size).toBe(first.length);
 const all = [...first]; for (let i = 0; i < 10; i++) all.push(...powers.affect(1,'shock',6,context,'a'));
 expect(all).toHaveLength(ENVIRONMENT_LIMITS.effectsPerTick); expect(new Set(all.map(effect => effect.id)).size).toBe(all.length);
 context.tick++; expect(powers.affect(1,'shock',6,context)).toHaveLength(ENVIRONMENT_LIMITS.chainParts);
});
it('spreads fire at most one hop per event then destroys links and leases without material refunds', () => {
 const {powers,context} = fixture();
 powers.action('a','sky-grab','1',undefined,{x: 0,y: 0,z: 1},context); powers.affect(1,'fire',6,context);
 context.tick = 15; powers.step(1 / 30,context);
 expect(powers.state.parts[1].burning).toBeGreaterThan(0); expect(powers.state.parts[2].burning ?? 0).toBe(0);
 powers.state.parts[0].integrity = .01; context.tick++; powers.step(1 / 30,context);
 expect(powers.state.parts.some(p => p.id === 1)).toBe(false); expect(powers.state.parts[0].links).not.toContain(1);
 expect(powers.leases.size).toBe(0); expect(context.inventory.wood).toBe(12);
});
it('rewinds only transforms, preserving damage, wetness, battery charge and inventory', () => {
 const {powers,context} = fixture(1), part = powers.state.parts[0];
 for (let i = 0; i < 5; i++) { context.tick++; powers.step(1 / 30,context); }
 part.integrity = 70; part.wet = 4; context.inventory.wood = 3;
 powers.action('a','sky-recall','1',undefined,{x: 0,y: 0,z: 1},context); context.tick++; powers.step(1 / 30,context);
 expect(part.integrity).toBe(70); expect(part.wet).toBeCloseTo(4 - 1 / 30); expect(context.inventory.wood).toBe(3);
});
it('casts a bounded emitter ray stopped by voxels, produces light radius, and shorts wet batteries', () => {
 const {powers,context} = fixture(), [emitter,battery,lamp] = powers.state.parts;
 Object.assign(emitter,{kind: 'emitter',mass: MATERIAL_MASS.wood * PART_COST.emitter,enabled: true,element: 'frost'});
 Object.assign(battery,{kind: 'battery',mass: MATERIAL_MASS.wood * PART_COST.battery,energy: 25});
 Object.assign(lamp,{kind: 'lamp',mass: MATERIAL_MASS.wood * PART_COST.lamp,enabled: true});
 context.solid = point => point.y < 0 || point.z >= 2;
 context.tick++; const effects = powers.step(1 / 30,context), beam = effects.find(effect => effect.element === 'frost')!;
 expect(beam.range).toBeLessThan(1.6); expect(beam.targets).toBe('enemies'); expect(beam.direction).toEqual({x: 0,y: 0,z: 1});
 expect(powers.snapshot('a').parts.find(p => p.id === lamp.id)!.lightRadius).toBe(4);
 context.immersion = () => .5; context.tick++; const short = powers.step(1 / 30,context);
 expect(short.some(effect => effect.element === 'shock')).toBe(true);
 battery.energy = 0; context.tick++; powers.step(1 / 30,context); expect(powers.snapshot('a').parts.find(p => p.id === lamp.id)!.lightRadius).toBe(0);
});
it('persists bounded environmental fields and excludes transient events from saves', () => {
 const {powers,context} = fixture(); powers.affect(1,'frost',6,context);
 const restored = new SkyboundPowers(powers.save()); expect(restored.state.parts[0].frozen).toBe(4);
 const raw = powers.save(); raw.parts[0].burning = Infinity; expect(() => new SkyboundPowers(raw)).toThrow('環境');
 expect(Object.hasOwn(powers.save(),'effects')).toBe(false);
});
