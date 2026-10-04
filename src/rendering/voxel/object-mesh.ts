import * as THREE from 'three';
import { pbrMaterial } from '../materials/pbr';
import type { VoxelModel,VoxelMaterial } from '../../game/voxel/model';
import { voxelKey } from '../../game/voxel/model';
const palette:Record<VoxelMaterial,string>={wood:'#9b754d',stone:'#8b8e7e',leaves:'#608a49',cloth:'#acac81',metal:'#777e79'};
const faces=[{n:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},{n:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},{n:[0,1,0],v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]},{n:[0,-1,0],v:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]]},{n:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},{n:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]}];
export function voxelGeometry(model:VoxelModel,removed:readonly string[]=[],material?:VoxelMaterial):THREE.BufferGeometry {
 const gone=new Set(removed),positions:number[]=[],normals:number[]=[],uv:number[]=[];
 for(const c of model.cells.values()){if(gone.has(c.key)||material&&c.material!==material)continue;for(const f of faces){const key=voxelKey(c.x+f.n[0],c.y+f.n[1],c.z+f.n[2]);if(model.cells.has(key)&&!gone.has(key))continue;for(const i of [0,1,2,0,2,3]){const v=f.v[i];positions.push((c.x+v[0])*model.size,(c.y+v[1])*model.size,(c.z+v[2])*model.size);normals.push(...f.n);uv.push(i===1||i===2?1:0,i>=2?1:0);}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}
export function voxelGroup(model:VoxelModel,removed:readonly string[]=[]):THREE.Group {const g=new THREE.Group();const kinds=new Set([...model.cells.values()].map(c=>c.material));for(const kind of kinds){const geo=voxelGeometry(model,removed,kind);if(!geo.getAttribute('position').count){geo.dispose();continue;}const m=pbrMaterial(palette[kind],kind==='leaves'?'foliage':kind);const mesh=new THREE.Mesh(geo,m);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);}return g;}
export function disposeVoxelGroup(group:THREE.Object3D){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
