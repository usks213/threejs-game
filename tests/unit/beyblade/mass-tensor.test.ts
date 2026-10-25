import {describe,it,expect} from 'vitest';
import type {Profile,SymmetricTensor,MassComponent} from '../../../src/beyblade/core/types';
import {combineMassComponents,diagonalTensor,multiplyTensor,inverseTensor,positiveDefinite} from '../../../src/beyblade/core/inertia';
import {createBattle,integrateFree,kineticEnergy,resolveFloor,ratchetImpulseTwist,setAngularVelocity,setOrientation,geometryToCOM,getCanonicalBladeVertices,getBladeVertices,inverseInertia} from '../../../src/beyblade/core/physics';
const p:Profile={name:'analytical',type:'balance',spin:1,mass:.035,radius:.024,inertia:1.3e-5,transverseInertia:8e-6,centerOfMassHeight:.02,height:.028,grip:0,drag:0,restitution:.4,burstThreshold:.03,railGrip:.7,gearRadius:.006,gearHeight:.007,railEligible:true,contactLobes:4,contactLobeDepth:.05,color:0,tipShape:'ball',tipRadius:.001,tipFriction:0,rollingDrag:0};
const make=(profile=p)=>createBattle([profile,profile],[{power:.8,angle:0,tilt:0},{power:.8,angle:0,tilt:0}]).tops[0];
describe('canonical COM and full symmetric inertia',()=>{
  it('combines exact 3D mass centres with all products of inertia',()=>{
    const parts:MassComponent[]=[{component:'blade',mass:2,center:{x:1,y:2,z:3},inertia:diagonalTensor(.1,.1,.1)},{component:'ratchet',mass:1,center:{x:-2,y:0,z:1},inertia:diagonalTensor(.2,.3,.4)}];
    const result=combineMassComponents(parts);expect(result.center).toEqual({x:0,y:4/3,z:7/3});
    const expected:SymmetricTensor={xx:.3+16/3,yy:.4+26/3,zz:.5+26/3,xy:-4,xz:-4,yz:-8/3};
    for(const k of Object.keys(expected) as (keyof SymmetricTensor)[])expect(result.inertia[k]).toBeCloseTo(expected[k],12);
  });
  it('inverts SI tensors without an absolute determinant cutoff and rejects non-SPD data',()=>{
    const tensor={xx:8e-6,yy:1.3e-5,zz:8e-6,xy:1.1e-6,xz:-.7e-6,yz:.9e-6};expect(positiveDefinite(tensor)).toBe(true);
    const v={x:.2,y:-.3,z:.4},restored=multiplyTensor(inverseTensor(tensor),multiplyTensor(tensor,v));for(const k of ['x','y','z'] as const)expect(restored[k]).toBeCloseTo(v[k],12);
    expect(()=>make({...p,inertiaTensor:{...tensor,xy:1}})).toThrow('positive definite');
  });
  it('transforms every blade vertex by the full canonical COM, exactly once',()=>{
    const profile={...p,centerOfMass:{x:.003,y:.021,z:-.002}},canonical=getCanonicalBladeVertices(profile),local=getBladeVertices(profile);
    expect(local).toEqual(canonical.map(v=>geometryToCOM(profile,v)));
    expect(local[0].x).toBeCloseTo(canonical[0].x-.003,14);expect(local[0].z).toBeCloseTo(canonical[0].z+.002,14);
  });
  it('uses lateral COM in the support impulse lever arm',()=>{
    const top=make({...p,centerOfMass:{x:.003,y:.02,z:0}});setOrientation(top,{x:0,y:0,z:0,w:1});setAngularVelocity(top,{x:0,y:0,z:0});top.x=.003;top.y=.02;top.z=0;top.vx=top.vz=0;top.vy=-.1;
    const before=top.angularMomentum.z,j=resolveFloor(top);expect(j).toBeGreaterThan(0);expect(top.angularMomentum.z-before).toBeCloseTo(-.003*j,12);
  });
  it('loads detent twist about the physical stem, not the displaced COM',()=>{
    const top=make({...p,centerOfMass:{x:.003,y:.02,z:.002}});setOrientation(top,{x:0,y:0,z:0,w:1});top.x=.003;top.z=.002;top.y=.02;
    expect(ratchetImpulseTwist(top,{x:0,y:.012,z:0},{x:1,y:0,z:1})).toBeCloseTo(0,14);
    expect(ratchetImpulseTwist(top,{x:.01,y:.012,z:0},{x:0,y:0,z:1})).toBeCloseTo(-.01,14);
  });
  it('does not use the axisymmetric propagator when Ixx=Izz but products are nonzero',()=>{
    const tensor={xx:8e-6,yy:1.3e-5,zz:8e-6,xy:1.1e-6,xz:-.7e-6,yz:.9e-6};
    const run=(dt:number)=>{const top=make({...p,inertiaTensor:tensor});setAngularVelocity(top,{x:30,y:400,z:-20});const L=structuredClone(top.angularMomentum),energy=kineticEnergy(top);for(let i=0;i<Math.round(.05/dt);i++)integrateFree(top,dt,false,false);expect(top.angularMomentum).toEqual(L);return{top,energy};};
    const reference=run(1/64000),coarse=run(1/4000),fine=run(1/8000);
    const error=(a:typeof fine)=>Math.min(Math.hypot(...(['x','y','z','w'] as const).map(k=>a.top.orientation[k]-reference.top.orientation[k])),Math.hypot(...(['x','y','z','w'] as const).map(k=>a.top.orientation[k]+reference.top.orientation[k])));
    expect(error(fine)).toBeLessThan(error(coarse)*.3);expect(Math.abs(kineticEnergy(fine.top)-fine.energy)/fine.energy).toBeLessThan(1e-4);
    expect(inverseInertia(fine.top,fine.top.angularMomentum)).toEqual(fine.top.angularVelocity);
  });
});
