export interface Vec3 { x:number; y:number; z:number }
export interface Cell extends Vec3 { material:number; object?:string }
export interface Hit { point:Vec3; normal:Vec3; cell:Cell; distance:number }
export const SOLID_SIZE=.25;
export const WATER_SIZE=.125; // Existing water used 1m cells: one eighth of the linear spacing.
export const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export const chunkKey=(x:number,z:number)=>`${Math.floor(x/16)},${Math.floor(z/16)}`;
/** Authoritative occupied volume, shared by rendering, collision and interaction. */
export class VoxelField {
 readonly cells=new Map<string,Cell>();
 readonly dirty=new Set<string>();
 constructor(readonly size=SOLID_SIZE){}
 get(x:number,y:number,z:number){return this.cells.get(key(x,y,z));}
 at(p:Vec3){return this.get(Math.floor(p.x/this.size),Math.floor(p.y/this.size),Math.floor(p.z/this.size));}
 set(x:number,y:number,z:number,material:number,object?:string){
  const id=key(x,y,z); if(material)this.cells.set(id,{x,y,z,material,object});else this.cells.delete(id);
  this.dirty.add(chunkKey(x,z));for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])this.dirty.add(chunkKey(x+dx,z+dz));
 }
 box(a:Vec3,b:Vec3,material:number,object?:string){
  for(let x=Math.floor(a.x/this.size);x<Math.ceil(b.x/this.size);x++)for(let y=Math.floor(a.y/this.size);y<Math.ceil(b.y/this.size);y++)for(let z=Math.floor(a.z/this.size);z<Math.ceil(b.z/this.size);z++)this.set(x,y,z,material,object);
 }
 removeObject(object:string){for(const c of this.cells.values())if(c.object===object)this.set(c.x,c.y,c.z,0);}
 /** Grid DDA: the first occupied cell blocks a target behind it. */
 ray(origin:Vec3,direction:Vec3,maxDistance:number):Hit|null {
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-9)return null;
  const d={x:direction.x/length,y:direction.y/length,z:direction.z/length},s=this.size;
  let x=Math.floor(origin.x/s),y=Math.floor(origin.y/s),z=Math.floor(origin.z/s),distance=0;
  const step={x:Math.sign(d.x),y:Math.sign(d.y),z:Math.sign(d.z)};
  const delta={x:d.x?Math.abs(s/d.x):Infinity,y:d.y?Math.abs(s/d.y):Infinity,z:d.z?Math.abs(s/d.z):Infinity};
  const next={x:d.x?((x+(d.x>0?1:0))*s-origin.x)/d.x:Infinity,y:d.y?((y+(d.y>0?1:0))*s-origin.y)/d.y:Infinity,z:d.z?((z+(d.z>0?1:0))*s-origin.z)/d.z:Infinity};
  let normal:Vec3={x:0,y:0,z:0};
  while(distance<=maxDistance){const cell=this.get(x,y,z);if(cell)return {cell,distance,normal,point:{x:origin.x+d.x*distance,y:origin.y+d.y*distance,z:origin.z+d.z*distance}};
   if(next.x<=next.y&&next.x<=next.z){distance=next.x;next.x+=delta.x;x+=step.x;normal={x:-step.x,y:0,z:0};}
   else if(next.y<=next.z){distance=next.y;next.y+=delta.y;y+=step.y;normal={x:0,y:-step.y,z:0};}
   else {distance=next.z;next.z+=delta.z;z+=step.z;normal={x:0,y:0,z:-step.z};}
  }return null;
 }
 /** Body collision queries the same occupied cells, including ceilings and objects. */
 overlaps(p:Vec3,radius=.27,height=1.65){
  const s=this.size;
  for(let x=Math.floor((p.x-radius)/s);x<=Math.floor((p.x+radius)/s);x++)for(let y=Math.floor((p.y+.015)/s);y<=Math.floor((p.y+height-.015)/s);y++)for(let z=Math.floor((p.z-radius)/s);z<=Math.floor((p.z+radius)/s);z++)if(this.get(x,y,z))return true;
  return false;
 }
}
export const direction=(yaw:number,pitch:number):Vec3=>({x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)});
