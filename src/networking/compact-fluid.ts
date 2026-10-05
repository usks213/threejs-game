import {MAX_FLUID_CELLS} from '../fluid/fluid';
import {WORLD} from '../world/types';
import type {FluidDelta,FluidTuple} from './fluid-wire';
/** JSON-compatible lossless transport. Volume is always IEEE Float64; other numeric
 * fields use an integer only when reconstructing it gives the identical Number. */
export interface CompactFluidDelta {format:'fluid64-v1';base:number;revision:number;count:number;data:string}
export const MAX_COMPACT_FLUID_BYTES=8+MAX_FLUID_CELLS*(57+6);
export const MAX_COMPACT_FLUID_BASE64=4*Math.ceil(MAX_COMPACT_FLUID_BYTES/3);
const fail=():never=>{throw Error('圧縮水データが不正です');};
const key=(v:readonly number[])=>`${v[0]},${v[1]},${v[2]}`;
const exact=(v:number,scale:number)=>!Object.is(v,-0)&&Object.is(Math.round(v*scale)/scale,v);
function metadata(d:{base:number;revision:number;count:number}):void{if(!Number.isSafeInteger(d.base)||d.base<0||!Number.isSafeInteger(d.revision)||d.revision!==d.base+1||!Number.isInteger(d.count)||d.count<0||d.count>MAX_FLUID_CELLS)fail();}
function coordinate(t:readonly number[]):boolean{return t.length>=3&&Number.isFinite(t[0])&&Number.isFinite(t[1])&&Number.isFinite(t[2])&&Number.isInteger(t[0]*2)&&Number.isInteger(t[1]*2)&&Number.isInteger(t[2]*2)&&t[0]>=WORLD.minX&&t[0]<=WORLD.maxX&&t[1]>=WORLD.minY&&t[1]<=WORLD.maxY&&t[2]>=WORLD.minZ&&t[2]<=WORLD.maxZ;}
function tuple(t:unknown):asserts t is FluidTuple{if(!Array.isArray(t)||t.length!==9||!t.every(Number.isFinite)||!coordinate(t)||![.5,1].includes(t[3])||(!Number.isInteger(t[0]/t[3])||!Number.isInteger(t[1]/t[3])||!Number.isInteger(t[2]/t[3]))||t[4]<=0||t[4]>t[3]**3+1e-8||t[5]<0||t[5]>t[3]||Math.abs(t[6])>12||Math.abs(t[7])>12||![0,1].includes(t[8]))fail();}
function removedCoordinate(id:string):number[]{if(typeof id!=='string'||id.length>64)fail();const xyz=id.split(',').map(Number);if(xyz.length!==3||!coordinate(xyz)||key(xyz)!==id)fail();return xyz;}
function flags(t:FluidTuple):number{return(t[3]===.5?1:0)|(t[8]?2:0)|(!exact(t[5],32768)?4:0)|(!exact(t[6],1000)?8:0)|(!exact(t[7],1000)?16:0)|((!exact(t[0],2)||!exact(t[1],2)||!exact(t[2],2))?32:0);}
function toBase64(bytes:Uint8Array):string{const chunks:string[]=[];for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));return btoa(chunks.join(''));}
function fromBase64(data:string):Uint8Array{if(typeof data!=='string'||data.length<12||data.length>MAX_COMPACT_FLUID_BASE64||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))fail();let text:string;try{text=atob(data);}catch{fail();}if(text!.length>MAX_COMPACT_FLUID_BYTES)fail();const result=new Uint8Array(text!.length);for(let i=0;i<result.length;i++)result[i]=text!.charCodeAt(i);return result;}
export function encodeCompactFluidDelta(d:FluidDelta):CompactFluidDelta{
 metadata(d);if(!Array.isArray(d.changed)||!Array.isArray(d.removed)||d.changed.length>MAX_FLUID_CELLS||d.removed.length>MAX_FLUID_CELLS)fail();
 const seen=new Set<string>(),removed=d.removed.map(id=>{const xyz=removedCoordinate(id);if(seen.has(id))fail();seen.add(id);return xyz;});
 let size=8+removed.length*6;const masks=d.changed.map(t=>{tuple(t);const id=key(t);if(seen.has(id))fail();seen.add(id);const f=flags(t);size+=21+(f&4?6:0)+(f&8?6:0)+(f&16?6:0)+(f&32?18:0);return f;});
 const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);bytes.set([70,87,1,0]);view.setUint16(4,d.changed.length,true);view.setUint16(6,removed.length,true);let at=8;
 const int=(v:number,signed=true)=>{if(signed)view.setInt16(at,v,true);else view.setUint16(at,v,true);at+=2;};const float=(v:number)=>{view.setFloat64(at,v,true);at+=8;};
 for(const xyz of removed)for(const v of xyz)int(v*2);
 d.changed.forEach((t,i)=>{const f=masks[i];view.setUint8(at++,f);for(let j=0;j<3;j++)if(f&32)float(t[j]);else int(t[j]*2);float(t[4]);if(f&4)float(t[5]);else int(t[5]*32768,false);if(f&8)float(t[6]);else int(Math.round(t[6]*1000));if(f&16)float(t[7]);else int(Math.round(t[7]*1000));});
 if(at!==size)fail();return{format:'fluid64-v1',base:d.base,revision:d.revision,count:d.count,data:toBase64(bytes)};
}
/** Structural validation occurs before the stateful FluidWireDecoder, which still
 * owns base-gap, previous-dictionary membership and final count validation. */
export function decodeCompactFluidDelta(raw:unknown):FluidDelta{
 if(!raw||typeof raw!=='object')fail();const d=raw as CompactFluidDelta;if(d.format!=='fluid64-v1')fail();metadata(d);const bytes=fromBase64(d.data);if(bytes.length<8||bytes[0]!==70||bytes[1]!==87||bytes[2]!==1||bytes[3]!==0)fail();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),changedCount=view.getUint16(4,true),removedCount=view.getUint16(6,true);if(changedCount>MAX_FLUID_CELLS||removedCount>MAX_FLUID_CELLS||8+changedCount*21+removedCount*6>bytes.length)fail();let at=8;
 const need=(n:number)=>{if(at+n>bytes.length)fail();};const int=(signed=true)=>{need(2);const v=signed?view.getInt16(at,true):view.getUint16(at,true);at+=2;return v;};const float=()=>{need(8);const v=view.getFloat64(at,true);at+=8;return v;};
 const seen=new Set<string>(),removed:string[]=[],changed:FluidTuple[]=[];
 for(let i=0;i<removedCount;i++){const xyz=[int()/2,int()/2,int()/2];if(!coordinate(xyz))fail();const id=key(xyz);if(seen.has(id))fail();seen.add(id);removed.push(id);}
 for(let i=0;i<changedCount;i++){need(1);const f=view.getUint8(at++);if(f&192)fail();const xyz=f&32?[float(),float(),float()]:[int()/2,int()/2,int()/2];const t:FluidTuple=[xyz[0],xyz[1],xyz[2],f&1?.5:1,float(),f&4?float():int(false)/32768,f&8?float():int()/1000,f&16?float():int()/1000,f&2?1:0];tuple(t);const id=key(t);if(seen.has(id))fail();seen.add(id);changed.push(t);}
 if(at!==bytes.length)fail();return{base:d.base,revision:d.revision,count:d.count,changed,removed};
}
