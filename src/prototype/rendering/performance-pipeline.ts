import * as THREE from 'three';
import type {createAtmosphere} from '../../rendering/environment/atmosphere';
export const PERFORMANCE_VIEW_DISTANCE=36;
/** Production quality budget: CSS UI remains full resolution; only the PBR canvas
 * is reduced. Neither world samples, collision, actor timing nor mesh topology change. */
export function performanceViewport(width:number,height:number,dpr:number,software:boolean){const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1),pixelRatio=Math.min(Math.max(.1,Number.isFinite(dpr)?dpr:1),1,(software?480:720)/Math.max(w,h));return {pixelRatio,width:Math.max(1,Math.floor(w*pixelRatio)),height:Math.max(1,Math.floor(h*pixelRatio)),longEdgeLimit:software?480:720};}
export function detectSoftwareRenderer(renderer:THREE.WebGLRenderer){const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return !!ext&&/SwiftShader|llvmpipe|software/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));}
export function createPerformancePipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,atmosphere:ReturnType<typeof createAtmosphere>){
 const software=detectSoftwareRenderer(renderer),oldShadow=renderer.shadowMap.enabled,oldFar=camera.far,oldBackground=scene.background,oldFog=scene.fog;
 const skies:{object:THREE.Object3D;visible:boolean}[]=[];scene.traverse(object=>{if(object instanceof THREE.Mesh&&object.material instanceof THREE.ShaderMaterial&&object.material.uniforms.sunPosition&&object.material.uniforms.rayleigh){skies.push({object,visible:object.visible});object.visible=false;}});
 const fill=new THREE.HemisphereLight('#9db4cc','#473925',.65);fill.name='performance-ambient';scene.add(fill);
 const background=new THREE.Color('#8cabb7'),fog=new THREE.Fog(background,18,PERFORMANCE_VIEW_DISTANCE);scene.background=background;scene.fog=fog;camera.far=PERFORMANCE_VIEW_DISTANCE;camera.updateProjectionMatrix();renderer.shadowMap.enabled=false;renderer.shadowMap.needsUpdate=false;renderer.toneMappingExposure=1.1;
 let dimensions=performanceViewport(1,1,1,software),frames=0,total=0;const daylight=new THREE.Color('#8cabb7'),night=new THREE.Color('#101b2d'),overcast=new THREE.Color('#899b9e');
 return {get stats(){return {mode:'performance',softwareRendering:software,gpuMode:software?'software-detected':'hardware-or-unreported',renderScale:dimensions.pixelRatio,renderWidth:dimensions.width,renderHeight:dimensions.height,pixelBudget:dimensions.width*dimensions.height,shadowMaps:false,skyMode:'simple-distance-fog',dynamicEnvironmentCapture:false,reflectionSources:0,exposure:1.1,frameMs:frames?total/frames:0,visibleDistance:PERFORMANCE_VIEW_DISTANCE};},
  resize(w:number,h:number){dimensions=performanceViewport(w,h,globalThis.devicePixelRatio??1,software);renderer.setPixelRatio(dimensions.pixelRatio);renderer.setSize(Math.max(1,w),Math.max(1,h),false);},
  render(_dt:number){const start=performance.now(),altitude=Math.sin((atmosphere.stats.hour-6)/24*Math.PI*2),amount=1-THREE.MathUtils.smoothstep(altitude,-.12,.08);background.copy(daylight).lerp(night,amount);if(['rain','fog','snow'].includes(atmosphere.stats.weather))background.lerp(overcast,.25);fog.color.copy(background);fog.near=atmosphere.stats.weather==='fog'?8:18;fog.far=atmosphere.stats.weather==='fog'?28:PERFORMANCE_VIEW_DISTANCE;fill.intensity=THREE.MathUtils.lerp(.65,.3,amount);scene.background=background;scene.fog=fog;
   // Deliberately skip atmosphere.prepare(): no PMREM, cube capture, GPU readback,
   // dynamic shadows, SSR, bloom or volumetric passes in this user-selected preset.
   // Existing filtered environment lighting, if already available, remains static.
   renderer.info.reset();renderer.shadowMap.needsUpdate=false;renderer.setRenderTarget(null);renderer.render(scene,camera);total+=performance.now()-start;frames++;if(frames>120){total*=.5;frames=Math.floor(frames*.5);}},
  dispose(){for(const sky of skies)sky.object.visible=sky.visible;scene.remove(fill);scene.background=oldBackground;scene.fog=oldFog;renderer.shadowMap.enabled=oldShadow;renderer.shadowMap.needsUpdate=oldShadow;camera.far=oldFar;camera.updateProjectionMatrix();},
 };
}
