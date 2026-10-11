import {expect,it} from 'vitest';
import {IndexedFluidCells} from '../../src/fluid/indexed-cells';
import type {FluidCell} from '../../src/fluid/fluid';
import type {Vec3} from '../../src/world/types';
const distance=(c:Vec3,centers:readonly Vec3[])=>Math.min(...centers.map(p=>(p.x-c.x)**2+(p.z-c.z)**2));
function exact(cells:IndexedFluidCells,centers:readonly Vec3[],limit:number,radius:number){const expected=[...cells].filter(([,c])=>distance(c,centers)<radius**2).sort(([,a],[,b])=>distance(a,centers)-distance(b,centers)).slice(0,limit).map(([id])=>id);expect(cells.nearest(centers,limit,radius).map(e=>e.id)).toEqual(expected);}
it('preserves exact float ordering around conservative bin boundaries and the strict visibility radius',()=>{
 const cells=new IndexedFluidCells(()=>{});let id=0;const radius=48;
 for(let bin=1;bin<4096;bin+=13){const x=Math.sqrt(radius*radius*bin/4096);for(const epsilon of [-1e-12,0,1e-12])for(const y of [0,.5,1])cells.set(String(id++),{x:x+epsilon,y,z:0,volume:.1});}
 for(const x of [radius-1e-12,radius,radius+1e-12])cells.set(String(id++),{x,y:0,z:0,volume:.1});
 for(const centers of [[{x:0,y:0,z:0}],[{x:.123456789,y:0,z:.25}],[{x:-.5,y:0,z:0},{x:.5,y:0,z:0}]])for(const limit of [512,2048,8192])exact(cells,centers,limit,radius);
});
it('keeps insertion-order ties across replacement, moving an existing key, deletion/reinsertion and clear',()=>{
 const cells=new IndexedFluidCells(()=>{});for(let i=0;i<9000;i++)cells.set(String(i),{x:i%3===0?-2:2,y:i,z:0,volume:.1});
 cells.set('20',{x:2,y:20,z:0,volume:.07});cells.set('21',{x:2,y:21,z:0,volume:.06});const returned=cells.get('18')!;cells.delete('18');cells.set('18',returned);
 for(const limit of [1,511,512,2048,8192,10000])exact(cells,[{x:0,y:0,z:0}],limit,48);
 cells.clear();expect(cells.nearest([{x:0,y:0,z:0}],8192,48)).toEqual([]);cells.set('fresh',{x:0,y:0,z:0,volume:.1});exact(cells,[{x:0,y:0,z:0}],8192,48);
});
it('does not round distances for tiny finite radii or change existing unusual slice limits',()=>{
 const cells=new IndexedFluidCells(()=>{});for(let i=0;i<2600;i++)cells.set(String(i),{x:(i%50)*1e-158,y:0,z:Math.floor(i/50)*1e-158,volume:.1});
 for(const limit of [512,2048,8192,Infinity,0,-1,NaN])exact(cells,[{x:0,y:0,z:0}],limit,1e-155);
 for(const radius of [0,-48,1e200])exact(cells,[{x:0,y:0,z:0}],8192,radius);
});
it('does not inspect cells in distant spatial buckets for a finite-radius query',()=>{
 const cells=new IndexedFluidCells(()=>{});for(let i=0;i<4000;i++)cells.set(String(i),{x:(i%100)/2,y:0,z:Math.floor(i/100)/2,volume:.1});let reads=0;
 for(let i=0;i<3000;i++){const x=500+i/2;cells.set('far'+i,{get x(){reads++;return x;},y:0,z:500,volume:.1} as FluidCell);}reads=0;
 expect(cells.nearest([{x:0,y:0,z:0}],2048,48)).toHaveLength(2048);expect(reads).toBe(0);expect(cells.size).toBe(7000);
});
