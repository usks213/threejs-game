import {combineMassComponents} from '../core/inertia';
import type {Profile,Vec3,SymmetricTensor,MassComponent} from '../core/types';
import {getCanonicalBladeVertices,getCanonicalRatchetVertices,getBitGeometry,getBladeMaterialGeometry} from '../core/body-geometry';

export interface MassProperties {mass:number;center:Vec3;inertia:SymmetricTensor}
export interface ClosedMesh {vertices:Vec3[];faces:[number,number,number][]}
const zero=():SymmetricTensor=>({xx:0,yy:0,zz:0,xy:0,xz:0,yz:0});
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scale=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const keys=['xx','yy','zz','xy','xz','yz'] as const;
export function parallelAxis(mass:number,d:Vec3):SymmetricTensor{return{xx:mass*(d.y*d.y+d.z*d.z),yy:mass*(d.x*d.x+d.z*d.z),zz:mass*(d.x*d.x+d.y*d.y),xy:-mass*d.x*d.y,xz:-mass*d.x*d.z,yz:-mass*d.y*d.z};}
/** Exact degree-two moments of a closed triangle mesh via signed tetrahedra, not equal vertex weights.
 * The origin is only an integration reference. All faces must form a consistently oriented closed surface.
 */
export function integrateClosedMesh(mesh:ClosedMesh,mass?:number):MassProperties {
  let volume=0,first:Vec3={x:0,y:0,z:0};const second=zero();
  for(const [i,j,k] of mesh.faces){const a=mesh.vertices[i],b=mesh.vertices[j],c=mesh.vertices[k],v=dot(a,cross(b,c))/6,s=add(add(a,b),c);volume+=v;first=add(first,scale(s,v/4));
    second.xx+=v*(s.x*s.x+a.x*a.x+b.x*b.x+c.x*c.x)/20;
    second.yy+=v*(s.y*s.y+a.y*a.y+b.y*b.y+c.y*c.y)/20;
    second.zz+=v*(s.z*s.z+a.z*a.z+b.z*b.z+c.z*c.z)/20;
    second.xy+=v*(s.x*s.y+a.x*a.y+b.x*b.y+c.x*c.y)/20;
    second.xz+=v*(s.x*s.z+a.x*a.z+b.x*b.z+c.x*c.z)/20;
    second.yz+=v*(s.y*s.z+a.y*a.z+b.y*b.z+c.y*c.z)/20;
  }
  if(!Number.isFinite(volume)||Math.abs(volume)<1e-18)throw new Error('Closed mass mesh has zero/nonfinite volume');
  const center=scale(first,1/volume),targetMass=mass??Math.abs(volume),density=targetMass/volume,shift=parallelAxis(targetMass,center);
  if(!Number.isFinite(targetMass)||targetMass<=0)throw new Error('Component mass must be positive');
  const inertia:SymmetricTensor={xx:density*(second.yy+second.zz)-shift.xx,yy:density*(second.xx+second.zz)-shift.yy,zz:density*(second.xx+second.yy)-shift.zz,xy:-density*second.xy-shift.xy,xz:-density*second.xz-shift.xz,yz:-density*second.yz-shift.yz};
  return{mass:targetMass,center,inertia};
}
/** Full parallel-axis aggregation; component tensors are about each component's own centroid. */
export function combineMassProperties(parts:readonly MassProperties[]):MassProperties {
  return combineMassComponents(parts.map(p=>({component:'blade',...p})));
}
/** Closed prism/frustum from matching lower/upper contour rings. Both loops share winding. */
export function ringMesh(vertices:Vec3[],innerScale=0):ClosedMesh {
  const n=vertices.length/2,all=vertices.map(v=>({...v})),faces:[number,number,number][]=[];
  if(!Number.isInteger(n)||n<3)throw new Error('Expected two contour rings');
  if(innerScale>0)all.push(...vertices.map(v=>({x:v.x*innerScale,y:v.y,z:v.z*innerScale})));
  else{all.push({x:0,y:vertices.slice(0,n).reduce((s,v)=>s+v.y,0)/n,z:0},{x:0,y:vertices.slice(n).reduce((s,v)=>s+v.y,0)/n,z:0});}
  for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,n+i,n+j],[i,n+j,j]);
    if(innerScale>0){faces.push([2*n+i,2*n+j,3*n+j],[2*n+i,3*n+j,3*n+i],[n+i,3*n+i,3*n+j],[n+i,3*n+j,n+j],[i,2*n+j,2*n+i],[i,j,2*n+j]);}
    else faces.push([2*n,i,j],[2*n+1,n+j,n+i]);
  }
  return{vertices:all,faces};
}
export function frustumMesh(bottomRadius:number,topRadius:number,bottomY:number,topY:number,samples=96):ClosedMesh {
  return ringMesh([bottomY,topY].flatMap((y,side)=>Array.from({length:samples},(_,i)=>{const a=i/samples*2*Math.PI,r=side?topRadius:bottomRadius;return{x:r*Math.cos(a),y,z:r*Math.sin(a)};})));
}
/** Real symmetric tensor eigenvalues, ascending; deterministic Jacobi rotations. */
export function principalInertias(t:SymmetricTensor):[number,number,number]{
  const a=[[t.xx,t.xy,t.xz],[t.xy,t.yy,t.yz],[t.xz,t.yz,t.zz]];
  for(let iteration=0;iteration<24;iteration++){let p=0,q=1;for(const [i,j] of [[0,1],[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
    if(Math.abs(a[p][q])<1e-20)break;const theta=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(theta),s=Math.sin(theta),pp=a[p][p],qq=a[q][q],pq=a[p][q];
    a[p][p]=c*c*pp-2*s*c*pq+s*s*qq;a[q][q]=s*s*pp+2*s*c*pq+c*c*qq;a[p][q]=a[q][p]=0;
    for(let k=0;k<3;k++)if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}
  }
  return[a[0][0],a[1][1],a[2][2]].sort((a,b)=>a-b) as [number,number,number];
}
// A multiple of each rotational symmetry order avoids invented imbalance from 48-vs-7/9 sampling.
const samplesFor=(count:number)=>Math.max(96,Math.ceil(96/Math.max(1,count))*Math.max(1,count));
export function deriveAssemblyMass(profile:Profile,masses:{blade:number;ratchet:number;bit:number},outwardMassConstraint:number):MassProperties&{components:MassComponent[];densityNotes:string[];materialZones:{rimMass:number;coreHubMass:number;rimDensity:number;coreDensity:number;densityRatio:number}} {
  const material=getBladeMaterialGeometry(profile),bladeSamples=samplesFor(profile.contactLobes),ratchetSamples=samplesFor(profile.ratchetLobes??1);
  const rimRaw=integrateClosedMesh(ringMesh(getCanonicalBladeVertices(profile,bladeSamples),material.rimInnerScale));
  const core=integrateClosedMesh(frustumMesh(material.core.radiusBottom,material.core.radiusTop,material.core.yMin,material.core.yMax));
  // The rendered hub begins inside the core. Clip that hidden overlap rather than counting it twice.
  const hubBottom=Math.max(material.hub.yMin,material.core.yMax),hubFraction=(hubBottom-material.hub.yMin)/(material.hub.yMax-material.hub.yMin);
  const hubRadius=material.hub.radiusBottom+(material.hub.radiusTop-material.hub.radiusBottom)*hubFraction;
  const hub=integrateClosedMesh(frustumMesh(hubRadius,material.hub.radiusTop,hubBottom,material.hub.yMax));
  const plasticRaw=combineMassProperties([core,hub]);
  // Previous outward-weight constraint now selects a DECLARED density ratio, not a post-fitted inertia.
  const rimToCoreDensityRatio=Math.max(4,Math.min(8,6+8*(outwardMassConstraint-.64)));
  const density=masses.blade/(rimRaw.mass*rimToCoreDensityRatio+plasticRaw.mass);
  const withDensity=(p:MassProperties,rho:number):MassProperties=>({mass:p.mass*rho,center:p.center,inertia:Object.fromEntries(keys.map(k=>[k,p.inertia[k]*rho])) as unknown as SymmetricTensor});
  const blade=combineMassProperties([withDensity(rimRaw,density*rimToCoreDensityRatio),withDensity(plasticRaw,density)]);
  const ratchet=integrateClosedMesh(ringMesh(getCanonicalRatchetVertices(profile,ratchetSamples)),masses.ratchet);
  const bit=getBitGeometry(profile),gearLow=bit.gearHeight-bit.engagementBand,gearHigh=bit.gearHeight+bit.engagementBand;
  const levels=[0,bit.tipLength,gearLow,gearHigh];
  if(bit.tipShape==='ball')for(let i=0;i<=24;i++)levels.push(2*bit.tipRadius*i/24);
  if(bit.discRadius>0)levels.push(bit.discHeight-bit.discHalfThickness,bit.discHeight+bit.discHalfThickness);
  const sorted=[...new Set(levels)].sort((a,b)=>a-b),bitZones:MassProperties[]=[];
  // Disjoint axial slices of the UNION of outer envelopes; no gear/stem/disc overlap is double-weighted.
  for(let i=1;i<sorted.length;i++){
    const lo=sorted[i-1],hi=sorted[i],mid=(lo+hi)/2;if(hi-lo<1e-12)continue;
    const gear=mid>gearLow&&mid<gearHigh,disc=bit.discRadius>0&&mid>bit.discHeight-bit.discHalfThickness&&mid<bit.discHeight+bit.discHalfThickness;
    const sphere=bit.tipShape==='ball'&&mid>0&&mid<2*bit.tipRadius,stem=mid>(bit.tipShape==='ball'?bit.tipRadius:0)&&mid<bit.tipLength;
    const radius=(y:number)=>Math.max(gear?bit.gearRadius:0,disc?bit.discRadius:0,sphere?Math.sqrt(Math.max(0,bit.tipRadius**2-(y-bit.tipRadius)**2)):0,stem?(bit.tipShape==='ball'?bit.tipRadius*.8+(bit.bodyRadius-bit.tipRadius*.8)*(y-bit.tipRadius)/(bit.tipLength-bit.tipRadius):bit.tipRadius+(bit.bodyRadius-bit.tipRadius)*y/bit.tipLength):0);
    const lower=radius(lo),upper=radius(hi);if(lower+upper>0)bitZones.push(integrateClosedMesh(frustumMesh(lower,upper,lo,hi)));
  }
  const bitRaw=combineMassProperties(bitZones),bitMass=withDensity(bitRaw,masses.bit/bitRaw.mass);
  const components:MassComponent[]=[{component:'blade',...blade},{component:'ratchet',...ratchet},{component:'bit',...bitMass}];
  return{...combineMassProperties(components),components,materialZones:{rimMass:rimRaw.mass*density*rimToCoreDensityRatio,coreHubMass:plasticRaw.mass*density,rimDensity:density*rimToCoreDensityRatio,coreDensity:density,densityRatio:rimToCoreDensityRatio},densityNotes:['金属リム/樹脂コアの推定密度比は4〜8（外周配分評価から単調変換）。体積に掛けて部品質量へ正規化。コア/ハブ重複は除去。装飾の質量は未計測。','ラチェットは描画輪郭の均質体。内部空洞・材質配分は未測定。','ビットは重複を除いた外接回転体の体積近似。球先端は24高さ区間、ギア歯間・ディスク穴の欠肉は未計測として区別。']};
}
