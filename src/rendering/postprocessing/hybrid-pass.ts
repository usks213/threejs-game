import type {createPeerRenderProbe} from '../scene/peer-render-probe';
import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {HybridVolume,type VolumeLighting} from '../volumetrics/hybrid-volume';
import type {createSparseWaterView} from '../water/sparse-view';
/** Localized world-space fog banks are separate from editable terrain density. */
export const adventureFogBanks=[
 {min:[-60,-2,-14] as [number,number,number],max:[-18,3,45] as [number,number,number],density:.10},
 {min:[-54,0,-44] as [number,number,number],max:[-22,5,-14] as [number,number,number],density:.065},
 {min:[-45,-27,-45] as [number,number,number],max:[45,-5,48] as [number,number,number],density:.045},
];
export class WaterCompositePass extends Pass {
 readonly target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
 private readonly copy=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth,uniforms:{color:{value:null as THREE.Texture|null},depth:{value:null as THREE.Texture|null}},vertexShader:'out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'in vec2 vUv;uniform sampler2D color,depth;out vec4 result;void main(){result=texture(color,vUv);gl_FragDepth=texture(depth,vUv).r;}'});
 private readonly blit=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{color:{value:this.target.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D color;void main(){gl_FragColor=texture2D(color,vUv);}'});
 private readonly quad=new FullScreenQuad(this.copy);
 constructor(private camera:THREE.PerspectiveCamera,private opaqueDepth:THREE.Texture,private water:ReturnType<typeof createSparseWaterView>,private peerProbe:ReturnType<typeof createPeerRenderProbe>|null=null){super();}
 setSize(w:number,h:number){this.target.setSize(w,h);}
 render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget,dt:number){this.copy.uniforms.color.value=read.texture;this.copy.uniforms.depth.value=this.opaqueDepth;this.quad.material=this.copy;renderer.setRenderTarget(this.target);renderer.clear();this.quad.render(renderer);this.water.render(renderer,this.camera,read.texture,this.opaqueDepth,this.target,dt);this.peerProbe?.finishFrame(this.camera,this.target);this.quad.material=this.blit;renderer.setRenderTarget(write);this.quad.render(renderer);}
 dispose(){this.target.dispose();this.copy.dispose();this.blit.dispose();this.quad.dispose();}
}
export class HybridVolumePass extends Pass {
 readonly volume:HybridVolume;
 get target(){return this.volume.target;}
 constructor(camera:THREE.PerspectiveCamera,private depth:THREE.Texture,lighting:VolumeLighting){super();this.volume=new HybridVolume(camera,lighting,adventureFogBanks);}
 setSize(w:number,h:number){this.volume.resize(w,h);}
 render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){this.volume.render(renderer,read.texture,this.depth,write);}
 dispose(){this.volume.dispose();}
}
