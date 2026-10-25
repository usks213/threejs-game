import {describe,it,expect} from 'vitest';
import {createBattle,splitBurstTop,stepBattle,stepSettlingBattle,kineticEnergy,totalEnergy,rotate,getBladeVertices,getFragmentVertices,STEP,SETTLING_SECONDS} from '../../../src/beyblade/core/physics';
import {profileFor,defaultBuild,buildForBlade,parts} from '../../../src/beyblade/data/catalog';
import type {Top,Vec3} from '../../../src/beyblade/core/types';
const p=()=>profileFor(defaultBuild);
const battle=()=>createBattle([p(),p()],[{power:.8,angle:.2,tilt:.3},{power:.76,angle:-.12,tilt:.11}]);
const momentum=(bodies:Top[])=>bodies.reduce((a,t)=>({x:a.x+t.profile.mass*t.vx,y:a.y+t.profile.mass*t.vy,z:a.z+t.profile.mass*t.vz}),{x:0,y:0,z:0});
const angular=(bodies:Top[])=>bodies.reduce((a,t)=>({x:a.x+t.angularMomentum.x+t.profile.mass*(t.y*t.vz-t.z*t.vy),y:a.y+t.angularMomentum.y+t.profile.mass*(t.z*t.vx-t.x*t.vz),z:a.z+t.angularMomentum.z+t.profile.mass*(t.x*t.vy-t.y*t.vx)}),{x:0,y:0,z:0});
const closeVector=(a:Vec3,b:Vec3)=>{for(const axis of ['x','y','z'] as const)expect(a[axis]).toBeCloseTo(b[axis],12);};
describe('physical burst partition and unscored observation',()=>{
  it('preserves mass, linear/angular momentum and kinetic energy without a separation kick',()=>{
    const b=battle(),top=b.tops[0],before=structuredClone(top);top.lock=.2;const energy=totalEnergy(top);
    const f=splitBurstTop(b,0);
    expect(f).toHaveLength(3);expect(f.reduce((s,t)=>s+t.profile.mass,0)).toBeCloseTo(before.profile.mass,14);
    closeVector(momentum(f),momentum([before]));closeVector(angular(f),angular([before]));
    expect(f.reduce((s,t)=>s+kineticEnergy(t),0)).toBeCloseTo(kineticEnergy(before),12);
    expect(f.reduce((s,t)=>s+totalEnergy(t),0)).toBeLessThan(energy);
    for(const t of f){for(const i of Object.values(t.bodyInertia))expect(i).toBeGreaterThan(0);expect(t.centerOfMassHeight).toBe(t.profile.centerOfMass?.y);}
    expect(splitBurstTop(b,0)).toEqual(f);expect(b.fragments).toHaveLength(3);
  });
  it('does not invent separable units for an unsupported integrated structure',()=>{
    const b=battle();b.tops[0].profile.burstSeparationSupported=false;b.tops[0].lock=1;
    expect(splitBurstTop(b,0)).toEqual([]);expect(b.tops[0].separated).not.toBe(true);
    stepBattle(b);expect(b.result?.finish).toBe('burst');expect(b.fragments).toEqual([]);
    expect(b.events.some(e=>e.kind==='burst-split')).toBe(false);
    const result=structuredClone(b.result),before=b.tops[0].y;stepSettlingBattle(b);
    expect(b.result).toEqual(result);expect(b.tops[0].y).not.toBe(before);expect(b.tops[0].separated).not.toBe(true);
  });
  it('uses exact original geometry positions at split, including a tilted body',()=>{
    const b=battle(),old=b.tops[0],point=getBladeVertices(old.profile,24)[0],oldWorld=rotate(old.orientation,point);
    oldWorld.x+=old.x;oldWorld.y+=old.y;oldWorld.z+=old.z;
    const f=splitBurstTop(b,0)[0],local=getFragmentVertices(f,24)[0],world=rotate(f.orientation,local);world.x+=f.x;world.y+=f.y;world.z+=f.z;
    closeVector(oldWorld,world);
  });
  it('continues deterministic body motion for only 2.5 s without changing result or finish events',()=>{
    const b=battle();b.tops[0].lock=1;stepBattle(b);expect(b.result?.finish).toBe('burst');expect(b.fragments).toHaveLength(3);
    const result=structuredClone(b.result),events=structuredClone(b.events),initial=structuredClone(b.fragments),clone=JSON.parse(JSON.stringify(b)),tick=b.tick,winner=structuredClone(b.tops[1]);
    for(let i=0;i<SETTLING_SECONDS/STEP+2;i++){stepSettlingBattle(b);stepSettlingBattle(clone);}
    expect(b).toEqual(clone);expect(b.result).toEqual(result);expect(b.events).toEqual(events);expect(b.settling?.remaining).toBe(0);expect(b.tick-tick).toBe(600);
    expect(b.fragments.map(f=>[f.x,f.y,f.z])).not.toEqual(initial.map(f=>[f.x,f.y,f.z]));expect(b.tops[1].x).not.toBe(winner.x);
    for(const f of [...b.fragments,...b.tops])expect([f.x,f.y,f.z,f.vx,f.vy,f.vz,...Object.values(f.orientation),...Object.values(f.angularMomentum)].every(Number.isFinite)).toBe(true);
    const settled=JSON.stringify(b);stepBattle(b);expect(JSON.stringify(b)).toBe(settled);
  },30000);
  it('splits an actual legal-launch burst and visibly separates component centres under physics',()=>{
    const cpu=profileFor(buildForBlade(parts.find(p=>p.category==='blade'&&p.release==='released'&&p.id!==defaultBuild.blade)!.id));
    const build={...buildForBlade(parts.find(p=>p.category==='blade'&&p.canonicalId==='ドランバスター'&&p.release==='released')!.id),ratchet:parts.find(p=>p.category==='ratchet'&&p.canonicalId==='1-60')!.id,bit:parts.find(p=>p.category==='bit'&&p.canonicalId==='A')!.id};
    const b=createBattle([profileFor(build),cpu],[{power:.8,angle:0,tilt:8*Math.PI/180},{power:.76,angle:-.12,tilt:.11}]);
    for(let i=0;i<240*15&&!b.result;i++)stepBattle(b);
    expect(b.result?.finish).toBe('burst');expect(b.fragments.length).toBeGreaterThan(0);
    const before=b.fragments.map(f=>({x:f.x,y:f.y,z:f.z}));for(let i=0;i<240;i++)stepSettlingBattle(b);
    expect(b.fragments.some((f,i)=>Math.hypot(f.x-before[i].x,f.y-before[i].y,f.z-before[i].z)>.01)).toBe(true);
  },30000);
});
