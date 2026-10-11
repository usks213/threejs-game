import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {FogField} from './fog-field';
import type {FogBox} from './medium';
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export interface VolumeLighting {density:number;ambient:THREE.Color;direction:THREE.Vector3;sun?:THREE.DirectionalLight;points:readonly THREE.PointLight[];groundHeight:number}
const common=`
 out vec4 volumeColor;
 #define gl_FragColor volumeColor
 varying vec2 vUv;
 uniform mat4 inverseProjection,cameraWorld,shadowMatrix;
 uniform vec3 eye,lightDirection,lightColor,ambient,fieldOrigin,fieldSize;
 uniform float nearClip,farClip,density,groundHeight,shadowEnabled;
 uniform sampler2D shadowMap;uniform highp sampler3D fogField;
 #include <packing>
 float sliceDepth(float u){float a=farClip*.5;return nearClip+(farClip-nearClip)/a*(pow(a+1.,u)-1.);}
 float sliceCoordinate(float d){float a=farClip*.5;return clamp(log((max(d,nearClip)-nearClip)*a/(farClip-nearClip)+1.)/log(a+1.),0.,1.);}
 vec3 rayAt(vec2 uv){vec4 v=inverseProjection*vec4(uv*2.-1.,1.,1.);return normalize((cameraWorld*vec4(v.xyz/v.w,0.)).xyz);}
 vec2 fieldAt(vec3 p){vec3 uv=(p-fieldOrigin)/fieldSize;if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return vec2(8.,0.);vec2 f=texture(fogField,uv).rg;return vec2(f.r*16.-8.,f.g);}
 float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float detailDensity(vec3 p){vec2 f=fieldAt(p);if(f.x>=0.||f.y<=0.)return 0.;float erosion=(noise(p*.8)*.7+noise(p*1.9)*.3)*.7;return f.y*(1.-smoothstep(-1.5,0.,f.x+erosion));}
 float sunVisibility(vec3 p){if(shadowEnabled<.5)return 1.;vec4 s=shadowMatrix*vec4(p,1.);vec3 q=s.xyz/s.w;if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;return step(q.z-.001,unpackRGBAToDepth(texture2D(shadowMap,q.xy)));}
 float phaseHG(float cosine,float g){return (1.-g*g)/(12.5663706*pow(max(.001,1.+g*g-2.*g*cosine),1.5));}
 float phaseDual(float cosine){return .8*phaseHG(cosine,.55)+.2*phaseHG(cosine,-.25);}
`;
/** Low-frequency lighting is injected into a logarithmic froxel atlas. Detailed
 * fog is evaluated independently from its world-space distance/density field.
 * Both media are integrated jointly per segment, avoiding cumulative-light
 * double counting. No temporal history or sparse/octree parity is claimed. */
