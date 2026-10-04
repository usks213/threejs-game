import type { Vec3 } from '../world/types';
export interface WaterObstacle extends Vec3 { hx:number; hy:number; hz:number; rotation?:number }
export function obstacleContains(b:WaterObstacle,x:number,y:number,z:number):boolean{
 const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),dx=x-b.x,dz=z-b.z;
 return Math.abs(dx*c-dz*s)<b.hx&&Math.abs(y-b.y)<b.hy&&Math.abs(dx*s+dz*c)<b.hz;
}

// The same slab test as the array-based loop, with no per-edge vectors or trig calls.
function intersects(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,b:WaterObstacle):boolean {
 let low=0,high=1;
 if(Math.abs(dx)<1e-8){if(Math.abs(ox)>=b.hx)return false;}
 else {const a=(-b.hx-ox)/dx,d=(b.hx-ox)/dx;low=Math.max(low,Math.min(a,d));high=Math.min(high,Math.max(a,d));}
 if(Math.abs(dy)<1e-8){if(Math.abs(oy)>=b.hy)return false;}
 else {const a=(-b.hy-oy)/dy,d=(b.hy-oy)/dy;low=Math.max(low,Math.min(a,d));high=Math.min(high,Math.max(a,d));}
 if(Math.abs(dz)<1e-8){if(Math.abs(oz)>=b.hz)return false;}
 else {const a=(-b.hz-oz)/dz,d=(b.hz-oz)/dz;low=Math.max(low,Math.min(a,d));high=Math.min(high,Math.max(a,d));}
 return low<high&&high>0&&low<1;
}

/** Voxel occupancy is fractional; edge barriers retain thin wall continuity. */
export function voxelizeObstacles(obstacles:readonly WaterObstacle[],size=1){
 const occupied=new Map<string,number>(),barriers=new Set<string>();
 for(const b of obstacles){
  const r=Math.hypot(b.hx,b.hz),c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),cs=c*size,ss=s*size;
  const minX=Math.floor((b.x-r)/size)*size,minZ=Math.floor((b.z-r)/size)*size,minY=Math.floor((b.y-b.hy)/size)*size;
  for(let x=minX;x<=b.x+r;x+=size)for(let z=minZ;z<=b.z+r;z+=size){
   // Occupancy's four horizontal samples are identical at every height in this column.
   let horizontal=0;
   for(let ix=0;ix<2;ix++)for(let iz=0;iz<2;iz++){
    const ox=x+(ix===0?.25:.75)*size-b.x,oz=z+(iz===0?.25:.75)*size-b.z;
    if(Math.abs(ox*c-oz*s)<b.hx&&Math.abs(ox*s+oz*c)<b.hz)horizontal++;
   }
   const ox=x+size/2-b.x,oz=z+size/2-b.z,localX=ox*c-oz*s,localZ=ox*s+oz*c;
   for(let y=minY;y<=b.y+b.hy;y+=size){
    const count=horizontal*(Number(Math.abs(y+.25*size-b.y)<b.hy)+Number(Math.abs(y+.75*size-b.y)<b.hy));
    const id=`${x},${y},${z}`;if(count)occupied.set(id,Math.min(1,(occupied.get(id)??0)+count/8));
    const localY=y+size/2-b.y;
    // Include all edges, even when a sub-voxel wall contains no volume samples.
    if(intersects(localX,localY,localZ,cs,0,ss,b)){const to=`${x+size},${y},${z}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
    if(intersects(localX,localY,localZ,0,size,0,b)){const to=`${x},${y+size},${z}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
    if(intersects(localX,localY,localZ,-ss,0,cs,b)){const to=`${x},${y},${z+size}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
   }
  }
 }
 return {occupied,barriers};
}
