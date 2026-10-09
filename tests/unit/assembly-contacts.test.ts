import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ASSEMBLY_CONTACT_BUDGET, skyPartsOverlap, skyPartOverlapsCapsule, transferAssemblyContacts } from '../../src/game/skybound/assembly-contacts';
import { massProperties } from '../../src/game/skybound/rigid';
import { cross, dot, plus, scale, increment } from '../../src/game/skybound/orientation';
import type { SkyPart } from '../../src/game/skybound/types';
import type { Vec3 } from '../../src/world/types';
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
function part(id: number, x: number, vx = 0, mass = 6): SkyPart {
  return { id, kind: 'block', material: mass === 30 ? 'metal' : 'wood', mass, position: { x, y: 4, z: 0 }, velocity: { x: vx, y: 0, z: 0 }, angularVelocity: zero(), rotation: 0, links: [], epoch: 0, creator: 'owner' };
}
const run = (parts: SkyPart[], dt = 1 / 30) => transferAssemblyContacts(parts.map(p => ({ parts: [p] })), dt);
const momentum = (parts: SkyPart[]) => parts.reduce((sum, p) => plus(sum, scale(p.velocity, p.mass)), zero());
function spinMomentum(p: SkyPart): Vec3 {
  const m = massProperties([p]).inverseInertia, [a,b,c,d,e,f,g,h,i] = m;
  const A=e*i-f*h, B=c*h-b*i, C=b*f-c*e, D=f*g-d*i, E=a*i-c*g, F=c*d-a*f, G=d*h-e*g, H=b*g-a*h, I=a*e-b*d, determinant=a*A+b*D+c*G;
  const w = p.angularVelocity ?? zero();
  return { x:(A*w.x+B*w.y+C*w.z)/determinant, y:(D*w.x+E*w.y+F*w.z)/determinant, z:(G*w.x+H*w.y+I*w.z)/determinant };
}
const angularMomentum = (parts: SkyPart[]) => parts.reduce((sum, p) => plus(sum, plus(spinMomentum(p), cross(p.position, scale(p.velocity, p.mass)))), zero());
const energy = (parts: SkyPart[]) => parts.reduce((sum, p) => sum + .5*p.mass*dot(p.velocity,p.velocity) + .5*dot(p.angularVelocity ?? zero(),spinMomentum(p)), 0);
function expectVector(actual: Vec3, expected: Vec3, precision = 8) { for (const key of ['x','y','z'] as const) expect(actual[key]).toBeCloseTo(expected[key], precision); }

it('transfers centered contact momentum to equal and unequal masses with no restitution or artificial spin', () => {
  for (const otherMass of [6,30]) {
    const a=part(1,-.51,3), b=part(2,.51,0,otherMass), before=momentum([a,b]), initialEnergy=energy([a,b]);
    const stats=run([a,b]);
    expect(stats.contacts).toBe(1); expect(stats.impulses).toBe(1);
    expect(a.velocity.x).toBeCloseTo(18/(6+otherMass)); expect(b.velocity.x).toBeCloseTo(a.velocity.x);
    expectVector(momentum([a,b]),before); expectVector(a.angularVelocity!,zero()); expectVector(b.angularVelocity!,zero());
    expect(energy([a,b])).toBeLessThan(initialEnergy);
  }
});

it('uses strict static OBB overlap with touching faces allowed, including rotated thin crossed edges', () => {
  const a=part(1,0),b=part(2,1);expect(skyPartsOverlap(a,b)).toBe(false);
  b.position.x-=.0001;expect(skyPartsOverlap(a,b)).toBe(true);
  b.position.x=1-1e-7;expect(skyPartsOverlap(a,b)).toBe(false);
  a.kind=b.kind='beam';b.position.x=0;b.q=increment({x:0,y:1,z:0},Math.PI/2);
  expect(skyPartsOverlap(a,b)).toBe(true);
  b.position.y+=.25;expect(skyPartsOverlap(a,b)).toBe(false);
  b.position.y-=.0001;expect(skyPartsOverlap(a,b)).toBe(true);
  b.position.z=5;expect(skyPartsOverlap(a,b)).toBe(false);
});

