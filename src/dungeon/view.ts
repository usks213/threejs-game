import * as THREE from 'three';
import {attackPose,bladeWorld,meleeDefinition} from '../prototype/core/motion';
import type {Vec3} from '../prototype/core/voxel';
import {WorldMeshes} from '../prototype/rendering/meshes';
import {dungeonField} from './world';
import type {Input,Snapshot,ClassId} from './types';

type VisibleActor=Snapshot['actors'][number];
const up=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3();
const classColors:Record<ClassId,string>={bastion:'#849cac',ravager:'#a8745d',shade:'#655f87',hunter:'#5d8b79',arcanist:'#8685b3',keeper:'#b6a568'};
export function dungeonBlade(actor:VisibleActor,yaw=actor.yaw,pitch=actor.pitch,age=0){
 const archetype=actor.weapon==='greatsword'?'greatsword':actor.weapon==='dagger'?'dagger':'sword';
 const timing=meleeDefinition(actor.kind,archetype),duration=actor.phase==='windup'?timing.windup:actor.phase==='strike'?timing.strike:actor.phase==='recover'?timing.recover:0;
 const pose=attackPose(actor.kind,actor.phase,Math.min(duration,actor.time+Math.max(0,Math.min(.1,age))),1,archetype);
 return bladeWorld(pose,actor.position,yaw,pitch);
}
function segment(mesh:THREE.Mesh,from:Vec3,to:Vec3,radius=1){a.set(from.x,from.y,from.z);b.set(to.x,to.y,to.z);direction.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,direction.clone().normalize());mesh.scale.set(radius,direction.length(),radius);}
/** A compact original render rig; the actual displayed blade endpoints come from shared server motion. */
function actorRig(enemy:boolean,local:boolean){
 const group=new THREE.Group(),resources:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const material=(color:string,metalness=.1,emissive='#000000')=>{const m=new THREE.MeshStandardMaterial({color,roughness:.7,metalness,emissive,emissiveIntensity:1.2});materials.push(m);return m;};
 const cloth=material(enemy?'#5e5143':'#849cac'),metal=material('#9dadaf',.7),leather=material('#43362b'),glow=material(enemy?'#f69059':'#b8c3c4',.1,enemy?'#a32208':'#000000');
 const mesh=(geometry:THREE.BufferGeometry,mat:THREE.Material)=>{resources.push(geometry);const m=new THREE.Mesh(geometry,mat);group.add(m);return m;};
 const torso=mesh(new THREE.CapsuleGeometry(.23,.38,3,7),cloth);torso.position.y=1.12;
 const head=mesh(new THREE.SphereGeometry(.17,10,6),metal);head.scale.set(1,1.18,1);head.position.y=1.66;
 const visor=mesh(new THREE.BoxGeometry(.24,.045,.055),glow);visor.position.set(0,1.67,-.16);
 const belt=mesh(new THREE.CylinderGeometry(.245,.24,.09,8),leather);belt.position.y=.87;
 const legs=[-1,1].map(side=>{const m=mesh(new THREE.CapsuleGeometry(.085,.54,2,6),cloth);m.position.set(side*.15,.43,0);return m;});
 const shoulders=[-1,1].map(()=>mesh(new THREE.SphereGeometry(.13,8,6),metal));
 const arms=[-1,1].map(()=>mesh(new THREE.CylinderGeometry(.065,.08,1,6),leather));
 const hands=[-1,1].map(()=>mesh(new THREE.SphereGeometry(.074,7,5),leather));
 const blade=mesh(new THREE.CylinderGeometry(.018,.04,1,4),metal);
 const hilt=mesh(new THREE.CylinderGeometry(.025,.025,.23,7),leather);
 const cross=mesh(new THREE.BoxGeometry(.27,.035,.05),metal);
 const shield=mesh(new THREE.CylinderGeometry(.29,.29,.06,12),metal);shield.rotation.x=Math.PI/2;
 const staffGem=mesh(new THREE.OctahedronGeometry(.085,1),glow);
 const bow=mesh(new THREE.TorusGeometry(.38,.026,5,14,Math.PI*1.25),leather);bow.rotation.z=-Math.PI*.12;
 const string=mesh(new THREE.CylinderGeometry(.003,.003,.7,3),metal);
 if(local)for(const part of [torso,head,visor,belt,...legs,...shoulders])part.visible=false;
 let previousClass:ClassId|null=null;
 return {group,
  update(actor:VisibleActor,look:Input|undefined,age:number,seconds:number){
   const yaw=look?.yaw??actor.yaw,pitch=look?.pitch??actor.pitch,bladePoints=dungeonBlade(actor,yaw,pitch,age);
   if(actor.classId!==previousClass){if(!enemy)cloth.color.set(classColors[actor.classId]);previousClass=actor.classId;}
   group.position.set(actor.position.x,actor.position.y,actor.position.z);group.rotation.y=yaw;
   // Convert exact world trajectory into this yaw-only rig. Pitch affects the blade itself.
   const worldToLocal=(p:Vec3)=>{const dx=p.x-actor.position.x,dz=p.z-actor.position.z;return {x:Math.cos(yaw)*dx-Math.sin(yaw)*dz,y:p.y-actor.position.y,z:Math.sin(yaw)*dx+Math.cos(yaw)*dz};};
   const grip=worldToLocal(bladePoints.grip),tip=worldToLocal(bladePoints.tip);segment(blade,grip,tip,actor.weapon==='greatsword'?1.55:actor.weapon==='dagger'?.7:1);
   a.set(tip.x-grip.x,tip.y-grip.y,tip.z-grip.z).normalize();hilt.position.set(grip.x-a.x*.12,grip.y-a.y*.12,grip.z-a.z*.12);hilt.quaternion.copy(blade.quaternion);cross.position.set(grip.x,grip.y,grip.z);cross.quaternion.copy(blade.quaternion);
   const ranged=actor.weapon==='bow',staff=actor.weapon==='staff';blade.visible=!ranged;cross.visible=!ranged&&!staff;blade.material=staff?leather:metal;
   bow.visible=string.visible=ranged;staffGem.visible=staff;staffGem.position.set(tip.x,tip.y,tip.z);bow.position.set(grip.x,grip.y+.2,grip.z);bow.quaternion.copy(blade.quaternion);string.position.copy(bow.position);string.quaternion.copy(bow.quaternion);
   const guarding=actor.guard,hasShield=local?actor.bag.some(i=>i.kind==='shield'):actor.classId==='bastion'||actor.classId==='keeper';shield.visible=hasShield;shield.position.set(-.36+guarding*.14,1.02+guarding*.34,-.32-guarding*.2);shield.rotation.set(Math.PI/2,-guarding*.15,.1);
   const left={x:shield.position.x,y:shield.position.y,z:shield.position.z+.06};
   for(let i=0;i<2;i++){const side=i?1:-1,hand=i?grip:left,shoulder={x:side*.29,y:1.36,z:0};shoulders[i].position.set(shoulder.x,shoulder.y,shoulder.z);segment(arms[i],shoulder,hand);hands[i].position.set(hand.x,hand.y,hand.z);legs[i].rotation.x=Math.sin(seconds*7+side*Math.PI/2)*.06;}
   const dead=actor.status==='dead';group.visible=actor.status==='alive'||local&&actor.status==='lobby';if(dead)group.visible=false;
  },
  dispose(){resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();},
 };
}

