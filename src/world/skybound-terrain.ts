import type { Vec3 } from './types';
/** Authored landmarks belong to this original world; none are a reference-game map. */
export const SKY_ISLANDS = [
 {x:18,y:25,z:-18,radius:10,depth:4}, {x:-22,y:34,z:-30,radius:12,depth:5},
 {x:48,y:29,z:24,radius:14,depth:5}, {x:-48,y:27,z:36,radius:11,depth:4},
 {x:78,y:38,z:-42,radius:16,depth:6}, {x:-76,y:36,z:-70,radius:18,depth:6},
] as const;
export const CHASMS = [{x:28,z:8,radius:3.5},{x:-38,z:-12,radius:4},{x:64,z:56,radius:5}] as const;
export function skyboundDensity(p:Vec3,surface:number):number {
 // A connected sub-surface cavern. Stone columns give orientation and support.
 const cave=Math.max(Math.abs(p.y+7.5)-3,Math.abs(p.x)-920,Math.abs(p.z)-920);
 let d=Math.max(p.y-surface,-cave);
 const cx=Math.round(p.x/28)*28,cz=Math.round(p.z/28)*28;
 if(Math.hypot(cx,cz)>20){
  const vertical=Math.abs(p.y+7.5)-4;
  // A strict bound cannot affect min, including signed-zero ties. Non-finite
  // column centers retain the original arithmetic/NaN behavior.
  if(!(vertical>d)||!Number.isFinite(cx)||!Number.isFinite(cz)){const pillar=Math.max(Math.hypot(p.x-cx,p.z-cz)-1.7,vertical);d=Math.min(d,pillar);}
 }
 for(const chasm of CHASMS){
  const dx=p.x-chasm.x,dz=p.z-chasm.z,vertical=Math.abs(p.y+1)-10;
  const lower=Math.max(Math.max(Math.abs(dx),Math.abs(dz))-chasm.radius,vertical);
  if(-lower<d)continue;
  const hole=Math.max(Math.hypot(dx,dz)-chasm.radius,vertical);d=Math.max(d,-hole);
 }
 // An ancient inclined causeway teaches vertical exploration before free flight.
 const rampTop=3+(8-p.z)*.58;
 const ramp=Math.max(Math.abs(p.x-10)-2,p.z-8,-18-p.z,p.y-rampTop,rampTop-1.2-p.y);
 const apronTop=3-(p.z-8)*.16,apron=Math.max(Math.abs(p.x-10)-2,p.z-20,8-p.z,p.y-apronTop,apronTop-.9-p.y);
 d=Math.min(d,ramp,apron);
 for(const island of SKY_ISLANDS){
  const top=p.y-island.y,bottom=island.y-island.depth-p.y;
  if(Math.max(top,bottom)>d)continue;
  const horizontal=Math.hypot(p.x-island.x,p.z-island.z), taper=Math.max(0,(island.y-p.y)/island.depth);
  // Flat tops and a tapering underside remain genuine 3D density, editable everywhere.
  const shape=Math.max(horizontal-island.radius*(1-.65*Math.min(1,taper)),top,bottom);
  d=Math.min(d,shape);
 }
 return d;
}
export function skyboundLayer(y:number):'sky'|'surface'|'depths'{return y>17?'sky':y<-3?'depths':'surface';}
