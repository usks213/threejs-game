import * as THREE from 'three';
import {npcBody,type NpcLife,type NpcPose} from '../core/npc-life';
import {voxelAppearance} from './meshes';

/** Cached SDF poses; the selected surface is also the physical actor's ray body.
 * No world cells or quest rewards are touched by presentation. */
export function createNpcLifeView(scene:THREE.Scene,sim:{campaignMode:boolean;npc:NpcLife;npcActors?:readonly NpcLife[]}){
 const actors=sim.npcActors??[sim.npc],views=actors.map(actor=>createActorView(scene,sim,actor));return {update(){for(const view of views)view.update();},dispose(){for(const view of views)view.dispose();}};
}
function createActorView(scene:THREE.Scene,sim:{campaignMode:boolean},actor:NpcLife){
 const meshes=new Map<NpcPose,THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>>();let disposed=false;
 function mesh(pose:NpcPose){let m=meshes.get(pose);if(m)return m;const surface=npcBody(pose,actor.profile).surface,colors=new Float32Array(surface.positions.length),color=voxelAppearance(10,0,0,0,0);
  for(let i=0;i<surface.materials.length;i++){const k=i*3;voxelAppearance(surface.materials[i],surface.positions[k],surface.positions[k+1],surface.positions[k+2],surface.normals[k+1],color);colors[k]=color.color.r;colors[k+1]=color.color.g;colors[k+2]=color.color.b;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(surface.normals,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeBoundingSphere();m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86}));m.name=actor.profile.viewName+':'+pose;m.castShadow=true;m.receiveShadow=true;m.userData.protected=true;meshes.set(pose,m);scene.add(m);return m;
 }
 return {update(){if(disposed)return;for(const m of meshes.values())m.visible=false;if(!sim.campaignMode||!actor.visible)return;const a=actor,m=mesh(a.pose);m.visible=true;m.position.set(a.position.x,a.position.y,a.position.z);m.rotation.y=a.state!.yaw;m.userData.activity=a.state!.activity;},dispose(){if(disposed)return;disposed=true;for(const m of meshes.values()){m.removeFromParent();m.geometry.dispose();m.material.dispose();}meshes.clear();}};
}
