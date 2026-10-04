export interface Vec3 { x:number; y:number; z:number }
/** A signed distance sample at the centre of a voxel; negative is solid. */
export interface Cell extends Vec3 { material:number; object?:string; distance:number }
export interface Hit { point:Vec3; normal:Vec3; cell:Cell; distance:number }
export const SOLID_SIZE=.25;
export const WATER_SIZE=.125;
export const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export const chunkKey=(x:number,z:number)=>`${Math.floor(x/16)},${Math.floor(z/16)}`;
export type Sdf=(p:Vec3)=>number;
export const sphere=(c:Vec3,r:number):Sdf=>p=>Math.hypot(p.x-c.x,p.y-c.y,p.z-c.z)-r;
export const ellipsoid=(c:Vec3,r:Vec3):Sdf=>p=>(Math.hypot((p.x-c.x)/r.x,(p.y-c.y)/r.y,(p.z-c.z)/r.z)-1)*Math.min(r.x,r.y,r.z);
export const capsule=(a:Vec3,b:Vec3,r:number):Sdf=>p=>{const x=p.x-a.x,y=p.y-a.y,z=p.z-a.z,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,t=Math.max(0,Math.min(1,(x*dx+y*dy+z*dz)/(dx*dx+dy*dy+dz*dz||1)));return Math.hypot(x-t*dx,y-t*dy,z-t*dz)-r;};
export const roundedBox=(a:Vec3,b:Vec3,r=0):Sdf=>p=>{const x=Math.abs(p.x-(a.x+b.x)/2)-(b.x-a.x)/2+r,y=Math.abs(p.y-(a.y+b.y)/2)-(b.y-a.y)/2+r,z=Math.abs(p.z-(a.z+b.z)/2)-(b.z-a.z)/2+r;return Math.hypot(Math.max(x,0),Math.max(y,0),Math.max(z,0))+Math.min(Math.max(x,y,z),0)-r;};
/** Authoritative sampled SDF. Neither collision nor rendering consults the authoring primitives. */
export class VoxelField {
 readonly cells=new Map<string,Cell>();readonly dirty=new Set<string>();revision=0;
 constructor(readonly size=SOLID_SIZE){}
 sample(x:number,y:number,z:number){return this.cells.get(key(x,y,z))?.distance??this.size*2;}
 get(x:number,y:number,z:number){const c=this.cells.get(key(x,y,z));return c&&c.distance<0?c:undefined;}
 private write(x:number,y:number,z:number,distance:number,material:number,object?:string){
  const id=key(x,y,z),d=Math.max(-this.size*2,Math.min(this.size*2,distance));
  if(d>=this.size*2)this.cells.delete(id);else this.cells.set(id,{x,y,z,distance:d,material,object});
  for(const dx of [-1,0,1])for(const dz of [-1,0,1])this.dirty.add(chunkKey(x+dx,z+dz));
 }
 /** Rasterize a CSG operation into the distance volume, including its exterior narrow band. */
 shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){
  const s=this.size,pad=s*2;
  for(let x=Math.floor((a.x-pad)/s);x<=Math.ceil((b.x+pad)/s);x++)for(let y=Math.floor((a.y-pad)/s);y<=Math.ceil((b.y+pad)/s);y++)for(let z=Math.floor((a.z-pad)/s);z<=Math.ceil((b.z+pad)/s);z++){
   const old=this.cells.get(key(x,y,z)),before=old?.distance??s*2,d=sdf({x:(x+.5)*s,y:(y+.5)*s,z:(z+.5)*s}),after=subtract?Math.max(before,-d):Math.min(before,d);
   if(after!==before)this.write(x,y,z,after,subtract?(old?.material??material):material,subtract?old?.object:object);
  }this.revision++;
 }
 box(a:Vec3,b:Vec3,material:number,object?:string,r=0){this.shape(a,b,roundedBox(a,b,r),material,object,material===0);}
 set(x:number,y:number,z:number,material:number,object?:string){const s=this.size;this.box({x:x*s,y:y*s,z:z*s},{x:(x+1)*s,y:(y+1)*s,z:(z+1)*s},material,object);}
 carve(p:Vec3,r:number){this.shape({x:p.x-r,y:p.y-r,z:p.z-r},{x:p.x+r,y:p.y+r,z:p.z+r},sphere(p,r),0,undefined,true);}
 removeObject(object:string){for(const c of this.cells.values())if(c.object===object)this.write(c.x,c.y,c.z,this.size*2,0);this.revision++;}
 distance(p:Vec3){const s=this.size,q=[p.x/s-.5,p.y/s-.5,p.z/s-.5],base=q.map(Math.floor),t=q.map((v,i)=>v-base[i]),order=[0,1,2].sort((a,b)=>t[b]-t[a]),n=[...base];
  let d=this.sample(n[0],n[1],n[2])*(1-t[order[0]]);n[order[0]]++;
  d+=this.sample(n[0],n[1],n[2])*(t[order[0]]-t[order[1]]);n[order[1]]++;
  d+=this.sample(n[0],n[1],n[2])*(t[order[1]]-t[order[2]]);n[order[2]]++;
  return d+this.sample(n[0],n[1],n[2])*t[order[2]];
 }
 materialAt(p:Vec3){const s=this.size,ix=Math.floor(p.x/s),iy=Math.floor(p.y/s),iz=Math.floor(p.z/s);let best:Cell|undefined,d=Infinity;
  for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++)for(let z=iz-1;z<=iz+1;z++){const c=this.cells.get(key(x,y,z));if(!c||c.material===0)continue;const dd=((x+.5)*s-p.x)**2+((y+.5)*s-p.y)**2+((z+.5)*s-p.z)**2;if(dd<d){d=dd;best=c;}}return best;
 }
 at(p:Vec3){return this.distance(p)<-.0001?this.materialAt(p):undefined;}
 normal(p:Vec3){const h=this.size*.2,dx=this.distance({...p,x:p.x+h})-this.distance({...p,x:p.x-h}),dy=this.distance({...p,y:p.y+h})-this.distance({...p,y:p.y-h}),dz=this.distance({...p,z:p.z+h})-this.distance({...p,z:p.z-h}),n=Math.hypot(dx,dy,dz)||1;return {x:dx/n,y:dy/n,z:dz/n};}
 /** Bounded sphere tracing plus bisection against the same interpolated SDF used by the mesh. */
 ray(origin:Vec3,direction:Vec3,maxDistance:number):Hit|null{
  const l=Math.hypot(direction.x,direction.y,direction.z);if(l<1e-9)return null;const d={x:direction.x/l,y:direction.y/l,z:direction.z/l};let t=0,previous=0;
  while(t<=maxDistance){const p={x:origin.x+d.x*t,y:origin.y+d.y*t,z:origin.z+d.z*t},sdf=this.distance(p);
   if(sdf<=.0002){let lo=previous,hi=t;for(let i=0;i<9;i++){const m=(lo+hi)/2;if(this.distance({x:origin.x+d.x*m,y:origin.y+d.y*m,z:origin.z+d.z*m})>0)lo=m;else hi=m;}const distance=(lo+hi)/2,point={x:origin.x+d.x*distance,y:origin.y+d.y*distance,z:origin.z+d.z*distance},cell=this.materialAt(point);return cell?{point,normal:this.normal(point),cell,distance}:null;}
   previous=t;t+=Math.max(this.size*.02,Math.min(this.size*.45,sdf*.75));
  }return null;
 }
 /** Vertical capsule; bottom is the feet, not a voxel-aligned bounding box. */
 private sphereOverlap(p:Vec3,r:number){if(this.distance(p)>=r-.002)return false;const n=this.normal(p);if(this.distance({x:p.x-n.x*r,y:p.y-n.y*r,z:p.z-n.z*r})<-.002)return true;for(const [x,y,z] of [[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]])if(this.distance({x:p.x+x,y:p.y+y,z:p.z+z})<-.002)return true;return false;}
 overlaps(p:Vec3,radius=.27,height=1.65){for(let y=radius;y<=height-radius+.001;y+=Math.min(.18,height-2*radius))if(this.sphereOverlap({x:p.x,y:p.y+y,z:p.z},radius))return true;return this.sphereOverlap({x:p.x,y:p.y+height-radius,z:p.z},radius);}

}
export const direction=(yaw:number,pitch:number):Vec3=>({x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)});
