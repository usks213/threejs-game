import { WATER_SIZE, type Vec3, type VoxelField } from './voxel';
/** Conservative local finite-volume liquid: gravity, lateral equalization, solid exclusion.
 * The fixed basin is a prototype boundary, not an open-world water implementation. */
export class VoxelWater {
 readonly size=WATER_SIZE;
 readonly nx=48;readonly ny=12;readonly nz=48;
 readonly origin:Vec3={x:4,y:-.5,z:-5};
 readonly volume=new Float32Array(this.nx*this.ny*this.nz);
 readonly blocked=new Uint8Array(this.volume.length);
 revision=0;injected=0;phase=0;
 private readonly queue=new Int32Array(this.volume.length);
 private readonly visited=new Uint32Array(this.volume.length);private stamp=0;
 constructor(readonly solids:VoxelField){this.refreshSolids();for(let z=0;z<this.nz;z++)for(let x=0;x<16;x++)for(let y=0;y<4;y++){const i=this.index(x,y,z);if(!this.blocked[i])this.volume[i]=1;}}
 index(x:number,y:number,z:number){return x+this.nx*(z+this.nz*y);}
 refreshSolids(){
  for(let y=0;y<this.ny;y++)for(let z=0;z<this.nz;z++)for(let x=0;x<this.nx;x++){
   const p={x:this.origin.x+(x+.5)*this.size,y:this.origin.y+(y+.5)*this.size,z:this.origin.z+(z+.5)*this.size};this.blocked[this.index(x,y,z)]=this.solids.at(p)?1:0;
  }
 }
 total(){let sum=0;for(const v of this.volume)sum+=v;return sum*this.size**3;}
 add(x:number,y:number,z:number,amount=1){if(x<0||y<0||z<0||x>=this.nx||y>=this.ny||z>=this.nz)return 0;const i=this.index(x,y,z);if(this.blocked[i])return 0;const accepted=Math.max(0,Math.min(1-this.volume[i],amount));this.volume[i]+=accepted;this.injected+=accepted*this.size**3;return accepted;}
 private displace(start:number){
  const stamp=++this.stamp;let head=0,tail=1;this.queue[0]=start;this.visited[start]=stamp;
  while(head<tail&&this.volume[start]>1e-7){const i=this.queue[head++],x=i%this.nx,z=Math.floor(i/this.nx)%this.nz,y=Math.floor(i/(this.nx*this.nz));
   if(i!==start&&!this.blocked[i]){const q=Math.min(this.volume[start],1-this.volume[i]);this.volume[start]-=q;this.volume[i]+=q;}
   for(const [dx,dy,dz] of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]){const xx=x+dx,yy=y+dy,zz=z+dz;if(xx<0||yy<0||zz<0||xx>=this.nx||yy>=this.ny||zz>=this.nz)continue;const j=this.index(xx,yy,zz);if(this.visited[j]!==stamp){this.visited[j]=stamp;this.queue[tail++]=j;}}
  }
 }
 step(){
  const a=this.volume,nx=this.nx,nz=this.nz,layer=nx*nz;
  // Cells embedded by an edit retain their volume and redistribute before normal flow.
  for(let i=0;i<a.length;i++)if(this.blocked[i]&&a[i]>0)this.displace(i);
  for(let y=1;y<this.ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=this.index(x,y,z),j=i-layer;if(this.blocked[i]||this.blocked[j])continue;const q=Math.min(a[i],1-a[j]);a[i]-=q;a[j]+=q;}
  // Alternating sweep removes the permanent directional bias of an in-place solver.
  const reverse=(this.phase++&1)===1;
  for(let y=0;y<this.ny;y++)for(let zz=0;zz<nz;zz++)for(let xx=0;xx<nx;xx++){
   const x=reverse?nx-1-xx:xx,z=reverse?nz-1-zz:zz,i=this.index(x,y,z);if(this.blocked[i])continue;
   for(const [dx,dz] of [[1,0],[0,1]]){if(x+dx>=nx||z+dz>=nz)continue;const j=this.index(x+dx,y,z+dz);if(this.blocked[j])continue;
    let q=(a[i]-a[j])*.22;
    // Lateral spreading needs support below both cells (falling water first settles).
    if(y>0&&((!this.blocked[i-layer]&&a[i-layer]<.98)||(!this.blocked[j-layer]&&a[j-layer]<.98)))continue;
    q=Math.max(-a[j],Math.min(a[i],q));a[i]-=q;a[j]+=q;
   }
  }this.revision++;
 }
 surface(x:number,z:number){const ix=Math.floor((x-this.origin.x)/this.size),iz=Math.floor((z-this.origin.z)/this.size);if(ix<0||iz<0||ix>=this.nx||iz>=this.nz)return -Infinity;
  for(let y=this.ny-1;y>=0;y--){const i=this.index(ix,y,iz);if(!this.blocked[i]&&this.volume[i]>.02)return this.origin.y+(y+this.volume[i])*this.size;}return -Infinity;
 }
}
