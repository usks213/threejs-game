import {createHash} from 'node:crypto';
import type {FluidCell} from '../src/fluid/fluid';
export function fluidDigest(cells:readonly FluidCell[]):string{
 const tuples=cells.map(c=>[c.x,c.y,c.z,c.size??1,c.volume,c.bottom??0,c.vx??0,c.vz??0,c.frozen?1:0]);
 tuples.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);return createHash('sha256').update(JSON.stringify(tuples)).digest('hex');
}
export function inventoryDigest(items:Record<string,number>):string{return createHash('sha256').update(JSON.stringify(Object.entries(items).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');}
export function distribution(values:readonly number[]){if(!values.length)return {count:0,mean:0,p50:0,p95:0,p99:0,max:0};const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],p99:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.99))],max:sorted.at(-1)!};}
/** Stable full app snapshot comparison: JSON semantics for optional fields, sorted
 * object keys, ordered gameplay arrays, coordinate-sorted water dictionaries. */
export function snapshotDigest(snapshot:unknown):string{
 const serial=JSON.parse(JSON.stringify(snapshot)) as Record<string,unknown>;
 if(Array.isArray(serial.fluids))serial.fluids.sort((a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>a.x-b.x||a.y-b.y||a.z-b.z);
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])):value;
 return createHash('sha256').update(JSON.stringify(canonical(serial))).digest('hex');
}
