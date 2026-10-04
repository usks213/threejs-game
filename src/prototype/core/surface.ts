import { chunkKey,key,type Cell,type VoxelField,type Vec3 } from './voxel';
const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
// Six tetrahedra sharing the 000 -> 111 diagonal. VoxelField.distance uses this same partition.
const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
export interface Surface {positions:number[];normals:number[];materials:number[]}
interface Vertex {p:Vec3;n:Vec3;m:number}
/** Iso-surface extraction from sampled voxel distances; no primitive meshes or box faces. */
export function extractSurface(field:VoxelField,samples:Iterable<Cell>=field.cells.values(),owner?:string):Surface{
 const result:Surface={positions:[],normals:[],materials:[]},cubes=new Map<string,Vec3>(),gradients=new Map<string,Vec3>(),s=field.size;
 for(const c of samples){if(c.distance>=0)continue;for(let dx=-1;dx<=0;dx++)for(let dy=-1;dy<=0;dy++)for(let dz=-1;dz<=0;dz++){const x=c.x+dx,y=c.y+dy,z=c.z+dz;if(owner&&chunkKey(x,z)!==owner)continue;cubes.set(key(x,y,z),{x,y,z});}}
 function gradient(x:number,y:number,z:number){const id=key(x,y,z);let n=gradients.get(id);if(!n){const dx=field.sample(x+1,y,z)-field.sample(x-1,y,z),dy=field.sample(x,y+1,z)-field.sample(x,y-1,z),dz=field.sample(x,y,z+1)-field.sample(x,y,z-1),l=Math.hypot(dx,dy,dz)||1;n={x:dx/l,y:dy/l,z:dz/l};gradients.set(id,n);}return n;}
 function triangle(a:Vertex,b:Vertex,c:Vertex){const ab={x:b.p.x-a.p.x,y:b.p.y-a.p.y,z:b.p.z-a.p.z},ac={x:c.p.x-a.p.x,y:c.p.y-a.p.y,z:c.p.z-a.p.z};
  const cross={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};if(cross.x*(a.n.x+b.n.x+c.n.x)+cross.y*(a.n.y+b.n.y+c.n.y)+cross.z*(a.n.z+b.n.z+c.n.z)<0)[b,c]=[c,b];
  for(const v of [a,b,c]){result.positions.push(v.p.x,v.p.y,v.p.z);result.normals.push(v.n.x,v.n.y,v.n.z);result.materials.push(v.m);}
 }
 for(const cube of cubes.values()){
  const nodes=corners.map(([dx,dy,dz])=>({x:cube.x+dx,y:cube.y+dy,z:cube.z+dz})),values=nodes.map(p=>field.sample(p.x,p.y,p.z));if(values.every(v=>v<0)||values.every(v=>v>=0))continue;
  const edge=(a:number,b:number):Vertex=>{const t=values[a]/(values[a]-values[b]),aa=nodes[a],bb=nodes[b],na=gradient(aa.x,aa.y,aa.z),nb=gradient(bb.x,bb.y,bb.z),n={x:na.x+(nb.x-na.x)*t,y:na.y+(nb.y-na.y)*t,z:na.z+(nb.z-na.z)*t},l=Math.hypot(n.x,n.y,n.z)||1,inside=values[a]<0?aa:bb;
   return {p:{x:(aa.x+.5+(bb.x-aa.x)*t)*s,y:(aa.y+.5+(bb.y-aa.y)*t)*s,z:(aa.z+.5+(bb.z-aa.z)*t)*s},n:{x:n.x/l,y:n.y/l,z:n.z/l},m:field.get(inside.x,inside.y,inside.z)?.material??3};};
  for(const tet of tetrahedra){const inside=tet.filter(i=>values[i]<0),outside=tet.filter(i=>values[i]>=0);
   if(inside.length===1)triangle(edge(inside[0],outside[0]),edge(inside[0],outside[1]),edge(inside[0],outside[2]));
   else if(inside.length===3)triangle(edge(outside[0],inside[0]),edge(outside[0],inside[1]),edge(outside[0],inside[2]));
   else if(inside.length===2){const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[1]),d=edge(inside[1],outside[0]);triangle(a,b,c);triangle(a,c,d);}
  }
 }return result;
}
