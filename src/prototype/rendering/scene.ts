import {WaterVisibilityProbe} from './water-visibility';
import {createTraversalView} from './traversal-view';
import {cameraMotion} from './camera-motion';
import {explorationCamera,type ExplorationCameraMode} from './exploration-camera';
import {createFishingView} from './fishing-view';
import * as THREE from 'three';
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
 const elementEffects=createElementEffects(scene),campaignDecor=createCampaignDecor(scene,sim),fishingView=createFishingView(scene,camera,sim),traversalView=createTraversalView(scene,camera,sim);
 const ambient=new THREE.HemisphereLight('#70829b','#33281e',.16);scene.add(ambient);
 const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#376573',roughness:.16,metalness:.1,transparent:true,opacity:.86,depthWrite:true,clearcoat:1,ior:1.333,vertexColors:false});
 const waterMesh=new THREE.Mesh(waterGeometry(sim.water),waterMaterial);waterMesh.receiveShadow=true;scene.add(waterMesh);
 const awarenessGeometry=new THREE.ConeGeometry(.1,.25,4),alertMaterial=new THREE.MeshBasicMaterial({color:'#ffd16a'}),searchMaterial=new THREE.MeshBasicMaterial({color:'#b3d6ed'});
 const creatures=sim.enemies.map(()=>{const rig=createRig(),holder=new THREE.Group();const marker=new THREE.Mesh(awarenessGeometry,alertMaterial);marker.position.y=2.15;marker.visible=false;holder.add(rig.root,marker);scene.add(holder);return {rig,holder,marker,last:new THREE.Vector3(),speed:0};});
 const thirdPerson=createRig(),playerHolder=new THREE.Group();playerHolder.add(thirdPerson.root);playerHolder.visible=false;scene.add(playerHolder);let cameraMode:ExplorationCameraMode='first',cameraDistance=3,resolvedCameraDistance=3,reducedMotion=false;
 const firstPerson=createRig(true),hands=new THREE.Group();hands.position.y=-1.52;hands.add(firstPerson.root);camera.add(hands);
 const lantern=new THREE.PointLight('#eccca6',.3,5.5,2);lantern.position.set(-.2,-.25,.05);camera.add(lantern);
 const lights:THREE.PointLight[]=[];for(const x of [-4,4]){const light=new THREE.PointLight('#ff9c51',7,10,2);light.position.set(x,2,-5);scene.add(light);lights.push(light);}
 const entrance=new THREE.PointLight('#b8c5de',2.2,9,2);entrance.position.set(0,3,2);scene.add(entrance);
 const waterVisibility=new WaterVisibilityProbe(camera,sim.arena.field,waterMesh,(x,z)=>sim.water.surface(x,z));
 let renderedFrames=0,previousWater=-1,waterElapsed=0,hour=15,weatherShelterTime=0,weatherSheltered=false;
 waterMesh.userData.reflectionVisible=false;


 return {
  renderer,camera,scene,get sheltered(){return weatherSheltered;},
  setReducedMotion(value:boolean){reducedMotion=value;},
  setCamera(mode:ExplorationCameraMode,distance:number){cameraMode=mode;cameraDistance=Math.max(1.4,Math.min(4,Number.isFinite(distance)?distance:3));},
  resize(){const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();pipeline.resize(w,h);},
  toggleDay(){hour=hour===15?20:15;if(sim.campaignMode)sim.worldHour=sim.worldHour<18?20:10;},
  setGraphics(value:'balanced'|'performance'|'high'){if(value===graphics)return;pipeline.dispose();graphics=value;pipeline=value==='high'?createPipeline(renderer,scene,camera,atmosphere):value==='performance'?createPerformancePipeline(renderer,scene,camera,atmosphere):createBalancedPipeline(renderer,scene,camera,atmosphere);pipeline.resize(canvas.clientWidth,canvas.clientHeight);},
  render(dt:number,_block:boolean,localFishing=true){
   renderedFrames++;
   const p=sim.player;if(sim.campaignMode){firstPerson.syncDamage([],sim.environment.burning,sim.environment.wet,sim.environment.shock);thirdPerson.syncDamage([],sim.environment.burning,sim.environment.wet,sim.environment.shock);firstPerson.setArmorStyle(sim.campaign.armorMaterial,sim.environment.wet);thirdPerson.setArmorStyle(sim.campaign.armorMaterial,sim.environment.wet);}const speed=Math.hypot(p.vx,p.vz),motion=cameraMotion(sim.seconds,p.stride,speed,p.impact,reducedMotion),{breath,bob}=motion;
   const third=cameraMode==='third'&&!(localFishing&&sim.fishing.selected);playerHolder.visible=third;
   if(third){const placement=explorationCamera(sim.arena.field,sim.eye(),p.yaw,p.pitch,cameraDistance,resolvedCameraDistance,dt,sim.target(7)?.hit.point);resolvedCameraDistance=placement.distance;camera.position.set(placement.position.x,placement.position.y,placement.position.z);camera.lookAt(placement.target.x,placement.target.y,placement.target.z);playerHolder.visible=placement.showBody;playerHolder.position.set(p.position.x,p.position.y,p.position.z);playerHolder.rotation.y=p.yaw;thirdPerson.update(sim.pose(),p.stride,speed,p.guard,p.tool,0,p.hp<=0?1:0,sim.campaignMode?(sim.campaign.isStaffWeapon?'staff':sim.campaign.equippedWeapon):null);}
   else{camera.position.set(p.position.x,p.position.y+1.52+breath+bob,p.position.z);camera.rotation.set(p.pitch+motion.impactPitch,p.yaw,motion.roll);}
   world.sync(p.position,1);elementEffects.update(sim.seconds,sim.elements.effects,[...sim.elements.states.values(),...sim.enemies.flatMap(e=>{const b=sim.enemyElements[e.id];return [...b.reactions.states.values()].map(s=>({...s,position:b.world(s.position,e.position,e.yaw)}));}),...sim.survival.drops.map(d=>({position:d.position,fire:d.fire??0,wet:d.wet??0,charge:d.charge??0}))],sim.survival.drops,sim.elements.shards);waterVisibility.update(dt,graphics);waterElapsed+=dt;if(previousWater!==sim.water.revision&&waterElapsed>.3){waterMesh.geometry.dispose();waterMesh.geometry=waterGeometry(sim.water);previousWater=sim.water.revision;waterElapsed=0;}
   for(const e of sim.enemies){const c=creatures[e.id],position=new THREE.Vector3(e.position.x,e.position.y,e.position.z),velocity=c.last.distanceTo(position)/Math.max(.001,dt);c.speed+=(Math.min(2,velocity)-c.speed)*(1-Math.exp(-dt*8));c.last.copy(position);c.holder.position.copy(position);c.holder.rotation.y=e.yaw;c.holder.visible=sim.enemyActive(e)&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<(graphics==='performance'?PERFORMANCE_VIEW_DISTANCE:38)&&(e.phase!=='dead'||e.time<6);if(!c.holder.visible)continue;
    const awareness=sim.enemyAwareness(e);c.marker.visible=sim.campaignMode&&(awareness==='alert'||awareness==='search');c.marker.material=awareness==='alert'?alertMaterial:searchMaterial;c.marker.rotation.z=awareness==='alert'?Math.PI:Math.PI/2;c.marker.position.y=2.15+Math.sin(sim.seconds*4)*.04;
    const body=sim.enemyElements[e.id];c.rig.syncDamage(body.scars,body.burning,body.wet,body.shock);
    c.rig.update(sim.enemyPose(e),e.stride,c.speed,0,false,e.phase==='stagger'?Math.sin(Math.min(1,e.time/.95)*Math.PI):0,e.phase==='dead'?THREE.MathUtils.smoothstep(e.time,0,.9):0,e.regional?(sim.enemyDefinition(e)?.tactic==='archer'?'bow':['caster','summoner','tidal-combo'].includes(sim.enemyDefinition(e)?.tactic??'')?'staff':null):null);
   }
   traversalView.update(third,playerHolder.visible,localFishing);fishingView.update(localFishing);hands.visible=!third&&!(localFishing&&sim.fishing.selected);
   firstPerson.update(sim.pose(),p.stride,speed,p.guard,p.tool,0,0,sim.campaignMode?(sim.campaign.isStaffWeapon?'staff':sim.campaign.equippedWeapon):null);hands.rotation.z=motion.handRoll;
   for(let i=0;i<lights.length;i++)lights[i].intensity=7+Math.sin(sim.seconds*9+i)*.35+Math.sin(sim.seconds*17+i)*.18;
   weatherShelterTime+=dt;if(weatherShelterTime>=.25){weatherShelterTime=0;weatherSheltered=sim.campaignMode&&sim.sheltered;}
   atmosphere.update({environment:{hour:sim.campaignMode?sim.worldHour:hour,seconds:sim.seconds,weather:sim.campaignMode?sim.weather.kind:'clear',sheltered:weatherSheltered},enemies:[]},camera.position);campaignDecor.update();pipeline.render(dt);
  },
  stats(){return {renderedFrames,traversal:traversalView.stats,reducedMotion,cameraMode,cameraDistance:resolvedCameraDistance,streamedWorld:sim.streamedWorld,worldResidency:world.stats,graphics,pixelRatio:renderer.getPixelRatio(),drawingBufferWidth:canvas.width,drawingBufferHeight:canvas.height,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sdfSamples:sim.arena.field.cells.size,remeshes:world.remeshes,remeshMs:world.lastRemeshMs,...pipeline.stats,...atmosphere.stats};},
  dispose(){traversalView.dispose();fishingView.dispose();campaignDecor.dispose();elementEffects.dispose();world.dispose();pipeline.dispose();atmosphere.dispose();waterMesh.geometry.dispose();waterMaterial.dispose();for(const c of creatures)c.rig.dispose();awarenessGeometry.dispose();alertMaterial.dispose();searchMaterial.dispose();firstPerson.dispose();thirdPerson.dispose();renderer.dispose();},
 };
}
