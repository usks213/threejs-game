import * as THREE from 'three';
import { chunkKey, type Cell, type VoxelField } from '../core/voxel';
import type { VoxelWater } from '../core/water';
const palette=['#000000','#514638','#68724b','#626570','#65432d','#947350','#a6abb0','#374e35','#687a8e','#ffb25c','#404753','#bbaf90'].map(c=>new THREE.Color(c));
const faces=[
 {n:[1,0,0],v:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]},
 {n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},
 {n:[0,1,0],v:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
 {n:[0,-1,0],v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
 {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},
 {n:[0,0,-1],v:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]},
];
function geometry(position:number[],normal:number[],color:number[]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));if(color.length)g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.computeBoundingSphere();return g;}
export function voxelGeometry(field:VoxelField,cells:Iterable<Cell>=field.cells.values()){
 const positions:number[]=[],normals:number[]=[],colors:number[]=[];
 for(const cell of cells){const {x,y,z}=cell,s=field.size,c=palette[cell.material]??palette[3];const variation=.88+(((x*13+y*7+z*19)%11+11)%11)/70;
  for(const face of faces){const [nx,ny,nz]=face.n;if(field.get(x+nx,y+ny,z+nz))continue;
   for(const index of [0,1,2,0,2,3]){const v=face.v[index];positions.push((x+v[0])*s,(y+v[1])*s,(z+v[2])*s);normals.push(nx,ny,nz);colors.push(c.r*variation,c.g*variation,c.b*variation);}
  }
 }return geometry(positions,normals,colors);
}
export class WorldMeshes {
 readonly material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83,metalness:.06});
 readonly chunks=new Map<string,THREE.Mesh>();
 constructor(readonly field:VoxelField,readonly scene:THREE.Scene){}
 sync(){if(!this.field.dirty.size)return;const dirty=new Set(this.field.dirty),buckets=new Map<string,Cell[]>();
  for(const c of this.field.cells.values()){const id=chunkKey(c.x,c.z);if(dirty.has(id)){let list=buckets.get(id);if(!list)buckets.set(id,list=[]);list.push(c);}}
  for(const id of dirty){const old=this.chunks.get(id);if(old){this.scene.remove(old);old.geometry.dispose();this.chunks.delete(id);}
   const list=buckets.get(id);if(!list)continue;const m=new THREE.Mesh(voxelGeometry(this.field,list),this.material);m.castShadow=true;m.receiveShadow=true;this.chunks.set(id,m);this.scene.add(m);
  }this.field.dirty.clear();
 }
 dispose(){for(const m of this.chunks.values()){this.scene.remove(m);m.geometry.dispose();}this.chunks.clear();this.material.dispose();}
}
export function waterGeometry(w:VoxelWater){
 const p:number[]=[],n:number[]=[],a=w.volume,s=w.size;
 for(let y=0;y<w.ny;y++)for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++){
  const i=w.index(x,y,z),volume=a[i];if(volume<.025||w.blocked[i])continue;
  for(const face of faces){const [dx,dy,dz]=face.n,xx=x+dx,yy=y+dy,zz=z+dz;let adjacent=0;
   if(xx>=0&&yy>=0&&zz>=0&&xx<w.nx&&yy<w.ny&&zz<w.nz){const j=w.index(xx,yy,zz);if(w.blocked[j])continue;adjacent=a[j];}
   if(dy===1&&volume>.99&&adjacent>.025)continue;if(dy===-1&&adjacent>.98)continue;if(dy===0&&adjacent>=volume-.01)continue;
   for(const index of [0,1,2,0,2,3]){const v=face.v[index];const height=dy===0?(v[1]?volume:Math.min(volume,adjacent)):v[1]*volume;p.push(w.origin.x+(x+v[0])*s,w.origin.y+(y+height)*s,w.origin.z+(z+v[2])*s);n.push(dx,dy,dz);}
  }
 }return geometry(p,n,[]);
}
