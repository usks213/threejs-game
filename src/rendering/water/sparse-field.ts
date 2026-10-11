import type {FluidCell} from '../../fluid/fluid';
/** Display-only narrow-band bricks. Authoritative water quantities are never changed. */
export const BRICK_SIZE=3, SX=8, SY=14, SZ=8, ATLAS_COLUMNS=16, ATLAS_ROWS=16;
export const WATER_SDF_RANGE=1.5;
export interface WaterBrick {x:number;y:number;z:number}
export interface SparseWaterField {encoded:Uint8Array;dimensions:[number,number,number];lookup:Uint32Array;lookupWidth:number;lookupMask:number;bricks:WaterBrick[];cells:number;milliseconds:number}
interface Box {x:number;y:number;z:number;xx:number;yy:number;zz:number}
export function waterHeight(cell:FluidCell){const s=cell.size??1;return Math.max(0,Math.min(s-(cell.bottom??0),cell.volume/(s*s)));}
// Sub-texel films and frozen cells retain the existing exact-height mesh path.
export function usesWaterField(cell:FluidCell){const s=cell.size??1;return (s===.5||s===1)&&[cell.x,cell.y,cell.z].every(v=>Number.isInteger(v/s))&&!cell.frozen&&waterHeight(cell)>=.26;}
export function boxSdf(x:number,y:number,z:number,b:Box){const qx=Math.abs(x-(b.x+b.xx)/2)-(b.xx-b.x)/2,qy=Math.abs(y-(b.y+b.yy)/2)-(b.yy-b.y)/2,qz=Math.abs(z-(b.z+b.zz)/2)-(b.zz-b.z)/2;return Math.hypot(Math.max(0,qx),Math.max(0,qy),Math.max(0,qz))+Math.min(0,Math.max(qx,qy,qz));}
export function buildSparseWaterField(cells:readonly FluidCell[]):SparseWaterField {
 const start=performance.now(),boxes:Box[]=[],keys=new Map<string,WaterBrick>(),buckets=new Map<string,Box[]>();
 const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
 for(const c of cells){if(!usesWaterField(c))continue;const s=c.size??1,b={x:c.x,y:c.y+(c.bottom??0),z:c.z,xx:c.x+s,yy:c.y+(c.bottom??0)+waterHeight(c),zz:c.z+s};boxes.push(b);
  for(let z=Math.floor(b.z/3);z<=Math.floor((b.zz-.00001)/3);z++)for(let y=Math.floor(b.y/3);y<=Math.floor((b.yy-.00001)/3);y++)for(let x=Math.floor(b.x/3);x<=Math.floor((b.xx-.00001)/3);x++)keys.set(key(x,y,z),{x:x*3,y:y*3,z:z*3});
  for(let z=Math.floor((b.z-WATER_SDF_RANGE)/3);z<=Math.floor((b.zz+WATER_SDF_RANGE)/3);z++)for(let y=Math.floor((b.y-WATER_SDF_RANGE)/3);y<=Math.floor((b.yy+WATER_SDF_RANGE)/3);y++)for(let x=Math.floor((b.x-WATER_SDF_RANGE)/3);x<=Math.floor((b.xx+WATER_SDF_RANGE)/3);x++){const k=key(x,y,z),list=buckets.get(k)??[];list.push(b);buckets.set(k,list);}
 }
 const bricks=[...keys.values()],dimensions:[number,number,number]=[SX*ATLAS_COLUMNS,SY*ATLAS_ROWS,SZ*Math.max(1,Math.ceil(bricks.length/(ATLAS_COLUMNS*ATLAS_ROWS)))],encoded=new Uint8Array(dimensions[0]*dimensions[1]*dimensions[2]);encoded.fill(255);
 for(let n=0;n<bricks.length;n++){const b=bricks[n],near=buckets.get(key(b.x/3,b.y/3,b.z/3))!,ox=n%ATLAS_COLUMNS*SX,oy=Math.floor(n/ATLAS_COLUMNS)%ATLAS_ROWS*SY,oz=Math.floor(n/(ATLAS_COLUMNS*ATLAS_ROWS))*SZ;
  for(let z=0;z<SZ;z++)for(let y=0;y<SY;y++)for(let x=0;x<SX;x++){const px=b.x+(x-.5)*.5,py=b.y+(y-.5)*.25,pz=b.z+(z-.5)*.5;let squared=WATER_SDF_RANGE*WATER_SDF_RANGE,inside=0;for(const box of near){const dx=Math.max(box.x-px,px-box.xx),dy=Math.max(box.y-py,py-box.yy),dz=Math.max(box.z-pz,pz-box.zz);if(dx<=0&&dy<=0&&dz<=0){inside=Math.min(inside,Math.max(dx,dy,dz));continue;}if(inside<0)continue;const ax=Math.max(0,dx),ay=Math.max(0,dy),az=Math.max(0,dz);squared=Math.min(squared,ax*ax+ay*ay+az*az);}const d=inside<0?inside:Math.sqrt(squared);const at=ox+x+dimensions[0]*(oy+y+dimensions[1]*(oz+z));encoded[at]=Math.round((Math.max(-1,d/WATER_SDF_RANGE)*.5+.5)*255);}
 }
 const {lookup,lookupMask}=buildWaterLookup(bricks);
 return {encoded,dimensions,lookup,lookupWidth:256,lookupMask,bricks,cells:boxes.length,milliseconds:performance.now()-start};
}

export function buildWaterLookup(bricks:readonly WaterBrick[]){
 let tableSize=256;while(tableSize<bricks.length*4)tableSize*=2;
 const lookup=new Uint32Array(tableSize*4),lookupMask=tableSize-1;
 for(let n=0;n<bricks.length;n++){const b=bricks[n],x=b.x/3,y=b.y/3,z=b.z/3;let slot=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))&lookupMask,probes=0;
  while(lookup[slot*4+3]){slot=(slot+1)&lookupMask;if(++probes>=32)throw Error('Sparse water lookup exceeded bounded collision budget');}
  lookup[slot*4]=x>>>0;lookup[slot*4+1]=y>>>0;lookup[slot*4+2]=z>>>0;lookup[slot*4+3]=n+1;
 }
 return {lookup,lookupMask};
}
