import {createDeviceMarks} from './device-marks';
import * as THREE from 'three';
import { pbrMaterial } from '../materials/pbr';
import { PART_HALF, type SkyboundSnapshot } from '../../game/skybound/types';
/** Cuboid parts use the same grid dimensions as authority collision. */
export function createSkybound(scene:THREE.Scene){
 const marks=createDeviceMarks(scene);
 const geometry=new THREE.BoxGeometry(1,1,1),materials={wood:pbrMaterial('#b9905b','wood'),stone:pbrMaterial('#abb7b6','stone'),metal:pbrMaterial('#537d89','metal')};
 const held=pbrMaterial('#76d5bd','crystal'),rewind=pbrMaterial('#ddb86b','crystal'),burn=pbrMaterial('#df8258','crystal'),ice=pbrMaterial('#a4def0','crystal');
 const lights=Array.from({length:4},()=>{const light=new THREE.PointLight('#c3efe0',0,4,2);scene.add(light);return light;});
 const meshes=new Map<number,THREE.Mesh>();let selected=0;const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#f4e7ad',depthTest:true}));outline.visible=false;scene.add(outline);
 const exit=new THREE.Mesh(new THREE.BoxGeometry(.7,.06,.7),pbrMaterial('#90f2ce','crystal'));exit.visible=false;scene.add(exit);
 return {select(id:number){selected=id;},update(state:SkyboundSnapshot|undefined,player:{x:number;y:number;z:number}){
  marks.update(state);const seen=new Set<number>();for(const part of state?.parts??[]){seen.add(part.id);let mesh=meshes.get(part.id);if(!mesh){mesh=new THREE.Mesh(geometry,materials[part.material]);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);meshes.set(part.id,mesh);}const half=PART_HALF[part.kind];mesh.position.set(part.position.x,part.position.y,part.position.z);if(part.q)mesh.quaternion.set(part.q.x,part.q.y,part.q.z,part.q.w);else mesh.rotation.set(0,part.rotation,0);mesh.scale.set(half.x*2,half.y*2,half.z*2);mesh.material=part.recalling?rewind:part.lease?held:(part.burning??0)>0?burn:(part.frozen??0)>0?ice:part.kind==='lamp'&&part.powered?held:materials[part.material];}
  for(const[id,mesh]of meshes)if(!seen.has(id)){scene.remove(mesh);meshes.delete(id);}
  const chosen=meshes.get(selected);outline.visible=!!chosen;if(chosen){outline.position.copy(chosen.position);outline.quaternion.copy(chosen.quaternion);outline.scale.copy(chosen.scale).multiplyScalar(1.015);}
  const emitters=(state?.parts??[]).filter(p=>p.lightRadius>0).sort((a,b)=>Math.hypot(a.position.x-player.x,a.position.y-player.y,a.position.z-player.z)-Math.hypot(b.position.x-player.x,b.position.y-player.y,b.position.z-player.z));
  lights.forEach((light,i)=>{const part=emitters[i];light.intensity=part?5:0;if(part){light.position.set(part.position.x,part.position.y+.4,part.position.z);light.distance=part.lightRadius;}});
  exit.visible=!!state?.ascendPreview;if(state?.ascendPreview){const p=state.ascendPreview.exit;exit.position.set(p.x,p.y+.02,p.z);}
 },dispose(){marks.dispose();scene.remove(outline);outline.geometry.dispose();outline.material.dispose();for(const mesh of meshes.values())scene.remove(mesh);meshes.clear();scene.remove(exit);geometry.dispose();exit.geometry.dispose();(exit.material as THREE.Material).dispose();Object.values(materials).forEach(m=>m.dispose());held.dispose();rewind.dispose();burn.dispose();ice.dispose();for(const light of lights)scene.remove(light);}};
}
