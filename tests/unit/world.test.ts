import { describe, expect, it } from 'vitest';
import { SdfWorld, terrainHeight } from '../../src/world/density';
import { visibleBricks } from '../../src/world/streaming';
import { meshBrick } from '../../src/world/mesher';
import { WORLD, type EditOperation } from '../../src/world/types';
const edit = (kind: 'dig' | 'add', x = 0, y = terrainHeight(0, 0)): EditOperation => ({ id: 1, kind, position: { x, y, z: 0 }, radius: 1.7, material: 'stone', tick: 0 });
describe('seeded 3D density', () => {
 it('is deterministic, seed-sensitive, with solid ground and air', () => {
  const a = new SdfWorld(), b = new SdfWorld();
  const p = { x: 5, y: -4, z: 4 };
  expect(a.density(p)).toBe(b.density(p)); expect(a.density(p)).toBeLessThan(0);
  expect(a.density({ ...p, y: 12 })).toBeGreaterThan(0);
  expect(terrainHeight(21, 8, 1)).not.toBe(terrainHeight(21, 8, 2));
 });
 it('contains an underground tunnel and an isolated floating island', () => {
  const world = new SdfWorld();
  expect(world.density({ x: -8, y: -0.2, z: -9 })).toBeGreaterThan(0);
  expect(world.density({ x: 13, y: 15, z: -17 })).toBeLessThan(0);
  expect(world.density({ x: 13, y: 8, z: -17 })).toBeGreaterThan(0);
 });
 it('carves then adds volume and only dirties local bricks including boundaries', () => {
  const world = new SdfWorld(), e = edit('dig');
  const dirty = world.apply(e); expect(dirty.length).toBeLessThan(30);
  expect(world.density(e.position)).toBeGreaterThan(0);
  world.apply({ ...e, id: 2, kind: 'add' }); expect(world.density(e.position)).toBeLessThan(0);
  expect(dirty.some(id => id.startsWith('-1,'))).toBe(true);
  expect(world.density({ x: 100, y: -3, z: 100 })).toBe(new SdfWorld().density({ x: 100, y: -3, z: 100 }));
 });
 it('rejects invalid, duplicate and out-of-bounds edits', () => {
  const world = new SdfWorld();
  expect(() => world.apply({ ...edit('dig'), radius: Infinity })).toThrow();
  expect(() => world.apply(edit('dig', WORLD.maxX))).toThrow();
  world.apply(edit('dig')); expect(() => world.apply(edit('dig'))).toThrow();
 });
});
describe('bounded streaming and mesh extraction', () => {
 it('streams a fixed vicinity and removes distant bricks as the player crosses chunks', () => {
  const a = visibleBricks({ x: 0, y: 3, z: 8 }), b = visibleBricks({ x: 100, y: 3, z: 8 });
  expect(a.size).toBe(800); expect([...a.keys()].some(k => b.has(k))).toBe(false);
  expect([...a.values()].every(brick => brick.step === .5)).toBe(true);
  const edge = visibleBricks({ x: 999, y: 3, z: 999 });
  for (const brick of edge.values()) { expect(brick.origin.x + 8).toBeLessThanOrEqual(1000); expect(brick.origin.z + 8).toBeLessThanOrEqual(1000); }
 });
 it('generates finite indexed smooth surface triangles and no solid interior mesh', () => {
  const world = new SdfWorld();
  const mesh = meshBrick(world, { id: 'test', origin: { x: 0, y: 0, z: 0 }, step: 1 });
  expect(mesh.indices.length).toBeGreaterThan(0); expect(mesh.indices.length % 3).toBe(0);
  expect([...mesh.positions, ...mesh.normals, ...mesh.colors].every(Number.isFinite)).toBe(true);
  expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3);
  for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1, 4);
  expect(meshBrick(world, { id: 'air', origin: { x: 0, y: 32, z: 0 }, step: 2 }).indices.length).toBe(0);
 });
 it('recreates identical boundary vertices between neighboring equal-LOD bricks', () => {
  const world = new SdfWorld();
  const left = meshBrick(world, { id: 'a', origin: { x: 0, y: 0, z: 0 }, step: 1 });
  const right = meshBrick(world, { id: 'b', origin: { x: 8, y: 0, z: 0 }, step: 1 });
  const boundary = (data: Float32Array) => { const points = new Set<string>(); for (let i = 0; i < data.length; i += 3) if (data[i] === 8) points.add(`${data[i + 1].toFixed(4)}:${data[i + 2].toFixed(4)}`); return [...points].sort(); };
  expect(boundary(left.positions).length).toBeGreaterThan(0); expect(boundary(left.positions)).toEqual(boundary(right.positions));
 });
 it('keeps an edited brick boundary continuous and places vertices on the curved density surface', () => {
  const world = new SdfWorld();
  world.apply({ ...edit('add'), position: { x: 8, y: 3.5, z: 4 } });
  const left = meshBrick(world, { id: 'edited-a', origin: { x: 0, y: 0, z: 0 }, step: 1 });
  const right = meshBrick(world, { id: 'edited-b', origin: { x: 8, y: 0, z: 0 }, step: 1 });
  const boundary = (mesh: typeof left) => {
   const points = new Set<string>();
   for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = { x: mesh.positions[i], y: mesh.positions[i + 1], z: mesh.positions[i + 2] };
    expect(Math.abs(world.density(p))).toBeLessThan(0.015);
    if (p.x === 8) points.add(`${p.y.toFixed(4)}:${p.z.toFixed(4)}`);
   }
   return [...points].sort();
  };
  expect(boundary(left)).toEqual(boundary(right));
 });
});

it('reduces distant geometry without moving shared brick boundary vertices', () => {
 const mesh = meshBrick(new SdfWorld(), { id: '0,0,0', origin: { x: 0, y: 0, z: 0 }, step: 1 });
 expect(mesh.coarse).toBeDefined(); expect(mesh.coarse!.indices.length).toBeLessThan(mesh.indices.length);
 const boundary = (data: Float32Array) => { const set = new Set<string>(); for (let i = 0; i < data.length; i += 3) if ([data[i], data[i + 1], data[i + 2]].some(v => v === 0 || v === 8)) set.add([...data.slice(i, i + 3)].join(',')); return [...set].sort(); };
 expect(boundary(mesh.coarse!.positions)).toEqual(boundary(mesh.positions));
});

