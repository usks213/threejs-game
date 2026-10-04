import { smokeColumn } from '../../game/meadows/smoke';
import { COOKING } from '../../content/meadows/data';
import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import type { Vec3 } from '../../world/types';
/** Small readable details; textures are generated only when sign text changes. */
export function campDetails(scene:THREE.Scene){
 const lights=Array.from({length:3},()=>{const light=new THREE.PointLight('#ff9b46',0,9,2);scene.add(light);return light;});
 const meatGeometry=new THREE.IcosahedronGeometry(.14,1),meatMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.8}),meat=new THREE.InstancedMesh(meatGeometry,meatMaterial,32),dummy=new THREE.Object3D(),color=new THREE.Color();meat.frustumCulled=false;scene.add(meat);
 const signs=new Map<number,{mesh:THREE.Mesh;texture:THREE.CanvasTexture;text:string}>();
 const signGeometry=new THREE.PlaneGeometry(1.1,.55);
 const lineGeometry=new THREE.BufferGeometry(),linePoints=new Float32Array(9*3);lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePoints,3));
 const lineMaterial=new THREE.LineBasicMaterial({color:'#eadbb7',transparent:true,opacity:.8});
 const line=new THREE.Line(lineGeometry,lineMaterial),floatGeometry=new THREE.SphereGeometry(.065,6,4),floatMaterial=new THREE.MeshStandardMaterial({color:'#db5935',roughness:.65});
 const bobber=new THREE.Mesh(floatGeometry,floatMaterial);line.frustumCulled=false;scene.add(line,bobber);line.visible=bobber.visible=false;
 const smokeGeometry=new THREE.BufferGeometry(),smokePositions=new Float32Array(32*3);smokeGeometry.setAttribute('position',new THREE.BufferAttribute(smokePositions,3));
 const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=32;const ctx=smokeCanvas.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,1,16,16,16);gradient.addColorStop(0,'rgba(180,179,166,0.35)');gradient.addColorStop(1,'rgba(180,179,166,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
 const smokeMap=new THREE.CanvasTexture(smokeCanvas),smokeMaterial=new THREE.PointsMaterial({map:smokeMap,size:1.2,transparent:true,opacity:.35,depthWrite:false,color:'#aaa99d'}),smoke=new THREE.Points(smokeGeometry,smokeMaterial);smoke.frustumCulled=false;scene.add(smoke);
 const remove=(id:number)=>{const sign=signs.get(id);if(sign){scene.remove(sign.mesh);(sign.mesh.material as THREE.Material).dispose();sign.texture.dispose();signs.delete(id);}};
 return {
 update(s:AdventureSnapshot,p?:Vec3){
  const fires=s.buildings.filter(b=>['fire','standingTorch'].includes(b.definition)&&(b.fuel??0)>0&&!b.open).sort((a,b)=>p?Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z):a.id-b.id);for(let i=0;i<lights.length;i++){const b=fires[i];lights[i].intensity=b?12+Math.sin(s.seconds*8+b.id)*2:0;if(b)lights[i].position.set(b.x,b.y+(b.definition==='fire'?.6:1.5),b.z);}
  let chunks=0;for(const b of s.buildings)if(b.cooking&&(!p||Math.hypot(b.x-p.x,b.z-p.z)<25))for(let i=0;i<b.cooking.length&&chunks<32;i++){const c=b.cooking[i],raw=c.time<COOKING[c.id].seconds,burn=c.time>=COOKING[c.id].seconds*2;dummy.position.set(b.x+(i-.5)*.5*Math.cos(b.rotation),b.y+.8,b.z-(i-.5)*.5*Math.sin(b.rotation));dummy.scale.set(.75,1.5,.75);dummy.updateMatrix();meat.setMatrixAt(chunks,dummy.matrix);meat.setColorAt(chunks,color.set(burn?'#251e18':raw?'#b55e4e':'#986133'));chunks++;}meat.count=chunks;meat.instanceMatrix.needsUpdate=true;if(meat.instanceColor)meat.instanceColor.needsUpdate=true;
  const live=new Set<number>();
  for(const b of s.buildings)if(b.definition==='sign'&&b.label&&(!p||Math.hypot(b.x-p.x,b.z-p.z)<30)){
   live.add(b.id);let sign=signs.get(b.id);
   if(!sign||sign.text!==b.label){remove(b.id);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d')!;c.fillStyle='#392b1e';c.fillRect(0,0,512,256);c.fillStyle='#f4e3b7';c.textAlign='center';c.textBaseline='middle';c.font='bold 34px sans-serif';const letters=[...b.label];for(let i=0;i<3;i++)c.fillText(letters.slice(i*14,i*14+14).join(''),256,55+i*70,490);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(signGeometry,new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide}));sign={mesh,texture,text:b.label};signs.set(b.id,sign);scene.add(mesh);}
   sign.mesh.position.set(b.x+Math.sin(b.rotation)*.09,b.y+1.1,b.z+Math.cos(b.rotation)*.09);sign.mesh.rotation.y=b.rotation;
  }
  for(const id of signs.keys())if(!live.has(id))remove(id);
  const f=s.meadows?.fishing,fish=f&&s.resources.find(n=>n.id===f.fish);line.visible=bobber.visible=!!(p&&f&&fish);
  if(p&&f&&fish){const progress=f.phase==='fight'?f.progress:0,x=fish.x+(p.x-fish.x)*progress*.85,z=fish.z+(p.z-fish.z)*progress*.85,y=fish.y+.3+(f.phase==='bite'?-Math.abs(Math.sin(s.seconds*12))*.18:Math.sin(s.seconds*3)*.025);bobber.position.set(x,y,z);for(let i=0;i<9;i++){const t=i/8;linePoints[i*3]=p.x+(x-p.x)*t;linePoints[i*3+1]=p.y+1.7+(y-p.y-1.7)*t-Math.sin(t*Math.PI)*(f.reeling?.12:.4);linePoints[i*3+2]=p.z+(z-p.z)*t;}lineGeometry.getAttribute('position').needsUpdate=true;}
  let count=0;for(const b of s.buildings)if(['fire','standingTorch'].includes(b.definition)&&(b.fuel??0)>0&&!b.open&&(!p||Math.hypot(b.x-p.x,b.z-p.z)<24)){const column=smokeColumn(b,s.buildings,s.seconds);for(let i=0;i<4&&count<32;i++){const age=(s.seconds*.55+i*.6+b.id*.13)%2.4;smokePositions[count*3]=b.x+Math.sin(age*2+i)*age*.15;smokePositions[count*3+1]=Math.min(b.y+.5+age,column.ceiling===null?Infinity:column.ceiling-.15);smokePositions[count*3+2]=b.z+Math.cos(age+i)*age*.15;count++;}}smokeGeometry.setDrawRange(0,count);smokeGeometry.getAttribute('position').needsUpdate=true;
 },
 dispose(){for(const id of signs.keys())remove(id);scene.remove(line,bobber,smoke,meat,...lights);meat.dispose();meatGeometry.dispose();meatMaterial.dispose();for(const g of [signGeometry,lineGeometry,floatGeometry,smokeGeometry])g.dispose();for(const m of [lineMaterial,floatMaterial,smokeMaterial])m.dispose();smokeMap.dispose();}
 };
}
