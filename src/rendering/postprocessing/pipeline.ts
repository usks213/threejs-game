import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VolumetricPass } from './volumetric';
import { ExposurePass } from './exposure';
import type { createAtmosphere } from '../environment/atmosphere';
export function createPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,atmosphere:ReturnType<typeof createAtmosphere>){
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType}),composer=new EffectComposer(renderer,target);
 const ssr=new SSRPass({renderer,scene,camera,width:1,height:1,selects:[],groundReflector:null});ssr.resolutionScale=.5;ssr.opacity=.45;ssr.maxDistance=18;ssr.thickness=.15;ssr.blur=true;ssr.bouncing=false;
 // Cap steps but stretch their stride to retain the whole reflection ray on mobile.
 ssr.ssrMaterial.fragmentShader=ssr.ssrMaterial.fragmentShader.replace('if(i>=totalStep) break;','float stride=max(1.,totalStep/128.);float stepIndex=i*stride; if(stepIndex>=totalStep) break;').replace('d0.x+i*xSpan,d0.y+i*ySpan','d0.x+stepIndex*xSpan,d0.y+stepIndex*ySpan');
 const volume=new VolumetricPass(camera,ssr.beautyRenderTarget.depthTexture!,atmosphere.volume),exposure=new ExposurePass(),bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.32,.55,1.05),output=new OutputPass();
 for(const pass of [ssr,volume,exposure,bloom,output])composer.addPass(pass);
 let lastSelect=-Infinity;const reflections:THREE.Mesh[]=[];
 return {
  stats:exposure.stats,
  resize(w:number,h:number){const ratio=Math.min(window.devicePixelRatio,1.25,1100/Math.max(w,h));renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);composer.setPixelRatio(ratio);composer.setSize(w,h);ssr.ssrMaterial.defines.MAX_STEP=128;ssr.ssrMaterial.needsUpdate=true;},
  render(dt:number){
   atmosphere.prepare(dt);
   if(performance.now()-lastSelect>350){lastSelect=performance.now();reflections.length=0;scene.traverseVisible(o=>{if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m instanceof THREE.MeshStandardMaterial&&(m.roughness<.4||m.metalness>.5)))reflections.push(o);}});ssr.selects=reflections;}
   composer.render(dt);
  },
  dispose(){for(const pass of [ssr,volume,exposure,bloom,output])pass.dispose();ssr.ssrMaterial.dispose();composer.dispose();},
 };
}
