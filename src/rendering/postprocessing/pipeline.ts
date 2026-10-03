import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VolumetricPass } from './volumetric';
import { ExposurePass } from './exposure';
import type { createAtmosphere } from '../environment/atmosphere';
export function createPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,atmosphere:ReturnType<typeof createAtmosphere>){
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType}),composer=new EffectComposer(renderer,target);
 const ssr=new SSRPass({renderer,scene,camera,width:1,height:1,selects:[],groundReflector:null});ssr.resolutionScale=.5;ssr.opacity=.45;ssr.maxDistance=18;ssr.thickness=.15;ssr.blur=true;ssr.bouncing=false;
 // Cap steps but stretch their stride to retain the whole reflection ray on mobile.
 ssr.ssrMaterial.fragmentShader=ssr.ssrMaterial.fragmentShader.replace('void main(){','void main(){ gl_FragColor=vec4(0.);').replace('if(i>=totalStep) break;','float stride=max(1.,totalStep/128.);float stepIndex=i*stride; if(stepIndex>=totalStep) break;').replace('d0.x+i*xSpan,d0.y+i*ySpan','d0.x+stepIndex*xSpan,d0.y+stepIndex*ySpan');
 // Three r180's alpha-weighted SSR blur divides by zero where no ray hit exists.
 for(const material of [ssr.blurMaterial,ssr.blurMaterial2])material.fragmentShader=material.fragmentShader.replace(')/a;',')/max(a,0.00001);');
 const volume=new VolumetricPass(camera,ssr.beautyRenderTarget.depthTexture!,atmosphere.volume),exposure=new ExposurePass(),bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.32,.55,1.05),output=new OutputPass(),fxaa=new ShaderPass(FXAAShader);
 for(const pass of [ssr,volume,exposure,bloom,output,fxaa])composer.addPass(pass);
 const inspect=new URLSearchParams(location.search).has('graphicsProbe'),diagnostics={stageSamples:0,reflectionPixels:0,bloomEnergy:0,volumeEnergy:0,invalidPixels:0,beautyEnergy:0};let reading=false,lastRead=0,disposed=false;
 async function measure(target:THREE.WebGLRenderTarget,alpha=false){const data=new Uint16Array(target.width*target.height*4);await renderer.readRenderTargetPixelsAsync(target,0,0,target.width,target.height,data);let sum=0;for(let i=0;i<data.length;i+=4){const v=THREE.DataUtils.fromHalfFloat(data[i+(alpha?3:0)]);if(!Number.isFinite(v)){diagnostics.invalidPixels++;continue;}sum+=alpha?(v>.001?1:0):Math.max(0,v);}return alpha?sum:sum/(data.length/4);}
 const renderSSR=ssr.render.bind(ssr);ssr.render=(r,write,read,delta,mask)=>{if(reflections.length){renderSSR(r,write,read,delta,mask);return;}r.setRenderTarget(ssr.beautyRenderTarget);r.clear();r.render(scene,camera);ssr.copyMaterial.uniforms.tDiffuse.value=ssr.beautyRenderTarget.texture;ssr.copyMaterial.blending=THREE.NoBlending;ssr.fsQuad.material=ssr.copyMaterial;r.setRenderTarget(write);ssr.fsQuad.render(r);};
 let lastSelect=-Infinity;const reflections:THREE.Mesh[]=[];
 return {
  get stats(){return {...exposure.stats,...diagnostics};},
  resize(w:number,h:number){const ratio=Math.min(window.devicePixelRatio,1,900/Math.max(w,h));renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);composer.setPixelRatio(ratio);composer.setSize(w,h);fxaa.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));ssr.ssrMaterial.defines.MAX_STEP=128;ssr.ssrMaterial.needsUpdate=true;},
  render(dt:number){
   renderer.info.reset();atmosphere.prepare(dt);
   if(performance.now()-lastSelect>350){lastSelect=performance.now();reflections.length=0;scene.traverseVisible(o=>{if(o instanceof THREE.Mesh&&o.geometry.drawRange.count>0&&(!(o instanceof THREE.InstancedMesh)||o.count>0)){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m instanceof THREE.MeshStandardMaterial&&m.roughness<.25))reflections.push(o);}});ssr.selects=reflections;}
   composer.render(dt);
   if(inspect&&!reading&&performance.now()-lastRead>2000){reading=true;lastRead=performance.now();void Promise.all([measure(ssr.ssrRenderTarget,true),measure(bloom.renderTargetsHorizontal[0]),measure(volume.target),measure(ssr.beautyRenderTarget)]).then(([reflectionPixels,bloomEnergy,volumeEnergy,beautyEnergy])=>{if(!disposed)Object.assign(diagnostics,{reflectionPixels,bloomEnergy,volumeEnergy,beautyEnergy,stageSamples:diagnostics.stageSamples+1});}).catch((error:unknown)=>console.error('HDR stage readback failed',error)).finally(()=>{reading=false;});}
  },
  dispose(){disposed=true;for(const pass of [ssr,volume,exposure,bloom,output,fxaa])pass.dispose();ssr.ssrMaterial.dispose();composer.dispose();},
 };
}
