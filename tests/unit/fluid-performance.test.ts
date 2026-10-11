import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FluidGrid, MAX_FLUID_CELLS, type FluidCell } from '../../src/fluid/fluid';
import { IndexedFluidCells } from '../../src/fluid/indexed-cells';
import { voxelizeObstacles, type WaterObstacle } from '../../src/fluid/obstacles';
import { SdfWorld } from '../../src/world/density';
import type { Vec3 } from '../../src/world/types';

const id = (c: Vec3) => `${c.x},${c.y},${c.z}`;
const volume = (f: FluidGrid) => [...f.cells.values()].reduce((n, c) => n + c.volume, 0);
const digest = (f: FluidGrid) => createHash('sha256').update(JSON.stringify([...f.cells].map(([id, c]) => [id, c.volume, c.vx ?? 0, c.vz ?? 0]))).digest('hex');
const distance = (c: Vec3, centers: readonly Vec3[]) => Math.min(...centers.map(p => (p.x - c.x) ** 2 + (p.z - c.z) ** 2));

describe('exact indexed water budgets', () => {
  it('matches full stable sorting for multiple centers, ties, negative buckets, and map mutations', () => {
    const cells = new IndexedFluidCells(() => {});
    for (let x = -30; x <= 30; x += .5) for (let z = -15; z <= 15; z += .5) {
      const c = { x, y: (x + z) % 2, z, volume: .1 }; cells.set(id(c), c);
    }
    const replaced = [...cells.values()][20]; cells.set(id(replaced), { ...replaced, volume: .04 });
    const reinserted = [...cells.values()][30]; cells.delete(id(reinserted)); cells.set(id(reinserted), reinserted);
    for (const centers of [[{ x: 0, y: 0, z: 0 }], [{ x: -8, y: 4, z: 8 }], [{ x: -20, y: 0, z: -5 }, { x: 10.3, y: 0, z: 4.7 }]]) {
      for (const [limit, radius] of [[2048, Infinity], [MAX_FLUID_CELLS, 48], [100, 8]]) {
        const expected = [...cells.values()].filter(c => distance(c, centers) < radius ** 2).sort((a, b) => distance(a, centers) - distance(b, centers)).slice(0, limit).map(id);
        expect(cells.nearest(centers, limit, radius).map(e => e.id)).toEqual(expected);
      }
    }
    expect(cells.first(100).map(e => e.id)).toEqual([...cells.keys()].slice(0, 100));
    cells.clear(); expect(cells.nearest([{ x: 0, y: 0, z: 0 }], 2048)).toEqual([]);
    expect([...cells.column(0, 0)]).toEqual([]);
  });

  it('does not read far-away cells to choose the nearest active region', () => {
    const cells = new IndexedFluidCells(() => {});
    for (let i = 0; i < 3000; i++) { const c = { x: (i % 64) * .5, y: 1, z: Math.floor(i / 64) * .5, volume: .1 }; cells.set(id(c), c); }
    let farReads = 0;
    for (let i = 0; i < 10000; i++) {
      const x = 1000 + i * .5, c = { get x() { farReads++; return x; }, y: 1, z: 1000, volume: .1 };
      cells.set(id(c), c);
    }
    farReads = 0;
    expect(cells.nearest([{ x: 0, y: 0, z: 0 }], 2048)).toHaveLength(2048);
    expect(farReads).toBe(0); expect(cells.size).toBe(13000);
  });

  it('keeps all distant water and velocities while updating exactly the existing 2048-cell budget', () => {
    const world = new SdfWorld(); world.density = p => p.y;
    const f = new FluidGrid(world, .5), cells: FluidCell[] = [];
    for (let i = 0; i < 2200; i++) cells.push({ x: (i % 55) * .5, y: 10, z: Math.floor(i / 55) * .5, size: .5, volume: .1, vx: 5, frozen: true });
    for (let i = 0; i < 7000; i++) cells.push({ x: 500 + i * .5, y: 10, z: 500, size: .5, volume: .1, vx: 5 });
    f.restore(cells); const before = volume(f), center = { x: 0, y: 10, z: 0 };
    const active = cells.slice().sort((a, b) => distance(a, [center]) - distance(b, [center])).slice(0, 2048);
    f.step([center]);
    expect([...f.cells.values()].filter(c => c.vx === 4).map(id).sort()).toEqual(active.map(id).sort());
    expect(f.cells.size).toBe(9200); expect(volume(f)).toBeCloseTo(before, 10);
    expect(f.cells.get(id(cells.at(-1)!))?.vx).toBe(5);
    expect(f.snapshot()).toHaveLength(9200); expect(f.snapshot(center).length).toBeLessThanOrEqual(MAX_FLUID_CELLS);
  });
});

