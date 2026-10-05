import {createNpcLifeView} from './npc-life-view';
import * as THREE from 'three';
import type {PlacementPreview} from '../core/survival';
import type {SoilPreview} from '../core/soil-fill';
import type {CoreSimulation} from '../core/simulation';
import {REGIONAL_WATERS,REGIONAL_POINTS,regionAt} from '../core/regions';
import {createHomesteadAnimalView} from './homestead-animal-view';
/** Reuses one unit box and edge buffer. Expensive placement checks run at most 10Hz. */
export function createBuildGhost(scene:THREE.Scene,preview:()=>PlacementPreview|SoilPreview|null){
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
export interface HearthVisualState {flameTier:number;campUnlocked:boolean;claimedPoints:readonly string[]}
/** Rendering only: no voxel edits or saved-world mutation. One shared nearest light. */
export function createHearthFlames(scene:THREE.Scene){
 const root=new THREE.Group();root.name='hearth-flames';root.visible=false;scene.add(root);
 const geometry=new THREE.LatheGeometry([new THREE.Vector2(0,0),new THREE.Vector2(.18,.08),new THREE.Vector2(.23,.25),new THREE.Vector2(.15,.51),new THREE.Vector2(.08,.77),new THREE.Vector2(0,1.02)],7);
 const outer=new THREE.MeshBasicMaterial({color:new THREE.Color(2.8,.55,.035),transparent:true,opacity:.88,depthWrite:false,toneMapped:false}),core=new THREE.MeshBasicMaterial({color:new THREE.Color(3,2.1,.65),transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
 const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);pixels[i]=255;pixels[i+1]=174;pixels[i+2]=63;pixels[i+3]=Math.round(Math.max(0,1-r)**2*110);}
 const texture=new THREE.DataTexture(pixels,32,32);texture.needsUpdate=true;const glowMaterial=new THREE.SpriteMaterial({map:texture,color:0xffad4a,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
 const definitions=[{id:'hearth',position:{x:-3,y:.67,z:4}},{id:'nextcamp',position:{x:0,y:4.08,z:-31}},...REGIONAL_POINTS.filter(p=>p.kind==='hearth').map(p=>({id:p.id,position:{x:p.position.x,y:p.position.y+.4,z:p.position.z}}))];
 const flames=definitions.map((definition,index)=>{const group=new THREE.Group();group.name='hearth-flame:'+definition.id;group.position.set(definition.position.x,definition.position.y,definition.position.z);group.visible=false;const a=new THREE.Mesh(geometry,outer),b=new THREE.Mesh(geometry,core),c=new THREE.Mesh(geometry,outer);b.scale.set(.55,.7,.55);b.position.y=.02;c.scale.set(.55,.8,.55);c.position.set(.16,.03,.03);c.rotation.z=-.2;group.add(a,b,c);const glow=new THREE.Sprite(glowMaterial);glow.position.y=.42;glow.scale.set(1.65,1.9,1);group.add(glow);root.add(group);return {...definition,index,group,a,b,c,glow};});
 const light=new THREE.PointLight(0xffa34a,0,7,2);light.name='hearth-nearest-light';light.castShadow=false;root.add(light);let disposed=false;
 return {update(enabled:boolean,state:HearthVisualState,player:{x:number;y:number;z:number},seconds:number){if(disposed)return;root.visible=enabled;let nearest:typeof flames[number]|undefined,nearestDistance=12;
  for(const f of flames){const lit=enabled&&(f.id==='hearth'?state.flameTier>0:f.id==='nextcamp'?state.campUnlocked:state.claimedPoints.includes(f.id));f.group.visible=lit;if(!lit)continue;const pulse=Math.sin(seconds*7+f.index)*.075+Math.sin(seconds*11+f.index)*.035;f.a.scale.set(1-pulse*.5,1+pulse,1-pulse*.5);f.a.rotation.z=Math.sin(seconds*3+f.index)*.075;f.b.scale.y=.69+pulse*.45;f.c.scale.y=.74-pulse*.5;const d=Math.hypot(player.x-f.position.x,player.y-f.position.y,player.z-f.position.z);if(d<nearestDistance){nearestDistance=d;nearest=f;}}
  light.intensity=nearest?7+Math.sin(seconds*7)*.5:0;if(nearest)light.position.set(nearest.position.x,nearest.position.y+.65,nearest.position.z);
 },dispose(){if(disposed)return;disposed=true;scene.remove(root);geometry.dispose();outer.dispose();core.dispose();glowMaterial.dispose();texture.dispose();}};
}
/** Small reusable visual layer for gameplay state; no particles edit the world. */
export function createCampaignDecor(scene:THREE.Scene,sim:CoreSimulation){
 const buildGhost=createBuildGhost(scene,()=>sim.soilFilling?sim.soilPreview():sim.buildPreview()),hearthFlames=createHearthFlames(scene),animalView=createHomesteadAnimalView(scene,sim),npcView=createNpcLifeView(scene,sim);
 const resources:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],root=new THREE.Group();scene.add(root);
 const waterMat=new THREE.MeshPhysicalMaterial({color:'#5e9cad',roughness:.28,metalness:.12,transparent:true,opacity:.68,depthWrite:false});materials.push(waterMat);
 if(sim.campaignMode)for(const w of REGIONAL_WATERS){const g=new THREE.PlaneGeometry(w.max.x-w.min.x,w.max.z-w.min.z,10,10);resources.push(g);const mesh=new THREE.Mesh(g,waterMat);mesh.rotation.x=-Math.PI/2;mesh.position.set((w.min.x+w.max.x)/2,w.surfaceY,(w.min.z+w.max.z)/2);root.add(mesh);}
 const arrowGeometry=new THREE.ConeGeometry(.035,.45,5),arrowMaterial=new THREE.MeshStandardMaterial({color:'#d9c196',roughness:.7}),arrows=new THREE.InstancedMesh(arrowGeometry,arrowMaterial,32);resources.push(arrowGeometry);materials.push(arrowMaterial);arrows.count=0;arrows.frustumCulled=false;root.add(arrows);
 const ropeGeometry=new THREE.BufferGeometry();ropeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));const ropeMaterial=new THREE.LineBasicMaterial({color:'#d6b982'}),rope=new THREE.Line(ropeGeometry,ropeMaterial);resources.push(ropeGeometry);materials.push(ropeMaterial);root.add(rope);
 const plantG=new THREE.ConeGeometry(.22,.65,7),plantM=new THREE.MeshStandardMaterial({color:'#68a14f',roughness:.9});resources.push(plantG);materials.push(plantM);const plants=[0,1,2].map(i=>{const m=new THREE.Mesh(plantG,plantM);m.position.set(-5.5,.5,3+i*.8);root.add(m);return m;});
 const pointerG=new THREE.OctahedronGeometry(.12),pointerM=new THREE.MeshBasicMaterial({color:'#e9bf70',transparent:true,opacity:.8}),pointer=new THREE.Mesh(pointerG,pointerM);resources.push(pointerG);materials.push(pointerM);root.add(pointer);
 const boltG=new THREE.IcosahedronGeometry(.18,0),boltM=new THREE.MeshBasicMaterial({color:'#b391e6'}),bolts=new THREE.InstancedMesh(boltG,boltM,32);bolts.count=0;bolts.frustumCulled=false;root.add(bolts);resources.push(boltG);materials.push(boltM);const ringG=new THREE.RingGeometry(.91,1,32),ringM=new THREE.MeshBasicMaterial({color:'#ff975e',side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}),rings=new THREE.InstancedMesh(ringG,ringM,24);rings.count=0;rings.frustumCulled=false;root.add(rings);resources.push(ringG);materials.push(ringM);
 const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();const fog=new THREE.FogExp2('#8cab9e',.025);
 return {update(){buildGhost.update(sim.buildMode||sim.soilFilling,performance.now());hearthFlames.update(sim.campaignMode,sim.campaign.state,sim.player.position,sim.seconds);let n=0;for(const a of sim.arrows){if(n>=32)break;dummy.position.set(a.position.x,a.position.y,a.position.z);dummy.quaternion.setFromUnitVectors(up,direction.set(a.velocity.x,a.velocity.y,a.velocity.z).normalize());dummy.scale.set(1,1,1);dummy.updateMatrix();arrows.setMatrixAt(n++,dummy.matrix);}arrows.count=n;arrows.instanceMatrix.needsUpdate=true;let bn=0;for(const b of sim.enemyShots){dummy.position.set(b.position.x,b.position.y,b.position.z);dummy.quaternion.identity();dummy.scale.setScalar(b.radius/.18);dummy.updateMatrix();bolts.setMatrixAt(bn++,dummy.matrix);}bolts.count=bn;bolts.instanceMatrix.needsUpdate=true;let rn=0;for(const t of sim.tells){dummy.position.set(t.position.x,t.position.y+.045,t.position.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(Math.max(.3,t.radius));dummy.updateMatrix();rings.setMatrixAt(rn++,dummy.matrix);}rings.count=rn;rings.instanceMatrix.needsUpdate=true;
  rope.visible=!!sim.grapple;if(sim.grapple){const p=sim.eye(),a=ropeGeometry.getAttribute('position') as THREE.BufferAttribute;a.setXYZ(0,p.x+.2,p.y-.3,p.z);a.setXYZ(1,sim.grapple.x,sim.grapple.y+1,sim.grapple.z);a.needsUpdate=true;ropeGeometry.computeBoundingSphere();}
  animalView.update();npcView.update();
  plants.forEach((p,i)=>{const plot=sim.home.state.plots[i];p.visible=sim.campaignMode&&plot.planted;p.scale.y=.15+.85*(1-plot.remaining/60);});
  const target=sim.campaign.objective().waypoint;pointer.visible=sim.campaignMode&&!!target;if(target){pointer.position.set(target.position.x,target.position.y+2.2+Math.sin(sim.seconds*2)*.1,target.position.z);pointer.rotation.y=sim.seconds;}
  if(sim.campaignMode){const region=regionAt(sim.player.position),mist=sim.player.position.x>5&&sim.player.position.x<11&&sim.player.position.z<-5&&sim.player.position.z>-15||sim.player.position.z<-18&&sim.player.position.z>-26||region?.climate==='ash';fog.color.set(mist?'#6b8d82':region?.airColor??'#b8cbd0');fog.density=mist?.075:region?.climate==='freezing'?.02:.004;scene.fog=fog;}
 },dispose(){buildGhost.dispose();hearthFlames.dispose();animalView.dispose();npcView.dispose();arrows.dispose();bolts.dispose();rings.dispose();scene.remove(root);for(const g of resources)g.dispose();for(const m of materials)m.dispose();}};
}
