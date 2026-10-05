import {ADVENTURE_REGIONS} from '../../environment/adventure';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { captureProbe } from './probe';
import { createDirectEnvironment } from './direct-environment';
import type { AdventureSnapshot } from '../../game/types';

/** Preetham Rayleigh/Mie sky, filtered HDR environment and 3-band spherical-harmonic diffuse light. */
export function createAtmosphere(scene: THREE.Scene, renderer:THREE.WebGLRenderer) {
 const sky=new Sky();sky.scale.setScalar(450000);sky.renderOrder=-2;sky.frustumCulled=false;
 const u=sky.material.uniforms;u.sunPosition.value.set(300000,300000,-100000);u.rayleigh.value=3.2;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.8;
 u.nightAmount={value:0};u.cloudCover={value:0};u.skyTime={value:0};
 sky.material.fragmentShader='uniform float nightAmount,cloudCover,skyTime;\n'+sky.material.fragmentShader;
 sky.material.fragmentShader=sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );',`
  float stars=step(.9987,fract(sin(dot(floor(direction*380.),vec3(12.98,78.23,45.1)))*43758.54))*smoothstep(0.,.15,direction.y);
  float moon=pow(max(dot(direction,-vSunDirection),0.),2400.);
  vec3 night=vec3(.003,.006,.014)+stars*.08+vec3(.5,.65,1.)*moon*2.;
  retColor=mix(retColor,night,nightAmount);
  vec2 q=direction.xz/max(.15,direction.y)*2.+vec2(skyTime*.005,0.);
  float cloud=smoothstep(.15,.8,sin(q.x+sin(q.y*.8))*sin(q.y*.7)+sin(q.x*2.+q.y)*.25)*smoothstep(.0,.2,direction.y)*cloudCover;
  retColor=mix(retColor,mix(vec3(.75,.8,.86),vec3(.007,.009,.014),nightAmount),cloud);
  gl_FragColor=vec4(retColor,1.);`);
 scene.add(sky);
 const sun=new THREE.DirectionalLight('#fff2d9',3.2),probe=new THREE.LightProbe();probe.intensity=.25;
 sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:.5,far:120});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target,probe);
 const direction=new THREE.Vector3(),targetSH=new THREE.SphericalHarmonics3();
 const environmentScene=new THREE.Scene(),captureSky=new Sky();captureSky.material=sky.material;captureSky.scale.copy(sky.scale);environmentScene.add(captureSky);
 const ground=new THREE.Mesh(new THREE.SphereGeometry(200,12,8,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshBasicMaterial({color:'#343e2b',side:THREE.BackSide}));environmentScene.add(ground);
 const pmrem=new THREE.PMREMGenerator(renderer),cube=new THREE.WebGLCubeRenderTarget(16,{type:THREE.HalfFloatType}),cubeCamera=new THREE.CubeCamera(.1,500000,cube);
 let environment:THREE.WebGLRenderTarget|null=null,disposed=false,pending=false,lastCapture=-Infinity,lastHour=-Infinity,lastWeather='',hour=12,weather='',seconds=0,captureRequested=true,ready=false,lastProbeError:unknown=null;
 const stats={iblUpdates:0,shUpdates:0,shEnergy:0,hour:12,probeError:'',lightingMode:'captured'};
 let underground=false;
 let directEnvironment:ReturnType<typeof createDirectEnvironment>|null=null,skyAltitude=1,skyNight=0,skyCloudy=false;
 const volume={sun,direction,density:.008,ambient:new THREE.Color('#637d95')};
 const weatherPositions=new Float32Array(180*3),weatherGeometry=new THREE.BufferGeometry();weatherGeometry.setAttribute('position',new THREE.BufferAttribute(weatherPositions,3));
 const weatherMaterial=new THREE.PointsMaterial({color:'#d7e3e1',size:.06,transparent:true,opacity:.5,depthWrite:false}),precipitation=new THREE.Points(weatherGeometry,weatherMaterial);precipitation.frustumCulled=false;scene.add(precipitation);
 return {
  volume,stats,
  update(state:AdventureSnapshot,player:THREE.Vector3){
   ready=true;const env=state.environment;hour=env.hour;weather=env.weather;seconds=env.seconds;stats.hour=hour;
   const boss=state.enemies.some(e=>e.boss&&e.health>0);const angle=(hour-6)/24*Math.PI*2,altitude=boss?.05:Math.sin(angle),night=1-THREE.MathUtils.smoothstep(altitude,-.12,.08),cloudy=['rain','storm','fog'].includes(weather);
   underground=state.generator===4&&player.y<-3;sky.visible=!underground;
   skyAltitude=altitude;skyNight=night;skyCloudy=cloudy;
   direction.set(Math.cos(angle),altitude,-.3).normalize();u.sunPosition.value.copy(direction).multiplyScalar(450000);u.nightAmount.value=night;u.cloudCover.value=cloudy?.85:.3;u.turbidity.value=cloudy?8:2.5;u.skyTime.value=seconds;
   ground.material.color.set('#343e2b').multiplyScalar(1-night*.99);
   sky.position.copy(player);sun.position.copy(player).addScaledVector(direction,night>.5?-45:45);sun.target.position.copy(player);
   sun.intensity=THREE.MathUtils.lerp(3.2*Math.max(.04,altitude)*(cloudy?.55:1),.055,night);sun.color.set(night>.5?'#b0c4ff':altitude<.25?'#ffd0a0':'#fff5e6');
   volume.direction.copy(sun.position).sub(player).normalize();volume.density=cloudy?.025:.008;volume.ambient.set(night>.5?'#111b35':'#748a9b');
   // Distance fog is handled by the volumetric pass, not applied twice in PBR shaders.
   const region=state.environment.regionId?ADVENTURE_REGIONS[state.environment.regionId]:undefined;scene.fog=underground?new THREE.Fog(region?.fog??'#102b38',8,36):region&&scene.userData.direct?new THREE.Fog(region.fog,30,78):null;if(underground){sun.intensity=.08;probe.intensity=.12;volume.density=.04;volume.ambient.set('#183e4c');}else probe.intensity=.25;
   precipitation.visible=!underground&&['rain','storm','snow','magic'].includes(weather);weatherMaterial.size=weather==='snow'?.12:.05;
   if(precipitation.visible){for(let i=0;i<180;i++){weatherPositions[i*3]=player.x+Math.sin(i*174.13)*15;weatherPositions[i*3+1]=player.y+12-((seconds*(weather==='snow'?1.2:6)+i*.413)%14);weatherPositions[i*3+2]=player.z+Math.cos(i*74.92)*15;}weatherGeometry.getAttribute('position').needsUpdate=true;}
   captureRequested=Math.abs(hour-lastHour)>.18||weather!==lastWeather;
  },
  prepareDirect(){
   if(!ready||disposed)return;
   directEnvironment??=createDirectEnvironment(renderer,sky.material);
   directEnvironment.prepare(scene,probe,skyAltitude,skyNight,skyCloudy);
   if(underground)scene.environmentIntensity*=.16;
   Object.assign(stats,directEnvironment.stats,{lightingMode:'cached-direct'});
  },
  prepare(dt:number){
   if(!ready)return;
   for(let i=0;i<9;i++){if(stats.shUpdates<=1)probe.sh.coefficients[i].copy(targetSH.coefficients[i]);else probe.sh.coefficients[i].lerp(targetSH.coefficients[i],1-Math.exp(-dt*1.5));}
   const now=performance.now();if(disposed||pending||!captureRequested||now-lastCapture<1500)return;
   lastCapture=now;lastHour=hour;lastWeather=weather;captureRequested=false;
   const next=pmrem.fromScene(environmentScene,0,.1,500000,{size:64});scene.environment=next.texture;scene.environmentIntensity=.75;environment?.dispose();environment=next;stats.iblUpdates++;
   cubeCamera.update(renderer,environmentScene);pending=true;
   void captureProbe(renderer,cube).then(result=>{if(!disposed){if(!result.sh.coefficients.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z)))throw new Error('Non-finite sky irradiance');targetSH.copy(result.sh);stats.probeError='';stats.shEnergy=result.sh.coefficients[0].length();stats.shUpdates++;}}).catch((error:unknown)=>{lastProbeError=error;stats.probeError=String(lastProbeError);console.error('SH environment capture failed',error);}).finally(()=>{pending=false;if(disposed)cube.dispose();});
  },
  dispose(){disposed=true;scene.environment=null;directEnvironment?.dispose();environment?.dispose();pmrem.dispose();if(!pending)cube.dispose();sun.shadow.dispose();sky.geometry.dispose();captureSky.geometry.dispose();sky.material.dispose();ground.geometry.dispose();ground.material.dispose();weatherGeometry.dispose();weatherMaterial.dispose();scene.remove(sky,sun,sun.target,probe,precipitation);},
 };
}