describe('baseline fluid behavior', () => {
  // Exact cell insertion order, volume, and unrounded current hashes from aa12908's original solver.
  const reference = [
    { size: 1, initial: 32.4, hashes: ['2f5cd20ffd4cd17dbc3b8eb1aec662667166c01dfda3f5a354f7edb73515e5d6', '9a97049edd6e1415f3e921c5085316a19aab49c98ce0f20be70f534fe20e912a', '51288b37a70a4fe9825315f37e8413f8db2d0ff2b2df2d2fd9ddf52c952d5a1d', 'cb2e311a7a432d51acfd04cc7d374af761a7bfc9f5268754e5618f4cd38a3cc5'] },
    { size: .5, initial: 16.9, hashes: ['f33b88af052f91813fd14085c5a086b7a5e59a5b243731c0ad7e68d66b6b6b2f', '84e29a6be664f4339f0dc344298380fc2573602c46247e64d705cf9d8b68cecb', '375fd7e061d332ba545cdcd7d057767498a40c01bbfaebaa6d4906fbc8020d17', '919d6a288d3095a92597da8f4b54652157cd2b0af326498412a6a71adc328c41'] },
  ];
  for (const { size, initial, hashes } of reference) it(`matches the unoptimized ${size}m solver through flow, obstacles, terrain edits, freezing, pouring and draining`, () => {
    const world = new SdfWorld(); world.density = p => p.y - .13;
    const f = new FluidGrid(world, size);
    for (let x = -4; x < 4; x += size) for (let z = -4; z < 4; z += size) f.add({ x, y: size * 2, z }, size ** 3 * (.2 + ((x + z + 8) / 16) * .7));
    for (let phase = 0; phase < 90; phase++) {
      if (phase === 2) f.setObstacles([{ x: 1, y: 1, z: 0, hx: .06, hy: 2, hz: 2, rotation: .32 }]);
      if (phase === 5) f.freeze({ x: 0, y: 2, z: 0 }, 2.5);
      if (phase === 9) expect(f.pour({ x: 0, y: 2, z: 0 }, { x: .7, z: -.3 }, 3)).toBeCloseTo(3);
      if (phase === 12) {
        world.apply({ id: 1, kind: 'add', position: { x: 0, y: 1, z: 0 }, radius: 1.2, material: 'stone', tick: 12 });
        const original = world.density.bind(world); world.density = p => Math.min(original(p), Math.hypot(p.x, p.y - 1, p.z) - 1.2);
      }
      if (phase === 20) f.setObstacles([]);
      if (phase === 25) expect(f.drain({ x: 0, y: 1, z: 0 }, 2, 1)).toBeCloseTo(1);
      f.step([{ x: 0, y: 2, z: 0 }, { x: -3, y: 2, z: 2 }]);
      const checkpoint = [0, 10, 30, 89].indexOf(phase);
      if (checkpoint !== -1) expect(digest(f)).toBe(hashes[checkpoint]);
      expect(volume(f)).toBeCloseTo(initial + (phase >= 9 ? 3 : 0) - (phase >= 25 ? 1 : 0), 8);
    }
  });

  it('reuses terrain samples, then invalidates terrain and obstacle floors without stale snapshots', () => {
    const world = new SdfWorld(); let samples = 0; world.density = p => { samples++; return p.y; };
    const f = new FluidGrid(world, .5), center = { x: 0, y: 2, z: 0 };
    f.add(center, .1); const before = f.snapshot(center); const count = samples;
    f.snapshot(); f.surfaceHeight(.25, .25); f.current(center); expect(samples).toBeGreaterThanOrEqual(count);
    const warmed = samples; f.snapshot(); f.surfaceHeight(.25, .25); expect(samples).toBe(warmed);
    f.setObstacles([{ x: .25, y: 2.25, z: .25, hx: .3, hy: .3, hz: .3 }]);
    expect(f.snapshot(center)[0].bottom).toBe(.5); expect(samples).toBe(warmed);
    f.setObstacles([]); expect(f.snapshot(center)[0].bottom).toBe(before[0].bottom);
    world.apply({ id: 1, kind: 'add', position: center, radius: .5, material: 'stone', tick: 1 });
    f.snapshot(center); expect(samples).toBeGreaterThan(warmed);
    f.freeze(center, 2); expect(f.snapshot(center)[0].frozen).toBe(true);
    f.drain(center, 2, .025); expect(f.snapshot(center)[0].volume).toBeCloseTo(.075);
    f.cells.clear(); expect(f.snapshot(center)).toEqual([]); expect(f.surfaceHeight(.25, .25)).toBeNull();
  });
});