it('rejects continuous capsule overlap at tilted edges while permitting exact contact and failing closed on invalid geometry', () => {
  const p=part(1,0),foot={x:.8,y:3.2,z:0};
  expect(skyPartOverlapsCapsule(p,foot)).toBe(false);expect(skyPartOverlapsCapsule(p,{...foot,x:.7999})).toBe(true);
  expect(skyPartOverlapsCapsule(p,{x:0,y:4.5,z:0})).toBe(false);expect(skyPartOverlapsCapsule(p,{x:0,y:4.499,z:0})).toBe(true);
  p.kind='slab';p.position={x:2.9747362837746403,y:.7874937536332223,z:.4};p.q={x:-.007498202847690789,y:-.0016046398324416507,z:-.001258683675985363,w:.9999698084444684};
  expect(skyPartOverlapsCapsule(p,{x:3,y:.2,z:1.7})).toBe(true);
  expect(skyPartOverlapsCapsule(p,{x:NaN,y:0,z:0})).toBe(true);expect(skyPartOverlapsCapsule(p,{x:30,y:0,z:0},NaN)).toBe(true);expect(skyPartOverlapsCapsule(p,{x:30,y:0,z:0},.3,.2)).toBe(true);
  p.q.x=Infinity;expect(skyPartOverlapsCapsule(p,{x:30,y:0,z:0})).toBe(true);
});

it('uses a shared world contact point for glancing/angular impulses and conserves impulse-stage linear and angular momentum', () => {
  const a=part(1,-.5,4), b=part(2,.5,0,30); b.position.y+=.6; a.velocity.z=1; a.angularVelocity={x:.2,y:.3,z:.1};
  const initialMomentum=momentum([a,b]), initialAngular=angularMomentum([a,b]), initialEnergy=energy([a,b]);
  expect(run([a,b]).impulses).toBeGreaterThan(0);
  expect(Math.abs(b.angularVelocity!.z)).toBeGreaterThan(.01);
  expectVector(momentum([a,b]),initialMomentum); expectVector(angularMomentum([a,b]),initialAngular);
  expect(energy([a,b])).toBeLessThanOrEqual(initialEnergy+1e-8);
});

it('detects rotated OBB contact and rejects separated boxes whose swept broadphase overlaps', () => {
  const a=part(1,-.55,3), b=part(2,.55); b.q=increment({x:0,y:1,z:0},Math.PI/4);
  expect(run([a,b]).impulses).toBeGreaterThan(0);
  const c=part(3,-.7,3), d=part(4,.7); c.kind=d.kind='beam'; c.q=d.q=increment({x:0,y:1,z:0},Math.PI/4); c.position.z=.8;
  const before=structuredClone([c,d]); expect(run([c,d]).impulses).toBe(0); expect([c,d]).toEqual(before);
});

it('sweeps thin boxes that pass through one another between endpoints, with a bounded horizon', () => {
  const a=part(1,0), b=part(2,0); a.kind=b.kind='slab'; a.position.y=4.275; b.position.y=3.725; a.velocity.y=-12; b.velocity.y=12;
  const positions=structuredClone([a.position,b.position]);
  expect(run([a,b]).impulses).toBe(1); expect(a.velocity.y).toBeCloseTo(0); expect(b.velocity.y).toBeCloseTo(0);
  expect([a.position,b.position]).toEqual(positions);
  const far=part(3,2), fast=part(4,0,12); expect(run([fast,far],10).contacts).toBe(0);
});

it('does not impulse separating or tangential motion, nor invent interaction through a spatial gap', () => {
  for (const [vx,z] of [[-3,0],[0,0],[3,2]]) {
    const a=part(1,-.5,vx), b=part(2,.5); a.velocity.z=1; b.position.z=z;
    const before=structuredClone([a,b]); expect(run([a,b]).impulses).toBe(0); expect([a,b]).toEqual(before);
  }
});

it('never transfers into unavailable, anchored, frozen, trial or loaned bodies', () => {
  for (const flag of ['unavailable','anchored','frozen','trial','loan'] as const) {
    const a=part(1,-.5,3), b=part(2,.5);
    if(flag==='anchored')b.anchored=true;
    if(flag==='frozen')b.frozen=1;
    if(flag==='trial')b.trial=825001;
    if(flag==='loan')b.loan={site:850001,role:'cargo'};
    const before=structuredClone([a,b]);
    expect(transferAssemblyContacts([{parts:[a]},{parts:[b],unavailable:flag==='unavailable'}],1/30).impulses).toBe(0);
    expect([a,b]).toEqual(before);
  }
});

