import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import { chunkKey,VoxelField,type Cell,type Vec3 } from '../core/voxel';
import { extractSurface } from '../core/surface';
import type { VoxelWater } from '../core/water';
import {REGIONS} from '../core/regions';
import {ProviderResidency,isProviderResidentField} from './provider-residency';
/** Original material colours, authored in sRGB then converted by Three to linear.
 * These are render properties only: harvest IDs and sampled SDF values stay intact. */
const palette=['#000000','#806447','#76563b','#98958a','#895b36','#b28653','#bdc7cd','#527938','#798b83','#ffae55','#b29a77','#9b8e78','#715035','#85724f'].map(c=>new THREE.Color(c));
const roughness=[1,.98,.98,.86,.84,.73,.28,.94,.72,.62,.97,.88,.85,.9];
const metalness=[0,0,0,.02,0,0,.82,0,.06,0,0,0,0,0];
const grass=new THREE.Color('#647d3a');
const biomeColors={temperate:new THREE.Color('#738045'),woodland:new THREE.Color('#446339'),wetland:new THREE.Color('#537b53'),arid:new THREE.Color('#b88056'),ash:new THREE.Color('#91837b'),freezing:new THREE.Color('#d8e3e4'),lake:new THREE.Color('#7d998d')};
export interface VoxelAppearance {color:THREE.Color;roughness:number;metalness:number;emission:number}
const newAppearance=():VoxelAppearance=>({color:new THREE.Color(),roughness:1,metalness:0,emission:0});
/** Constant bounded work per vertex; no textures, random samples or GPU noise. The
 * caller can reuse `out` to avoid allocating an object for every extracted vertex. */
export function voxelAppearance(material:number,x:number,y:number,z:number,normalY:number,out:VoxelAppearance=newAppearance()):VoxelAppearance {
 const id=Number.isInteger(material)&&material>=0&&material<palette.length?material:3,c=out.color.copy(palette[id]),top=THREE.MathUtils.smoothstep(normalY,.45,.9);
 out.roughness=roughness[id];out.metalness=metalness[id];out.emission=material===9?1.8:0;
 if(material===1||material===2)c.lerp(grass,top*.62);
 if(material===1||material===2||material===3){for(const region of REGIONS){const b=region.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;const edge=Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z),border=THREE.MathUtils.smoothstep(edge,0,1.4),height=THREE.MathUtils.clamp((region.groundY+1.6-y)/1.6,0,1),amount=border*height;
   if(region.climate==='freezing'){c.lerp(biomeColors.freezing,amount*top*.88);out.roughness=THREE.MathUtils.lerp(out.roughness,.76,amount*top);}
   else if(region.climate==='arid'||region.climate==='ash')c.lerp(biomeColors[region.climate],amount*(material===3?.56:.8));
   else if(material!==3)c.lerp(biomeColors[region.climate],amount*top*.4);
   break;
  }}
 // Gentle low-frequency mottling preserves broad material readability. No grain
 // or high-frequency pattern that shimmers at the performance preset's resolution.
 const variation=.96+.035*Math.sin(x*1.7+y*.8)*Math.sin(z*1.5-x*.35);c.multiplyScalar(variation);return out;
}
export function voxelGeometry(field:VoxelField,cells:Iterable<Cell>=field.cells.values(),owner?:string){
 const data=extractSurface(field,cells,owner),colors:number[]=[],surface:number[]=[],appearance=newAppearance(),materialCounts:Record<number,number>={};
 for(let i=0;i<data.materials.length;i++){const id=data.materials[i];voxelAppearance(id,data.positions[i*3],data.positions[i*3+1],data.positions[i*3+2],data.normals[i*3+1],appearance);colors.push(appearance.color.r,appearance.color.g,appearance.color.b);surface.push(appearance.roughness,appearance.metalness,appearance.emission);materialCounts[id]=(materialCounts[id]??0)+1;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('voxelSurface',new THREE.Float32BufferAttribute(surface,3));const indexed=mergeVertices(g,.00001);g.dispose();indexed.userData.sourceMaterialCounts=materialCounts;indexed.computeBoundingSphere();return indexed;
}
/** Augment the installed standard shader in-place, retaining its lighting model,
 * vertex colour handling, and the existing torch-emission contribution. */
export function configureVoxelMaterial(material:THREE.MeshStandardMaterial){material.customProgramCacheKey=()=> 'ash-voxel-pbr-v2';material.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 voxelSurface;\nvarying vec3 vVoxelSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvVoxelSurface = voxelSurface;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vVoxelSurface;').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = clamp(vVoxelSurface.x, 0.04, 1.0);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vVoxelSurface.y, 0.0, 1.0);').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_COLOR
 totalEmissiveRadiance += vColor.rgb * max(0.0, vVoxelSurface.z);
#endif`);
 };return material;}