export function createDungeonView(canvas:HTMLCanvasElement){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
 const scene=new THREE.Scene();scene.background=new THREE.Color('#0b1011');scene.fog=new THREE.FogExp2('#0b1011',.044);
 const camera=new THREE.PerspectiveCamera(76,1,.035,55);camera.rotation.order='YXZ';scene.add(camera);
 scene.add(new THREE.HemisphereLight('#a6b8c4','#403224',.58));
 const lantern=new THREE.PointLight('#f9d6a0',11,9,2);lantern.position.set(-.25,-.15,-.15);camera.add(lantern);
 const resources:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const material=(options:THREE.MeshStandardMaterialParameters)=>{const m=new THREE.MeshStandardMaterial(options);materials.push(m);return m;};
 const stone=material({color:'#5b6260',roughness:.98}),wood=material({color:'#46301e',roughness:.9}),iron=material({color:'#5e6966',metalness:.72,roughness:.45}),gold=material({color:'#b69649',metalness:.45,roughness:.42}),cloth=material({color:'#5b3e36',roughness:1});
 const flame=material({color:'#ffa752',emissive:'#fb6e17',emissiveIntensity:3,roughness:1}),activePortal=material({color:'#70d2cb',emissive:'#3ce7c4',emissiveIntensity:2.4,metalness:.1,roughness:.3}),closedPortal=material({color:'#506e76',emissive:'#23404c',emissiveIntensity:.2,roughness:.6});
 const geometry=<T extends THREE.BufferGeometry>(g:T)=>{resources.push(g);return g;};
 const box=geometry(new THREE.BoxGeometry(1,1,1)),sphere=geometry(new THREE.SphereGeometry(1,8,6)),cylinder=geometry(new THREE.CylinderGeometry(1,1,1,8)),ring=geometry(new THREE.TorusGeometry(.72,.035,5,32)),disk=geometry(new THREE.CylinderGeometry(.75,.82,.08,24));
 const staticGroup=new THREE.Group();scene.add(staticGroup);const lights:THREE.PointLight[]=[];
 const mesh=(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D=scene)=>{const object=new THREE.Mesh(g,m);parent.add(object);return object;};
 // Interior ceiling and fixtures are authored scenery; traversable walls/floor below come from the shared sampled SDF.
 const ceiling=mesh(box,stone,staticGroup);ceiling.position.set(0,4.1,0);ceiling.scale.set(32,.4,32);
 for(const [x,z] of [[-14.8,8],[-14.8,-9],[14.8,-8],[14.8,9],[2.7,-5.1],[-2.7,5.6],[0,-14.8],[0,14.8]]){
  const bracket=mesh(cylinder,iron,staticGroup);bracket.position.set(x,1.8,z);bracket.scale.set(.055,.7,.055);
  const glow=mesh(sphere,flame,staticGroup);glow.position.set(x,2.2,z);glow.scale.set(.1,.21,.1);
  const light=new THREE.PointLight('#ffb765',24,10,2);light.position.set(x,2.3,z);staticGroup.add(light);lights.push(light);
 }
 const rigs=new Map<string,ReturnType<typeof actorRig>>(),containers=new Map<string,{root:THREE.Group;lid:THREE.Group;lock:THREE.Mesh}>(),portals=new Map<string,{root:THREE.Group;ring:THREE.Mesh;light:THREE.PointLight}>(),shots=new Map<string,THREE.Mesh>();
 const ownRig=actorRig(false,true);scene.add(ownRig.group);
 let world:WorldMeshes|null=null,seed:number|null=null,doors=new Map<string,boolean>(),snapshot:Snapshot|null=null,receivedAt=0,disposed=false,contextLost=false;
 const doorDecor=new Map<string,THREE.Group>();
 const localPosition=new THREE.Vector3(),readyPosition={value:false};let currentRaid=-1,seconds=0;
 function syncWorld(next:Snapshot){
  if(seed!==next.seed){world?.dispose();world=new WorldMeshes(dungeonField(next.seed,next.doors),scene);seed=next.seed;doors=new Map(next.doors.map(d=>[d.id,d.open]));}
  else if(world){for(const door of next.doors){if(doors.get(door.id)===door.open)continue;world.field.removeObject(door.id);if(!door.open)world.field.box({x:door.position.x-3,y:0,z:door.position.z-.15},{x:door.position.x+3,y:2.8,z:door.position.z+.15},4,door.id,.04);doors.set(door.id,door.open);}}
  const doorIds=new Set(next.doors.map(d=>d.id));for(const [id,frame] of doorDecor)if(!doorIds.has(id)){frame.removeFromParent();doorDecor.delete(id);}
  for(const door of next.doors){let frame=doorDecor.get(door.id);if(!frame){frame=new THREE.Group();scene.add(frame);for(const side of [-1,1]){const post=mesh(box,iron,frame);post.position.set(side*2.9,1.45,0);post.scale.set(.1,2.9,.37);}const lintel=mesh(box,iron,frame);lintel.position.y=2.8;lintel.scale.set(5.9,.1,.36);doorDecor.set(door.id,frame);}frame.position.set(door.position.x,door.position.y,door.position.z);}
 }
 function syncProps(next:Snapshot){
  const ids=new Set(next.containers.map(c=>c.id));for(const [id,view]of containers)if(!ids.has(id)){view.root.removeFromParent();containers.delete(id);}
  for(const c of next.containers){let view=containers.get(c.id);if(!view){const root=new THREE.Group(),lid=new THREE.Group();scene.add(root);root.add(lid);const base=mesh(box,c.kind==='corpse'?cloth:wood,root);base.position.y=.28;base.scale.set(c.kind==='corpse'?.7:.85,.5,.55);lid.position.set(0,.55,.275);const top=mesh(box,wood,lid);top.position.z=-.275;top.scale.set(.88,.1,.58);const lock=mesh(box,gold,root);lock.position.set(0,.43,-.3);lock.scale.set(.1,.13,.06);for(const side of [-1,1]){const band=mesh(box,iron,root);band.position.set(side*.3,.29,0);band.scale.set(.055,.53,.57);}view={root,lid,lock};containers.set(c.id,view);}view.root.position.set(c.position.x,c.position.y,c.position.z);view.lid.rotation.x=c.opened?-1.05:0;view.lock.visible=c.locked;view.lid.visible=c.kind!=='corpse';}
  const exitIds=new Set(next.exits.map(e=>e.id));for(const[id,p]of portals)if(!exitIds.has(id)){p.root.removeFromParent();portals.delete(id);}
  for(const exit of next.exits){let p=portals.get(exit.id);if(!p){const root=new THREE.Group();scene.add(root);const base=mesh(disk,stone,root),loop=mesh(ring,closedPortal,root);base.position.y=.03;loop.position.y=1.12;const light=new THREE.PointLight('#60ffd8',0,5,2);light.position.y=1.2;root.add(light);p={root,ring:loop,light};portals.set(exit.id,p);}p.root.position.set(exit.position.x,exit.position.y,exit.position.z);const open=next.elapsed>=exit.opensAt&&exit.remaining>0;p.ring.material=open?activePortal:closedPortal;p.light.intensity=open?10:0;p.root.visible=exit.remaining>0;}
 }
 const contextHandler=(event:Event)=>{event.preventDefault();contextLost=true;};canvas.addEventListener('webglcontextlost',contextHandler);
 return {
  setSnapshot(next:Snapshot){if(disposed)return;snapshot=next;receivedAt=performance.now();syncWorld(next);syncProps(next);if(next.raid!==currentRaid){currentRaid=next.raid;readyPosition.value=false;}},
  resize(){if(disposed)return;const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();},
  render(dt:number,look:Input){if(disposed||contextLost)return;seconds+=dt;if(!snapshot){camera.position.set(-11,1.52,11);camera.rotation.set(-.03,0,0);renderer.render(scene,camera);return;}
   const own=snapshot.actors.find(actor=>actor.id===snapshot!.you),age=Math.min(.1,(performance.now()-receivedAt)/1000);
   if(own){const p=own.position;if(!readyPosition.value||localPosition.distanceTo(new THREE.Vector3(p.x,p.y,p.z))>3){localPosition.set(p.x,p.y,p.z);readyPosition.value=true;}else localPosition.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-dt*24));camera.position.copy(localPosition);camera.position.y+=own.status==='dead'?.6:1.52;camera.rotation.set(look.pitch,look.yaw,0);ownRig.update({...own,position:{x:localPosition.x,y:localPosition.y,z:localPosition.z}},look,age,seconds);ownRig.group.visible=own.status==='alive';world?.sync(p,2);}
   else world?.sync(undefined,2);
   const ids=new Set<string>();for(const actor of [...snapshot.actors,...snapshot.enemies]){if(actor.id===snapshot.you)continue;ids.add(actor.id);let rig=rigs.get(actor.id);if(!rig){rig=actorRig(actor.team===-1,false);rigs.set(actor.id,rig);scene.add(rig.group);}rig.update(actor,undefined,age,seconds);}
   for(const [id,rig]of rigs)if(!ids.has(id)){rig.dispose();rigs.delete(id);}
   const shotIds=new Set(snapshot.shots.map(s=>s.id));for(const[id,object]of shots)if(!shotIds.has(id)){object.removeFromParent();shots.delete(id);}for(const shot of snapshot.shots){let object=shots.get(shot.id);if(!object){object=mesh(shot.magic?sphere:cylinder,shot.magic?activePortal:iron);shots.set(shot.id,object);}object.position.set(shot.position.x+shot.velocity.x*age,shot.position.y+shot.velocity.y*age,shot.position.z+shot.velocity.z*age);if(shot.magic)object.scale.setScalar(.095);else{object.scale.set(.013,.6,.013);direction.set(shot.velocity.x,shot.velocity.y,shot.velocity.z).normalize();object.quaternion.setFromUnitVectors(up,direction);}}
   for(let i=0;i<lights.length;i++)lights[i].intensity=23+Math.sin(seconds*8+i)*1.3;for(const p of portals.values())p.ring.rotation.y=seconds*.35;
   renderer.render(scene,camera);
  },
  get lost(){return contextLost;},
  dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',contextHandler);world?.dispose();ownRig.dispose();rigs.forEach(r=>r.dispose());resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.clear();renderer.renderLists.dispose();renderer.dispose();},
 };
}
