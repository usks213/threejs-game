import * as THREE from 'three';
import { buildingKit } from './building-model';
import type { Vec3 } from '../../world/types';
export function createBuildingPreview(scene:THREE.Scene){
 const kit=buildingKit(),material=new THREE.MeshBasicMaterial({color:'#96e4bd',transparent:true,opacity:.45,depthWrite:false});
 let group:THREE.Group|null=null,current='';
 return {update(id:string,p:Vec3|null,rotation:number,valid:boolean){
  if(id!==current){if(group)scene.remove(group);current=id;group=id?kit.make(id):null;if(group){group.traverse(o=>{if(o instanceof THREE.Mesh){o.material=material;o.castShadow=false;o.receiveShadow=false;}});scene.add(group);}}
  if(group){group.visible=!!p;if(p)group.position.set(p.x,p.y+.015,p.z);group.rotation.y=rotation;material.color.set(valid?'#8bf0b6':'#f38e7d');}
 },dispose(){if(group)scene.remove(group);kit.dispose();material.dispose();}};
}
