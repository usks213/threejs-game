import { expect,it } from 'vitest';
import { FluidGrid } from '../../src/fluid/fluid';
import { SdfWorld } from '../../src/world/density';
import { voxelizeObstacles } from '../../src/fluid/obstacles';
it('keeps thin rotated walls continuous at voxel edges',()=>{const v=voxelizeObstacles([{x:1,y:20.5,z:.5,hx:.06,hy:2,hz:2}]);expect(v.barriers.has('0,20,0/1,20,0')).toBe(true);expect(v.barriers.has('1,20,0/0,20,0')).toBe(true);});
it('displaces water from solid objects without deleting its volume',()=>{const f=new FluidGrid(new SdfWorld());f.add({x:0,y:20,z:0},1);f.setObstacles([{x:.5,y:20.5,z:.5,hx:.6,hy:.6,hz:.6}]);f.step();expect([...f.cells.values()].reduce((n,c)=>n+c.volume,0)).toBeCloseTo(1);expect(f.displaced).toBeGreaterThan(0);f.setObstacles([]);f.step();expect([...f.cells.values()].reduce((n,c)=>n+c.volume,0)).toBeCloseTo(1);});

it('uses displaced bottom height when finding the surface for boats and fish',()=>{const f=new FluidGrid(new SdfWorld());f.add({x:0,y:20,z:0},.3);f.setObstacles([{x:.5,y:20.25,z:.5,hx:.5,hy:.251,hz:.5}]);expect(f.surfaceHeight(.5,.5)).toBeCloseTo(20.8);expect(f.surfaceHeight(8,8)).toBeNull();});
