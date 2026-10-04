import * as THREE from 'three';
import type { Vec3 } from '../core/voxel';

type Element = 'fire' | 'water' | 'earth' | 'wind' | 'lightning';
interface VisualEffect { element:Element; position:Vec3; direction:Vec3; life:number; strength:number }
interface VisualState { position:Vec3; fire:number; wet:number; charge:number }
interface VisualDrop { id:number; material:number; position:Vec3; count:number }
const colors:Record<Element,string>={fire:'#ff8841',water:'#75c8f4',earth:'#d3ab74',wind:'#d9f5e1',lightning:'#d6b9ff'};
export const materialColors:Record<number,string>={2:'#c7a27b',3:'#b7bcc7',4:'#c9955e',5:'#c9955e',6:'#a9d9e6',7:'#8cac69'};
const MAX_PARTICLES=768,MAX_DROPS=192;
interface VisualShard { position:Vec3; material:number; life:number }
/** Bounded instancing: purely visual particles never edit or remesh the terrain. */
export function createElementEffects(scene:THREE.Scene){
 const particleGeometry=new THREE.IcosahedronGeometry(1,0),dropGeometry=new THREE.IcosahedronGeometry(1,1);
 const particleMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.78,depthWrite:false,toneMapped:false});
 const dropMaterial=new THREE.MeshStandardMaterial({roughness:.7,metalness:.15,emissive:'#6e6b56',emissiveIntensity:.24});
 const particles=new THREE.InstancedMesh(particleGeometry,particleMaterial,MAX_PARTICLES),drops=new THREE.InstancedMesh(dropGeometry,dropMaterial,MAX_DROPS);
 particles.frustumCulled=drops.frustumCulled=false;particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 particles.count=drops.count=0;scene.add(particles,drops);
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 let count=0;
 function particle(x:number,y:number,z:number,sx:number,sy:number,sz:number,tint:string,rotation=0){
  if(count>=MAX_PARTICLES)return;dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rotation,rotation*.7,rotation*.3);dummy.updateMatrix();particles.setMatrixAt(count,dummy.matrix);particles.setColorAt(count,color.set(tint));count++;
 }
 return {
  update(seconds:number,effects:readonly VisualEffect[],states:Iterable<VisualState>,materials:readonly VisualDrop[],shards:readonly VisualShard[]){
   count=0;
   // Authoritative depletion pulses persist even when chunks are picked up immediately.
   for(const s of shards){const t=.7-s.life,r=t*.9,fade=s.life/.7;
    for(let j=0;j<3;j++){const seed=s.position.x*7+s.position.z*11+j*2.1;
     particle(s.position.x+Math.sin(seed)*r,s.position.y+.12+t*1.2-t*t*1.8,s.position.z+Math.cos(seed)*r,.035*fade,.065*fade,.025*fade,materialColors[s.material]??'#c4b597',seed+t*5);
    }
   }
   for(let i=0;i<effects.length;i++){const e=effects[i],p=e.position,t=seconds*5+i*1.7,fade=Math.min(1,e.life*3),radius=.12+Math.min(1,e.life)*.22;
    for(let j=0;j<5;j++){const angle=t+j*Math.PI*.4,ox=Math.cos(angle)*radius,oz=Math.sin(angle)*radius;
     if(e.element==='wind')particle(p.x+ox+e.direction.x*(.7-e.life),p.y+(j-2)*.07+e.direction.y*(.7-e.life),p.z+oz+e.direction.z*(.7-e.life),.1*fade,.016*fade,.025*fade,colors.wind,angle);
     else if(e.element==='lightning')particle(p.x+ox*.5,p.y+(j-2)*.15,p.z+oz*.5,.026*fade,.13*fade,.026*fade,colors.lightning,Math.sin(angle)*.7);
     else if(e.element==='fire')particle(p.x+ox,p.y+.05+j*.09,p.z+oz,.055*fade,.12*fade,.055*fade,colors.fire,angle);
     else if(e.element==='water')particle(p.x+ox,p.y+.1+Math.sin(angle)*.15,p.z+oz,.038*fade,.09*fade,.038*fade,colors.water,angle);
     else particle(p.x+ox,p.y+.05+j*.035,p.z+oz,.075*fade,.055*fade,.055*fade,colors.earth,angle);
    }
   }
   for(const s of states){const p=s.position,t=seconds*6+p.x*2+p.z;
    if(s.fire>0)for(let j=0;j<2;j++)particle(p.x+Math.sin(t+j*3)*.08,p.y+.16+j*.1+Math.sin(t)*.025,p.z+Math.cos(t+j*3)*.08,.047,.12,.047,colors.fire,t);
    if(s.wet>0)particle(p.x,p.y+.02,p.z,.11,.018,.11,colors.water);
    if(s.charge>0)particle(p.x+Math.sin(t*3)*.08,p.y+.09,p.z+Math.cos(t*3)*.08,.025,.15,.025,colors.lightning,Math.sin(t)*.8);
   }
   particles.count=count;particles.instanceMatrix.needsUpdate=true;if(particles.instanceColor)particles.instanceColor.needsUpdate=true;
   let d=0;for(const drop of materials){if(d>=MAX_DROPS)break;const p=drop.position,size=.095+Math.min(12,drop.count)*.004;
    dummy.position.set(p.x,p.y+.08+Math.sin(seconds*2+drop.id)*.017,p.z);dummy.rotation.set(drop.id*.8,seconds*.2+drop.id,.2);dummy.scale.set(size*1.15,size*.72,size);dummy.updateMatrix();drops.setMatrixAt(d,dummy.matrix);drops.setColorAt(d,color.set(materialColors[drop.material]??'#c4b597'));d++;
   }drops.count=d;drops.instanceMatrix.needsUpdate=true;if(drops.instanceColor)drops.instanceColor.needsUpdate=true;
  },
  dispose(){scene.remove(particles,drops);particles.dispose();drops.dispose();particleGeometry.dispose();dropGeometry.dispose();particleMaterial.dispose();dropMaterial.dispose();},
 };
}
