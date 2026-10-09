import { describe, expect, it } from 'vitest';
import { SkyboundPowers } from '../../src/game/skybound/powers';
import { SKY_LIMITS } from '../../src/game/skybound/types';
import type { SkyContext, SkyPart } from '../../src/game/skybound/types';
import { validateSkybound } from '../../src/game/skybound/validation';
import { WORLD } from '../../src/world/types';
const aim = {x: 0, y: 0, z: 1};
function fixture() {
 const powers = new SkyboundPowers();
 const context: SkyContext = {tick: 0, bounds: WORLD, player: {x: 0, y: 0, z: 0}, inventory: {wood: 50, stone: 50, iron: 50, sword: 1, resin: 3}, actors: [], solid: p => p.y < 0};
 return {powers, context};
}
function part(powers: SkyboundPowers, context: SkyContext, x = 2, y = 2, z = 0): SkyPart {
 powers.action('a', 'sky-part', 'block:wood', {x, y, z}, aim, context); return powers.state.parts.at(-1)!;
}
function tick(powers: SkyboundPowers, context: SkyContext, times = 1) { for (let i = 0; i < times; i++) { context.tick++; powers.step(1 / 30, context); } }
describe('authoritative creative powers', () => {
 it('validates before spending, preserves mass differences and prevents a two-person lease conflict', () => {
  const {powers, context} = fixture(), a = part(powers, context);
  expect(a.mass).toBe(6); expect(context.inventory.wood).toBe(47);
  powers.action('a', 'sky-grab', String(a.id), undefined, aim, context);
  expect(() => powers.action('b', 'sky-grab', String(a.id), undefined, aim, context)).toThrow('別の冒険者');
  const before = context.inventory.wood;
  expect(() => part(powers, context, 2, -.1)).toThrow(); expect(context.inventory.wood).toBe(before);
  expect(() => powers.action('a', 'sky-part', '__proto__:wood', {x: 4, y: 2, z: 0}, aim, context)).toThrow();
  powers.release('a'); powers.action('b', 'sky-grab', String(a.id), undefined, aim, context);
  expect(powers.snapshot('b').parts[0].lease?.owner).toBe('b');
 });
 it('sweeps dragged parts against thin voxel walls and does not renew another owner lease', () => {
  const {powers, context} = fixture(), a = part(powers, context);
  powers.action('a', 'sky-grab', String(a.id), undefined, aim, context);
  context.solid = p => p.y < 0 || (p.x >= 3 && p.x < 3.125);
  expect(() => powers.action('a', 'sky-move', String(a.id), {x: 4, y: 2, z: 0}, aim, context)).toThrow();
  expect(a.position.x).toBe(2);
  context.tick = SKY_LIMITS.leaseTicks + 1; powers.step(1 / 30, context);
  expect(powers.leases.size).toBe(0);
 });
 it('glues and rotates whole assemblies, clears pre-glue history and releases all parts on disconnect', () => {
  const {powers, context} = fixture(), a = part(powers, context), b = part(powers, context, 3);
  tick(powers, context, 2); powers.action('a', 'sky-grab', String(a.id), undefined, aim, context);
  powers.action('a', 'sky-glue', `${a.id}:${b.id}`, undefined, aim, context);
  expect(a.links).toEqual([b.id]); expect(b.links).toEqual([a.id]);
  expect(() => powers.action('a', 'sky-recall', String(a.id), undefined, aim, context)).toThrow('軌跡');
  powers.action('a', 'sky-move', String(a.id), {x: 2, y: 3, z: 0}, {x: 1, y: 0, z: 0}, context);
  expect(b.position.x).toBeCloseTo(2); expect(b.position.z).toBeCloseTo(-1);
  powers.release('a'); expect(powers.leases.size).toBe(0);
 });
 it('rewinds only finite object poses, refuses concurrent ownership and never rewinds inventory', () => {
  const {powers, context} = fixture(), a = part(powers, context, 2, 4), initial = a.position.y;
  tick(powers, context, 12); expect(a.position.y).toBeLessThan(initial);
  context.inventory.wood = 7;
  powers.action('a', 'sky-recall', String(a.id), undefined, aim, context);
  expect(() => powers.action('b', 'sky-grab', String(a.id), undefined, aim, context)).toThrow();
  const low = a.position.y; tick(powers, context, 10); expect(a.position.y).toBeGreaterThan(low);
  expect(context.inventory.wood).toBe(7); expect(context.tick).toBe(22);
  tick(powers, context, 3); expect(powers.leases.size).toBe(0);
 });
 it('cancels recall when new terrain blocks the old path', () => {
  const {powers, context} = fixture(), a = part(powers, context, 2, 4);
  tick(powers, context, 8); powers.action('a', 'sky-recall', String(a.id), undefined, aim, context);
  context.solid = () => true; tick(powers, context); expect(powers.leases.size).toBe(0);
  expect(powers.snapshot('a').parts[0].recalling).toBe(false);
 });
 it('previews an upward exit and rechecks roof, headroom, other players and protection at commit', () => {
  const {powers, context} = fixture(); context.solid = p => p.y < 0 || (p.y >= 2 && p.y < 3);
  powers.action('a', 'sky-ascend-preview', '', undefined, aim, context);
  expect(powers.snapshot('a').ascendPreview?.exit.y).toBeCloseTo(3.01,2);
  context.actors = [{id: 'b', position: {x: 0, y: 3, z: 0}}];
  expect(() => powers.action('a', 'sky-ascend', '', undefined, aim, context)).toThrow('出口');
  expect(powers.snapshot('a').ascendPreview).toBeUndefined(); context.actors = [];
  powers.action('a', 'sky-ascend-preview', '', undefined, aim, context);
  context.protected = p => p.y >= 3;
  expect(() => powers.action('a', 'sky-ascend', '', undefined, aim, context)).toThrow('出口');
  context.protected = undefined; powers.action('a', 'sky-ascend-preview', '', undefined, aim, context);
  expect(powers.action('a', 'sky-ascend', '', undefined, aim, context).exit).toEqual({x: 0, y: 3.01, z: 0});
 });
 it('rebuilds an owned graph atomically, keeps failed placement materials, and saves no leases/history', () => {
  const {powers, context} = fixture(), a = part(powers, context), b = part(powers, context, 3);
  powers.action('a', 'sky-grab', String(a.id), undefined, aim, context);
  powers.action('a', 'sky-glue', `${a.id}:${b.id}`, undefined, aim, context);
  powers.action('a', 'sky-blueprint', `${a.id}:橋の土台`, undefined, aim, context);
  const blueprint = powers.state.blueprints[0], before = context.inventory.wood;
  expect(() => powers.action('a', 'sky-rebuild', String(blueprint.id), a.position, aim, context)).toThrow();
  expect(context.inventory.wood).toBe(before);
  expect(() => powers.action('b', 'sky-rebuild', String(blueprint.id), {x: 2, y: 2, z: 3}, aim, context)).toThrow();
  powers.action('a', 'sky-rebuild', String(blueprint.id), {x: 2, y: 2, z: 3}, aim, context);
  expect(powers.state.parts).toHaveLength(4); expect(context.inventory.wood).toBe(before - 6);
  expect(powers.state.parts[2].links).toEqual([powers.state.parts[3].id]);
  const restored = new SkyboundPowers(powers.save()); expect(restored.leases.size).toBe(0);
  expect(restored.save()).toEqual(powers.save()); expect(() => restored.action('a', 'sky-recall', String(a.id), undefined, aim, context)).toThrow('軌跡');
 });
 it('fuses once, spends exactly one material and removes without refund', () => {
  const {powers, context} = fixture(); powers.action('a', 'sky-fuse', 'sword:resin', undefined, aim, context);
  expect(context.inventory.resin).toBe(2); expect(powers.fusion('a', 'sword')?.effect).toBe('fire');
  expect(() => powers.action('a', 'sky-fuse', 'sword:resin', undefined, aim, context)).toThrow(); expect(context.inventory.resin).toBe(2);
  expect(powers.fusion('b', 'sword')).toBeUndefined();
  powers.wearFusion('a', 'sword'); expect(powers.fusion('a', 'sword')?.durability).toBe(19);
  powers.action('a', 'sky-unfuse', 'sword', undefined, aim, context); expect(powers.fusion('a', 'sword')).toBeUndefined(); expect(context.inventory.resin).toBe(2);
 });
 it('rejects malformed/future saves and allows only symmetric bounded graphs', () => {
  const {powers, context} = fixture(); part(powers, context);
  const saved = powers.save(); saved.parts[0].links = [999]; expect(() => validateSkybound(saved)).toThrow();
  expect(() => validateSkybound({...powers.save(), version: 999})).toThrow();
  const corrupt = powers.save(); corrupt.parts[0].position.x = NaN; expect(() => validateSkybound(corrupt)).toThrow();
 });
 it('lets a character stand on parts and blocks their occupied side faces', () => {
  const {powers, context} = fixture(); part(powers, context);
  const player = {x: 2, y: 2.4, z: 0, vy: -1, grounded: false}; powers.collidePlayer(player, 2.6);
  expect(player.y).toBe(2.5); expect(player.grounded).toBe(true);
  const side = {x: 2, y: 1.8, z: 0, vy: 0, grounded: true}; powers.collidePlayer(side, 1.8); expect(Math.hypot(side.x - 2, side.z)).toBeGreaterThan(.7);
 });
});
it('replaces replica collision poses without retaining references or authority-only leases', () => {
 const {powers,context} = fixture(), root = part(powers,context), replica = new SkyboundPowers();
 powers.action('a','sky-grab',String(root.id),undefined,aim,context);
 const snapshot = powers.snapshot('a'); replica.applyReplica(snapshot);
 expect(replica.state.parts[0].position).toEqual(root.position); expect(replica.leases.size).toBe(0);
 snapshot.parts[0].position.x = 12; expect(replica.state.parts[0].position.x).toBe(2);
 root.position.x = 3; replica.applyReplica(powers.snapshot('a')); expect(replica.state.parts[0].position.x).toBe(3);
});
