import * as THREE from 'three';
import type {VoxelWater} from '../core/water';
import {waterGeometry,waterSurfaceHeights} from './meshes';

/** Schedule only presentation work. The solver, conserved volumes and actual-flow
 * waterwheel keep running even when the fixed basin is outside the camera.
 * Visible flowing water retains its existing >0.3 simulation-second mesh cadence;
 * camera re-entry and terrain edits refresh before the next displayed frame. */
export function createWaterSurfaceView(water:VoxelWater,camera:THREE.PerspectiveCamera,material:THREE.Material,now=()=>performance.now()){
 const heights=waterSurfaceHeights(water),nextHeights=new Float32Array(heights.length);
 const mesh=new THREE.Mesh(waterGeometry(water,heights),material);
 const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),s=water.size;
 // A sample-wide guard also encloses boundary interpolation and empty geometry.
 // Never use the last mesh's bounds: dry/newly filled columns may lie outside it.
 const bounds=new THREE.Box3(new THREE.Vector3(water.origin.x-s,water.origin.y-s,water.origin.z-s),new THREE.Vector3(water.origin.x+(water.nx+1)*s,water.origin.y+(water.ny+1)*s,water.origin.z+(water.nz+1)*s));
 let previousWater=water.revision,previousSolids=water.solids.revision,elapsed=0,wasVisible=false,disposed=false;
 const stats={builds:1,offscreenSkips:0,unchangedSkips:0,lastBuildMs:0,maxBuildMs:0,inView:false};
 return {mesh,get stats(){return {...stats};},
  update(dt:number){
   if(disposed)return;
   if(Number.isFinite(dt)&&dt>0)elapsed=Math.min(.31,elapsed+dt);
   camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
   const visible=mesh.visible&&frustum.intersectsBox(bounds),reentered=visible&&!wasVisible;wasVisible=visible;stats.inView=visible;
   if(!visible){stats.offscreenSkips++;return;}
   const solidsChanged=previousSolids!==water.solids.revision;
   if(!solidsChanged&&!reentered&&(elapsed<=.3||previousWater===water.revision))return;
   waterSurfaceHeights(water,nextHeights);
   const changed=solidsChanged||nextHeights.some((height,i)=>height!==heights[i]);
   if(changed){
    const start=now(),geometry=waterGeometry(water,nextHeights),old=mesh.geometry;
    mesh.geometry=geometry;old.dispose();heights.set(nextHeights);stats.builds++;
    stats.lastBuildMs=Math.max(0,now()-start);stats.maxBuildMs=Math.max(stats.maxBuildMs,stats.lastBuildMs);
   }else stats.unchangedSkips++;
   previousWater=water.revision;previousSolids=water.solids.revision;elapsed=0;
  },
  dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();mesh.geometry.dispose();},
 };
}
