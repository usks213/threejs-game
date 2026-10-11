import * as THREE from 'three';
import type {createAtmosphere} from '../../rendering/environment/atmosphere';
import {createVolumeScenePipeline,type VolumeWater} from '../../rendering/volumetrics/scene-pipeline';
import type {FogBox} from '../../rendering/volumetrics/medium';
/** Bounded HDR surface + froxel/distance-field pipeline, with measured sizes. */
export function createBalancedPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,atmosphere:ReturnType<typeof createAtmosphere>,options:{water?:VolumeWater;boxes?:readonly FogBox[];high?:boolean}={}){
 let pixelRatio=1,elapsed=0,frames=0,total=0;
 const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),software=ext?/SwiftShader|llvmpipe|software/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))):false;
 const points:THREE.PointLight[]=[];
 const lighting={...atmosphere.volume,points,groundHeight:0};
 const pipeline=createVolumeScenePipeline(renderer,scene,camera,lighting,options.boxes??[],options.water,options.high);
 atmosphere.volume.sun.shadow.mapSize.set(options.high?1024:512,options.high?1024:512);renderer.toneMappingExposure=1.1;
 return {get stats(){return {mode:options.high?'high':'balanced',softwareRendering:software,renderScale:pixelRatio,reflectionSources:options.water?.mesh.visible?1:0,exposure:1.1,frameMs:frames?total/frames:0,...pipeline.stats};},
 resize(w:number,h:number){pixelRatio=Math.min(devicePixelRatio,options.high?1.5:1,software?.75:1.5);renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);pipeline.resize(w*pixelRatio,h*pixelRatio);},
 render(dt:number){const start=performance.now();renderer.info.reset();atmosphere.prepare(dt);elapsed+=dt;renderer.shadowMap.needsUpdate=elapsed>.12;
  if(elapsed>.12){elapsed=0;points.length=0;scene.traverseVisible(o=>{if(o instanceof THREE.PointLight&&o.intensity>0&&points.length<8)points.push(o);});}
  lighting.density=atmosphere.volume.density;lighting.groundHeight=atmosphere.volume.sun.target.position.y-1;
  pipeline.render(dt);total+=performance.now()-start;frames++;if(frames>120){total*=.5;frames=Math.floor(frames*.5);}
 },dispose(){pipeline.dispose();},};
}
