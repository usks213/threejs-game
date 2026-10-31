import {describe,it,expect} from 'vitest';
import {integrateClosedMesh,frustumMesh,ringMesh,combineMassProperties,parallelAxis,principalInertias,deriveAssemblyMass} from '../../../src/beyblade/data/assembly-mass';
import {parts,defaultBuild,buildForBlade,profileFor} from '../../../src/beyblade/data/catalog';
import {positiveDefinite} from '../../../src/beyblade/core/inertia';
const near=(a:number,b:number,relative=1e-3)=>expect(Math.abs(a-b)).toBeLessThan(Math.max(1e-14,Math.abs(b)*relative));
describe('exact mesh-volume moments and full tensor assembly',()=>{
  it('integrates a cylinder to its analytical COM/inertia, not equal vertex weights',()=>{
    const m=2,r=.03,h=.02,p=integrateClosedMesh(frustumMesh(r,r,.1,.1+h,192),m);
    near(p.center.y,.11,1e-10);expect(Math.hypot(p.center.x,p.center.z)).toBeLessThan(1e-14);
    near(p.inertia.yy,.5*m*r*r);near(p.inertia.xx,m*(3*r*r+h*h)/12);near(p.inertia.zz,p.inertia.xx,1e-10);expect(positiveDefinite(p.inertia)).toBe(true);
  });
  it('integrates an open annular rim without filling its central hole',()=>{
    const r=.03,h=.01,mesh=frustumMesh(r,r,0,h,192),n=(mesh.vertices.length-2)/2;
    const annulus=integrateClosedMesh(ringMesh(mesh.vertices.slice(0,2*n),.6),1);
    near(annulus.inertia.yy,.5*(r*r+(.6*r)**2));near(annulus.center.y,.005,1e-10);
  });
  it('obeys translation covariance and combines full parallel-axis products',()=>{
    const mesh=frustumMesh(.02,.01,0,.03,120),p=integrateClosedMesh(mesh,.04),d={x:.02,y:-.03,z:.01};
    const q=integrateClosedMesh({...mesh,vertices:mesh.vertices.map(v=>({x:v.x+d.x,y:v.y+d.y,z:v.z+d.z}))},.04);
    near(q.center.x,p.center.x+d.x,1e-10);near(q.center.y,p.center.y+d.y,1e-10);near(q.center.z,p.center.z+d.z,1e-10);
    for(const key of ['xx','yy','zz','xy','xz','yz'] as const)near(q.inertia[key],p.inertia[key],1e-8);
    const combined=combineMassProperties([p,q]),delta={x:d.x/2,y:d.y/2,z:d.z/2},shift=parallelAxis(.08,delta);
    for(const key of ['xx','yy','zz','xy','xz','yz'] as const)near(combined.inertia[key],p.inertia[key]*2+shift[key],1e-8);
    expect(combined.inertia.xy).not.toBe(0);expect(positiveDefinite(combined.inertia)).toBe(true);
  });
  it('obeys 90-degree rotation covariance and principal-inertia invariance',()=>{
    const mesh=frustumMesh(.025,.01,0,.04,120),p=integrateClosedMesh(mesh,.03),rotated=integrateClosedMesh({...mesh,vertices:mesh.vertices.map(v=>({x:v.y,y:-v.x,z:v.z}))},.03);
    near(rotated.center.x,p.center.y,1e-10);near(rotated.center.y,-p.center.x,1e-10);near(rotated.inertia.xx,p.inertia.yy,1e-8);near(rotated.inertia.yy,p.inertia.xx,1e-8);
    const a=principalInertias(p.inertia),b=principalInertias(rotated.inertia);a.forEach((v,i)=>near(v,b[i],1e-8));
  });
});


describe('geometry-derived component distributions',()=>{
  it('keeps N-fold ratchets centered while preserving two-fold anisotropy',()=>{
    for(const name of ['2-60','3-60','4-60','5-60','7-60','9-60']){
      const part=parts.find(p=>p.category==='ratchet'&&p.canonicalId===name)!,p=profileFor({...defaultBuild,ratchet:part.id}),r=p.massComponents!.find(c=>c.component==='ratchet')!;
      expect(Math.hypot(r.center.x,r.center.z),name).toBeLessThan(1e-12);expect(positiveDefinite(r.inertia)).toBe(true);
      if(name==='2-60')expect(Math.abs(r.inertia.xx-r.inertia.zz)).toBeGreaterThan(1e-9);
    }
  });
  it('gets one-lobe and one-sword lateral offsets from volume rather than a named offset constant',()=>{
    const ratchet=parts.find(p=>p.category==='ratchet'&&p.canonicalId==='1-60')!,p=profileFor({...defaultBuild,ratchet:ratchet.id});
    expect(Math.hypot(p.massComponents![1].center.x,p.massComponents![1].center.z)).toBeGreaterThan(.0001);
    const buster=profileFor(buildForBlade(parts.find(p=>p.name==='ドランバスター')!.id));
    expect(Math.hypot(buster.centerOfMass!.x,buster.centerOfMass!.z)).toBeGreaterThan(.0001);
    expect(Math.abs(buster.inertiaTensor!.xy)).toBeGreaterThan(1e-10);
  });
  it('changes vertical COM with actual ratchet layer height, preserving symmetric lateral COM',()=>{
    const p=(name:string)=>profileFor({...defaultBuild,ratchet:parts.find(p=>p.category==='ratchet'&&p.canonicalId===name)!.id});
    const low=p('3-60'),high=p('3-80');expect(high.centerOfMass!.y).toBeGreaterThan(low.centerOfMass!.y);
    expect(Math.hypot(high.centerOfMass!.x,high.centerOfMass!.z)).toBeLessThan(1e-12);
  });
  it('retains a monotone rating-informed outward-density constraint with fixed geometry and total mass',()=>{
    const p=profileFor(defaultBuild),low=deriveAssemblyMass(p,p.componentMasses!,.48),high=deriveAssemblyMass(p,p.componentMasses!,.88);
    near(low.mass,high.mass,1e-12);expect(high.inertia.yy).toBeGreaterThan(low.inertia.yy);
    expect(Math.hypot(low.center.x,low.center.z)).toBeLessThan(1e-12);expect(Math.hypot(high.center.x,high.center.z)).toBeLessThan(1e-12);
    expect(positiveDefinite(high.inertia)).toBe(true);
  });
});
