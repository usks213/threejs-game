import type {Profile,Vec3} from './types';
const V=(x=0,y=0,z=0):Vec3=>({x,y,z});
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const bitHeightOffset=(p:Profile)=>p.bitHeightOffset??0;
export const getCenterOfMass=(p:Profile):Vec3=>p.centerOfMass??V(0,(p.centerOfMassHeight??p.height*.72)+bitHeightOffset(p),0);
export const comHeight=(p:Profile)=>getCenterOfMass(p).y;
export const geometryToCOM=(p:Profile,v:Vec3):Vec3=>{const c=getCenterOfMass(p);return V(v.x-c.x,v.y-c.y,v.z-c.z);};
export const gearHeightAt=(p:Profile)=>p.gearHeight+bitHeightOffset(p);
export function getBitGeometry(p:Profile){const tipRadius=p.tipRadius??.0015,gearHeight=gearHeightAt(p);return{gearRadius:p.gearRadius,gearHeight,gearTeeth:p.gearTeeth??12,engagementBand:p.gearEngagementBand??.0045,tipRadius,tipShape:p.tipShape??'taper',tipLength:Math.max(tipRadius*2,gearHeight*.75),bodyRadius:p.gearRadius*.65,discRadius:p.bitDiscRadius??0,discHeight:(p.bitDiscHeight??p.gearHeight*.65)+bitHeightOffset(p),discHalfThickness:.001};}
/** Piecewise angular control points are estimated silhouette cues, not scanned OEM geometry. */
function contourAt(phase:number,points:readonly (readonly [number,number])[]):number{
  const a=Math.atan2(Math.sin(phase),Math.cos(phase));
  for(let i=1;i<points.length;i++)if(a<=points[i][0]){const [x0,y0]=points[i-1],[x1,y1]=points[i];return y0+(y1-y0)*(a-x0)/(x1-x0);}
  return points[points.length-1][1];
}
export function bladeRadiusAt(profile:Profile,angle:number):number{
  const phase=profile.contactLobes*angle*(profile.bladeHandedness??profile.spin),skew=profile.bladeSkew??0;
  let wave=(Math.cos(phase)+skew*Math.sin(2*phase))/(1+Math.abs(skew));
  // Source-informed families, explicitly estimated contours. The same function drives display and contact samples.
  switch(profile.bladeStyle){
    case 'single-sword':wave=contourAt(phase,[[-Math.PI,-.35],[-2.35,.15],[-1.7,-.55],[-.78,.35],[-.4,-1],[0,1],[.4,-1],[.78,.35],[1.7,-.55],[2.35,.15],[Math.PI,-.35]]);break;
    case 'sword':case 'uppercut':wave=contourAt(phase,[[-Math.PI,-.65],[-2.1,-.8],[-.8,-.5],[.15,.15],[.85,1],[1.05,-.75],[2.1,-.95],[Math.PI,-.65]]);break;
    case 'scythe':case 'smash':wave=contourAt(phase,[[-Math.PI,-.55],[-2.0,-.8],[-.6,-.15],[.35,.6],[1.0,1],[1.25,-.65],[2.4,-.75],[Math.PI,-.55]]);break;
    case 'broad-wing':wave=contourAt(phase,[[-Math.PI,-.75],[-2.2,-.65],[-1,.15],[.35,.8],[1,1],[1.15,-.9],[2.4,-.85],[Math.PI,-.75]]);break;
    case 'shield':wave=clamp(wave*1.5,-1,1);break;
    case 'round-wing':wave=.65*wave+.35*Math.cos(2*phase);break;
  }
  const sharpness=profile.bladeEdgeSharpness??1;
  if(sharpness!==1)wave=Math.sign(wave)*Math.abs(wave)**sharpness;
  return profile.radius*(1+profile.contactLobeDepth*wave);
}
export function canonicalBladeCenterHeightAt(profile:Profile,angle:number):number{
  return profile.height*.82+bitHeightOffset(profile)+(profile.bladeRampAmplitude??0)*Math.sin(profile.contactLobes*angle*(profile.bladeHandedness??profile.spin));
}
export function getBladeOutline(profile:Profile,samples=48):{x:number;z:number}[]{return Array.from({length:samples},(_,i)=>{const a=i/samples*Math.PI*2,r=bladeRadiusAt(profile,a);return{x:r*Math.cos(a),z:r*Math.sin(a)};});}
export function getRatchetGeometry(profile:Profile){return{radius:profile.ratchetRadius??profile.radius*.65,centerHeight:(profile.ratchetCenterHeight??profile.height*.43)+bitHeightOffset(profile),halfThickness:profile.ratchetHalfThickness??.0025,lobes:profile.ratchetLobes??0,lobeDepth:profile.ratchetLobeDepth??0,skew:profile.ratchetSkew??0};}
export function getRatchetOutline(profile:Profile,samples=48):{x:number;z:number}[]{const geometry=getRatchetGeometry(profile);return Array.from({length:samples},(_,i)=>{const a=i/samples*Math.PI*2,phase=geometry.lobes*a,r=geometry.radius*(1+geometry.lobeDepth*(Math.cos(phase)+geometry.skew*Math.sin(2*phase))/(1+Math.abs(geometry.skew)));return{x:r*Math.cos(a),z:r*Math.sin(a)};});}
export function getCanonicalRatchetVertices(profile:Profile,samples=48):Vec3[]{const geometry=getRatchetGeometry(profile),outline=getRatchetOutline(profile,samples);return[-1,1].flatMap(side=>outline.map(p=>V(p.x,geometry.centerHeight+side*geometry.halfThickness,p.z)));}
export function getCanonicalBladeVertices(profile:Profile,samples=48):Vec3[]{const outline=getBladeOutline(profile,samples),half=(profile.bladeThickness??.009)/2;return[-1,1].flatMap(side=>outline.map((p,i)=>V(p.x,canonicalBladeCenterHeightAt(profile,i/samples*Math.PI*2)+side*half,p.z)));}
export const bladeCenterHeightAt=(p:Profile,a:number)=>canonicalBladeCenterHeightAt(p,a)-comHeight(p);
export const getBladeVertices=(p:Profile,n=48)=>getCanonicalBladeVertices(p,n).map(v=>geometryToCOM(p,v));
export const getRatchetVertices=(p:Profile,n=48)=>getCanonicalRatchetVertices(p,n).map(v=>geometryToCOM(p,v));
export function getCanonicalBitVertices(p:Profile,samples=48):Vec3[]{
  const bit=getBitGeometry(p),vertices:Vec3[]=[];
  const ring=(radius:number,y:number)=>{for(let i=0;i<samples;i++){const a=i/samples*Math.PI*2;vertices.push(V(radius*Math.cos(a),y,radius*Math.sin(a)));}};
  ring(bit.gearRadius,bit.gearHeight-bit.engagementBand);ring(bit.gearRadius,bit.gearHeight+bit.engagementBand);
  ring(bit.bodyRadius,bit.tipLength);ring(bit.tipRadius,bit.tipShape==='ball'?bit.tipRadius:0);vertices.push(V(0,0,0));
  if(bit.discRadius){ring(bit.discRadius,bit.discHeight-bit.discHalfThickness);ring(bit.discRadius,bit.discHeight+bit.discHalfThickness);}
  return vertices;
}
/** Shared estimated material zones. Small surface relief is decorative and excluded from bulk mass. */
export function getBladeMaterialGeometry(p:Profile){
  const coreRadius=p.radius*(p.bladeStyle==='round-wing'?.53:p.bladeStyle==='single-sword'?.40:.46),topY=p.height*.82+bitHeightOffset(p)+(p.bladeThickness??.009)/2;
  return{rimInnerScale:.63,coreRadius,topY,core:{radiusBottom:coreRadius*1.08,radiusTop:coreRadius,yMin:topY,yMax:topY+.0026},hub:{radiusBottom:coreRadius*.62,radiusTop:coreRadius*.55,yMin:topY+.0021,yMax:topY+.0041}};
}
