import type {VoxelWater} from '../core/water';

/** Browser-sized counterpart of the paper's 8-bit surface-brick SDF atlas.
 * The authoritative finite-volume solver is read-only. Distances are baked to
 * exposed voxel-face rectangles, rather than treating density as a distance.
 * One padded cell makes trilinear interpolation across brick boundaries safe.
 * The small fixed basin uses a dense texture; it is not an open-world octree. */
export class WaterDistanceField {
 readonly nx:number;readonly ny:number;readonly nz:number;
 readonly spacing:{x:number;y:number;z:number};readonly origin:{x:number;y:number;z:number};
 readonly distance:Float32Array;readonly encoded:Uint8Array;readonly range:number;
 readonly bricks:{x:number;y:number;z:number;nx:number;ny:number;nz:number}[]=[];
 private readonly squared:Float32Array;
 faces=0;wetCells=0;
 constructor(readonly water:VoxelWater){
  const s=water.size;this.nx=water.nx+2;this.ny=water.ny*2+2;this.nz=water.nz+2;
  this.spacing={x:s,y:s/2,z:s};this.origin={x:water.origin.x-s/2,y:water.origin.y-s/4,z:water.origin.z-s/2};
  this.range=s*3;this.distance=new Float32Array(this.nx*this.ny*this.nz);this.encoded=new Uint8Array(this.distance.length);this.squared=new Float32Array(this.distance.length);this.rebuild();
 }
 index(x:number,y:number,z:number){return x+this.nx*(y+this.ny*z);}
 private amount(x:number,y:number,z:number){const w=this.water;return x<0||y<0||z<0||x>=w.nx||y>=w.ny||z>=w.nz?0:w.blocked[w.index(x,y,z)]?0:Math.max(0,Math.min(1,w.volume[w.index(x,y,z)]));}
 rebuild(){
  const w=this.water,s=w.size,o=w.origin,r=this.range,sp=this.spacing,p=this.origin;
  this.squared.fill(r*r);this.faces=0;this.wetCells=0;this.bricks.length=0;
  // Only exposed faces seed the narrow band. Internal cell faces are omitted.
  const face=(ax:number,ay:number,az:number,bx:number,by:number,bz:number)=>{
   this.faces++;
   const x0=Math.max(0,Math.ceil((ax-r-p.x)/sp.x)),x1=Math.min(this.nx-1,Math.floor((bx+r-p.x)/sp.x));
   const y0=Math.max(0,Math.ceil((ay-r-p.y)/sp.y)),y1=Math.min(this.ny-1,Math.floor((by+r-p.y)/sp.y));
   const z0=Math.max(0,Math.ceil((az-r-p.z)/sp.z)),z1=Math.min(this.nz-1,Math.floor((bz+r-p.z)/sp.z));
   for(let z=z0;z<=z1;z++){const wz=p.z+z*sp.z,dz=Math.max(az-wz,0,wz-bz);for(let y=y0;y<=y1;y++){const wy=p.y+y*sp.y,dy=Math.max(ay-wy,0,wy-by);for(let x=x0;x<=x1;x++){const wx=p.x+x*sp.x,dx=Math.max(ax-wx,0,wx-bx),i=this.index(x,y,z),d=dx*dx+dy*dy+dz*dz;if(d<this.squared[i])this.squared[i]=d;}}}
  };
  const active=new Uint8Array(Math.ceil(w.nx/6)*Math.ceil(w.ny/6)*Math.ceil(w.nz/6)),bnx=Math.ceil(w.nx/6),bny=Math.ceil(w.ny/6);
  for(let z=0;z<w.nz;z++)for(let y=0;y<w.ny;y++)for(let x=0;x<w.nx;x++){
   const v=this.amount(x,y,z);if(v<=.01)continue;this.wetCells++;active[Math.floor(x/6)+bnx*(Math.floor(y/6)+bny*Math.floor(z/6))]=1;
   const ax=o.x+x*s,ay=o.y+y*s,az=o.z+z*s,bx=ax+s,by=ay+v*s,bz=az+s;
   // A thin isolated layer needs a negative lattice sample. Extend only its
   // render hull downward by half a cell, preserving the top within the interpolation error (under 5mm).
   // Opaque terrain clips this guard; volumes and collision are unchanged.
   const guard=v<.5&&this.amount(x,y-1,z)<=.01?s*.5:0,lower=ay-guard;
   if(v<.999||this.amount(x,y+1,z)<=.01)face(ax,by,az,bx,by,bz);
   if(this.amount(x,y-1,z)<.999)face(ax,lower,az,bx,lower,bz);
   const left=this.amount(x-1,y,z),right=this.amount(x+1,y,z),back=this.amount(x,y,z-1),front=this.amount(x,y,z+1);
   if(left<v)face(ax,(left>.01?ay+left*s:lower),az,ax,by,bz);if(right<v)face(bx,(right>.01?ay+right*s:lower),az,bx,by,bz);
   if(back<v)face(ax,(back>.01?ay+back*s:lower),az,bx,by,az);if(front<v)face(ax,(front>.01?ay+front*s:lower),bz,bx,by,bz);
  }
  for(let z=0;z<this.nz;z++)for(let y=0;y<this.ny;y++)for(let x=0;x<this.nx;x++){
   const wy=p.y+y*sp.y,cy=Math.floor((wy-o.y)/s),v=this.amount(x-1,cy,z-1),upper=this.amount(x-1,cy+1,z-1),inside=(v>.01&&wy<o.y+(cy+v)*s)||(v<=.01&&upper>.01&&upper<.5&&wy>=o.y+(cy+1)*s-s*.5);
   const i=this.index(x,y,z),d=Math.sqrt(this.squared[i])*(inside?-1:1);this.distance[i]=d;this.encoded[i]=Math.round(127.5+127.5*Math.max(-1,Math.min(1,d/r)));
  }
  for(let z=0;z<Math.ceil(w.nz/6);z++)for(let y=0;y<bny;y++)for(let x=0;x<bnx;x++)if(active[x+bnx*(y+bny*z)])this.bricks.push({x:o.x+x*6*s,y:o.y+y*6*s,z:o.z+z*6*s,nx:Math.min(6,w.nx-x*6)*s,ny:Math.min(6,w.ny-y*6)*s,nz:Math.min(6,w.nz-z*6)*s});
 }
 /** CPU reference for tests and bounded ray tracing diagnostics. */
 sample(x:number,y:number,z:number){
  const p=this.origin,s=this.spacing,gx=Math.max(0,Math.min(this.nx-1,(x-p.x)/s.x)),gy=Math.max(0,Math.min(this.ny-1,(y-p.y)/s.y)),gz=Math.max(0,Math.min(this.nz-1,(z-p.z)/s.z));
  const ix=Math.min(this.nx-2,Math.floor(gx)),iy=Math.min(this.ny-2,Math.floor(gy)),iz=Math.min(this.nz-2,Math.floor(gz)),tx=gx-ix,ty=gy-iy,tz=gz-iz;let sum=0;
  for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=this.distance[this.index(ix+dx,iy+dy,iz+dz)]*(dx?tx:1-tx)*(dy?ty:1-ty)*(dz?tz:1-tz);return sum;
 }
}
