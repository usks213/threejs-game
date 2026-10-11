import type { VoxelModel } from './model';
import type { WaterObstacle } from '../../fluid/obstacles';
/** Merge exact occupied runs across all three axes; holes remain empty. */
export function voxelSlabs(model:VoxelModel,removed:readonly string[]=[]):WaterObstacle[]{
 const gone=new Set(removed),rows=new Map<string,number[]>(),result:WaterObstacle[]=[];
 for(const c of model.cells.values()){if(gone.has(c.key)||c.material==='leaves')continue;const key=c.y+','+c.z,list=rows.get(key)??[];list.push(c.x);rows.set(key,list);}
 for(const [key,row]of rows){const [y,z]=key.split(',').map(Number);row.sort((a,b)=>a-b);let first=row[0],last=first;const push=()=>result.push({x:(first+last+1)*model.size/2,y:(y+.5)*model.size,z:(z+.5)*model.size,hx:(last-first+1)*model.size/2,hy:model.size/2,hz:model.size/2});for(const x of row.slice(1)){if(x!==last+1){push();first=x;}last=x;}push();}return merge(merge(result,'z','hz',['x','hx','y','hy']),'y','hy',['x','hx','z','hz']);
}

function merge(boxes:WaterObstacle[],axis:'y'|'z',half:'hy'|'hz',keys:('x'|'y'|'z'|'hx'|'hy'|'hz')[]):WaterObstacle[]{
 const groups=new Map<string,WaterObstacle[]>(),result:WaterObstacle[]=[];for(const box of boxes){const key=keys.map(k=>box[k]).join(','),group=groups.get(key)??[];group.push(box);groups.set(key,group);}
 for(const group of groups.values()){group.sort((a,b)=>a[axis]-b[axis]);let previous={...group[0]};for(const box of group.slice(1)){if(Math.abs(previous[axis]+previous[half]-(box[axis]-box[half]))<1e-9){const low=previous[axis]-previous[half],high=box[axis]+box[half];previous[axis]=(low+high)/2;previous[half]=(high-low)/2;}else{result.push(previous);previous={...box};}}result.push(previous);}return result;
}