export class WorldMeshes {
 readonly material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.04});readonly chunks=new Map<string,THREE.Mesh>();remeshes=0;lastRemeshMs=0;
 readonly residency:ProviderResidency|null;
 readonly loadRadius=24;readonly evictionRadius=32;bucketScans=0;lastBuiltChunks=0;
 private cachedRevision=-1;private buckets=new Map<string,Cell[]>();private emptyChunks=new Set<string>();
 constructor(readonly field:VoxelField,readonly scene:THREE.Scene){this.residency=isProviderResidentField(field)?new ProviderResidency(field):null;configureVoxelMaterial(this.material);}
 private distance(id:string,center:Vec3){const [x,z]=id.split(',').map(Number),width=16*this.field.size;return Math.hypot((x+.5)*width-center.x,(z+.5)*width-center.z);}
 private remove(id:string){const mesh=this.chunks.get(id);if(!mesh)return;this.scene.remove(mesh);mesh.geometry.dispose();this.chunks.delete(id);}
 /** Reuse owner buckets across unchanged frames. The one-sample halo is identical to
  * full-world meshing, so streamed neighbours retain exact surface ownership/seams. */
 private refreshBuckets(){
  if(this.cachedRevision===this.field.revision)return;
  this.buckets.clear();this.emptyChunks.clear();
  if(this.residency){this.cachedRevision=this.field.revision;return;}
  this.bucketScans++;
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
  const ids=new Set([...(this.residency?.chunkKeys()??this.buckets.keys()),...this.field.dirty]);
  const pending:[string,number,number][]=[];
  for(const id of ids){const distance=this.distance(id,center);if(distance>this.loadRadius)continue;
   const dirty=this.field.dirty.has(id),existing=this.chunks.has(id);
   if(!dirty&&(existing||this.emptyChunks.has(id)))continue;
   const priority=dirty&&existing&&distance<=8?0:distance<=8?1:dirty&&existing?2:3;
   pending.push([id,distance,priority]);
  }
  pending.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0].localeCompare(b[0]));
  for(const [id] of pending.slice(0,limit)){
   const list=this.residency?this.residency.samples(id):this.buckets.get(id);let geometry:THREE.BufferGeometry|undefined;
   if(list)geometry=voxelGeometry(this.field,list,id);
   this.remove(id);
   if(geometry&&geometry.getAttribute('position').count){const mesh=new THREE.Mesh(geometry,this.material);mesh.castShadow=true;mesh.receiveShadow=true;this.chunks.set(id,mesh);this.scene.add(mesh);this.emptyChunks.delete(id);this.remeshes++;}
   else{geometry?.dispose();this.emptyChunks.add(id);}
   this.field.dirty.delete(id);this.lastBuiltChunks++;
  }
  this.lastRemeshMs=performance.now()-start;
 }
 get stats(){let geometryBytes=0,triangles=0;for(const mesh of this.chunks.values()){const g=mesh.geometry;for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;geometryBytes+=g.index?.array.byteLength??0;triangles+=(g.index?.count??g.getAttribute('position').count)/3;}return{residentChunks:this.chunks.size,geometryBytes,triangles,bucketScans:this.bucketScans,lastBuiltChunks:this.lastBuiltChunks,provider:this.residency?.stats??null};}
 dispose(){this.residency?.dispose();for(const id of this.chunks.keys())this.remove(id);this.buckets.clear();this.emptyChunks.clear();this.cachedRevision=-1;this.material.dispose();}
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
