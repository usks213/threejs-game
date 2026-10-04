import * as THREE from 'three';
import { VoxelField,capsule,ellipsoid,roundedBox,type Vec3 } from '../core/voxel';
import type { WeaponPose } from '../core/motion';
import { voxelGeometry } from './meshes';
const sharedGeometry=new Map<string,{geometry:THREE.BufferGeometry;users:number}>();
const up=new THREE.Vector3(0,1,0),vec=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
/** Every rigid skin part is an extracted SDF voxel asset. Joints articulate the resulting meshes. */
export function createRig(firstPerson=false){
 const editable:{mesh:THREE.Mesh;size:number;author:(f:VoxelField)=>void;field?:VoxelField}[]=[];let appliedScars=0;
 const root=new THREE.Group(),resources:string[]=[],materials=[new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.12}),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.72})];
 function asset(size:number,author:(f:VoxelField)=>void,metal=false){const id=size+author.toString();let shared=sharedGeometry.get(id);if(!shared){const f=new VoxelField(size);author(f);shared={geometry:voxelGeometry(f),users:0};sharedGeometry.set(id,shared);}shared.users++;resources.push(id);const mesh=new THREE.Mesh(shared.geometry,materials[metal?1:0]);mesh.castShadow=!firstPerson;mesh.receiveShadow=true;root.add(mesh);editable.push({mesh,size,author});return mesh;}
 const orb=(f:VoxelField,c:Vec3,r:Vec3,m:number)=>f.shape({x:c.x-r.x,y:c.y-r.y,z:c.z-r.z},{x:c.x+r.x,y:c.y+r.y,z:c.z+r.z},ellipsoid(c,r),m);
 const limb=(f:VoxelField,a:Vec3,b:Vec3,r:number,m:number)=>f.shape({x:Math.min(a.x,b.x)-r,y:Math.min(a.y,b.y)-r,z:Math.min(a.z,b.z)-r},{x:Math.max(a.x,b.x)+r,y:Math.max(a.y,b.y)+r,z:Math.max(a.z,b.z)+r},capsule(a,b,r),m);
 const torso=asset(.0625,f=>{orb(f,{x:0,y:0,z:0},{x:.29,y:.33,z:.18},10);orb(f,{x:0,y:.08,z:-.05},{x:.26,y:.26,z:.16},6);f.box({x:-.27,y:-.23,z:-.21},{x:.27,y:-.16,z:.16},12,undefined,.025);},true);
 const pelvis=asset(.0625,f=>orb(f,{x:0,y:0,z:0},{x:.27,y:.18,z:.17},12));
 const head=asset(.03125,f=>{orb(f,{x:0,y:0,z:0},{x:.16,y:.2,z:.17},6);f.box({x:-.13,y:-.04,z:-.19},{x:.13,y:.008,z:-.15},10,undefined,.008);orb(f,{x:0,y:-.14,z:-.02},{x:.11,y:.075,z:.14},6);},true);
 const shoulderMeshes=[-1,1].map(()=>asset(.03125,f=>orb(f,{x:0,y:0,z:0},{x:.15,y:.13,z:.15},6),true));
 const upperArms=[-1,1].map(()=>asset(.03125,f=>{limb(f,{x:0,y:0,z:0},{x:0,y:.34,z:0},.085,12);orb(f,{x:0,y:.3,z:0},{x:.1,y:.11,z:.1},6);}));
 const forearms=[-1,1].map(()=>asset(.03125,f=>{limb(f,{x:0,y:0,z:0},{x:0,y:.34,z:0},.08,6);f.box({x:-.09,y:.23,z:-.09},{x:.09,y:.27,z:.09},12,undefined,.025);},true));
 const hands=[-1,1].map(()=>asset(.025,f=>orb(f,{x:0,y:0,z:0},{x:.065,y:.09,z:.067},12)));
 const thighs=[-1,1].map(()=>asset(.0625,f=>limb(f,{x:0,y:0,z:0},{x:0,y:.34,z:0},.13,10)));
 const calves=[-1,1].map(()=>asset(.0625,f=>{limb(f,{x:0,y:0,z:0},{x:0,y:.34,z:0},.1,10);orb(f,{x:0,y:.28,z:-.04},{x:.12,y:.09,z:.1},6);},true));
 const boots=[-1,1].map(()=>asset(.03125,f=>orb(f,{x:0,y:.07,z:-.07},{x:.12,y:.12,z:.22},12)));
 const sword=asset(.0125,f=>{
  f.shape({x:-.06,y:0,z:-.025},{x:.06,y:1.06,z:.025},p=>{const width=p.y<.91?.048-p.y*.006:Math.max(.001,(1.065-p.y)*.28);return Math.max((Math.abs(p.x)/width+Math.abs(p.z)/.024-1)*.024,-p.y,p.y-1.05);},6);
  limb(f,{x:-.18,y:0,z:0},{x:.18,y:0,z:0},.028,5);limb(f,{x:0,y:-.2,z:0},{x:0,y:-.02,z:0},.03,12);orb(f,{x:0,y:-.23,z:0},{x:.045,y:.045,z:.045},5);
 },true);
 const chisel=asset(.025,f=>{limb(f,{x:0,y:-.18,z:0},{x:0,y:.35,z:0},.035,4);f.box({x:-.05,y:.28,z:-.025},{x:.05,y:.48,z:.025},6,undefined,.009);},true);
 const shield=asset(.03125,f=>{
  f.shape({x:-.32,y:-.45,z:-.07},{x:.32,y:.45,z:.07},p=>Math.max((Math.hypot(p.x/(.3*(p.y<0?1+p.y*.75:1)),p.y/.43)-1)*.27,Math.abs(p.z)-.055),4);
  orb(f,{x:0,y:0,z:-.06},{x:.12,y:.13,z:.075},6);for(const x of [-.23,.23])limb(f,{x,y:-.12,z:-.045},{x:x*.75,y:.24,z:-.045},.025,6);
 });
 const flask=asset(.025,f=>{orb(f,{x:0,y:0,z:0},{x:.085,y:.13,z:.075},8);limb(f,{x:0,y:.1,z:0},{x:0,y:.21,z:0},.04,5);});
 if(firstPerson)for(const mesh of [torso,pelvis,head,...thighs,...calves,...boots,...shoulderMeshes])mesh.visible=false;
 function link(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const d=b.clone().sub(a);mesh.position.copy(a);mesh.quaternion.setFromUnitVectors(up,d.clone().normalize());mesh.scale.set(1,d.length()/.34,1);}
 function arm(side:number,shoulder:THREE.Vector3,hand:THREE.Vector3){if(shoulder.distanceTo(hand)>.66)shoulder.addScaledVector(hand.clone().sub(shoulder).normalize(),shoulder.distanceTo(hand)-.66);
  const index=side<0?0:1,delta=hand.clone().sub(shoulder),distance=Math.min(.67,delta.length()),dir=delta.normalize(),upper=.34,lower=.34,along=distance*.5,bend=Math.sqrt(Math.max(.003,upper*upper-along*along));
  const pole=new THREE.Vector3(side*.75,-.6,.45),perpendicular=pole.addScaledVector(dir,-pole.dot(dir)).normalize(),elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(perpendicular,bend);
  // Two-bone IK keeps fingers on the hilt instead of independently rotating a sword billboard.
  const reachable=shoulder.clone().addScaledVector(dir,Math.min(upper+lower-.01,shoulder.distanceTo(hand)));
  shoulderMeshes[index].position.copy(shoulder);link(upperArms[index],shoulder,elbow);link(forearms[index],elbow,reachable);hands[index].position.copy(hand);hands[index].quaternion.copy(side>0?sword.quaternion:shield.quaternion);
 }
 return {
  root,
  syncDamage(scars:readonly Vec3[],fire:number,wet:number,shock:number){for(const m of materials){m.emissive.set(shock>0?'#796acc':fire>0?'#6e2108':'#000000');m.emissiveIntensity=shock>0?.9:fire>0?.5:0;m.roughness=wet>0?.24:.7;}
   const end=Math.min(scars.length,appliedScars+16);for(const item of editable){if([sword,chisel,shield,flask].some(mesh=>mesh===item.mesh))continue;item.mesh.updateMatrix();let changed=false;for(let i=appliedScars;i<end;i++){const local=vec(scars[i]).applyMatrix4(item.mesh.matrix.clone().invert());if(!item.mesh.geometry.boundingBox)item.mesh.geometry.computeBoundingBox();const bounds=item.mesh.geometry.boundingBox;if(!bounds||bounds.distanceToPoint(local)>.12)continue;if(!item.field){item.field=new VoxelField(item.size);item.author(item.field);}item.field.carve({x:local.x,y:local.y,z:local.z},.085);changed=true;}if(changed&&item.field){if(item.mesh.userData.privateGeometry)item.mesh.geometry.dispose();item.mesh.geometry=voxelGeometry(item.field);item.mesh.userData.privateGeometry=true;}}appliedScars=end;
  },
  update(pose:WeaponPose,stride:number,speed:number,guard:number,tool=false,stagger=0,dead=0){
   const gait=Math.sin(stride)*Math.min(1,speed/1.4),bob=Math.abs(Math.sin(stride))*.018*Math.min(1,speed),lean=pose.lean+stagger*.16;
   torso.position.set(0,1.16+bob,lean*.4);torso.rotation.set(lean,pose.twist,stagger*.14);pelvis.position.set(0,.82+bob,0);pelvis.rotation.y=pose.twist*.45;head.position.set(0,1.66+bob,lean*.65);head.rotation.set(-lean*.4,pose.twist*.3,stagger*.12);
   const shoulders=[-1,1].map(side=>new THREE.Vector3(side*.29,1.39+bob,.015).applyAxisAngle(up,pose.twist).add(new THREE.Vector3(0,0,lean*.4)));
   const grip=vec(pose.grip),tip=vec(pose.tip);sword.position.copy(grip);sword.quaternion.setFromUnitVectors(up,tip.sub(grip).normalize());chisel.position.copy(grip);chisel.quaternion.copy(sword.quaternion);sword.visible=!tool&&pose.drink===undefined;chisel.visible=tool&&pose.drink===undefined;flask.visible=pose.drink!==undefined;flask.position.copy(grip);flask.rotation.set(-(pose.drink??0)*.85,0,-.1); 
   const left=new THREE.Vector3(-.38+guard*.2,(firstPerson?.85:1.02)+guard*(firstPerson?.54:.37),-.31-guard*.15);shield.position.copy(left).add(new THREE.Vector3(0,.015,-.09));shield.rotation.set(-.08,-.18+guard*.22,.13);shield.visible=!tool;
   arm(1,shoulders[1],grip);arm(-1,shoulders[0],left);
   for(let i=0;i<2;i++){const side=i?1:-1,phase=gait*side,hip=new THREE.Vector3(side*.16,.85+bob,0),knee=new THREE.Vector3(side*.17,.45+Math.max(0,phase)*.08,-phase*.12),foot=new THREE.Vector3(side*.18,Math.max(0,phase)*.07,-phase*.23+pose.step*(i?1:-.35));link(thighs[i],knee,hip);link(calves[i],foot,knee);boots[i].position.copy(foot);boots[i].rotation.x=-Math.max(0,phase)*.2;}
   root.rotation.z=dead*.9;root.position.y=-dead*.65;
  },
  dispose(){for(const item of editable)if(item.mesh.userData.privateGeometry)item.mesh.geometry.dispose();for(const id of resources){const item=sharedGeometry.get(id)!;if(--item.users===0){item.geometry.dispose();sharedGeometry.delete(id);}}for(const m of materials)m.dispose();},
 };
}
