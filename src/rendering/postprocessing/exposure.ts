import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { screenVertex } from './volumetric';
/** GPU log-average luminance meter, asymmetric temporal eye adaptation, no synchronous pixel readback. */
export class ExposurePass extends Pass {
 private previous=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
 private next=this.previous.clone();private initialized=false;private pending=false;private disposed=false;private lastRead=0;
 readonly stats={exposure:1,luminance:0,samples:0};
 private meter=new THREE.ShaderMaterial({vertexShader:screenVertex,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},previous:{value:null},dt:{value:0},initialized:{value:0}},fragmentShader:`
 uniform sampler2D sceneColor,previous;uniform float dt,initialized;
 void main(){float total=0.,weights=0.;
  for(int y=0;y<8;y++)for(int x=0;x<8;x++){vec2 uv=(vec2(float(x),float(y))+.5)/8.;float w=1.-length(uv-.5)*.6;vec3 color=texture2D(sceneColor,uv).rgb;total+=log(clamp(dot(color,vec3(.2126,.7152,.0722)),.0001,10000.))*w;weights+=w;}
  float luminance=exp(total/weights),target=clamp(.18/luminance,.12,8.),old=texture2D(previous,vec2(.5)).r;
  float speed=target<old?3.:1.2;float adapted=initialized<.5?target:mix(old,target,1.-exp(-dt*speed));gl_FragColor=vec4(adapted,luminance,0.,1.);
 }`});
 private apply=new THREE.ShaderMaterial({vertexShader:screenVertex,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},exposure:{value:null}},fragmentShader:'varying vec2 vUv;uniform sampler2D sceneColor,exposure;void main(){gl_FragColor=vec4(texture2D(sceneColor,vUv).rgb*texture2D(exposure,vec2(.5)).r,1.);}'});
 private quad=new FullScreenQuad(this.meter);
 render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget,dt:number){
  if(!this.initialized){renderer.setRenderTarget(this.previous);renderer.clear();}
  const u=this.meter.uniforms;u.sceneColor.value=read.texture;u.previous.value=this.previous.texture;u.dt.value=Math.min(dt||1/60,.1);u.initialized.value=this.initialized?1:0;
  this.quad.material=this.meter;renderer.setRenderTarget(this.next);this.quad.render(renderer);this.initialized=true;
  this.apply.uniforms.sceneColor.value=read.texture;this.apply.uniforms.exposure.value=this.next.texture;this.quad.material=this.apply;renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer);
  // One tiny asynchronous diagnostic sample per second, never blocks the animation loop.
  if(!this.pending&&performance.now()-this.lastRead>1000){this.pending=true;this.lastRead=performance.now();const data=new Uint16Array(4);
   void renderer.readRenderTargetPixelsAsync(this.next,0,0,1,1,data).then(()=>{if(!this.disposed){this.stats.exposure=THREE.DataUtils.fromHalfFloat(data[0]);this.stats.luminance=THREE.DataUtils.fromHalfFloat(data[1]);this.stats.samples++;}}).catch((error:unknown)=>console.error('Exposure readback failed',error)).finally(()=>{this.pending=false;});
  }
  const swap=this.previous;this.previous=this.next;this.next=swap;
 }
 dispose(){this.disposed=true;this.previous.dispose();this.next.dispose();this.meter.dispose();this.apply.dispose();this.quad.dispose();}
}