it('preserves obstacle masks at thin, axis-aligned, rotated, overlapping and negative cell boundaries', () => {
  const obstacles: WaterObstacle[] = [
    { x: 1, y: 2.5, z: .5, hx: .06, hy: 2, hz: 2 },
    { x: -1, y: 1, z: -2, hx: .8, hy: .3, hz: .06, rotation: Math.PI / 2 },
    { x: -1, y: 1, z: -2, hx: .8, hy: .3, hz: .4, rotation: .372 },
    { x: 0, y: .5, z: 0, hx: .25, hy: .25, hz: .25, rotation: Math.PI },
  ];
  // Lower-face entering edges are included after the authored-room obstacle fix.
  const hashes = ['9bacc87f828b129f8fd090f33fb6d6904d6f4081daa3f25ef03abef7a1705943', '80d715cfe5466ea49ea567c6ccf657b51527551fcfcae34681220eb94101f73e'];
  for (const [i, size] of [.5, 1].entries()) {
    const mask = voxelizeObstacles(obstacles, size);
    expect(createHash('sha256').update(JSON.stringify({ occupied: [...mask.occupied], barriers: [...mask.barriers] })).digest('hex')).toBe(hashes[i]);
  }
});
it('selects the exact nearest visible subset before sorting, including dense ties and adversarial insertion orders',()=>{
 for(const order of ['forward','reverse','alternating'] as const){const cells=new IndexedFluidCells(()=>{}),values:FluidCell[]=[];for(let x=-30;x<=30;x+=.5)for(let z=-20;z<=20;z+=.5)for(const y of [0,.5])values.push({x,y,z,volume:.1,size:.5});
  if(order==='reverse')values.reverse();if(order==='alternating')values.sort((a,b)=>(a.x+a.z)%3-(b.x+b.z)%3);
  for(const cell of values)cells.set(id(cell),cell);const removed=values[123];cells.delete(id(removed));cells.set(id(removed),removed);
  for(const centers of [[{x:0,y:0,z:0}],[{x:8.25,y:1,z:-6.75}],[{x:-10,y:0,z:7},{x:12,y:0,z:-5}]])for(const limit of [1,64,2048,8192]){
   const expected=[...cells.values()].filter(c=>distance(c,centers)<48**2).sort((a,b)=>distance(a,centers)-distance(b,centers)).slice(0,limit).map(id);
   expect(cells.nearest(centers,limit,48).map(e=>e.id)).toEqual(expected);
  }
  expect(cells.size).toBe(values.length);
 }
});
