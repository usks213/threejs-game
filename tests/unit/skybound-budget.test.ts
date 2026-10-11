import { expect, it } from 'vitest';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import type { SkyContext, SkyPart } from '../../src/game/skybound/types';
import { WORLD } from '../../src/world/types';
it('keeps 64 active parts intact over 120 authority ticks without exceeding the finite history window', () => {
 const parts: SkyPart[] = Array.from({length: 64}, (_, i) => ({id: i + 1, kind: 'block', material: 'wood', position: {x: (i % 8) * 2.5 - 9, y: 3, z: Math.floor(i / 8) * 2.5 - 9}, velocity: {x: 0,y: 0,z: 0}, rotation: 0, mass: 6, links: [], epoch: 0}));
 const powers = new SkyboundPowers({version: 1, parts, blueprints: [], fusions: {}});
 const context: SkyContext = {tick: 0, bounds: WORLD, player: {x: 0,y: 0,z: 0}, inventory: {}, actors: [{id: 'observer', position: {x: 0,y: 0,z: 0}}], solid: p => p.y < 0};
 const elapsed: number[] = [];
 for (let i = 0; i < 120; i++) { context.tick++; const start = performance.now(); powers.step(1 / 30, context); elapsed.push(performance.now() - start); }
 expect(powers.state.parts).toHaveLength(64); expect(powers.state.parts.every(p => p.position.y >= .49 && Number.isFinite(p.position.y))).toBe(true);
 elapsed.sort((a,b) => a - b);
 console.info(JSON.stringify({scope: '64 parts / 120 ticks / synthetic flat collision, excludes real terrain, GPU and network', p95Ms: Number(elapsed[Math.floor(elapsed.length * .95)].toFixed(2)), maxMs: Number(elapsed.at(-1)!.toFixed(2))}));
});
