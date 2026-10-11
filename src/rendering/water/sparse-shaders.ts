/** Bounded surface-brick sphere tracing, not a full-screen water color filter. */
export const waterVolumeVertex=`
flat out vec3 brickMin;
flat out float brickIndex;
flat out vec3 brickMax;
void main(){
 brickIndex=float(gl_InstanceID);
 brickMin=(modelMatrix*instanceMatrix*vec4(-1.5,-1.5,-1.5,1.)).xyz;
 brickMax=(modelMatrix*instanceMatrix*vec4(1.5,1.5,1.5,1.)).xyz;
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
}`;
export const waterVolumeFragment=`
precision highp sampler3D;
precision highp usampler2D;
uniform usampler2D brickLookup;
uniform int lookupMask;
uniform sampler3D sdf;
uniform sampler2D ripples;
uniform sampler2D opaqueColor;
uniform sampler2D opaqueDepth;
uniform mat4 inverseViewProjection;
uniform mat4 viewProjection;
uniform vec3 eye;
uniform vec3 fieldOrigin;
uniform vec3 fieldSpacing;
uniform vec3 fieldDimensions;
uniform vec3 basinMin;
uniform vec3 basinSize;
uniform vec2 viewport;
uniform float distanceRange;
uniform float rippleAmplitude;
uniform float time;
uniform float buffersReady;
flat in vec3 brickMin;
flat in float brickIndex;
flat in vec3 brickMax;
out vec4 waterColor;
vec3 worldAt(vec2 uv,float depth){vec4 p=inverseViewProjection*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}
int findBrick(ivec3 cell){uint h=(uint(cell.x)*73856093u^uint(cell.y)*19349663u^uint(cell.z)*83492791u)&uint(lookupMask);for(int j=0;j<32;j++){uvec4 entry=texelFetch(brickLookup,ivec2(int(h)%256,int(h)/256),0);if(entry.a==0u)return -1;if(all(equal(entry.rgb,uvec3(cell))))return int(entry.a)-1;h=(h+1u)&uint(lookupMask);}return -1;}
float baseDistance(vec3 p){ivec3 cell=ivec3(floor(p/3.));int found=findBrick(cell);if(found<0){if(any(lessThan(p,brickMin-vec3(.24,.12,.24)))||any(greaterThan(p,brickMax+vec3(.24,.12,.24))))return distanceRange;found=int(brickIndex);cell=ivec3(floor((brickMin+vec3(.001))/3.));}float index=float(found);vec3 tile=vec3(mod(index,16.)*8.,mod(floor(index/16.),16.)*14.,floor(index/256.)*8.);vec3 local=(p-vec3(cell)*3.)/vec3(.5,.25,.5)+1.;vec3 uv=(tile+clamp(local,vec3(.5),vec3(7.5,13.5,7.5)))/fieldDimensions;return (texture(sdf,uv).r*2.-1.)*distanceRange;}
float ripple(vec3 p){vec2 uv=(p.xz-basinMin.xz)/basinSize.xz;if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;return (texture(ripples,uv).r*2.-1.)*rippleAmplitude;}
float distanceAt(vec3 p){return baseDistance(p-vec3(0.,ripple(p),0.));}
vec3 surfaceNormal(vec3 p){vec3 e=fieldSpacing*.45;vec3 gradient=vec3(distanceAt(p+vec3(e.x,0,0))-distanceAt(p-vec3(e.x,0,0)),distanceAt(p+vec3(0,e.y,0))-distanceAt(p-vec3(0,e.y,0)),distanceAt(p+vec3(0,0,e.z))-distanceAt(p-vec3(0,0,e.z)))/e;return dot(gradient,gradient)>.000001?normalize(gradient):vec3(0.,1.,0.);}
void main(){
 if(buffersReady<.5)discard;
 vec2 uv=gl_FragCoord.xy/viewport;
 vec3 rd=normalize(worldAt(uv,1.)-eye);
 // Slab intersection also works when the camera/near plane is inside a brick.
 vec3 safeDirection=sign(rd)*max(abs(rd),vec3(.000001));safeDirection+=vec3(equal(rd,vec3(0.)))*.000001;
 vec3 a=(brickMin-vec3(.05)-eye)/safeDirection,b=(brickMax+vec3(.05)-eye)/safeDirection;
 vec3 lo=min(a,b),hi=max(a,b);
 float nearDistance=max(max(lo.x,lo.y),lo.z),farDistance=min(min(hi.x,hi.y),hi.z);
 float sceneDepth=texture(opaqueDepth,uv).r;
 float sceneDistance=dot(worldAt(uv,sceneDepth)-eye,rd);
 float clipStart=length(worldAt(uv,0.)-eye);bool nearMedium=distanceAt(eye+rd*clipStart)<0.;
 float start=max(max(nearDistance,0.),clipStart);
 float end=min(farDistance,sceneDistance-.002);
 if(end<start)discard;
 float t=start,d=distanceAt(eye+rd*t),previous=d,previousT=t;bool hit=!nearMedium&&start>clipStart+.001&&d<0.;
 // Finite browser trace with a0.4 safety factor and interpolation allowance.
 // Grazing-ray parity with the source engine is not claimed.
 for(int step=0;step<96;step++){
  if(hit)break;
  d=distanceAt(eye+rd*t);
  if(abs(d)<.004||(step>0&&d*previous<0.)){hit=true;break;}
  previous=d;previousT=t;t+=clamp(abs(d)*.4-.006,.006,distanceRange*.4);
  if(t>end)break;
 }
 if(!hit){if(nearMedium&&sceneDistance<=farDistance+.003&&distanceAt(eye+rd*end)<0.){vec3 transmission=exp(-vec3(.55,.18,.10)*min(max(0.,sceneDistance-(baseDistance(eye)<0.?0.:clipStart)),8.));waterColor=vec4(texture(opaqueColor,uv).rgb*transmission+vec3(.022,.14,.17)*(1.-transmission),1.);gl_FragDepth=max(0.,sceneDepth-.0000001);return;}discard;}
 if(d*previous<0.){float low=previousT,high=t;for(int i=0;i<5;i++){float middle=(low+high)*.5;float dm=distanceAt(eye+rd*middle);if(dm*previous>0.)low=middle;else high=middle;}t=(low+high)*.5;}
 vec3 p=eye+rd*t,n=surfaceNormal(p);bool underwater=nearMedium;if(dot(n,rd)>0.)n=-n;
 // Small surface detail only; large waves would diverge from the voxel liquid.
 vec2 waves=vec2(sin(p.x*18.+p.z*11.+time*1.7),cos(p.z*21.-p.x*9.-time*1.3));
 n=normalize(n+vec3(waves.x,0.,waves.y)*.035*abs(n.y));
 vec4 clip=viewProjection*vec4(p,1.);float hitDepth=clip.z/clip.w*.5+.5;
 if(hitDepth>=sceneDepth)discard;gl_FragDepth=hitDepth;
 float thickness=underwater?max(0.,t-(baseDistance(eye)<0.?0.:clipStart)):0.;
 if(!underwater){float travelled=.008;for(int i=0;i<64;i++){float sd=distanceAt(p+rd*travelled);if(sd>.004||t+travelled>=sceneDistance||travelled>=6.)break;float stride=min(clamp(abs(sd)*.45,.012,.125),sceneDistance-t-travelled);thickness+=max(0.,stride);travelled+=stride;}}
 vec2 offset=n.xz*.025*min(thickness,2.5);vec2 refractedUv=clamp(uv+offset,vec2(.001),vec2(.999));
 // Reject foreground refraction taps instead of dragging actors across the edge.
 if(texture(opaqueDepth,refractedUv).r<hitDepth)refractedUv=uv;
 vec3 ground=texture(opaqueColor,refractedUv).rgb;
 vec3 absorption=exp(-vec3(.55,.18,.10)*min(thickness,8.));
 vec3 body=ground*absorption+vec3(.022,.14,.17)*(1.-absorption);
 float fresnel=.0204+.9796*pow(1.-max(0.,dot(n,-rd)),5.);
 vec3 reflected=reflect(rd,n);vec3 sky=mix(vec3(.10,.16,.19),vec3(.42,.58,.66),clamp(reflected.y*.6+.4,0.,1.));
 // Bounded screen-space reflection with depth intersection and sky fallback.
 for(int i=1;i<=12;i++){vec3 q=p+reflected*(float(i)*.24);vec4 projected=viewProjection*vec4(q,1.);if(projected.w<=0.)break;vec3 ndc=projected.xyz/projected.w;vec2 suv=ndc.xy*.5+.5;if(any(lessThan(suv,vec2(.01)))||any(greaterThan(suv,vec2(.99))))break;float depth=texture(opaqueDepth,suv).r;vec3 surface=worldAt(suv,depth);if(ndc.z*.5+.5>depth&&length(surface-q)<.3){sky=texture(opaqueColor,suv).rgb;break;}}
 float shore=(1.-smoothstep(.015,.15,thickness))*.28;
 float spec=pow(max(0.,dot(reflect(-normalize(vec3(.3,.8,.4)),n),-rd)),90.)*.5;
 vec3 color=mix(body,sky,fresnel)+vec3(.75,.85,.82)*shore+spec;
 if(underwater)color=mix(color,vec3(.02,.12,.15),.2);
 waterColor=vec4(color,1.);
}`;
