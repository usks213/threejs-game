import type { WorldSave } from './format';
import type { EditOperation } from '../world/types';
import type { FluidCell } from '../fluid/fluid';
import type { SphereBody } from '../physics/sphere';
export interface ChunkSave { edits: EditOperation[]; fluids: FluidCell[]; bodies: SphereBody[] }
export interface ChunkBytes { format:'json'|'deflate'; bytes:ArrayBuffer }
export function partitionWorld(save:WorldSave):Map<string,ChunkSave>{
 const chunks=new Map<string,ChunkSave>();
 const chunk=(p:{x:number;y:number;z:number})=>{
  const id=[Math.floor(p.x/16),Math.floor(p.y/16),Math.floor(p.z/16)].join(',');
  let value=chunks.get(id);if(!value){value={edits:[],fluids:[],bodies:[]};chunks.set(id,value);}return value;
 };
 for(const e of save.edits)chunk(e.position).edits.push(e);
 for(const cell of save.fluids)chunk(cell).fluids.push(cell);
 for(const body of save.bodies)chunk(body.position).bodies.push(body);
 return chunks;
}
export async function encodeChunk(text:string):Promise<ChunkBytes>{
 const bytes=new TextEncoder().encode(text);
 if(typeof CompressionStream==='undefined')return {format:'json',bytes:bytes.buffer};
 const stream=new Blob([bytes.buffer]).stream().pipeThrough(new CompressionStream('deflate'));
 const compressed=await new Response(stream).arrayBuffer();
 return compressed.byteLength<bytes.byteLength?{format:'deflate',bytes:compressed}:{format:'json',bytes:bytes.buffer};
}
export async function decodeChunk(value:ChunkBytes):Promise<string>{
 if(value.format==='json')return new TextDecoder().decode(value.bytes);
 if(value.format!=='deflate' || typeof DecompressionStream==='undefined')throw new Error('チャンク圧縮形式に対応していません');
 return new Response(new Blob([value.bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
}
