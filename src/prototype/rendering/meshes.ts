import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import { chunkKey,VoxelField,type Cell,type Vec3 } from '../core/voxel';
import { extractSurface } from '../core/surface';
import type { VoxelWater } from '../core/water';
const palette=['#000000','#3b3630','#455044','#64605a','#37281f','#806346','#9ca4aa','#26392e','#475461','#ffb25c','#33343a','#8e8475','#574633','#635448'].map(c=>new THREE.Color(c));
export function voxelGeometry(field:VoxelField,cells:Iterable<Cell>=field.cells.values(),owner?:string){
 const data=extractSurface(field,cells,owner),colors:number[]=[];
 for(let i=0;i<data.materials.length;i++){const c=palette[data.materials[i]]??palette[3],x=data.positions[i*3],y=data.positions[i*3+1],z=data.positions[i*3+2];const variation=.92+.06*Math.sin(x*7.1+y*9.3+z*4.7)*Math.sin(x*2.3-z*3.8);colors.push(c.r*variation,c.g*variation,c.b*variation);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const indexed=mergeVertices(g,.00001);g.dispose();indexed.computeBoundingSphere();return indexed;
}
export class WorldMeshes {
 readonly material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.04});readonly chunks=new Map<string,THREE.Mesh>();remeshes=0;lastRemeshMs=0;
 readonly loadRadius=24;readonly evictionRadius=32;bucketScans=0;lastBuiltChunks=0;
 private cachedRevision=-1;private buckets=new Map<string,Cell[]>();private emptyChunks=new Set<string>();
 constructor(readonly field:VoxelField,readonly scene:THREE.Scene){this.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_COLOR
 totalEmissiveRadiance += vColor.rgb * step(.8,vColor.r) * step(vColor.b,.2) * 1.8;
#endif`);};}
 private distance(id:string,center:Vec3){const [x,z]=id.split(',').map(Number),width=16*this.field.size;return Math.hypot((x+.5)*width-center.x,(z+.5)*width-center.z);}
 private remove(id:string){const mesh=this.chunks.get(id);if(!mesh)return;this.scene.remove(mesh);mesh.geometry.dispose();this.chunks.delete(id);}
 /** Reuse owner buckets across unchanged frames. The one-sample halo is identical to
  * full-world meshing, so streamed neighbours retain exact surface ownership/seams. */
 private refreshBuckets(){
  if(this.cachedRevision===this.field.revision)return;
  this.buckets.clear();this.emptyChunks.clear();this.bucketScans++;
  for(const c of this.field.cells.values()){if(c.distance>=0)continue;
   const owners=new Set([chunkKey(c.x,c.z),chunkKey(c.x-1,c.z),chunkKey(c.x,c.z-1),chunkKey(c.x-1,c.z-1)]);
   for(const id of owners){let list=this.buckets.get(id);if(!list)this.buckets.set(id,list=[]);list.push(c);}
  }
  this.cachedRevision=this.field.revision;
 }
 /** Builds at most budget chunks (default four) nearest the view. Dirty near-player
  * edits outrank new distant chunks. Unloaded dirty flags survive until visited.
  * Geometry beyond 32 m is disposed; 24/32 m hysteresis prevents boundary thrashing.
  * The authoritative collision/SDF world is never altered or unloaded here. */
 sync(center:Vec3={x:0,y:0,z:6},budget=4){
  const start=performance.now();this.lastBuiltChunks=0;
  if(!Number.isFinite(center.x)||!Number.isFinite(center.z)){this.lastRemeshMs=0;return;}
  for(const id of this.chunks.keys())if(this.distance(id,center)>this.evictionRadius)this.remove(id);
  const limit=Number.isFinite(budget)?Math.max(0,Math.min(64,Math.floor(budget))):4;
  if(!limit){this.lastRemeshMs=performance.now()-start;return;}
  this.refreshBuckets();
  // Dirty chunks without solid samples still need their old geometry removed.
  const ids=new Set([...this.buckets.keys(),...this.field.dirty]);
  const pending:[string,number,number][]=[];
  for(const id of ids){const distance=this.distance(id,center);if(distance>this.loadRadius)continue;
   const dirty=this.field.dirty.has(id),existing=this.chunks.has(id);
   if(!dirty&&(existing||this.emptyChunks.has(id)))continue;
   const priority=dirty&&existing&&distance<=8?0:distance<=8?1:dirty&&existing?2:3;
   pending.push([id,distance,priority]);
  }
  pending.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0].localeCompare(b[0]));
  for(const [id] of pending.slice(0,limit)){
   const list=this.buckets.get(id);let geometry:THREE.BufferGeometry|undefined;
   if(list)geometry=voxelGeometry(this.field,list,id);
   this.remove(id);
   if(geometry&&geometry.getAttribute('position').count){const mesh=new THREE.Mesh(geometry,this.material);mesh.castShadow=true;mesh.receiveShadow=true;this.chunks.set(id,mesh);this.scene.add(mesh);this.emptyChunks.delete(id);this.remeshes++;}
   else{geometry?.dispose();this.emptyChunks.add(id);}
   this.field.dirty.delete(id);this.lastBuiltChunks++;
  }
  this.lastRemeshMs=performance.now()-start;
 }
 dispose(){for(const id of this.chunks.keys())this.remove(id);this.buckets.clear();this.emptyChunks.clear();this.cachedRevision=-1;this.material.dispose();}
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
