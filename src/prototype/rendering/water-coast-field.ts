import type {VoxelWater} from '../core/water';
/** Paper-style auxiliary shore data: coast direction X/Z, inverse distance and
 * local contiguous water depth (0..3m). A bounded CPU nearest-coast transform
 * replaces the source's GPU dilation/blur for this 48×48 basin. */
export class WaterCoastField {
 readonly encoded:Uint8Array;readonly depth:Float32Array;readonly heights:Float32Array;
 private readonly seeds:Int32Array;
 constructor(readonly water:VoxelWater){const count=water.nx*water.nz;this.encoded=new Uint8Array(count*4);this.depth=new Float32Array(count);this.heights=new Float32Array(count);this.seeds=new Int32Array(count);this.rebuild();}
 rebuild(){const w=this.water,s=w.size;this.depth.fill(0);this.heights.fill(-Infinity);let seeds=0;
  for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++){const column=x+w.nx*z;let top=-1,bottom=-1,volume=0;for(let y=w.ny-1;y>=0;y--){const i=w.index(x,y,z),v=w.blocked[i]?0:w.volume[i];if(v>.01){if(top<0){top=y;this.heights[column]=w.origin.y+(y+v)*s;}bottom=y;volume+=v;}else if(top>=0)break;}if(bottom>=0)this.depth[column]=Math.min(3,volume*s);}
  const wet=(x:number,z:number)=>x>=0&&z>=0&&x<w.nx&&z<w.nz&&this.depth[x+w.nx*z]>0;
  for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++)if(wet(x,z)&&(!wet(x-1,z)||!wet(x+1,z)||!wet(x,z-1)||!wet(x,z+1)))this.seeds[seeds++]=x+w.nx*z;
  for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++){const i=x+w.nx*z,j=i*4;this.encoded[j]=this.encoded[j+1]=128;this.encoded[j+2]=this.encoded[j+3]=0;if(!wet(x,z))continue;
   let distance=Infinity,dx=0,dz=0;for(let k=0;k<seeds;k++){const seed=this.seeds[k],sx=seed%w.nx,sz=Math.floor(seed/w.nx),xx=sx-x,zz=sz-z,d=xx*xx+zz*zz;if(d<distance){distance=d;dx=xx;dz=zz;}}
   // Boundary cells use the outward dry-neighbour gradient; zero gradients stay
   // neutral, preventing NaNs / arbitrarily oriented waves in symmetric corners.
   if(distance===0){dx=(wet(x+1,z)?0:1)-(wet(x-1,z)?0:1);dz=(wet(x,z+1)?0:1)-(wet(x,z-1)?0:1);}
   const length=Math.hypot(dx,dz);if(length>0){this.encoded[j]=Math.round(127.5+127.5*dx/length);this.encoded[j+1]=Math.round(127.5+127.5*dz/length);}
   this.encoded[j+2]=Math.round(255*Math.max(0,1-Math.sqrt(distance)*s/2));this.encoded[j+3]=Math.round(255*this.depth[i]/3);
  }
 }
}