it('respects private creators, including mixed-owner assemblies, while shared parts explicitly opt in', () => {
  const a=part(1,-.5,3), b=part(2,.5); b.creator='other';
  expect(run([a,b]).impulses).toBe(0); expect(b.velocity.x).toBe(0);
  b.shared=true; expect(run([a,b]).impulses).toBe(0);
  a.shared=true; expect(run([a,b]).impulses).toBeGreaterThan(0);
  const c=part(3,-.5,3), d=part(4,-.5,3), e=part(5,.5); d.position.z=1.1; d.creator='other';
  expect(transferAssemblyContacts([{parts:[c,d]},{parts:[e]}],1/30).impulses).toBe(0);
  const legacy=part(6,-.5,3), owned=part(7,.5); delete legacy.creator;
  expect(run([legacy,owned]).impulses).toBe(0);
});

it('wakes only impacted free bodies and preserves poses, links, epochs, inventory-like state and ownership fields', () => {
  const a=part(1,-.5,3), b=part(2,.5), c=part(3,10); b.sleeping=c.sleeping=true; b.energy=7; b.integrity=85; b.recalled=2; b.epoch=3;
  const immutable=(p:SkyPart)=>{const {velocity: _v, angularVelocity: _w, sleeping: _s,...rest}=p;return rest;};
  const before=[a,b,c].map(p=>structuredClone(immutable(p)));
  expect(run([a,b,c]).woken).toBe(1); expect(b.sleeping).toBe(false); expect(c.sleeping).toBe(true);
  expect([a,b,c].map(immutable)).toEqual(before);
});

it('uses deterministic body/part ordering and coherent composite inertia regardless of input group order', () => {
  const a=part(1,-.5,3), b=part(2,-.5,3), c=part(3,.5); a.position.y=3.4; b.position.y=4.6;
  const original=[a,b,c], copy=structuredClone(original);
  const x=transferAssemblyContacts([{parts:[a,b]},{parts:[c]}],1/30);
  const y=transferAssemblyContacts([{parts:[copy[2]]},{parts:[copy[1],copy[0]]}],1/30);
  expect(x).toEqual(y); expect(copy).toEqual(original); expect(a.velocity).toEqual(b.velocity); expect(a.angularVelocity).toEqual(b.angularVelocity);
});

it('scales both sides of capped off-center impulses together rather than independently clipping momentum', () => {
  const a=part(1,-1.01,12,30), b=part(2,1.01); a.kind=b.kind='beam'; a.position.y=4.1; b.position.y=4;
  b.angularVelocity={x:0,y:0,z:-3.9};
  const before=momentum([a,b]), beforeAngular=angularMomentum([a,b]), beforeEnergy=energy([a,b]);
  expect(run([a,b]).impulses).toBeGreaterThan(0);
  for(const p of[a,b]){expect(Math.hypot(...Object.values(p.velocity))).toBeLessThanOrEqual(12+1e-8);expect(Math.hypot(...Object.values(p.angularVelocity!))).toBeLessThanOrEqual(4+1e-8);}
  expectVector(momentum([a,b]),before); expectVector(angularMomentum([a,b]),beforeAngular);expect(energy([a,b])).toBeLessThanOrEqual(beforeEnergy+1e-8);
});

