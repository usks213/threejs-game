import * as THREE from 'three';
import type {PlacementPreview} from '../core/survival';
import type {CoreSimulation} from '../core/simulation';
import {REGIONAL_WATERS,regionAt} from '../core/regions';
/** Reuses one unit box and edge buffer. Expensive placement checks run at most 10Hz. */
export function createBuildGhost(scene:THREE.Scene,preview:()=>PlacementPreview|null){
 const geometry=new THREE.BoxGeometry(1,1,1),edges=new THREE.EdgesGeometry(geometry),fill=new THREE.MeshBasicMaterial({color:0x68db94,transparent:true,opacity:.12,depthWrite:false}),line=new THREE.LineBasicMaterial({color:0x68db94,transparent:true,opacity:.85,depthWrite:false});
 const root=new THREE.Group();root.name='building-preview';root.visible=false;root.add(new THREE.Mesh(geometry,fill),new THREE.LineSegments(edges,line));scene.add(root);
 let nextCheck=0,wasEnabled=false,disposed=false;
 return {update(enabled:boolean,now:number){
  if(disposed)return;
  if(!enabled){root.visible=false;wasEnabled=false;return;}
  if(wasEnabled&&now<nextCheck)return;wasEnabled=true;nextCheck=now+100;
  const result=preview();if(!result){root.visible=false;return;}
  const {min,max}=result.bounds;if(![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite)||max.x<=min.x||max.y<=min.y||max.z<=min.z){root.visible=false;return;}
  root.visible=true;root.position.set((min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2);root.scale.set(max.x-min.x,max.y-min.y,max.z-min.z);
  fill.color.setHex(result.ok?0x68db94:0xee736c);line.color.copy(fill.color);root.userData.valid=result.ok;root.userData.message=result.message;
 },dispose(){if(disposed)return;disposed=true;scene.remove(root);geometry.dispose();edges.dispose();fill.dispose();line.dispose();}};
}
/** Small reusable visual layer for gameplay state; no particles edit the world. */
export function createCampaignDecor(scene:THREE.Scene,sim:CoreSimulation){
 const buildGhost=createBuildGhost(scene,()=>sim.buildPreview());
 const resources:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],root=new THREE.Group();scene.add(root);
 const waterMat=new THREE.MeshPhysicalMaterial({color:'#5e9cad',roughness:.28,metalness:.12,transparent:true,opacity:.68,depthWrite:false});materials.push(waterMat);
 if(sim.campaignMode)for(const w of REGIONAL_WATERS){const g=new THREE.PlaneGeometry(w.max.x-w.min.x,w.max.z-w.min.z,10,10);resources.push(g);const mesh=new THREE.Mesh(g,waterMat);mesh.rotation.x=-Math.PI/2;mesh.position.set((w.min.x+w.max.x)/2,w.surfaceY,(w.min.z+w.max.z)/2);root.add(mesh);}
 const arrowGeometry=new THREE.ConeGeometry(.035,.45,5),arrowMaterial=new THREE.MeshStandardMaterial({color:'#d9c196',roughness:.7}),arrows=new THREE.InstancedMesh(arrowGeometry,arrowMaterial,32);resources.push(arrowGeometry);materials.push(arrowMaterial);arrows.count=0;arrows.frustumCulled=false;root.add(arrows);
 const ropeGeometry=new THREE.BufferGeometry();ropeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));const ropeMaterial=new THREE.LineBasicMaterial({color:'#d6b982'}),rope=new THREE.Line(ropeGeometry,ropeMaterial);resources.push(ropeGeometry);materials.push(ropeMaterial);root.add(rope);
 const goatMat=new THREE.MeshStandardMaterial({color:'#b7b1a2',roughness:.9}),goat=new THREE.Group();materials.push(goatMat);const bodyG=new THREE.SphereGeometry(.32,8,6),headG=new THREE.SphereGeometry(.18,8,6);resources.push(bodyG,headG);const body=new THREE.Mesh(bodyG,goatMat);body.scale.set(1.4,.8,.75);body.position.y=.65;goat.add(body);const head=new THREE.Mesh(headG,goatMat);head.position.set(0,.9,-.4);goat.add(head);for(const x of [-.2,.2])for(const z of [-.2,.2]){const g=new THREE.CylinderGeometry(.045,.045,.5,5);resources.push(g);const leg=new THREE.Mesh(g,goatMat);leg.position.set(x,.35,z);goat.add(leg);}root.add(goat);
 const plantG=new THREE.ConeGeometry(.22,.65,7),plantM=new THREE.MeshStandardMaterial({color:'#68a14f',roughness:.9});resources.push(plantG);materials.push(plantM);const plants=[0,1,2].map(i=>{const m=new THREE.Mesh(plantG,plantM);m.position.set(-5.5,.5,3+i*.8);root.add(m);return m;});
 const pointerG=new THREE.OctahedronGeometry(.12),pointerM=new THREE.MeshBasicMaterial({color:'#e9bf70',transparent:true,opacity:.8}),pointer=new THREE.Mesh(pointerG,pointerM);resources.push(pointerG);materials.push(pointerM);root.add(pointer);
 const boltG=new THREE.IcosahedronGeometry(.18,0),boltM=new THREE.MeshBasicMaterial({color:'#b391e6'}),bolts=new THREE.InstancedMesh(boltG,boltM,32);bolts.count=0;bolts.frustumCulled=false;root.add(bolts);resources.push(boltG);materials.push(boltM);const ringG=new THREE.RingGeometry(.91,1,32),ringM=new THREE.MeshBasicMaterial({color:'#ff975e',side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}),rings=new THREE.InstancedMesh(ringG,ringM,24);rings.count=0;rings.frustumCulled=false;root.add(rings);resources.push(ringG);materials.push(ringM);
 const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();const fog=new THREE.FogExp2('#8cab9e',.025);
 return {update(){buildGhost.update(sim.buildMode,performance.now());let n=0;for(const a of sim.arrows){if(n>=32)break;dummy.position.set(a.position.x,a.position.y,a.position.z);dummy.quaternion.setFromUnitVectors(up,direction.set(a.velocity.x,a.velocity.y,a.velocity.z).normalize());dummy.scale.set(1,1,1);dummy.updateMatrix();arrows.setMatrixAt(n++,dummy.matrix);}arrows.count=n;arrows.instanceMatrix.needsUpdate=true;let bn=0;for(const b of sim.enemyShots){dummy.position.set(b.position.x,b.position.y,b.position.z);dummy.quaternion.identity();dummy.scale.setScalar(b.radius/.18);dummy.updateMatrix();bolts.setMatrixAt(bn++,dummy.matrix);}bolts.count=bn;bolts.instanceMatrix.needsUpdate=true;let rn=0;for(const t of sim.tells){dummy.position.set(t.position.x,t.position.y+.045,t.position.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(Math.max(.3,t.radius));dummy.updateMatrix();rings.setMatrixAt(rn++,dummy.matrix);}rings.count=rn;rings.instanceMatrix.needsUpdate=true;
  rope.visible=!!sim.grapple;if(sim.grapple){const p=sim.eye(),a=ropeGeometry.getAttribute('position') as THREE.BufferAttribute;a.setXYZ(0,p.x+.2,p.y-.3,p.z);a.setXYZ(1,sim.grapple.x,sim.grapple.y+1,sim.grapple.z);a.needsUpdate=true;ropeGeometry.computeBoundingSphere();}
  goat.visible=sim.campaignMode&&sim.home.state.animal.tamed;goat.position.set(-1.3+Math.sin(sim.seconds*.3)*.35,.25,5.4+Math.cos(sim.seconds*.3)*.35);goat.rotation.y=sim.seconds*.3;
  plants.forEach((p,i)=>{const plot=sim.home.state.plots[i];p.visible=sim.campaignMode&&plot.planted;p.scale.y=.15+.85*(1-plot.remaining/60);});
  const target=sim.campaign.objective().waypoint;pointer.visible=sim.campaignMode&&!!target;if(target){pointer.position.set(target.position.x,target.position.y+2.2+Math.sin(sim.seconds*2)*.1,target.position.z);pointer.rotation.y=sim.seconds;}
  if(sim.campaignMode){const region=regionAt(sim.player.position),mist=sim.player.position.x>5&&sim.player.position.x<11&&sim.player.position.z<-5&&sim.player.position.z>-15||sim.player.position.z<-18&&sim.player.position.z>-26||region?.climate==='ash';fog.color.set(mist?'#6b8d82':region?.airColor??'#b8cbd0');fog.density=mist?.075:region?.climate==='freezing'?.02:.004;scene.fog=fog;}
 },dispose(){buildGhost.dispose();arrows.dispose();bolts.dispose();rings.dispose();scene.remove(root);for(const g of resources)g.dispose();for(const m of materials)m.dispose();}};
}
