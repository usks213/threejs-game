import type {Vec3,Brick,MeshData} from './types';
import type {SdfWorld} from './density';
export interface FieldData {id:string;origin:Vec3;step:number;size:number;density:Float32Array}
/** Sample the authoritative implicit field; no surface vertices or triangle indices are generated. */
export function sampleFieldBrick(world:SdfWorld,brick:Brick):MeshData{
 const size=17,step=.5,density=new Float32Array(size**3),start=performance.now();
 for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)density[x+size*(y+size*z)]=world.density({x:brick.origin.x+x*step,y:brick.origin.y+y*step,z:brick.origin.z+z*step});
 return {id:brick.id,positions:new Float32Array(),normals:new Float32Array(),colors:new Float32Array(),indices:new Uint32Array(),milliseconds:performance.now()-start,field:{id:brick.id,origin:{...brick.origin},step,size,density}};
}
