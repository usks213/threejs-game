/** Run: node --import tsx scripts/profile-water-meshing.ts. CPU-only, excludes scheduling and GPU. */
import assert from 'node:assert/strict';
import {GameSimulation} from '../src/simulation/game-simulation.ts';
import {waterSurface,WATER_VERTEX_CAPACITY} from '../src/fluid/surface.ts';
import {WaterSurfaceMesher,packWaterCells} from '../src/rendering/water/mesher.ts';
const sim = new GameSimulation(), results=[];
const summary=(a:number[])=>{a.sort((x,y)=>x-y);return {mean:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(4),p95:+a[Math.floor(a.length*.95)].toFixed(4),max:+a[a.length-1].toFixed(4)}};
for (const location of [{name:'starting spawn',x:0,z:8},{name:'river bank',x:-25,z:-10}]) {
  Object.assign(sim.player,{x:location.x,z:location.z,y:sim.groundAt(location.x,location.z),vy:0,grounded:true});
  for(let i=0;i<60;i++)sim.step({x:0,z:0,jump:false});
  const cells=sim.fluid.snapshot(sim.player), positions=new Float32Array(WATER_VERTEX_CAPACITY*3), normals=new Float32Array(positions.length), colors=new Float32Array(positions.length);
  let packed=packWaterCells(cells);const mesher=new WaterSurfaceMesher(), result=mesher.build({type:'mesh',epoch:0,revision:0,cells:packed});
  const originalCount=waterSurface(cells,positions,normals,colors);
  assert.equal(result.count,originalCount);assert.deepEqual(result.positions,positions.slice(0,originalCount*3));assert.deepEqual(result.normals,normals.slice(0,originalCount*3));assert.deepEqual(result.colors,colors.slice(0,originalCount*3));
  const before:number[]=[],packing:number[]=[],apply:number[]=[],after:number[]=[];
  for(let i=0;i<70;i++){
    let t=performance.now();waterSurface(cells,positions,normals,colors);const beforeMs=performance.now()-t;
    t=performance.now();packed=packWaterCells(cells,packed);const packingMs=performance.now()-t;
    t=performance.now();positions.set(result.positions);normals.set(result.normals);colors.set(result.colors);const applyMs=performance.now()-t;
    if(i>=10){before.push(beforeMs);packing.push(packingMs);apply.push(applyMs);after.push(packingMs+applyMs);}
  }
  results.push({location:location.name,cells:cells.length,vertices:result.count,samples:60,exactGeometryMatch:true,beforeSurfaceMainCPUms:summary(before),afterPackingMainCPUms:summary(packing),afterArrayCopyMainCPUms:summary(apply),afterPackingPlusCopyMainCPUms:summary(after),inputBytes:packed.byteLength,outputBytes:result.allocatedBytes,fullOutputCapacityBytes:WATER_VERTEX_CAPACITY*3*4*3});
}
console.log(JSON.stringify({method:'Cloud Node CPU only. Identical actual new-game fluid snapshots, after 60 simulation steps per location. Ten surface/packing/copy warmups then 60 alternating samples. Compares old main-thread waterSurface to new main-thread Float64 input packing plus copies into existing dynamic GPU-attribute arrays. Worker construction/compute/transfer latency, browser GPU upload and real-device FPS are not measured. Exact positions/normals/colors asserted before timing. Worker output meshing still uses unchanged waterSurface.',results},null,2));
