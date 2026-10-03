import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
export const screenVertex='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
interface LightVolume { sun:THREE.DirectionalLight; direction:THREE.Vector3; density:number; ambient:THREE.Color }
/** Half-resolution world-space single scattering with shadow-map occlusion, Beer-Lambert extinction and HG phase. */
export class VolumetricPass extends Pass {
 private target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
 private march=new THREE.ShaderMaterial({vertexShader:screenVertex,depthTest:false,depthWrite:false,uniforms:{depth:{value:null},shadowMap:{value:null},inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},shadowMatrix:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},lightDirection:{value:new THREE.Vector3()},lightColor:{value:new THREE.Color()},ambient:{value:new THREE.Color()},density:{value:.008},shadowEnabled:{value:0},groundHeight:{value:0}},fragmentShader:`
 varying vec2 vUv;uniform sampler2D depth,shadowMap;uniform mat4 inverseProjection,cameraWorld,shadowMatrix;
 uniform vec3 eye,lightDirection,lightColor,ambient;uniform float density,shadowEnabled,groundHeight;
 #include <packing>
 void main(){
  float d=texture2D(depth,vUv).r;vec4 v=inverseProjection*vec4(vUv*2.-1.,d*2.-1.,1.);v/=v.w;
  vec3 end=(cameraWorld*v).xyz,ray=end-eye;float distance=min(length(ray),72.);ray=normalize(ray);
  float stepSize=distance/16.,T=1.;vec3 scatter=vec3(0.);
  float cosine=dot(ray,lightDirection),g=.55;float phase=(1.-g*g)/(12.56637*pow(max(.01,1.+g*g-2.*g*cosine),1.5));
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.54);
  for(int i=0;i<16;i++){
   vec3 p=eye+ray*(float(i)+jitter)*stepSize;float rho=density*exp(-max(p.y-groundHeight,0.)*.12);
   float attenuation=exp(-rho*stepSize),visibility=1.;
   if(shadowEnabled>.5){vec4 s=shadowMatrix*vec4(p,1.);vec3 q=s.xyz/s.w;
    if(q.x>0.&&q.x<1.&&q.y>0.&&q.y<1.&&q.z>0.&&q.z<1.)visibility=step(q.z-.001,unpackRGBAToDepth(texture2D(shadowMap,q.xy)));
   }
   scatter+=T*(1.-attenuation)*(lightColor*phase*visibility+ambient*.18);T*=attenuation;
  }
  gl_FragColor=vec4(scatter,T);
 }`});
 private composite=new THREE.ShaderMaterial({vertexShader:screenVertex,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},volume:{value:this.target.texture},depth:{value:null},texel:{value:new THREE.Vector2()}},fragmentShader:`
 varying vec2 vUv;uniform sampler2D sceneColor,volume,depth;uniform vec2 texel;
 void main(){float center=texture2D(depth,vUv).r;vec4 sum=vec4(0.);float weights=0.;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 uv=vUv+(vec2(float(x),float(y))-.5)*texel;float delta=abs(texture2D(depth,uv).r-center);float w=1./(.001+delta);sum+=texture2D(volume,uv)*w;weights+=w;}
  vec4 fog=sum/weights;gl_FragColor=vec4(texture2D(sceneColor,vUv).rgb*fog.a+fog.rgb,1.);
 }`});
 private quad=new FullScreenQuad(this.march);
 constructor(private camera:THREE.PerspectiveCamera,private depthTexture:THREE.Texture,private light:LightVolume){super();}
 setSize(w:number,h:number){const width=Math.max(1,Math.floor(w/2)),height=Math.max(1,Math.floor(h/2));this.target.setSize(width,height);this.composite.uniforms.texel.value.set(1/width,1/height);}
 render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  const u=this.march.uniforms,l=this.light;u.depth.value=this.depthTexture;u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);u.cameraWorld.value.copy(this.camera.matrixWorld);u.eye.value.copy(this.camera.position);u.lightDirection.value.copy(l.direction);u.lightColor.value.copy(l.sun.color).multiplyScalar(l.sun.intensity);u.ambient.value.copy(l.ambient);u.density.value=l.density;u.groundHeight.value=l.sun.target.position.y-1;
  u.shadowMap.value=l.sun.shadow.map?.texture??this.depthTexture;u.shadowEnabled.value=renderer.shadowMap.enabled&&l.sun.shadow.map?1:0;u.shadowMatrix.value.copy(l.sun.shadow.matrix);
  this.quad.material=this.march;renderer.setRenderTarget(this.target);this.quad.render(renderer);
  this.composite.uniforms.sceneColor.value=read.texture;this.composite.uniforms.depth.value=this.depthTexture;this.quad.material=this.composite;renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer);
 }
 dispose(){this.target.dispose();this.march.dispose();this.composite.dispose();this.quad.dispose();}
}
