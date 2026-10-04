import { describe, expect, it } from 'vitest';
import { sampleField } from '../../src/rendering/voxel/field-raycast';
import { SdfWorld } from '../../src/world/density';
import { sampleFieldBrick } from '../../src/world/field-data';
import { DIRECT_FIELD_RANGES, directVisibleBricks, withinDirectFieldRetention } from '../../src/world/field-streaming';
import { TerrainRuntime } from '../../src/world/terrain-runtime';
import { TerrainScheduler } from '../../src/world/terrain-scheduler';
import { BRICK_SIZE, WORLD, brickId, type Brick, type FieldLod } from '../../src/world/types';

const focus = { x: 4, y: 4, z: 4 };
const brick = (step = .5, fieldLod?: FieldLod): Brick => ({ id: '0,0,0', origin: { x: 0, y: 0, z: 0 }, step, fieldLod });

describe('bounded direct field demand', () => {
  it('extends the same 8m brick IDs to 80m using half/full/2m grids with stable cell demand', () => {
    const visible = directVisibleBricks(focus);
    expect(new Set([...visible.values()].map(value => value.step))).toEqual(new Set([.5, 1, 2]));
    expect(visible.get('0,0,0')?.step).toBe(.5);
    expect(visible.get('4,0,0')?.step).toBe(1);
    expect(visible.get('10,0,0')?.step).toBe(2);
    expect(visible.has('11,0,0')).toBe(false);
    expect(directVisibleBricks({ x: .1, y: .1, z: .1 })).toEqual(visible);
    expect(directVisibleBricks({ x: 7.9, y: 7.9, z: 7.9 })).toEqual(visible);
    const uniformSamples = visible.size * 17 ** 3;
    const lodSamples = [...visible.values()].reduce((sum, value) => sum + (BRICK_SIZE / value.step + 1) ** 3, 0);
    expect(visible.size).toBeLessThan(1300);
    expect(lodSamples / uniformSamples).toBeLessThan(.25);
    for (const value of visible.values()) {
      expect(value.id).toBe(brickId(value.origin.x / 8, value.origin.y / 8, value.origin.z / 8));
      expect(value.origin.y).toBeGreaterThanOrEqual(WORLD.minY);
      expect(value.origin.y + 8).toBeLessThanOrEqual(WORLD.maxY);
    }
  });
  it('covers near caves at player altitude, surface at distance and old floating SDF islands', () => {
    const underground = directVisibleBricks({ ...focus, y: -12 });
    expect(underground.has('0,-2,0')).toBe(true);
    expect(underground.has('8,0,0')).toBe(true);
    const elevated = directVisibleBricks({ ...focus, y: 36 });
    expect(elevated.has('0,5,0')).toBe(true);
    expect(elevated.has('0,0,0')).toBe(true);
    expect(elevated.has('8,5,0')).toBe(false);
    expect(directVisibleBricks({ x: 60, y: 0, z: 0 }, WORLD, 1).has('1,2,-3')).toBe(true);
    for (const value of directVisibleBricks({ x: 995, y: 1, z: -995 }).values()) {
      expect(value.origin.x + 8).toBeLessThanOrEqual(WORLD.maxX);
      expect(value.origin.z).toBeGreaterThanOrEqual(WORLD.minZ);
    }
  });
  it('retains the extra completed halo without keeping far-world bricks forever', () => {
    expect(withinDirectFieldRetention({ ...brick(), origin: { x: 88, y: 0, z: 0 } }, focus)).toBe(true);
    expect(withinDirectFieldRetention({ ...brick(), origin: { x: 104, y: 0, z: 0 } }, focus)).toBe(false);
    expect(DIRECT_FIELD_RANGES.retention).toBeGreaterThan(DIRECT_FIELD_RANGES.far);
  });
});

