import * as THREE from 'three';
import { VoxelField } from '../core/voxel';
import type { CoreSimulation } from '../core/simulation';
import { WorldMeshes,voxelGeometry,waterGeometry } from './meshes';
import { createAtmosphere } from '../../rendering/environment/atmosphere';
import { createPipeline } from '../../rendering/postprocessing/pipeline';
export function createView(canvas:HTMLCanvasElement,sim:CoreSimulation){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(78,1,.04,120);camera.rotation.order='YXZ';scene.add(camera);
 const atmosphere=createAtmosphere(scene,renderer),pipeline=createPipeline(renderer,scene,camera,atmosphere),world=new WorldMeshes(sim.arena.field,scene);world.sync();
 const ambient=new THREE.HemisphereLight('#bfcada','#26241d',.45);scene.add(ambient);
 const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#437a90',roughness:.18,metalness:.1,transparent:true,opacity:.83,depthWrite:true,clearcoat:1,ior:1.333});
 const waterMesh=new THREE.Mesh(waterGeometry(sim.water),waterMaterial);waterMesh.receiveShadow=true;scene.add(waterMesh);
 const creatureMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.35});
 const creatures=sim.enemies.map(e=>{const m=new THREE.Mesh(voxelGeometry(sim.enemyShape),creatureMaterial);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;});
 const steel=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:.65});
 function weapon(tool=false){const f=new VoxelField(.0625);if(tool){f.box({x:-.04,y:-.25,z:-.08},{x:.04,y:.28,z:.04},4);f.box({x:-.2,y:.2,z:-.08},{x:.2,y:.33,z:.04},6);}else {f.box({x:-.04,y:-.2,z:-.04},{x:.04,y:.12,z:.04},4);f.box({x:-.18,y:.1,z:-.06},{x:.18,y:.16,z:.06},5);f.box({x:-.055,y:.16,z:-.025},{x:.055,y:.85,z:.025},6);f.box({x:-.03,y:.85,z:-.025},{x:.03,y:.96,z:.025},6);}return voxelGeometry(f);}
 const blade=new THREE.Mesh(weapon(),steel);const toolGeometry=weapon(true),bladeGeometry=blade.geometry;blade.position.set(.35,-.52,-.48);blade.rotation.set(-.4,0,-.18);camera.add(blade);
 const shieldField=new VoxelField(.0625);shieldField.box({x:-.22,y:-.28,z:0},{x:.22,y:.28,z:.0625},4);shieldField.box({x:-.0625,y:-.25,z:-.0625},{x:.0625,y:.25,z:0},6);
 const shield=new THREE.Mesh(voxelGeometry(shieldField),steel);shield.position.set(-.48,-.5,-.65);camera.add(shield);
 const lights:THREE.PointLight[]=[];for(const x of [-4,4]){const light=new THREE.PointLight('#ff9144',7,7,2);light.position.set(x,2,-5);scene.add(light);lights.push(light);}
 let previousWater=-1,waterElapsed=0,lastTool=false,hour=15;
 return {
  renderer,camera,scene,
  resize(){const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();pipeline.resize(w,h);},
  toggleDay(){hour=hour===15?23:15;},
  render(dt:number,block:boolean){
   const p=sim.player;camera.position.set(p.position.x,p.position.y+1.52,p.position.z);camera.rotation.set(p.pitch,p.yaw,0);
   world.sync();waterElapsed+=dt;if(previousWater!==sim.water.revision&&waterElapsed>.2){waterMesh.geometry.dispose();waterMesh.geometry=waterGeometry(sim.water);previousWater=sim.water.revision;waterElapsed=0;}
   for(const e of sim.enemies){const m=creatures[e.id];m.position.set(e.position.x,e.position.y,e.position.z);m.rotation.set(e.phase==='windup'?.12:e.phase==='strike'?-.24:0,e.yaw,e.phase==='stagger'?.17:0);m.visible=e.hp>0;m.scale.y=e.phase==='windup'?.96:1;}
   if(lastTool!==p.tool){blade.geometry=p.tool?toolGeometry:bladeGeometry;lastTool=p.tool;}
   const wind=p.phase==='windup'?Math.min(1,p.time/(p.heavy?.46:.22)):p.phase==='strike'?1-p.time/.15:0;
   blade.position.set(.35-wind*.18,-.52+wind*.15,-.48);blade.rotation.set(-.4+(p.phase==='strike'?-1.6*wind:.7*wind),0,-.18+(p.phase==='strike'?-1.2*wind:.6*wind));
   shield.visible=!p.tool;shield.position.set(block?-.21:-.48,block?-.12:-.5,block?-.5:-.65);shield.rotation.y=block?.2:.5;
   atmosphere.update({environment:{hour,seconds:sim.seconds,weather:'clear'},enemies:[]},camera.position);pipeline.render(dt);
  },
  stats(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,...pipeline.stats,...atmosphere.stats};},
  dispose(){world.dispose();pipeline.dispose();atmosphere.dispose();waterMesh.geometry.dispose();waterMaterial.dispose();for(const m of creatures)m.geometry.dispose();creatureMaterial.dispose();bladeGeometry.dispose();toolGeometry.dispose();shield.geometry.dispose();steel.dispose();renderer.dispose();},
 };
}
