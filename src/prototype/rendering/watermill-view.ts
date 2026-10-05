import * as THREE from 'three';
import {WATERMILL_POSITION,WATERMILL_ROTOR,type WatermillSystem} from '../core/watermill';
/** Fixed GPU allocation. The visual rotor follows only the host's accumulated
 * hydraulic angle; rotating it never changes the SDF or triggers a terrain remesh. */
export function createWatermillView(scene:THREE.Scene,sim:{campaignMode:boolean;watermill:WatermillSystem}){
 const root=new THREE.Group(),rotor=new THREE.Group();root.name='waterwheel-loom';root.add(rotor);scene.add(root);
 rotor.position.set(WATERMILL_ROTOR.x,WATERMILL_ROTOR.y,WATERMILL_ROTOR.z);
 const wood=new THREE.MeshStandardMaterial({color:0x9e794a,roughness:.85}),iron=new THREE.MeshStandardMaterial({color:0x737d84,metalness:.6,roughness:.5}),lampMaterial=new THREE.MeshStandardMaterial({color:0xeec68c,emissive:0x000000});
 const ringGeometry=new THREE.TorusGeometry(.3,.025,5,16),paddleGeometry=new THREE.BoxGeometry(.12,.12,.24),shaftGeometry=new THREE.CylinderGeometry(.045,.045,.6,8),lampGeometry=new THREE.BoxGeometry(.14,.14,.14);
 const ring=new THREE.Mesh(ringGeometry,wood);ring.rotation.y=Math.PI/2;rotor.add(ring);
 for(let i=0;i<8;i++){const t=i*Math.PI/4,paddle=new THREE.Mesh(paddleGeometry,wood);paddle.position.set(0,Math.cos(t)*.27,Math.sin(t)*.27);paddle.rotation.x=t;rotor.add(paddle);}
 const shaft=new THREE.Mesh(shaftGeometry,iron);shaft.rotation.z=Math.PI/2;shaft.position.set(4.03,WATERMILL_ROTOR.y,WATERMILL_ROTOR.z);root.add(shaft);
 const lamp=new THREE.Mesh(lampGeometry,lampMaterial);lamp.position.set(WATERMILL_POSITION.x,1.1,WATERMILL_POSITION.z);root.add(lamp);let disposed=false;
 return {update(){if(disposed)return;const m=sim.watermill;root.visible=sim.campaignMode&&m.state.built;rotor.visible=shaft.visible=m.frameIntact();rotor.rotation.x=m.state.angle;root.userData.flow=m.flow;root.userData.status=m.blockedReason;lampMaterial.emissive.setHex(m.state.job?.remaining===0?0x29613b:m.blockedReason?0x50221a:0x24586b);},dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of [ringGeometry,paddleGeometry,shaftGeometry,lampGeometry])g.dispose();for(const m of [wood,iron,lampMaterial])m.dispose();root.clear();}};
}
