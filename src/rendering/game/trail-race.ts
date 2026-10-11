import * as THREE from 'three';
import type {Snapshot} from '../../simulation/protocol';
export function createTrailRace(scene:THREE.Scene){
 const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial({color:'#c1efac',transparent:true,opacity:.8,depthWrite:false}),group=new THREE.Group();
 for(const[x,y,z,sx,sy,sz]of[[-1.7,1.1,0,.12,2.2,.12],[1.7,1.1,0,.12,2.2,.12],[0,2.2,0,3.5,.12,.12]]){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);group.add(m);}group.visible=false;scene.add(group);
 return {update(s:Snapshot){const target=s.adventure.raceTarget;group.visible=!!target;if(target){group.position.set(target.x,target.y+.08,target.z);group.rotation.y=Math.atan2(target.x-s.player.x,target.z-s.player.z);}},dispose(){scene.remove(group);geometry.dispose();material.dispose();}};
}
