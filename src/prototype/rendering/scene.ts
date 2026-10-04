import * as THREE from 'three';
import {REGIONAL_ENEMIES} from '../core/regions';
import type { CoreSimulation } from '../core/simulation';
import { WorldMeshes,waterGeometry } from './meshes';
import { createRig } from './rig';
import {createCampaignDecor} from './campaign-decor';
import { createElementEffects } from './element-effects';
import { createAtmosphere } from '../../rendering/environment/atmosphere';
import {createPerformancePipeline,PERFORMANCE_VIEW_DISTANCE} from './performance-pipeline';
import {createBalancedPipeline} from './balanced-pipeline';
import { createPipeline } from '../../rendering/postprocessing/pipeline';
export function createView(canvas:HTMLCanvasElement,sim:CoreSimulation){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.info.autoReset=false;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(74,1,.035,120);camera.rotation.order='YXZ';scene.add(camera);
 const atmosphere=createAtmosphere(scene,renderer);let graphics:'balanced'|'performance'|'high'='balanced',pipeline:ReturnType<typeof createPipeline>|ReturnType<typeof createBalancedPipeline>|ReturnType<typeof createPerformancePipeline>=createBalancedPipeline(renderer,scene,camera,atmosphere);const world=new WorldMeshes(sim.arena.field,scene);world.sync();
 const elementEffects=createElementEffects(scene),campaignDecor=createCampaignDecor(scene,sim);
 const ambient=new THREE.HemisphereLight('#70829b','#33281e',.16);scene.add(ambient);
 const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#376573',roughness:.16,metalness:.1,transparent:true,opacity:.86,depthWrite:true,clearcoat:1,ior:1.333,vertexColors:false});
 const waterMesh=new THREE.Mesh(waterGeometry(sim.water),waterMaterial);waterMesh.receiveShadow=true;scene.add(waterMesh);
 const creatures=sim.enemies.map(()=>{const rig=createRig(),holder=new THREE.Group();holder.add(rig.root);scene.add(holder);return {rig,holder,last:new THREE.Vector3(),speed:0};});
 const firstPerson=createRig(true),hands=new THREE.Group();hands.position.y=-1.52;hands.add(firstPerson.root);camera.add(hands);
 const lantern=new THREE.PointLight('#eccca6',.3,5.5,2);lantern.position.set(-.2,-.25,.05);camera.add(lantern);
 const lights:THREE.PointLight[]=[];for(const x of [-4,4]){const light=new THREE.PointLight('#ff9c51',7,10,2);light.position.set(x,2,-5);scene.add(light);lights.push(light);}
 const entrance=new THREE.PointLight('#b8c5de',2.2,9,2);entrance.position.set(0,3,2);scene.add(entrance);
 const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
 let renderedFrames=0,previousWater=-1,waterElapsed=0,hour=15,visibilityTime=0;
 waterMesh.userData.reflectionVisible=false;
 function updateWaterVisibility(){camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);let visible=false;
  for(const x of [4.25,5.5,7.25,9.5])for(const z of [-4.75,-2,.75]){const h=sim.water.surface(x,z);if(!Number.isFinite(h))continue;const point=new THREE.Vector3(x,h+.015,z);if(!frustum.containsPoint(point))continue;const dx=x-camera.position.x,dy=point.y-camera.position.y,dz=z-camera.position.z,d=Math.hypot(dx,dy,dz),hit=sim.arena.field.ray({x:camera.position.x,y:camera.position.y,z:camera.position.z},{x:dx,y:dy,z:dz},d);
   if(!hit||hit.distance>d-.04){visible=true;break;}
  }waterMesh.userData.reflectionVisible=visible;
 }

 return {
  renderer,camera,scene,
  resize(){const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();pipeline.resize(w,h);},
  toggleDay(){hour=hour===15?20:15;if(sim.campaignMode)sim.worldHour=sim.worldHour<18?20:10;},
  setGraphics(value:'balanced'|'performance'|'high'){if(value===graphics)return;pipeline.dispose();graphics=value;pipeline=value==='high'?createPipeline(renderer,scene,camera,atmosphere):value==='performance'?createPerformancePipeline(renderer,scene,camera,atmosphere):createBalancedPipeline(renderer,scene,camera,atmosphere);pipeline.resize(canvas.clientWidth,canvas.clientHeight);},
  render(dt:number,_block:boolean){
   renderedFrames++;
   const p=sim.player,speed=Math.hypot(p.vx,p.vz),breath=Math.sin(sim.seconds*1.7)*.002,bob=Math.sin(p.stride*2)*Math.min(.008,speed*.003);
   camera.position.set(p.position.x,p.position.y+1.52+breath+bob,p.position.z);camera.rotation.set(p.pitch+p.impact*.006,p.yaw,Math.sin(p.stride)*Math.min(.003,speed*.001));
   world.sync(p.position,1);elementEffects.update(sim.seconds,sim.elements.effects,[...sim.elements.states.values(),...sim.enemies.flatMap(e=>{const b=sim.enemyElements[e.id];return [...b.reactions.states.values()].map(s=>({...s,position:b.world(s.position,e.position,e.yaw)}));}),...sim.survival.drops.map(d=>({position:d.position,fire:d.fire??0,wet:d.wet??0,charge:d.charge??0}))],sim.survival.drops,sim.elements.shards);visibilityTime+=dt;if(visibilityTime>=(graphics==='performance'?1:.2)){visibilityTime=0;if(graphics==='high')updateWaterVisibility();}waterElapsed+=dt;if(previousWater!==sim.water.revision&&waterElapsed>.3){waterMesh.geometry.dispose();waterMesh.geometry=waterGeometry(sim.water);previousWater=sim.water.revision;waterElapsed=0;}
   for(const e of sim.enemies){const c=creatures[e.id],position=new THREE.Vector3(e.position.x,e.position.y,e.position.z),velocity=c.last.distanceTo(position)/Math.max(.001,dt);c.speed+=(Math.min(2,velocity)-c.speed)*(1-Math.exp(-dt*8));c.last.copy(position);c.holder.position.copy(position);c.holder.rotation.y=e.yaw;c.holder.visible=sim.enemyActive(e)&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<(graphics==='performance'?PERFORMANCE_VIEW_DISTANCE:38)&&(e.phase!=='dead'||e.time<6);if(!c.holder.visible)continue;
    const body=sim.enemyElements[e.id];c.rig.syncDamage(body.scars,body.burning,body.wet,body.shock);
    c.rig.update(sim.enemyPose(e),e.stride,c.speed,0,false,e.phase==='stagger'?Math.sin(Math.min(1,e.time/.95)*Math.PI):0,e.phase==='dead'?THREE.MathUtils.smoothstep(e.time,0,.9):0,e.regional?(REGIONAL_ENEMIES.find(d=>d.id===e.regional)?.tactic==='archer'?'bow':['caster','summoner','tidal-combo'].includes(REGIONAL_ENEMIES.find(d=>d.id===e.regional)?.tactic??'')?'staff':null):null);
   }
   firstPerson.update(sim.pose(),p.stride,speed,p.guard,p.tool,0,0,sim.campaignMode?sim.campaign.equippedWeapon:null);hands.rotation.z=-p.impact*.012;
   for(let i=0;i<lights.length;i++)lights[i].intensity=7+Math.sin(sim.seconds*9+i)*.35+Math.sin(sim.seconds*17+i)*.18;
   atmosphere.update({environment:{hour:sim.campaignMode?sim.worldHour:hour,seconds:sim.seconds,weather:sim.campaignMode&&sim.player.position.z<-44?'snow':'clear'},enemies:[]},camera.position);campaignDecor.update();pipeline.render(dt);
  },
  stats(){return {renderedFrames,graphics,pixelRatio:renderer.getPixelRatio(),drawingBufferWidth:canvas.width,drawingBufferHeight:canvas.height,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sdfSamples:sim.arena.field.cells.size,remeshes:world.remeshes,remeshMs:world.lastRemeshMs,...pipeline.stats,...atmosphere.stats};},
  dispose(){campaignDecor.dispose();elementEffects.dispose();world.dispose();pipeline.dispose();atmosphere.dispose();waterMesh.geometry.dispose();waterMaterial.dispose();for(const c of creatures)c.rig.dispose();firstPerson.dispose();renderer.dispose();},
 };
}
