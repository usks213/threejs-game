import { MAX_FLUID_CELLS, type FluidCell } from './fluid';
export const WATER_VERTEX_CAPACITY = MAX_FLUID_CELLS * 36;
interface Column { x: number; z: number; bottom: number; top: number; frozen: boolean }
const key = (x: number,z: number) => x+','+z;
// Merge full vertical neighbors, retain air gaps, and share corner heights within a connected pool.
export function waterSurface(cells: FluidCell[], positions: Float32Array, normals: Float32Array, colors?: Float32Array): number {
 const raw = new Map<string,FluidCell[]>(), columns = new Map<string,Column[]>();
 for (const c of cells) { const id=key(c.x,c.z), list=raw.get(id)??[]; list.push(c); raw.set(id,list); }
 for (const [id,list] of raw) {
  list.sort((a,b)=>a.y-b.y); const merged:Column[]=[];
  for (const c of list) {
   const bottom=c.y+(c.bottom??0), top=Math.min(c.y+1,bottom+c.volume); if(top-bottom<0.0001)continue;
   const last=merged[merged.length-1];
   if(last && bottom<=last.top+0.001 && last.frozen===Boolean(c.frozen)) last.top=Math.max(last.top,top);
   else merged.push({x:c.x,z:c.z,bottom,top,frozen:Boolean(c.frozen)});
  }
  columns.set(id,merged);
 }
 let count=0, ice=false;
 const face=(corners:number[][],nx:number,ny:number,nz:number)=>{
  for(const i of [0,1,2,0,2,3]) { positions.set(corners[i],count*3); normals.set([nx,ny,nz],count*3); colors?.set(ice?[0.7,0.9,1]:[0.14,0.5,0.57],count*3); count++; }
 };
 const neighbor=(c:Column,x:number,z:number)=>columns.get(key(x,z))?.find(n=>Math.abs(n.top-c.top)<0.8 && n.bottom<c.top && c.bottom<n.top && n.frozen===c.frozen);
 const corner=(c:Column,x:number,z:number)=>{
  let sum=0,n=0; for(const dx of [-1,0])for(const dz of [-1,0]){
   const match=neighbor(c,x+dx,z+dz); if(match){sum+=match.top;n++;}
  }
  return Math.max(c.bottom+0.0001,n?sum/n:c.top);
 };
 for(const list of columns.values())for(const c of list){
  ice=c.frozen; const {x,z,bottom}=c, heights=[corner(c,x,z),corner(c,x,z+1),corner(c,x+1,z+1),corner(c,x+1,z)];
  face([[x,heights[0],z],[x,heights[1],z+1],[x+1,heights[2],z+1],[x+1,heights[3],z]],0,1,0);
  if(!neighbor(c,x+1,z)) face([[x+1,bottom,z],[x+1,heights[3],z],[x+1,heights[2],z+1],[x+1,bottom,z+1]],1,0,0);
  if(!neighbor(c,x-1,z)) face([[x,bottom,z+1],[x,heights[1],z+1],[x,heights[0],z],[x,bottom,z]],-1,0,0);
  if(!neighbor(c,x,z+1)) face([[x+1,bottom,z+1],[x+1,heights[2],z+1],[x,heights[1],z+1],[x,bottom,z+1]],0,0,1);
  if(!neighbor(c,x,z-1)) face([[x,bottom,z],[x,heights[0],z],[x+1,heights[3],z],[x+1,bottom,z]],0,0,-1);
  face([[x,bottom,z+1],[x,bottom,z],[x+1,bottom,z],[x+1,bottom,z+1]],0,-1,0);
 }
 return count;
}
