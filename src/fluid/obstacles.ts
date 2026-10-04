import type { Vec3 } from '../world/types';
export interface WaterObstacle extends Vec3 { hx:number; hy:number; hz:number; rotation?:number }
export function obstacleContains(b:WaterObstacle,x:number,y:number,z:number):boolean{
 const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),dx=x-b.x,dz=z-b.z;
 return Math.abs(dx*c-dz*s)<b.hx&&Math.abs(y-b.y)<b.hy&&Math.abs(dx*s+dz*c)<b.hz;
}
/** Voxel occupancy is fractional; edge barriers retain thin wall continuity. */
export function voxelizeObstacles(obstacles:readonly WaterObstacle[],size=1){
 const occupied=new Map<string,number>(),barriers=new Set<string>();
 for(const b of obstacles){const r=Math.hypot(b.hx,b.hz);
  for(let x=Math.floor((b.x-r)/size)*size;x<=b.x+r;x+=size)for(let z=Math.floor((b.z-r)/size)*size;z<=b.z+r;z+=size)for(let y=Math.floor((b.y-b.hy)/size)*size;y<=b.y+b.hy;y+=size){
   let count=0;for(const dx of [.25,.75])for(const dy of [.25,.75])for(const dz of [.25,.75])if(obstacleContains(b,x+dx*size,y+dy*size,z+dz*size))count++;
   const id=`${x},${y},${z}`;if(count)occupied.set(id,Math.min(1,(occupied.get(id)??0)+count/8));
   for(const [dx,dy,dz]of [[1,0,0],[0,1,0],[0,0,1]]){
    // Slab intersection in local coordinates, including walls thinner than a voxel.
    const c=Math.cos(b.rotation??0),s=Math.sin(b.rotation??0),ox=x+size/2-b.x,oz=z+size/2-b.z;
    const origin=[ox*c-oz*s,y+size/2-b.y,ox*s+oz*c],direction=[(dx*c-dz*s)*size,dy*size,(dx*s+dz*c)*size],half=[b.hx,b.hy,b.hz];let low=0,high=1;
    for(let i=0;i<3;i++){if(Math.abs(direction[i])<1e-8){if(Math.abs(origin[i])>=half[i]){high=-1;break;}}else{const a=(-half[i]-origin[i])/direction[i],d=(half[i]-origin[i])/direction[i];low=Math.max(low,Math.min(a,d));high=Math.min(high,Math.max(a,d));}}
    if(low<high&&high>0&&low<1){const to=`${x+dx*size},${y+dy*size},${z+dz*size}`;barriers.add(`${id}/${to}`);barriers.add(`${to}/${id}`);}
   }
  }
 }
 return {occupied,barriers};
}
