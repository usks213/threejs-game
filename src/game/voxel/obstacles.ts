import type { VoxelModel } from './model';
import type { WaterObstacle } from '../../fluid/obstacles';
/** Merge occupied cells into row slabs; holes remain empty without a collider per cell. */
export function voxelSlabs(model:VoxelModel,removed:readonly string[]=[]):WaterObstacle[]{
 const gone=new Set(removed),rows=new Map<string,number[]>(),result:WaterObstacle[]=[];
 for(const c of model.cells.values()){if(gone.has(c.key)||c.material==='leaves')continue;const key=c.y+','+c.z,list=rows.get(key)??[];list.push(c.x);rows.set(key,list);}
 for(const [key,row]of rows){const [y,z]=key.split(',').map(Number);row.sort((a,b)=>a-b);let first=row[0],last=first;const push=()=>result.push({x:(first+last+1)*model.size/2,y:(y+.5)*model.size,z:(z+.5)*model.size,hx:(last-first+1)*model.size/2,hy:model.size/2,hz:model.size/2});for(const x of row.slice(1)){if(x!==last+1){push();first=x;}last=x;}push();}return result;
}
