import {it,expect} from 'vitest';
import {FluidGrid} from '../../src/fluid/fluid';
import {SdfWorld} from '../../src/world/density';
import type {WaterObstacle} from '../../src/fluid/obstacles';
it('matches naïve union occupancy exactly across moving and removed obstacles while conserving displaced water',()=>{
 const world=new SdfWorld();world.density=p=>p.y;const separated=new FluidGrid(world,.5),reference=new FluidGrid(world,.5);
 for(let x=-2;x<=2;x+=.5)for(let z=-2;z<=2;z+=.5){separated.add({x,y:.5,z},.1);reference.add({x,y:.5,z},.1);}
 const wall:WaterObstacle={x:0,y:1,z:0,hx:.065,hy:1,hz:2,rotation:.18};
 const ordered=(grid:FluidGrid)=>grid.snapshot().sort((a,b)=>a.x-b.x||a.y-b.y||a.z-b.z);
 for(let step=0;step<30;step++){
  const fixed=step<20?[wall]:[],dynamic=step<25?[{x:-1+step*.06,y:.8,z:.3,hx:.3,hy:.5,hz:.3}]:[];
  separated.setObstacles(dynamic,fixed);reference.setObstacles([...fixed,...dynamic]);expect(ordered(separated)).toEqual(ordered(reference));const volume=[...separated.cells.values()].reduce((n,c)=>n+c.volume,0);separated.step([{x:0,y:0,z:0}]);expect([...separated.cells.values()].reduce((n,c)=>n+c.volume,0)).toBeCloseTo(volume,8);
  // Static barriers now intentionally constrain displacement differently from all-dynamic obstacles.
  // Compare the next obstacle projection on the same exact physical cells, not different flow rules.
  reference.restore([...separated.cells.values()].map(c=>({...c})));
 }
});