export class HybridVolume {
 readonly field:FogField;
 readonly atlas:THREE.WebGLRenderTarget;
 readonly target:THREE.WebGLRenderTarget;
 private readonly uniforms={inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},shadowMatrix:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},lightDirection:{value:new THREE.Vector3(0,1,0)},lightColor:{value:new THREE.Color()},ambient:{value:new THREE.Color()},density:{value:.008},groundHeight:{value:0},shadowEnabled:{value:0},shadowMap:{value:null as THREE.Texture|null},nearClip:{value:.035},farClip:{value:55},fieldOrigin:{value:new THREE.Vector3()},fieldSize:{value:new THREE.Vector3()},fogField:{value:null as THREE.Data3DTexture|null}};
 private readonly inject:THREE.ShaderMaterial;
 private readonly march:THREE.ShaderMaterial;
 private readonly composite:THREE.ShaderMaterial;
 private readonly quad:FullScreenQuad;
 private readonly pointPositions=Array.from({length:12},()=>new THREE.Vector4());
 private readonly pointColors=Array.from({length:12},()=>new THREE.Color());
 private readonly position=new THREE.Vector3();
 private frames=0;
 constructor(private readonly camera:THREE.PerspectiveCamera,private readonly lighting:VolumeLighting,boxes:readonly FogBox[],targetType:THREE.TextureDataType=THREE.HalfFloatType){
  this.atlas=new THREE.WebGLRenderTarget(48*6,28*4,{type:targetType,depthBuffer:false});this.target=new THREE.WebGLRenderTarget(1,1,{type:targetType,depthBuffer:false});
  this.field=new FogField(boxes);this.uniforms.fogField.value=this.field.texture;this.uniforms.fieldSize.value.copy(this.field.size);
  this.inject=new THREE.ShaderMaterial({vertexShader:vertex,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,uniforms:{...this.uniforms,pointPositions:{value:this.pointPositions},pointColors:{value:this.pointColors}},fragmentShader:common+`
   uniform vec4 pointPositions[12];uniform vec3 pointColors[12];
   void main(){vec2 cell=floor(gl_FragCoord.xy/vec2(48.,28.));float z=cell.x+cell.y*6.;vec2 uv=(mod(gl_FragCoord.xy,vec2(48.,28.)))/vec2(48.,28.);
    vec3 ray=rayAt(uv);float viewZ=sliceDepth((z+.5)/24.);vec3 forward=normalize((cameraWorld*vec4(0.,0.,-1.,0.)).xyz);vec3 p=eye+ray*viewZ/max(.05,dot(ray,forward));
    float sigma=density*exp(-max(p.y-groundHeight,0.)*.14);vec3 incident=ambient*.18;
    for(int i=0;i<12;i++){vec3 delta=pointPositions[i].xyz-p;float d=length(delta),range=pointPositions[i].w;float falloff=pow(clamp(1.-pow(d/max(.01,range),4.),0.,1.),2.)/max(d*d,.5);incident+=pointColors[i]*falloff*.07957747;}
    gl_FragColor=vec4(incident,sigma);
   }`});
  this.march=new THREE.ShaderMaterial({vertexShader:vertex,glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,uniforms:{...this.uniforms,depth:{value:null},froxelAtlas:{value:this.atlas.texture}},fragmentShader:common+`
   uniform sampler2D depth,froxelAtlas;
   vec4 sampleSlice(vec2 uv,float z){vec2 cell=vec2(mod(z,6.),floor(z/6.));return texture2D(froxelAtlas,(cell+clamp(uv,vec2(.5/48.,.5/28.),vec2(1.-.5/48.,1.-.5/28.)))/vec2(6.,4.));}
   vec4 froxel(vec2 uv,float viewZ){float z=clamp(sliceCoordinate(viewZ)*24.-.5,0.,23.),lo=floor(z);return mix(sampleSlice(uv,lo),sampleSlice(uv,min(23.,lo+1.)),fract(z));}
   void main(){float sceneDepth=texture2D(depth,vUv).r;vec4 v=inverseProjection*vec4(vUv*2.-1.,sceneDepth*2.-1.,1.);vec3 endpoint=(cameraWorld*vec4(v.xyz/v.w,1.)).xyz;vec3 ray=rayAt(vUv);float endDistance=min(length(endpoint-eye),farClip);vec3 forward=normalize((cameraWorld*vec4(0.,0.,-1.,0.)).xyz);float cosine=dot(ray,lightDirection),phase=phaseDual(cosine);
    float T=1.,t=0.;vec3 L=vec3(0.);
    for(int i=0;i<64;i++){if(t>=endDistance||T<.01)break;vec3 start=eye+ray*t;float safeDistance=max(0.,fieldAt(start).x-2.7);float ds=min(endDistance-t,clamp(max(safeDistance,max(.65,endDistance/64.)),max(.65,endDistance/64.),3.));vec3 p=eye+ray*(t+ds*.5);vec4 low=froxel(vUv,max(nearClip,(t+ds*.5)*dot(ray,forward)));float high=detailDensity(p),sigma=low.a+high;
     float visibility=sunVisibility(p);float lightDepth=0.;if(high>.0001){for(int j=0;j<4;j++)lightDepth+=detailDensity(p+lightDirection*(float(j)+.5)*1.5)*1.5;}visibility*=exp(-lightDepth);
     vec3 incident=low.rgb+lightColor*phase*visibility;vec3 q=low.a*incident+high*(incident*vec3(.64,.82,.76));float stepT=exp(-sigma*ds);float integral=sigma>.000001?(1.-stepT)/sigma:ds;L+=T*q*integral;T*=stepT;t+=ds;
    }gl_FragColor=vec4(L,T);
   }`});
  this.composite=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},depth:{value:null},volume:{value:this.target.texture},texel:{value:new THREE.Vector2()},nearClip:{value:camera.near},farClip:{value:camera.far}},fragmentShader:`
   varying vec2 vUv;uniform sampler2D sceneColor,depth,volume;uniform vec2 texel;uniform float nearClip,farClip;
   float linearDepth(float d){return nearClip*farClip/(farClip-(farClip-nearClip)*d);}
   void main(){float center=linearDepth(texture2D(depth,vUv).r);vec4 sum=vec4(0.);float weight=0.;for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 uv=(floor(vUv/texel-.5)+vec2(float(x),float(y))+.5)*texel;float other=linearDepth(texture2D(depth,uv).r);float w=exp(-abs(other-center)*4./max(1.,center*.05))+.00001;sum+=texture2D(volume,uv)*w;weight+=w;}vec4 fog=sum/weight;gl_FragColor=vec4(texture2D(sceneColor,vUv).rgb*fog.a+fog.rgb,1.);}
  `});this.quad=new FullScreenQuad(this.inject);
 }
 resize(width:number,height:number){this.target.setSize(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));this.composite.uniforms.texel.value.set(1/this.target.width,1/this.target.height);}
 render(renderer:THREE.WebGLRenderer,color:THREE.Texture,depth:THREE.Texture,output:THREE.WebGLRenderTarget){
  const l=this.lighting,u=this.uniforms;this.field.update(this.camera.position);u.fieldOrigin.value.copy(this.field.origin);u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);u.cameraWorld.value.copy(this.camera.matrixWorld);u.eye.value.copy(this.camera.position);u.lightDirection.value.copy(l.direction);if(l.sun)u.lightColor.value.copy(l.sun.color).multiplyScalar(l.sun.intensity);else u.lightColor.value.setRGB(0,0,0);u.ambient.value.copy(l.ambient);u.density.value=l.density;u.groundHeight.value=l.groundHeight;u.nearClip.value=this.camera.near;u.farClip.value=Math.min(72,this.camera.far);u.shadowMap.value=l.sun?.shadow.map?.texture??depth;u.shadowEnabled.value=l.sun?.shadow.map&&renderer.shadowMap.enabled?1:0;if(l.sun)u.shadowMatrix.value.copy(l.sun.shadow.matrix);
  for(let i=0;i<12;i++){const light=l.points[i];if(light){light.getWorldPosition(this.position);this.pointPositions[i].set(this.position.x,this.position.y,this.position.z,light.distance);this.pointColors[i].copy(light.color).multiplyScalar(light.visible?light.intensity:0);}else{this.pointPositions[i].set(0,0,0,1);this.pointColors[i].setRGB(0,0,0);}}
  this.quad.material=this.inject;renderer.setRenderTarget(this.atlas);this.quad.render(renderer);
  this.march.uniforms.depth.value=depth;this.quad.material=this.march;renderer.setRenderTarget(this.target);this.quad.render(renderer);
  this.composite.uniforms.sceneColor.value=color;this.composite.uniforms.depth.value=depth;this.composite.uniforms.nearClip.value=this.camera.near;this.composite.uniforms.farClip.value=this.camera.far;this.quad.material=this.composite;renderer.setRenderTarget(output);this.quad.render(renderer);this.frames++;
 }
 get stats(){return {volumeFrames:this.frames,froxelDimensions:[48,28,24],volumeWidth:this.target.width,volumeHeight:this.target.height,volumeMaxSteps:64,temporalHistory:false,...this.field.stats};}
 dispose(){this.field.dispose();this.atlas.dispose();this.target.dispose();this.inject.dispose();this.march.dispose();this.composite.dispose();this.quad.dispose();}
}
