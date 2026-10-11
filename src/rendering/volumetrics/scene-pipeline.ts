import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ExposurePass} from '../postprocessing/exposure';
import {HybridVolume,type VolumeLighting} from './hybrid-volume';
import type {FogBox} from './medium';
export interface VolumeWater {mesh:THREE.Object3D;setSceneBuffers(color:THREE.Texture,depth:THREE.Texture,camera:THREE.PerspectiveCamera,viewport:THREE.Vector2):void}
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function target(type:THREE.TextureDataType){const result=new THREE.WebGLRenderTarget(1,1,{type});result.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);return result;}
/** Opaque -> copied color/depth -> SDF water -> hybrid volume -> output.
 * Water never samples a texture attached to its current framebuffer. */
export function createVolumeScenePipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,lighting:VolumeLighting,boxes:readonly FogBox[],water?:VolumeWater,high=false){
 const hdr=renderer.extensions.has('EXT_color_buffer_float'),type=hdr?THREE.HalfFloatType:THREE.UnsignedByteType;
 const opaque=target(type),surfaces=water?target(type):null,volumeColor=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
 const volume=new HybridVolume(camera,lighting,boxes,type),viewport=new THREE.Vector2(1,1);
 const post=high&&hdr?new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}):null,exposure=high&&hdr?new ExposurePass():null,bloom=high&&hdr?new UnrealBloomPass(new THREE.Vector2(1,1),.25,.55,1.1):null;
 const copy=new THREE.ShaderMaterial({vertexShader:vertex,glslVersion:THREE.GLSL3,depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,uniforms:{color:{value:opaque.texture},depth:{value:opaque.depthTexture}},fragmentShader:'varying vec2 vUv;out vec4 copiedColor;uniform sampler2D color,depth;void main(){copiedColor=texture2D(color,vUv);gl_FragDepth=texture2D(depth,vUv).r;}'});
 const output=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,uniforms:{color:{value:volumeColor.texture}},fragmentShader:'varying vec2 vUv;uniform sampler2D color;void main(){gl_FragColor=texture2D(color,vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
 const quad=new FullScreenQuad(copy);let frames=0,width=1,height=1,disposed=false;
 if(water)water.mesh.traverse(object=>object.layers.set(1));
 return {volume,
  resize(w:number,h:number){width=Math.max(1,Math.floor(w));height=Math.max(1,Math.floor(h));viewport.set(width,height);for(const t of [opaque,surfaces,volumeColor])t?.setSize(width,height);post?.setSize(width,height);bloom?.setSize(width,height);volume.resize(width,height);},
  render(dt=1/60){
   if(disposed)return;const autoClear=renderer.autoClear,mask=camera.layers.mask,oldFog=scene.fog,background=scene.background;scene.fog=null;
   try{
    camera.layers.set(0);renderer.autoClear=true;renderer.setRenderTarget(opaque);renderer.render(scene,camera);
    let color=opaque.texture,depth=opaque.depthTexture!;
    if(water&&water.mesh.visible&&surfaces){
     water.setSceneBuffers(opaque.texture,depth,camera,viewport);quad.material=copy;renderer.setRenderTarget(surfaces);quad.render(renderer);
     renderer.autoClear=false;scene.background=null;camera.layers.set(1);renderer.render(scene,camera);color=surfaces.texture;depth=surfaces.depthTexture!;
    }
    renderer.autoClear=true;volume.render(renderer,color,depth,volumeColor);
    if(post&&exposure&&bloom){exposure.render(renderer,post,volumeColor,dt);bloom.render(renderer,post,post,dt,false);output.uniforms.color.value=post.texture;}
    quad.material=output;renderer.setRenderTarget(null);quad.render(renderer);frames++;
   }finally{renderer.autoClear=autoClear;camera.layers.mask=mask;scene.fog=oldFog;scene.background=background;renderer.setRenderTarget(null);}
  },
  get stats(){return {renderingPipeline:'froxel-and-distance-field',hdr,pipelineFrames:frames,renderWidth:width,renderHeight:height,bloom:!!bloom,...exposure?.stats,...volume.stats};},
  dispose(){if(disposed)return;disposed=true;for(const t of [opaque,surfaces,volumeColor])t?.dispose();post?.dispose();exposure?.dispose();bloom?.dispose();volume.dispose();copy.dispose();output.dispose();quad.dispose();},
 };
}
