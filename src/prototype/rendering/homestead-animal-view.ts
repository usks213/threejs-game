import * as THREE from 'three';
import {HOMESTEAD_ANIMAL_ID,type HomesteadAnimal} from '../core/homestead-animal';
import {voxelAppearance} from './meshes';

export interface HomesteadAnimalViewSimulation {readonly campaignMode:boolean;readonly animal:HomesteadAnimal}
/** One unmodified copy of the actor's cached sampled surface. Only its actual
 * physical transform moves; feedback never displaces vertices or remeshes terrain.
 * Trial mode does not request the surface or allocate animal GPU resources. */
export function createHomesteadAnimalView(scene:THREE.Scene,sim:HomesteadAnimalViewSimulation){
 let mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|null=null,disposed=false;
 function createMesh(){
  const surface=sim.animal.bodySurface,colors=new Float32Array(surface.positions.length),appearance=voxelAppearance(10,0,0,0,0);
  for(let i=0;i<surface.materials.length;i++){
   const offset=i*3;voxelAppearance(surface.materials[i],surface.positions[offset],surface.positions[offset+1],surface.positions[offset+2],surface.normals[offset+1],appearance);
   colors[offset]=appearance.color.r;colors[offset+1]=appearance.color.g;colors[offset+2]=appearance.color.b;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(surface.normals,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0});
  mesh=new THREE.Mesh(geometry,material);mesh.name=HOMESTEAD_ANIMAL_ID;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.protected=true;scene.add(mesh);
  return mesh;
 }
 function update(){
  if(disposed)return;
  if(!sim.campaignMode){if(mesh)mesh.visible=false;return;}
  const actor=sim.animal,body=mesh??createMesh(),state=actor.state,material=body.material;
  body.visible=actor.visible;body.position.set(actor.position.x,actor.position.y,actor.position.z);body.rotation.set(0,actor.yaw,0);
  const wet=state.wet>0;material.color.setHex(wet?0xb5d5e3:0xffffff);material.roughness=wet?.32:.97;
  // Protected status is temporary colour/light feedback, with no injury, damage
  // texture, expanding flame mesh, or pose that disagrees with the actor's ray.
  if(state.shock>0){material.emissive.setHex(0x7bbfff);material.emissiveIntensity=.75;body.userData.status='shock';}
  else if(state.burning>0){material.emissive.setHex(0xff631d);material.emissiveIntensity=.6;body.userData.status='burning';}
  else if(wet){material.emissive.setHex(0x000000);material.emissiveIntensity=0;body.userData.status='wet';}
  else if(state.fright>0){material.emissive.setHex(0xe6ba7a);material.emissiveIntensity=.12;body.userData.status='fright';}
  else{material.emissive.setHex(0x000000);material.emissiveIntensity=0;body.userData.status='calm';}
 }
 update();
 return {update,dispose(){if(disposed)return;disposed=true;if(!mesh)return;mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();mesh=null;}};
}