describe('adaptive authoritative field sampling', () => {
  it('labels empty and solid bricks so they do not consume the GPU upload count', () => {
    const world = new SdfWorld(WORLD, 3);
    for (const value of [-2, 2]) { world.density = () => value; expect(sampleFieldBrick(world, brick(2)).field?.surface).toBe(false); }
    world.density = p => p.y - 4; expect(sampleFieldBrick(world, brick()).field?.surface).toBe(true);
    world.density = () => 0; expect(sampleFieldBrick(world, brick()).field?.surface).toBe(true);
  });
  it('samples exactly 17³, 9³ and 5³ values, with identical extents and nested grid values', () => {
    const world = new SdfWorld(WORLD, 3), fields = [.5, 1, 2].map(step => sampleFieldBrick(world, brick(step)).field!);
    expect(fields.map(field => field.density.length)).toEqual([4913, 729, 125]);
    for (const field of fields) {
      expect((field.size - 1) * field.step).toBe(8);
      for (let z = 0; z <= 8; z += 2) for (let y = 0; y <= 8; y += 2) for (let x = 0; x <= 8; x += 2) {
        expect(sampleField(field, x, y, z)).toBe(sampleField(fields[0], x, y, z));
      }
    }
    expect(() => sampleFieldBrick(world, brick(0))).toThrow('sampling step');
    expect(() => sampleFieldBrick(world, brick(.3))).toThrow('sampling step');
  });
  it('matches all shared face reconstructions, including edge neighbors coarser than either face', () => {
    const visible = directVisibleBricks(focus), world = new SdfWorld(WORLD, 3);
    // A genuinely 3D nonlinear field exposes cracks hidden by a planar terrain test.
    world.density = p => Math.sin(p.x * .83) + Math.sin(p.y * .61) + Math.cos(p.z * .77) - .1;
    const fields = new Map<string, ReturnType<typeof sampleFieldBrick>['field']>();
    const get = (value: Brick) => { if (!fields.has(value.id)) fields.set(value.id, sampleFieldBrick(world, value).field); return fields.get(value.id)!; };
    let mixed = 0, matchingWithCoarseEdge = 0, vertical = 0;
    for (const a of visible.values()) {
      if (a.origin.y !== 0 || !a.fieldLod) continue;
      for (const [axis, key] of (['x', 'y', 'z'] as const).entries()) {
        const origin = { ...a.origin, [key]: a.origin[key] + 8 };
        const b = visible.get(brickId(origin.x / 8, origin.y / 8, origin.z / 8));
        if (!b) continue;
        const mismatch = a.step !== b.step;
        if (mismatch ? mixed >= 16 : key === 'y' ? vertical >= 8 : matchingWithCoarseEdge >= 16) continue;
        const af = get(a), bf = get(b), other = [0, 1, 2].filter(value => value !== axis), names = ['x', 'y', 'z'] as const;
        for (let u = 0; u <= 8; u += .25) for (let v = 0; v <= 8; v += .25) {
          const p = { ...origin }; p[names[other[0]]] += u; p[names[other[1]]] += v;
          expect(sampleField(af, p.x, p.y, p.z)).toBeCloseTo(sampleField(bf, p.x, p.y, p.z), 6);
        }
        if (mismatch) mixed++; else if (key === 'y') vertical++; else matchingWithCoarseEdge++;
      }
    }
    expect(mixed).toBe(16); expect(vertical).toBe(8); expect(matchingWithCoarseEdge).toBe(16);
    const transition = [...visible.values()].find(value => value.step === .5 && value.fieldLod)!;
    const field = get(transition), p = { x: transition.origin.x + .5, y: transition.origin.y + .5, z: transition.origin.z + .5 };
    expect(sampleField(field, p.x, p.y, p.z)).toBeCloseTo(world.density(p), 6);
  });
  it('invalidates cached transitions and in-flight revisions even when brick step and ID do not change', () => {
    const runtime = new TerrainRuntime(); runtime.handle({ type: 'init', direct: true, epoch: 1, bounds: WORLD, generator: 3, edits: [] });
    const lod = { faces: [1, 1, 1, 1, 1, 1], edges: Array<number>(12).fill(1) };
    const request = (target: Brick) => runtime.handle({ type: 'mesh', job: { epoch: 1, editCount: 0, version: 1, brick: target } });
    request(brick()); request(brick()); request(brick(.5, lod)); request(brick(.5, structuredClone(lod)));
    lod.faces[0] = 2; lod.edges.fill(2); request(brick(.5, lod));
    request(brick(2));
    expect(runtime.cacheStats).toMatchObject({ hits: 2, misses: 4 });
    const scheduler = new TerrainScheduler(); scheduler.reset();
    scheduler.setVisible(new Map([['0,0,0', brick()]]), focus);
    const stale = scheduler.next(0)!;
    scheduler.setVisible(new Map([['0,0,0', brick(.5, lod)]]), focus);
    expect(scheduler.complete(stale)).toBeNull(); expect(scheduler.next(0)?.brick.fieldLod).toEqual(lod);
  });
  it('invalidates incremental direct edits without touching unaffected cached fields', () => {
    const world = new SdfWorld(WORLD, 3), runtime = new TerrainRuntime();
    runtime.handle({ type: 'init', direct: true, epoch: 1, bounds: WORLD, generator: 3, edits: [] });
    const request = (target: Brick, editCount: number) => {
      const result = runtime.handle({ type: 'mesh', job: { epoch: 1, editCount, version: 1, brick: target } });
      if (result?.type !== 'mesh') throw new Error('Expected direct field');
      return result.mesh.field!;
    };
    const distant = { ...brick(2), id: '8,0,0', origin: { x: 64, y: 0, z: 0 } };
    const original = request(brick(), 0); request(distant, 0);
    const edit = { id: 1, tick: 1, kind: 'dig' as const, position: { x: 4, y: 2, z: 4 }, radius: 1.5, material: 'stone' as const };
    world.apply(edit); runtime.handle({ type: 'edits', epoch: 1, base: 0, edits: [edit] });
    const updated = request(brick(), 1); request(distant, 1);
    expect(sampleField(updated, 4, 2, 4)).not.toBe(sampleField(original, 4, 2, 4));
    expect(sampleField(updated, 4, 2, 4)).toBeCloseTo(world.density(edit.position), 6);
    expect(runtime.cacheStats).toMatchObject({ hits: 1, misses: 3 });
  });
  it('keeps saved edits authoritative across coarse sampling and a later fine resample', () => {
    const world = new SdfWorld(WORLD, 3), operation = { id: 1, tick: 1, kind: 'dig' as const, position: { x: 4, y: 2, z: 4 }, radius: 1.5, material: 'stone' as const };
    world.apply(operation); const saved = JSON.stringify(world.edits);
    const runtime = new TerrainRuntime(); runtime.handle({ type: 'init', direct: true, epoch: 1, bounds: WORLD, generator: 3, edits: world.edits });
    for (const step of [2, 1, .5]) {
      const result = runtime.handle({ type: 'mesh', job: { epoch: 1, editCount: 1, version: 1, brick: brick(step) } });
      if (result?.type !== 'mesh') throw new Error('Expected direct field');
      expect(sampleField(result.mesh.field!, 4, 2, 4)).toBeCloseTo(world.density(operation.position), 6);
    }
    expect(JSON.stringify(world.edits)).toBe(saved);
  });
});
