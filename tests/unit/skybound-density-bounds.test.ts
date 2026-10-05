import {expect,it} from 'vitest';
import {SKY_ISLANDS,CHASMS,skyboundDensity} from '../../src/world/skybound-terrain';
import type {Vec3} from '../../src/world/types';
// Frozen original numeric function; compare Numbers with Object.is, including -0.
function reference(p:Vec3,surface:number):number {
 // A connected sub-surface cavern. Stone columns give orientation and support.
 const cave=Math.max(Math.abs(p.y+7.5)-3,Math.abs(p.x)-920,Math.abs(p.z)-920);
 let d=Math.max(p.y-surface,-cave);
 const cx=Math.round(p.x/28)*28,cz=Math.round(p.z/28)*28;
 if(Math.hypot(cx,cz)>20){const pillar=Math.max(Math.hypot(p.x-cx,p.z-cz)-1.7,Math.abs(p.y+7.5)-4);d=Math.min(d,pillar);}
 for(const chasm of CHASMS){const hole=Math.max(Math.hypot(p.x-chasm.x,p.z-chasm.z)-chasm.radius,Math.abs(p.y+1)-10);d=Math.max(d,-hole);}
 // An ancient inclined causeway teaches vertical exploration before free flight.
 const rampTop=3+(8-p.z)*.58;
 const ramp=Math.max(Math.abs(p.x-10)-2,p.z-8,-18-p.z,p.y-rampTop,rampTop-1.2-p.y);
 const apronTop=3-(p.z-8)*.16,apron=Math.max(Math.abs(p.x-10)-2,p.z-20,8-p.z,p.y-apronTop,apronTop-.9-p.y);
 d=Math.min(d,ramp,apron);
 for(const island of SKY_ISLANDS){
  const horizontal=Math.hypot(p.x-island.x,p.z-island.z), taper=Math.max(0,(island.y-p.y)/island.depth);
  // Flat tops and a tapering underside remain genuine 3D density, editable everywhere.
  const shape=Math.max(horizontal-island.radius*(1-.65*Math.min(1,taper)),p.y-island.y,island.y-island.depth-p.y);
  d=Math.min(d,shape);
 }
 return d;
}

it('returns identical numeric density for dense world probes, not just an identical sign',()=>{
 let random=19384;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 for(let i=0;i<150000;i++){const p={x:(next()-.5)*(i%2?2100:200),y:next()*100-30,z:(next()-.5)*(i%2?2100:200)},surface=next()*100-30;expect(skyboundDensity(p,surface)).toBe(reference(p,surface));}
});
it('preserves exact boundary, CSG tie, signed-zero and non-finite arithmetic',()=>{
 const check=(p:Vec3)=>{for(const surface of [-10,-0,0,3,15,40,Infinity,-Infinity,NaN])expect(skyboundDensity(p,surface)).toBe(reference(p,surface));};
 for(const epsilon of [-1e-10,0,1e-10]){
  for(const island of SKY_ISLANDS)for(const depth of [0,island.depth/2,island.depth]){const y=island.y-depth+epsilon,radius=island.radius*(1-.65*Math.min(1,Math.max(0,(island.y-y)/island.depth)));for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI])check({x:island.x+(radius+epsilon)*Math.cos(angle),y,z:island.z+(radius+epsilon)*Math.sin(angle)});}
  for(const chasm of CHASMS)for(const y of [-11,-10.5,-4.5,0,9])for(const angle of [0,Math.PI/4,Math.PI/2])check({x:chasm.x+(chasm.radius+epsilon)*Math.cos(angle),y:y+epsilon,z:chasm.z+(chasm.radius+epsilon)*Math.sin(angle)});
  for(const z of [-18,0,8,20])for(const x of [8,10,12]){const top=z<=8?3+(8-z)*.58:3-(z-8)*.16;for(const y of [top,top-(z<=8?1.2:.9)])check({x:x+epsilon,y:y+epsilon,z:z+epsilon});}
  for(const x of [-920,0,920])for(const z of [-920,0,920])for(const y of [-11.5,-10.5,-4.5,-3.5])check({x:x+epsilon,y:y+epsilon,z:z+epsilon});
 }
 for(const value of [NaN,Infinity,-Infinity,-0,0])for(const axis of ['x','y','z'] as const)check({x:0,y:0,z:0,[axis]:value});
});
