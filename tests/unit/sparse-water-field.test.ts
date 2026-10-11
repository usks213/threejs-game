import {expect,it} from 'vitest';
import {buildSparseWaterField,boxSdf,usesWaterField,waterHeight} from '../../src/rendering/water/sparse-field';
it('retains authoritative partial-cell volume, bottom, freeze state and legacy cell size',()=>{
 const cells=[{x:0,y:2,z:0,size:.5,bottom:.1,volume:.075},{x:1,y:2,z:0,volume:.8,frozen:true},{x:2,y:2,z:0,size:.5,volume:.005}];const original=JSON.stringify(cells),field=buildSparseWaterField(cells);
 expect(waterHeight(cells[0])).toBeCloseTo(.3);expect(field.cells).toBe(1);expect(field.bricks).toHaveLength(1);expect(JSON.stringify(cells)).toBe(original);expect(usesWaterField(cells[1])).toBe(false);expect(usesWaterField(cells[2])).toBe(false);
});
it('has exact signed distances to partial-fill bounds and preserves disconnected levels',()=>{
 const b={x:0,y:.1,z:0,xx:.5,yy:.3,zz:.5};expect(boxSdf(.25,.2,.25,b)).toBeCloseTo(-.1);expect(boxSdf(.25,.5,.25,b)).toBeCloseTo(.2);
 const f=buildSparseWaterField([{x:0,y:0,z:0,size:.5,volume:.125},{x:0,y:12,z:0,size:.5,volume:.125}]);expect(f.bricks.map(b=>b.y)).toEqual([0,12]);expect(f.encoded.some(n=>n<127)).toBe(true);
});
it('keeps negative-coordinate brick boundaries continuous in their padded samples',()=>{
 const f=buildSparseWaterField([{x:-.5,y:0,z:0,size:.5,volume:.125},{x:0,y:0,z:0,size:.5,volume:.125}]);expect(f.bricks.map(b=>b.x)).toEqual([-3,0]);const [w,h]=f.dimensions;
 // Same world x=-.25 at first brick sample6 and second padded sample0.
 const index=(n:number,x:number,y:number,z:number)=>(n%16)*8+x+w*(Math.floor(n/16)%16*14+y+h*(Math.floor(n/256)*8+z));
 expect(f.encoded[index(0,6,2,1)]).toBe(f.encoded[index(1,0,2,1)]);
});
it('budgets the atlas by occupied bricks, not the bounding box of a sparse world',()=>{
 const f=buildSparseWaterField([{x:-10000,y:0,z:0,volume:1},{x:10000,y:0,z:0,volume:1}]);expect(f.bricks.length).toBeLessThan(5);expect(f.encoded.length).toBe(128*224*8);
 expect(buildSparseWaterField([]).bricks).toEqual([]);
});

import {buildWaterLookup} from '../../src/rendering/water/sparse-field';
function lookup(field:ReturnType<typeof buildWaterLookup>,x:number,y:number,z:number){let h=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))&field.lookupMask;for(let j=0;j<32;j++){const i=h*4;if(!field.lookup[i+3])return -1;if(field.lookup[i]===(x>>>0)&&field.lookup[i+1]===(y>>>0)&&field.lookup[i+2]===(z>>>0))return field.lookup[i+3]-1;h=(h+1)&field.lookupMask;}return -1;}
it('matches unsigned GLSL lookup for negative neighbors, collisions and the full cell budget',()=>{
 const bricks=Array.from({length:8192},(_,i)=>({x:(i%32-16)*3,y:(Math.floor(i/32)%16-8)*3,z:(Math.floor(i/512)-8)*3})),table=buildWaterLookup(bricks);
 bricks.forEach((b,i)=>expect(lookup(table,b.x/3,b.y/3,b.z/3)).toBe(i));expect(lookup(table,999,999,999)).toBe(-1);expect(table.lookup.length*4).toBe(524288);
 // Max8192 eligible aligned cells occupy at most8192 bricks: atlas fits the guaranteed256 dimension.
 expect([16*8,16*14,8*Math.ceil(bricks.length/256)].every(n=>n<=256)).toBe(true);
});
it('quantifies the bounded coarse side-surface bias instead of claiming exact union distance',()=>{
 const cells=[];for(let z=0;z<6;z++)for(let y=0;y<6;y++)for(let x=0;x<6;x++)cells.push({x:x*.5,y:y*.5,z:z*.5,size:.5,volume:.125});const f=buildSparseWaterField(cells),[w,h]=f.dimensions;
 const sample=(x:number)=>{const q=[x/.5+.5,1.5/.25+.5,1.5/.5+.5],low=q.map(Math.floor),frac=q.map((v,i)=>v-low[i]);let total=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let xx=0;xx<2;xx++){const code=f.encoded[low[0]+xx+w*(low[1]+y+h*(low[2]+z))];total+=(code/255*2-1)*1.5*(xx?frac[0]:1-frac[0])*(y?frac[1]:1-frac[1])*(z?frac[2]:1-frac[2]);}return total;};
 let a=2.5,b=3.2;for(let i=0;i<24;i++){const m=(a+b)/2;if(sample(m)<0)a=m;else b=m;}const bias=3-(a+b)/2;expect(bias).toBeGreaterThan(.04);expect(bias).toBeLessThan(.11);
});
