import * as THREE from 'three';
import type {createAtmosphere} from '../../rendering/environment/atmosphere';
/** Single PBR pass keeps the campaign responsive on mobile and software WebGL. */
export function createBalancedPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,atmosphere:ReturnType<typeof createAtmosphere>){
 let pixelRatio=1,reflectionSources=0,elapsed=0,frames=0,total=0;const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),software=ext?/SwiftShader|llvmpipe|software/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))):false;
 atmosphere.volume.sun.shadow.mapSize.set(512,512);renderer.toneMappingExposure=1.1;
 return {get stats(){return {mode:'balanced',softwareRendering:software,renderScale:pixelRatio,reflectionSources,exposure:1.1,frameMs:frames?total/frames:0};},
 resize(w:number,h:number){pixelRatio=Math.min(devicePixelRatio,1.5,software?.75:1.25);renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);},
 render(dt:number){const start=performance.now();renderer.info.reset();atmosphere.prepare(dt);elapsed+=dt;renderer.shadowMap.needsUpdate=elapsed>.12;if(elapsed>.12){elapsed=0;reflectionSources=0;scene.traverseVisible(o=>{if(o instanceof THREE.Mesh&&o.userData.reflectionVisible===true)reflectionSources++;});}renderer.setRenderTarget(null);renderer.render(scene,camera);total+=performance.now()-start;frames++;if(frames>120){total*=.5;frames=Math.floor(frames*.5);}},dispose(){},};
}
