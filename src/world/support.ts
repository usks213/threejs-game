import type {SdfWorld} from './density';
import type {Vec3} from './types';
const key=(x:number,y:number,z:number)=>x+','+y+','+z;
// Bounded flood fill: components touching the search boundary remain attached.
// Natural floating islands have explicit seed anchors; only severed fragments fall.
export function detachedVoxels(world:SdfWorld,center:Vec3,radius=5):Vec3[][]{
 const cx=Math.floor(center.x),cy=Math.floor(center.y),cz=Math.floor(center.z),solid=new Map<string,Vec3>();
 for(let x=cx-radius;x<=cx+radius;x++)for(let y=Math.max(world.bounds.minY+1,cy-radius);y<=Math.min(world.bounds.maxY-1,cy+radius);y++)for(let z=cz-radius;z<=cz+radius;z++){
  const p={x:x+0.5,y:y+0.5,z:z+0.5};if(world.density(p)<-0.1)solid.set(key(x,y,z),p);
 }
 const detached:Vec3[][]=[];
 for(const [start,point] of solid){
  if(!solid.has(start))continue;
  const queue=[point],component:Vec3[]=[];solid.delete(start);let supported=false;
  for(let index=0;index<queue.length;index++){
   const p=queue[index],x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);component.push(p);
   if(Math.abs(x-cx)===radius || Math.abs(y-cy)===radius || Math.abs(z-cz)===radius || world.isAnchor(p))supported=true;
   for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
    const id=key(x+dx,y+dy,z+dz),n=solid.get(id);if(n){solid.delete(id);queue.push(n);}
   }
  }
  if(!supported && component.length<=96)detached.push(component);
 }
 return detached;
}
