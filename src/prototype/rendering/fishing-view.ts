import * as THREE from 'three';
import type {FishingSystem} from '../core/fishing';

export interface FishingViewSimulation {fishing:Pick<FishingSystem,'selected'|'status'>;seconds:number;player:{hp:number}}
/** Original low-poly rod and buoy, rendered in the existing scene pass. No textures,
 * water queries, simulation mutations, or per-frame geometry/resource creation. */
export function createFishingView(scene:THREE.Scene,camera:THREE.Camera,sim:FishingViewSimulation){
 const rod=new THREE.Group();rod.name='fishing-held-rod';rod.visible=false;camera.add(rod);
 const world=new THREE.Group();world.name='fishing-cast-view';world.visible=false;scene.add(world);
 const buoy=new THREE.Group();buoy.name='fishing-float';world.add(buoy);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const geometry=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
 const material=<T extends THREE.Material>(m:T)=>{materials.push(m);return m;};
 const reed=material(new THREE.MeshStandardMaterial({color:0x98754c,roughness:.75,metalness:.05,emissive:0x1b1008,emissiveIntensity:.25}));
 const gripMaterial=material(new THREE.MeshStandardMaterial({color:0x36332c,roughness:.95}));
 const metal=material(new THREE.MeshStandardMaterial({color:0x969f9e,roughness:.35,metalness:.65}));
 const floatMaterial=material(new THREE.MeshBasicMaterial({color:0xd96647,toneMapped:false}));
 const pale=material(new THREE.MeshBasicMaterial({color:0xf5e9bc,toneMapped:false}));
 const lineMaterial=material(new THREE.LineBasicMaterial({color:0xe7dcc3,transparent:true,opacity:.82,depthWrite:false,toneMapped:false}));
 const rippleMaterial=material(new THREE.MeshBasicMaterial({color:0xffd45a,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
 const bottom=new THREE.Vector3(.15,-.25,-.55),top=new THREE.Vector3(.13,.24,-1.62),shaftDirection=top.clone().sub(bottom).normalize(),up=new THREE.Vector3(0,1,0);
 const shaft=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.009,.022,1,7)),reed);shaft.name='fishing-rod-shaft';shaft.position.copy(bottom).add(top).multiplyScalar(.5);shaft.scale.y=bottom.distanceTo(top);shaft.quaternion.setFromUnitVectors(up,shaftDirection);rod.add(shaft);
 const grip=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.035,.038,.24,8)),gripMaterial);grip.position.copy(bottom).addScaledVector(shaftDirection,.09);grip.quaternion.copy(shaft.quaternion);rod.add(grip);
 const reel=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.058,.058,.045,10)),metal);reel.position.copy(bottom).addScaledVector(shaftDirection,.18);reel.position.x+=.04;reel.rotation.z=Math.PI/2;rod.add(reel);
 const guideGeometry=geometry(new THREE.TorusGeometry(.025,.006,4,8));
 for(const t of [.55,.93]){const guide=new THREE.Mesh(guideGeometry,metal);guide.position.copy(bottom).lerp(top,t);guide.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),shaftDirection);rod.add(guide);}
 const tip=new THREE.Object3D();tip.name='fishing-line-origin';tip.position.copy(top);rod.add(tip);
 const floatGeometry=geometry(new THREE.SphereGeometry(.052,10,6));
 const body=new THREE.Mesh(floatGeometry,floatMaterial);body.name='fishing-float-body';body.scale.set(.8,1.4,.8);buoy.add(body);
 const cap=new THREE.Mesh(floatGeometry,pale);cap.scale.set(.65,.45,.65);cap.position.y=.045;buoy.add(cap);
 const stem=new THREE.Mesh(geometry(new THREE.CylinderGeometry(.009,.009,.2,5)),pale);stem.position.y=.07;buoy.add(stem);
 const ripple=new THREE.Mesh(geometry(new THREE.RingGeometry(.1,.12,16)),rippleMaterial);ripple.name='fishing-bite-ripple';ripple.rotation.x=-Math.PI/2;ripple.visible=false;world.add(ripple);
 const lineGeometry=geometry(new THREE.BufferGeometry()),linePositions=new Float32Array(9*3),lineAttribute=new THREE.BufferAttribute(linePositions,3);lineAttribute.setUsage(THREE.DynamicDrawUsage);lineGeometry.setAttribute('position',lineAttribute);
 const line=new THREE.Line(lineGeometry,lineMaterial);line.name='fishing-line';line.frustumCulled=false;world.add(line);
 const origin=new THREE.Vector3(),end=new THREE.Vector3(),target=new THREE.Vector3();let disposed=false;
 return {
  update(enabled=true){
   if(disposed)return;const selected=enabled&&sim.fishing.selected&&sim.player.hp>0;rod.visible=selected;world.visible=false;if(!selected)return;
   const status=sim.fishing.status,time=Number.isFinite(sim.seconds)?sim.seconds:0,bite=status.phase==='bite';
   rod.rotation.z=Math.sin(time*(bite?25:1.7))*(bite?.025:.004);rod.rotation.x=0;
   if(!status.target||!['casting','waiting','bite'].includes(status.phase)||![status.target.x,status.target.y,status.target.z].every(Number.isFinite))return;
   world.visible=true;target.set(status.target.x,status.target.y,status.target.z);const cast=status.phase==='casting',progress=cast?THREE.MathUtils.clamp(1-status.remaining/.6,0,1):1;
   if(cast)rod.rotation.x=-Math.sin(progress*Math.PI)*.15;
   camera.updateWorldMatrix(true,false);rod.updateWorldMatrix(false,true);tip.getWorldPosition(origin);
   end.copy(target);end.y+=bite?.02+Math.sin(time*25)*.05:.08+Math.sin(time*4)*.012;
   if(cast){end.copy(origin).lerp(target,progress);end.y+=Math.sin(progress*Math.PI)*.45;}
   buoy.position.copy(end);buoy.rotation.z=bite?Math.sin(time*22)*.2:Math.sin(time*3)*.045;
   floatMaterial.color.setHex(bite?0xffd34e:0xd96647);lineMaterial.color.setHex(bite?0xffe39a:0xe7dcc3);lineMaterial.opacity=bite?1:.82;
   ripple.visible=bite;ripple.position.set(target.x,target.y+.025,target.z);ripple.scale.setScalar(1+(time*2.2%1)*2);rippleMaterial.opacity=.6*(1-time*2.2%1);
   for(let i=0;i<9;i++){const t=i/8,index=i*3;linePositions[index]=origin.x+(end.x-origin.x)*t;linePositions[index+1]=origin.y+(end.y-origin.y)*t-Math.sin(t*Math.PI)*(bite?.015:cast?.015:.08);linePositions[index+2]=origin.z+(end.z-origin.z)*t;}
   lineAttribute.needsUpdate=true;line.userData.phase=status.phase;buoy.userData.phase=status.phase;
  },
  get stats(){return{geometries:geometries.length,materials:materials.length,lineVertices:9,rodVisible:rod.visible,floatVisible:world.visible,disposed};},
  dispose(){if(disposed)return;disposed=true;camera.remove(rod);scene.remove(world);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();rod.clear();world.clear();},
 };
}
