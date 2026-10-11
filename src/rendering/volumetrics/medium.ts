/** CPU reference for the bounded WebGL adaptation of Krause (GPC 2025).
 * Radiance source q is sigmaS * incident light, not an already integrated color. */
export interface Medium { extinction:number; source:readonly [number,number,number] }
export function integrateMedium(medium:Medium,distance:number){
 const d=Math.max(0,distance),sigma=Math.max(0,medium.extinction),transmittance=Math.exp(-sigma*d);
 const integral=sigma>1e-7?-Math.expm1(-sigma*d)/sigma:d;
 return {transmittance,radiance:medium.source.map(q=>q*integral)};
}
export function combineMedia(a:Medium,b:Medium):Medium{return {extinction:a.extinction+b.extinction,source:[a.source[0]+b.source[0],a.source[1]+b.source[1],a.source[2]+b.source[2]]};}
export function froxelDepth(u:number,near:number,far:number){const a=far*.5,b=(far-near)/a;return near+b*(Math.pow(a+1,Math.max(0,Math.min(1,u)))-1);}
export function froxelCoordinate(depth:number,near:number,far:number){const a=far*.5,b=(far-near)/a;return Math.max(0,Math.min(1,Math.log((Math.max(near,depth)-near)/b+1)/Math.log(a+1)));}
export function henyeyGreenstein(cosine:number,g:number){return (1-g*g)/(4*Math.PI*Math.pow(Math.max(.0001,1+g*g-2*g*cosine),1.5));}
export function dualPhase(cosine:number){return .8*henyeyGreenstein(cosine,.55)+.2*henyeyGreenstein(cosine,-.25);}
export interface FogBox { min:readonly [number,number,number];max:readonly [number,number,number];density:number }
export function boxDistance(x:number,y:number,z:number,box:FogBox){
 const qx=Math.abs(x-(box.min[0]+box.max[0])*.5)-(box.max[0]-box.min[0])*.5;
 const qy=Math.abs(y-(box.min[1]+box.max[1])*.5)-(box.max[1]-box.min[1])*.5;
 const qz=Math.abs(z-(box.min[2]+box.max[2])*.5)-(box.max[2]-box.min[2])*.5;
 return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0);
}
