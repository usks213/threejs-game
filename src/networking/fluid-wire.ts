import type {FluidCell} from '../fluid/fluid';
import {MAX_FLUID_CELLS} from '../fluid/fluid';
import {WORLD} from '../world/types';
/** Exact (unquantized) water cells. Dictionary keys address one visible cell, not world deletion. */
export type FluidTuple=[number,number,number,number,number,number,number,number,0|1];
export interface FluidDelta {base:number;revision:number;count:number;changed:FluidTuple[];removed:string[]}
const key=(t:readonly number[])=>`${t[0]},${t[1]},${t[2]}`;
const tuple=(c:FluidCell):FluidTuple=>[c.x,c.y,c.z,c.size??1,c.volume,c.bottom??0,c.vx??0,c.vz??0,c.frozen?1:0];
function valid(t:unknown):t is FluidTuple{
 if(!Array.isArray(t)||t.length!==9||!t.every(Number.isFinite))return false;
 const[x,y,z,size,volume,bottom,vx,vz,frozen]=t;return[.5,1].includes(size)&&[x,y,z].every(v=>Number.isInteger(v/size))&&x>=WORLD.minX&&x<=WORLD.maxX&&y>=WORLD.minY&&y<=WORLD.maxY&&z>=WORLD.minZ&&z<=WORLD.maxZ&&volume>0&&volume<=size**3+1e-8&&bottom>=0&&bottom<=size&&Math.abs(vx)<=12&&Math.abs(vz)<=12&&(frozen===0||frozen===1);
}
function dictionary(cells:readonly FluidCell[]):Map<string,FluidTuple>{if(cells.length>MAX_FLUID_CELLS)throw Error('水の表示数が上限を超えています');const map=new Map<string,FluidTuple>();for(const c of cells){const t=tuple(c);if(!valid(t)||map.has(key(t)))throw Error('水の基準状態が不正です');map.set(key(t),t);}return map;}
// Half-cell coordinates within WORLD form a collision-free safe integer address.
// Keep strings only at the wire boundary instead of allocating 8,192 keys per peer/frame.
const xStride=(WORLD.maxX-WORLD.minX)*2+1,zStride=(WORLD.maxZ-WORLD.minZ)*2+1;
const address=(x:number,y:number,z:number)=>((y-WORLD.minY)*2*zStride+(z-WORLD.minZ)*2)*xStride+(x-WORLD.minX)*2;
export class FluidWireEncoder{
 private previous=new Map<number,FluidTuple>();private revision=0;
 reset(cells:readonly FluidCell[]):void{this.previous=new Map([...dictionary(cells).values()].map(t=>[address(t[0],t[1],t[2]),t]));this.revision=0;}
 encode(cells:readonly FluidCell[]):FluidDelta{
  if(cells.length>MAX_FLUID_CELLS)throw Error('水の表示数が上限を超えています');const next=new Map<number,FluidTuple>(),changed:FluidTuple[]=[],removed:string[]=[];
  for(const c of cells){const id=address(c.x,c.y,c.z),old=this.previous.get(id);if(next.has(id))throw Error('水の基準状態が不正です');
   if(old&&old[0]===c.x&&old[1]===c.y&&old[2]===c.z&&old[3]===(c.size??1)&&old[4]===c.volume&&old[5]===(c.bottom??0)&&old[6]===(c.vx??0)&&old[7]===(c.vz??0)&&old[8]===(c.frozen?1:0))next.set(id,old);
   else{const value=tuple(c);if(!valid(value))throw Error('水の基準状態が不正です');next.set(id,value);changed.push(value);}
  }
  for(const [id,old] of this.previous)if(!next.has(id))removed.push(key(old));const delta={base:this.revision,revision:this.revision+1,count:next.size,changed,removed};this.previous=next;this.revision++;return delta;
 }
}
export class FluidWireDecoder{
 private previous=new Map<string,FluidTuple>();private revision=0;
 reset(cells:readonly FluidCell[]):void{this.previous=dictionary(cells);this.revision=0;}
 apply(raw:unknown):FluidCell[]{
  if(!raw||typeof raw!=='object')throw Error('水の同期データが不正です');const d=raw as FluidDelta;
  if(d.base!==this.revision||!Number.isSafeInteger(d.revision)||d.revision!==this.revision+1)throw Error('水の差分が連続していません');
  if(!Number.isInteger(d.count)||d.count<0||d.count>MAX_FLUID_CELLS||!Array.isArray(d.changed)||d.changed.length>MAX_FLUID_CELLS||!Array.isArray(d.removed)||d.removed.length>MAX_FLUID_CELLS)throw Error('水の同期上限が不正です');
  const next=new Map(this.previous),seen=new Set<string>();for(const id of d.removed){if(typeof id!=='string'||!next.has(id)||seen.has(id))throw Error('水の削除差分が不正です');seen.add(id);next.delete(id);}
  for(const t of d.changed){if(!valid(t)||seen.has(key(t)))throw Error('水の変更差分が不正です');const id=key(t);seen.add(id);next.set(id,[...t]);}
  if(next.size!==d.count)throw Error('水の同期数が一致しません');this.previous=next;this.revision=d.revision;
  return [...next.values()].map(([x,y,z,size,volume,bottom,vx,vz,frozen])=>({x,y,z,size,volume,bottom,vx,vz,frozen:!!frozen}));
 }
}
