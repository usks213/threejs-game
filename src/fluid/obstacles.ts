import type { Vec3 } from '../world/types';
export interface WaterObstacle extends Vec3 { hx:number; hy:number; hz:number; rotation?:number; q?:{x:number;y:number;z:number;w:number} }
export function obstacleContains(b:WaterObstacle,x:number,y:number,z:number):boolean{
 if(b.q){const m=rotationMatrix(b),dx=x-b.x,dy=y-b.y,dz=z-b.z;return Math.abs(m[0]*dx+m[3]*dy+m[6]*dz)<b.hx&&Math.abs(m[1]*dx+m[4]*dy+m[7]*dz)<b.hy&&Math.abs(m[2]*dx+m[5]*dy+m[8]*dz)<b.hz;}
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
 const occupied=new Map<string,number>(),barriers=new Set<string>(),hullSamples=new Map<string,number>();
 for(const b of obstacles){
  if(b.q){voxelizeQuaternion(b,size,occupied,barriers,hullSamples);continue;}
  const r=Math.hypot(b.hx,b.hz),c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),cs=c*size,ss=s*size;
  // Include the cell just outside each lower face: positive edges can enter a solid from there.
  const minX=Math.floor((b.x-r)/size)*size-size,minZ=Math.floor((b.z-r)/size)*size-size,minY=Math.floor((b.y-b.hy)/size)*size-size;
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


type Rotation=[number,number,number,number,number,number,number,number,number];
function rotationMatrix(b:WaterObstacle):Rotation{
 const q=b.q!,{x,y,z,w}=q;
 if(![b.x,b.y,b.z,b.hx,b.hy,b.hz,x,y,z,w].every(Number.isFinite)||Math.min(b.hx,b.hy,b.hz)<=0||Math.abs(Math.hypot(x,y,z,w)-1)>.001)throw new Error('Invalid oriented water hull');
 return[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];
}
const bitCount=(mask:number)=>{let count=0;while(mask){mask&=mask-1;count++;}return count;};
/** Full-quaternion hulls use the same eight volume probes and exact edge-segment barriers. */
function voxelizeQuaternion(b:WaterObstacle,size:number,occupied:Map<string,number>,barriers:Set<string>,samples:Map<string,number>):void{
 const m=rotationMatrix(b);
 if(!Number.isFinite(size)||size<=0)throw new Error('Invalid water cell size');
 const rx=Math.abs(m[0])*b.hx+Math.abs(m[1])*b.hy+Math.abs(m[2])*b.hz,ry=Math.abs(m[3])*b.hx+Math.abs(m[4])*b.hy+Math.abs(m[5])*b.hz,rz=Math.abs(m[6])*b.hx+Math.abs(m[7])*b.hy+Math.abs(m[8])*b.hz;
 const minX=Math.floor((b.x-rx)/size)-1,maxX=Math.floor((b.x+rx)/size),minY=Math.floor((b.y-ry)/size)-1,maxY=Math.floor((b.y+ry)/size),minZ=Math.floor((b.z-rz)/size)-1,maxZ=Math.floor((b.z+rz)/size);
 // Skybound's individual boxes fit this bound at .5m or 1m resolution. Never silently truncate a hull.
 if((maxX-minX+1)*(maxY-minY+1)*(maxZ-minZ+1)>4096)throw new Error('Oriented water hull exceeds voxel budget');
 for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++)for(let iy=minY;iy<=maxY;iy++){
  const x=ix*size,y=iy*size,z=iz*size,id=`${x},${y},${z}`;let mask=0,bit=1;
  for(let sx=0;sx<2;sx++)for(let sy=0;sy<2;sy++)for(let sz=0;sz<2;sz++){
   const dx=x+(sx===0?.25:.75)*size-b.x,dy=y+(sy===0?.25:.75)*size-b.y,dz=z+(sz===0?.25:.75)*size-b.z;
   if(Math.abs(m[0]*dx+m[3]*dy+m[6]*dz)<b.hx&&Math.abs(m[1]*dx+m[4]*dy+m[7]*dz)<b.hy&&Math.abs(m[2]*dx+m[5]*dy+m[8]*dz)<b.hz)mask|=bit;
   bit<<=1;
  }
  // Overlapping parts occupy the union of probe bits, not summed buoyant volume.
  if(mask){const previous=samples.get(id)??0,next=previous|mask;if(next!==previous){samples.set(id,next);occupied.set(id,Math.min(1,(occupied.get(id)??0)+(bitCount(next)-bitCount(previous))/8));}}
  const dx=x+size/2-b.x,dy=y+size/2-b.y,dz=z+size/2-b.z,ox=m[0]*dx+m[3]*dy+m[6]*dz,oy=m[1]*dx+m[4]*dy+m[7]*dz,oz=m[2]*dx+m[5]*dy+m[8]*dz;
  if(intersects(ox,oy,oz,m[0]*size,m[1]*size,m[2]*size,b)){const to=`${x+size},${y},${z}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
  if(intersects(ox,oy,oz,m[3]*size,m[4]*size,m[5]*size,b)){const to=`${x},${y+size},${z}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
  if(intersects(ox,oy,oz,m[6]*size,m[7]*size,m[8]*size,b)){const to=`${x},${y},${z+size}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
 }
}
