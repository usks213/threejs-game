import * as THREE from 'three';
import { BEACONS } from '../../content/adventure-world';
import { WIND_COLUMNS } from '../../game/traversal';
import { pbrMaterial } from '../materials/pbr';
import type { Snapshot } from '../../simulation/protocol';
export function createLandmarks(scene:THREE.Scene){
 const box=new THREE.BoxGeometry(1,1,1),crystal=pbrMaterial('#9fe4d6','crystal'),dark=pbrMaterial('#44777b','crystal');
 const beacons=BEACONS.map(b=>{const group=new THREE.Group();for(let i=0;i<5;i++){const cube=new THREE.Mesh(box,dark);cube.scale.set(.25,.25,.25);cube.position.set(Math.sin(i*Math.PI*.4)*.8,1.2+(i%2)*.5,Math.cos(i*Math.PI*.4)*.8);group.add(cube);}scene.add(group);return group;});
 const windGeometry=new THREE.BufferGeometry(),windPositions=new Float32Array(WIND_COLUMNS.length*40*3);windGeometry.setAttribute('position',new THREE.BufferAttribute(windPositions,3));
 const windMaterial=new THREE.PointsMaterial({color:'#e4f1d2',size:.1,opacity:.55,transparent:true,depthWrite:false}),wind=new THREE.Points(windGeometry,windMaterial);wind.frustumCulled=false;scene.add(wind);
 const wingMaterial=pbrMaterial('#ecd4a0','cloth'),wings=new Map<string,THREE.Group>();
 const wing=(id:string,parent:THREE.Group,visible:boolean)=>{let group=wings.get(id);if(!group){group=new THREE.Group();for(let i=-3;i<=3;i++){const piece=new THREE.Mesh(box,wingMaterial);piece.scale.set(.35,.06,.65-Math.abs(i)*.055);piece.position.set(i*.33,1.9-Math.abs(i)*.06,-.1);piece.rotation.z=-i*.06;group.add(piece);}parent.add(group);wings.set(id,group);}group.visible=visible;};
 return {update(state:Snapshot,local:THREE.Group,remote:Map<string,{model:{group:THREE.Group}}>) {
  const enabled=state.adventure.generator===4;wind.visible=enabled;
  BEACONS.forEach((b,i)=>{const resource=state.adventure.resources.find(n=>n.id===b.id),group=beacons[i];group.visible=enabled;group.position.set(b.x,resource?.y??b.y,b.z);group.rotation.y=state.adventure.seconds*.25;for(const child of group.children)(child as THREE.Mesh).material=(resource?.ready??0)>1e9?crystal:dark;});
  if(enabled){for(let w=0;w<WIND_COLUMNS.length;w++){const column=WIND_COLUMNS[w];for(let i=0;i<40;i++){const n=(w*40+i)*3,phase=i*.71+state.adventure.seconds*.7;windPositions[n]=column.x+Math.sin(phase)*column.radius*.7;windPositions[n+1]=3+(i*.87+state.adventure.seconds*2.8)%(column.top-3);windPositions[n+2]=column.z+Math.cos(phase)*column.radius*.7;}}windGeometry.getAttribute('position').needsUpdate=true;}
  wing('local',local,!!(state.adventure.traversal?.gliding||state.adventure.traversal?.debugFlying));
  for(const peer of state.peers??[]){const view=remote.get(peer.id);if(view)wing(peer.id,view.model.group,!!peer.appearance?.gliding);}
  for(const[id,group]of wings)if(id!=='local'&&!remote.has(id)){group.removeFromParent();wings.delete(id);}
 },dispose(){for(const group of beacons)scene.remove(group);for(const group of wings.values())group.removeFromParent();scene.remove(wind);box.dispose();crystal.dispose();dark.dispose();wingMaterial.dispose();windGeometry.dispose();windMaterial.dispose();}};
}