it('skips invalid math, duplicate/oversized inputs and incoherent assembly velocities without changing state', () => {
  for(const broken of ['position','velocity','angular','mass','quaternion'] as const){
    const a=part(1,-.5,3),b=part(2,.5);
    if(broken==='position')b.position.x=NaN;
    if(broken==='velocity')b.velocity.x=Infinity;
    if(broken==='angular')b.angularVelocity!.x=NaN;
    if(broken==='mass')b.mass=0;
    if(broken==='quaternion')b.q={x:NaN,y:0,z:0,w:1};
    const before=structuredClone([a,b]);expect(run([a,b]).impulses).toBe(0);expect([a,b]).toEqual(before);
  }
  const a=part(1,-.5,3), b=part(2,.5), before=structuredClone([a,b]);
  for(const dt of[NaN,Infinity,0,-1])expect(run([a,b],dt).contacts).toBe(0);
  expect(transferAssemblyContacts([{parts:[a,b]},{parts:[a]}],1/30).contacts).toBe(0);
  expect(run(Array.from({length:65},(_,i)=>part(i+1,i))).contacts).toBe(0);
  expect(transferAssemblyContacts([{parts:Array.from({length:17},(_,i)=>part(i+1,i))},{parts:[part(100,0)]}],1/30).contacts).toBe(0);
  const inconsistent=part(3,-.5,2);expect(transferAssemblyContacts([{parts:[a,inconsistent]},{parts:[b]}],1/30).impulses).toBe(0);
  expect([a,b]).toEqual(before);
});

it('keeps seeded rotated/glancing contacts finite and nonenergizing across varied masses and shapes', () => {
  let seed=7319, collided=0;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let sample=0;sample<200;sample++){
    const a=part(1,-.5,1+next()*5,6),b=part(2,.5,-next()*3,30);
    for(const p of[a,b]){
      p.kind=sample%3===0?'slab':sample%3===1?'beam':'block';p.position.y+=next()*.3;p.position.z+=next()*.3;
      p.q=increment({x:next()-.5,y:next()-.5,z:next()-.5},1);
      p.angularVelocity={x:next()-.5,y:next()-.5,z:next()-.5};p.velocity.z=next()-.5;
    }
    const before=momentum([a,b]),beforeAngular=angularMomentum([a,b]),beforeEnergy=energy([a,b]);
    collided+=Number(run([a,b]).impulses>0);
    expectVector(momentum([a,b]),before,7);expectVector(angularMomentum([a,b]),beforeAngular,7);
    expect(energy([a,b])).toBeLessThanOrEqual(beforeEnergy+1e-7);
    expect([a,b].every(p=>[...Object.values(p.velocity),...Object.values(p.angularVelocity!)].every(Number.isFinite))).toBe(true);
  }
  expect(collided).toBeGreaterThan(50);
});

it('bounds dense 64-part Node work and reports measurements separately from device/network performance', () => {
  const timings:number[]=[], stats=[];
  for(let tick=0;tick<160;tick++){
    const parts=Array.from({length:64},(_,i)=>{const p=part(i+1,(i%4)*.95-1.5,i%2?-.5:.5);p.position.y=3+Math.floor(i/16)*.95;p.position.z=Math.floor(i/4)%4*.95;p.angularVelocity={x:.1,y:.05,z:.025};return p;});
    const start=performance.now(),result=run(parts);timings.push(performance.now()-start);stats.push(result);
    expect(result.bodyPairs).toBeLessThanOrEqual(64*63/2);expect(result.boxPairs).toBeLessThanOrEqual(64*63/2);
    expect(result.contacts).toBeLessThanOrEqual(64*ASSEMBLY_CONTACT_BUDGET.contactsPerAssembly/2);
    expect(result.impulses).toBeLessThanOrEqual(result.contacts*ASSEMBLY_CONTACT_BUDGET.iterations);
    expect(parts.every(p=>[...Object.values(p.velocity),...Object.values(p.angularVelocity!)].every(Number.isFinite))).toBe(true);
  }
  const sampled=timings.slice(10).sort((a,b)=>a-b);
  writeFileSync('/tmp/voxel-assembly-contacts-budget.json',JSON.stringify({scope:'Node isolated impulse prepass, 64 densely touching blocks, 150 measured ticks after 10 warmup ticks. Excludes world collision, browser GPU/network and device FPS.',budget:ASSEMBLY_CONTACT_BUDGET,p50Ms:sampled[75],p95Ms:sampled[142],maxMs:sampled[149],maxBodyPairs:Math.max(...stats.map(s=>s.bodyPairs)),maxBoxPairs:Math.max(...stats.map(s=>s.boxPairs)),maxContacts:Math.max(...stats.map(s=>s.contacts)),maxImpulses:Math.max(...stats.map(s=>s.impulses))},null,2));
});
