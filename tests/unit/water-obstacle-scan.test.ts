import {expect,it} from 'vitest';
import {voxelizeObstacles as actual,type WaterObstacle} from '../../src/fluid/obstacles';
import {voxelizeObstacles as legacy} from '../helpers/legacy-water-obstacles';
import {buildingVoxels,worldPoint} from '../../src/game/voxel/model';
import {voxelSlabs} from '../../src/game/voxel/obstacles';
import {yawQuaternion} from '../../src/game/skybound/orientation';
const box:WaterObstacle={x:-.25,y:.65,z:.25,hx:2.5,hy:.15,hz:.015};
function same(boxes:WaterObstacle[],size=.5){
 const before=legacy(boxes,size),after=actual(boxes,size);
 expect([...after.occupied]).toEqual([...before.occupied]);expect([...after.barriers]).toEqual([...before.barriers]);
 return after;
}
it('preserves ordered yaw occupancy and incoming edge barriers at grid/probe boundaries',()=>{
 for(const size of [.5,1])for(const rotation of [0,Math.PI/2,-Math.PI/2,Math.PI/4,Math.PI/3])for(const x of [-1,-.375,-.25,0,.125,.25,.5])for(const shift of [-Number.EPSILON,0,Number.EPSILON])same([{...box,x:x+shift,z:-x,rotation}],size);
 const thin=same([{x:.25,y:.25,z:.25,hx:.01,hy:.01,hz:.1}]);
 expect(thin.occupied.size).toBe(0);expect(thin.barriers.size).toBeGreaterThan(0);
 const lower=same([{x:.25,y:.65,z:.25,hx:.2,hy:.15,hz:.2}]);expect(lower.barriers.has('0,0,0/0,0.5,0')).toBe(true);
});
it('keeps overlap fractions/order and full-quaternion mixtures exactly unchanged',()=>{
 const a={...box,rotation:.4},b={...box,x:box.x+.13,rotation:-.6},q={...box,hx:.6,hy:.25,hz:.9,q:yawQuaternion(.4)};
 for(const list of [[a,b],[b,a],[a,a,b],[a,q,b],[q,b,a]])same(list);
});
it('retains original decimal-grid and nonpositive or unsafe-index scan behavior',()=>{
 same([{x:.24707561451941729,y:.3,z:.009393878746777773,hx:.125,hy:.05,hz:.015,rotation:5.454470777884126}],.1);
 for(const hx of [0,-.1])same([{...box,hx}]);same([{...box,hy:0}]);same([{...box,rotation:NaN}]);
 same([{x:2**51,y:.5,z:0,hx:.125,hy:.125,hz:.015}],.5);
 same([{x:2**52,y:.5,z:0,hx:.125,hy:.125,hz:.015}],1);
});
it('preserves rebuilt geometry after edits, moves, deletion and restoring the original list',()=>{
 const model=buildingVoxels('wall'),removed=[...model.cells.keys()].filter((_,i)=>i%23===0),pose={x:-3.13,y:1.17,z:2.22};
 const transform=(gone:string[],rotation:number,x=pose.x)=>voxelSlabs(model,gone).map(s=>({...s,...worldPoint(s,{...pose,x},rotation),rotation}));
 const original=transform([],Math.PI/3),saved=JSON.stringify(original);
 const before=same(original);same(transform(removed,Math.PI/3));same(transform(removed,-Math.PI/4,pose.x+.125));same([]);
 const restored=same(JSON.parse(saved) as WaterObstacle[]);expect([...restored.occupied]).toEqual([...before.occupied]);expect([...restored.barriers]).toEqual([...before.barriers]);
});
