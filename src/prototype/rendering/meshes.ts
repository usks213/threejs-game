import * as THREE from 'three';
import { chunkKey,VoxelField,type Cell } from '../core/voxel';
import { extractSurface } from '../core/surface';
import type { VoxelWater } from '../core/water';
const palette=['#000000','#3b3630','#455044','#64605a','#37281f','#806346','#9ca4aa','#26392e','#475461','#ffb25c','#33343a','#8e8475','#574633','#635448'].map(c=>new THREE.Color(c));
export function voxelGeometry(field:VoxelField,cells:Iterable<Cell>=field.cells.values(),owner?:string){
 const data=extractSurface(field,cells,owner),colors:number[]=[];
 for(let i=0;i<data.materials.length;i++){const c=palette[data.materials[i]]??palette[3],x=data.positions[i*3],y=data.positions[i*3+1],z=data.positions[i*3+2];const variation=.92+.06*Math.sin(x*7.1+y*9.3+z*4.7)*Math.sin(x*2.3-z*3.8);colors.push(c.r*variation,c.g*variation,c.b*variation);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingSphere();return g;
}
export class WorldMeshes {
 readonly material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.04});readonly chunks=new Map<string,THREE.Mesh>();remeshes=0;lastRemeshMs=0;
 constructor(readonly field:VoxelField,readonly scene:THREE.Scene){}
 sync(){if(!this.field.dirty.size)return;const start=performance.now();const dirty=new Set(this.field.dirty),buckets=new Map<string,Cell[]>();
  // Include a one-sample halo. Cube ownership is unique, so neighbouring chunks share exact vertices.
  for(const c of this.field.cells.values()){if(c.distance>=0)continue;const owners=new Set([chunkKey(c.x,c.z),chunkKey(c.x-1,c.z),chunkKey(c.x,c.z-1),chunkKey(c.x-1,c.z-1)]);for(const id of owners){if(!dirty.has(id))continue;let list=buckets.get(id);if(!list)buckets.set(id,list=[]);list.push(c);}}
  for(const id of dirty){const old=this.chunks.get(id);if(old){this.scene.remove(old);old.geometry.dispose();this.chunks.delete(id);}const list=buckets.get(id);if(!list)continue;
   const geometry=voxelGeometry(this.field,list,id);if(!geometry.getAttribute('position').count){geometry.dispose();continue;}const m=new THREE.Mesh(geometry,this.material);m.castShadow=true;m.receiveShadow=true;this.chunks.set(id,m);this.scene.add(m);this.remeshes++;
  }this.field.dirty.clear();this.lastRemeshMs=performance.now()-start;
 }
 dispose(){for(const m of this.chunks.values()){this.scene.remove(m);m.geometry.dispose();}this.chunks.clear();this.material.dispose();}
}
/** Reconstruct the fluid free-surface distance band from conserved 0.125m volume cells. */
export function waterGeometry(w:VoxelWater){
 const f=new VoxelField(w.size),s=w.size,heights=new Float32Array(w.nx*w.nz);heights.fill(-Infinity);
 for(let z=0;z<w.nz;z++)for(let x=0;x<w.nx;x++)for(let y=w.ny-1;y>=0;y--){const i=w.index(x,y,z);if(!w.blocked[i]&&w.volume[i]>.03){heights[x+w.nx*z]=w.origin.y+(y+w.volume[i])*s;break;}}
 // The free surface uses a signed distance to the height and domain boundaries; empty columns stay empty.
 for(let z=-1;z<=w.nz;z++)for(let x=-1;x<=w.nx;x++){const xx=Math.max(0,Math.min(w.nx-1,x)),zz=Math.max(0,Math.min(w.nz-1,z)),h=heights[xx+w.nx*zz];if(!Number.isFinite(h))continue;
  for(let y=-1;y<=Math.ceil((h-w.origin.y)/s)+1;y++){const px=w.origin.x+(x+.5)*s,py=w.origin.y+(y+.5)*s,pz=w.origin.z+(z+.5)*s,d=Math.max(py-h,w.origin.y-py,w.origin.x-px,px-(w.origin.x+w.nx*s),w.origin.z-pz,pz-(w.origin.z+w.nz*s),-w.solids.distance({x:px,y:py,z:pz}));
   if(d<s*2){const ix=Math.round(px/s-.5),iy=Math.round(py/s-.5),iz=Math.round(pz/s-.5);f.cells.set(`${ix},${iy},${iz}`,{x:ix,y:iy,z:iz,distance:d,material:8});}
  }
 }return voxelGeometry(f);
}
