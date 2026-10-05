import {expect,it} from 'vitest';
import {buildingVoxels,worldPoint} from '../../src/game/voxel/model';
import {voxelSlabs} from '../../src/game/voxel/obstacles';
import {voxelizeObstacles,type WaterObstacle} from '../../src/fluid/obstacles';
it('coalesces solid foundations and walls while preserving every carved voxel',()=>{
 for(const id of ['foundation','wall','floor'])expect(voxelSlabs(buildingVoxels(id))).toHaveLength(1);
 for(const id of ['foundation','wall','roof','chest','stairs']){const model=buildingVoxels(id),removed=[...model.cells.keys()].filter((_,i)=>i%23===0),boxes=voxelSlabs(model,removed),gone=new Set(removed);for(const cell of model.cells.values()){const p={x:(cell.x+.5)*model.size,y:(cell.y+.5)*model.size,z:(cell.z+.5)*model.size};expect(boxes.some(b=>Math.abs(p.x-b.x)<b.hx&&Math.abs(p.y-b.y)<b.hy&&Math.abs(p.z-b.z)<b.hz)).toBe(!gone.has(cell.key));}}
});
it('preserves fractional fluid occupancy and thin-wall barriers at rotated poses and carved holes',()=>{
 for(const id of ['foundation','wall','roof','chest'])for(const rotation of [0,Math.PI/3]){const model=buildingVoxels(id),removed=[...model.cells.keys()].filter((_,i)=>i%29===0),gone=new Set(removed),pose={x:2.13,y:1.17,z:-3.22};const rows=new Map<string,number[]>();for(const c of model.cells.values()){if(gone.has(c.key))continue;const key=c.y+','+c.z,row=rows.get(key)??[];row.push(c.x);rows.set(key,row);}const old:WaterObstacle[]=[];for(const [key,row]of rows){const[y,z]=key.split(',').map(Number);row.sort((a,b)=>a-b);let first=row[0],last=first;const push=()=>old.push({x:(first+last+1)*model.size/2,y:(y+.5)*model.size,z:(z+.5)*model.size,hx:(last-first+1)*model.size/2,hy:model.size/2,hz:model.size/2});for(const x of row.slice(1)){if(x!==last+1){push();first=x;}last=x;}push();}const transformed=(boxes:WaterObstacle[])=>boxes.map(b=>({...b,...worldPoint(b,pose,rotation),rotation}));const before=voxelizeObstacles(transformed(old),.5),after=voxelizeObstacles(transformed(voxelSlabs(model,removed)),.5);expect([...after.occupied].sort()).toEqual([...before.occupied].sort());expect([...after.barriers].sort()).toEqual([...before.barriers].sort());}
});

it('blocks water edges entering a solid from just outside its lower face',()=>{const mask=voxelizeObstacles([{x:.25,y:.65,z:.25,hx:.2,hy:.15,hz:.2}],.5);expect(mask.barriers.has('0,0,0/0,0.5,0')).toBe(true);expect(mask.barriers.has('0,0.5,0/0,0,0')).toBe(true);});
