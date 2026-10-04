import * as THREE from 'three';
import type { CoreSimulation } from '../core/simulation';
import { WorldMeshes,waterGeometry } from './meshes';
import { createRig } from './rig';
import { createAtmosphere } from '../../rendering/environment/atmosphere';
import { createPipeline } from '../../rendering/postprocessing/pipeline';
export function createView(canvas:HTMLCanvasElement,sim:CoreSimulation){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(74,1,.035,120);camera.rotation.order='YXZ';scene.add(camera);
 const atmosphere=createAtmosphere(scene,renderer),pipeline=createPipeline(renderer,scene,camera,atmosphere),world=new WorldMeshes(sim.arena.field,scene);world.sync();
 const ambient=new THREE.HemisphereLight('#70829b','#33281e',.16);scene.add(ambient);
 const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#376573',roughness:.16,metalness:.1,transparent:true,opacity:.86,depthWrite:true,clearcoat:1,ior:1.333,vertexColors:false});
 const waterMesh=new THREE.Mesh(waterGeometry(sim.water),waterMaterial);waterMesh.receiveShadow=true;scene.add(waterMesh);
 const creatures=sim.enemies.map(()=>{const rig=createRig(),holder=new THREE.Group();holder.add(rig.root);scene.add(holder);return {rig,holder,last:new THREE.Vector3(),speed:0};});
 const firstPerson=createRig(true),hands=new THREE.Group();hands.position.y=-1.52;hands.add(firstPerson.root);camera.add(hands);
 const lantern=new THREE.PointLight('#eccca6',2.5,5.5,2);lantern.position.set(-.2,-.25,.05);camera.add(lantern);
 const lights:THREE.PointLight[]=[];for(const x of [-4,4]){const light=new THREE.PointLight('#ff9c51',23,10,2);light.position.set(x,2,-5);scene.add(light);lights.push(light);}
 const entrance=new THREE.PointLight('#b8c5de',9,9,2);entrance.position.set(0,3,2);scene.add(entrance);
 let previousWater=-1,waterElapsed=0,hour=20;
 return {
  renderer,camera,scene,
  resize(){const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();pipeline.resize(w,h);},
  toggleDay(){hour=hour===15?20:15;},
  render(dt:number,_block:boolean){
   const p=sim.player,speed=Math.hypot(p.vx,p.vz),breath=Math.sin(sim.seconds*1.7)*.002,bob=Math.sin(p.stride*2)*Math.min(.008,speed*.003);
   camera.position.set(p.position.x,p.position.y+1.52+breath+bob,p.position.z);camera.rotation.set(p.pitch+p.impact*.006,p.yaw,Math.sin(p.stride)*Math.min(.003,speed*.001));
   world.sync();waterElapsed+=dt;if(previousWater!==sim.water.revision&&waterElapsed>.3){waterMesh.geometry.dispose();waterMesh.geometry=waterGeometry(sim.water);previousWater=sim.water.revision;waterElapsed=0;}
   for(const e of sim.enemies){const c=creatures[e.id],position=new THREE.Vector3(e.position.x,e.position.y,e.position.z),velocity=c.last.distanceTo(position)/Math.max(.001,dt);c.speed+=(Math.min(2,velocity)-c.speed)*(1-Math.exp(-dt*8));c.last.copy(position);c.holder.position.copy(position);c.holder.rotation.y=e.yaw;c.holder.visible=e.phase!=='dead'||e.time<6;
    c.rig.update(sim.enemyPose(e),e.stride,c.speed,0,false,e.phase==='stagger'?Math.sin(Math.min(1,e.time/.95)*Math.PI):0,e.phase==='dead'?THREE.MathUtils.smoothstep(e.time,0,.9):0);
   }
   firstPerson.update(sim.pose(),p.stride,speed,p.guard,p.tool);hands.rotation.z=-p.impact*.012;
   for(let i=0;i<lights.length;i++)lights[i].intensity=23+Math.sin(sim.seconds*9+i)*1.3+Math.sin(sim.seconds*17+i)*.7;
   atmosphere.update({environment:{hour,seconds:sim.seconds,weather:'clear'},enemies:[]},camera.position);pipeline.render(dt);
  },
  stats(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sdfSamples:sim.arena.field.cells.size,remeshes:world.remeshes,remeshMs:world.lastRemeshMs,...pipeline.stats,...atmosphere.stats};},
  dispose(){world.dispose();pipeline.dispose();atmosphere.dispose();waterMesh.geometry.dispose();waterMaterial.dispose();for(const c of creatures)c.rig.dispose();firstPerson.dispose();renderer.dispose();},
 };
}
