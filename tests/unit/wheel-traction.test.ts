import {expect,it} from 'vitest';
import {WHEEL_TRACTION_LIMITS,wheelDriveWrench,wheelRollingDirection,wheelSupports} from '../../src/game/skybound/wheel-traction';
import {dot,increment} from '../../src/game/skybound/orientation';
import type {SkyPart} from '../../src/game/skybound/types';
const wheel=(id=1,x=0):SkyPart=>({id,kind:'wheel',material:'wood',mass:4,position:{x,y:.5,z:0},velocity:{x:0,y:0,z:0},rotation:0,angularVelocity:{x:0,y:0,z:0},links:[],epoch:0,enabled:true,creator:'owner'});
const ground={solid:(p:{y:number})=>p.y<0};
it('finds bounded upright terrain/voxel tread support and a normalized rolling direction',()=>{
  const p=wheel(),support=wheelSupports([p],ground);expect(support).toHaveLength(1);expect(support[0].point).toEqual({x:0,y:0,z:0});expect(support[0].normal).toEqual({x:0,y:1,z:0});expect(support[0].forward).toEqual({x:0,y:0,z:1});
  expect(wheelSupports([p],{solid:()=>false,occupied:ground.solid})).toEqual([]);expect(wheelSupports([p],{...ground,occupied:()=>true})).toEqual([]);
  p.q=increment({x:0,y:1,z:0},Math.PI/2);expect(wheelRollingDirection(p,{x:0,y:1,z:0})!.x).toBeCloseTo(1);
});
it('never obtains traction support from air, walls, overturned wheels, protected regions or fixed/trial/loan groups',()=>{
  const p=wheel();expect(wheelSupports([p],{solid:()=>false})).toEqual([]);expect(wheelSupports([p],{solid:point=>point.x<.5})).toEqual([]);expect(wheelSupports([p],{...ground,protected:()=>true})).toEqual([]);
  p.position.y=.57;expect(wheelSupports([p],ground)).toEqual([]);p.position.y=.5;p.q=increment({x:0,y:0,z:1},Math.PI);expect(wheelSupports([p],ground)).toEqual([]);
  for(const extra of[{anchored:true},{frozen:1},{trial:825001},{loan:{site:850001,role:'device' as const}}])expect(wheelSupports([{...wheel(),...extra}],ground)).toEqual([]);
  expect(wheelRollingDirection(wheel(),{x:1,y:0,z:0})).toBeUndefined();
});
it('produces bounded forward/reverse force at ground contacts with the corresponding COM torque',()=>{
  const p=wheel(),supports=wheelSupports([p],ground),power=new Set([1]);
  const forward=wheelDriveWrench([p],supports,power,-1,true),reverse=wheelDriveWrench([p],supports,power,1,true);
  expect(forward.force.z).toBeGreaterThan(0);expect(reverse.force.z).toBeCloseTo(-forward.force.z);expect(forward.torque.x).toBeCloseTo(-.5*forward.force.z);
  expect(forward.force.z).toBeLessThanOrEqual(Math.min(WHEEL_TRACTION_LIMITS.motorForce,WHEEL_TRACTION_LIMITS.grip*p.mass*9.8));expect(forward.driven).toEqual([1]);
  p.velocity.z=6;expect(wheelDriveWrench([p],supports,power,-1,true).force.z).toBeCloseTo(0);p.velocity.z=7;expect(wheelDriveWrench([p],supports,power,-1,true).force.z).toBeLessThan(0);
});
it('requires both driver input and power, and leaves all part/energy/permission fields untouched',()=>{
  const p=wheel(),supports=wheelSupports([p],ground),power=new Set([1]),before=structuredClone(p);
  for(const [powered,input,driver] of[[new Set<number>(),-1,true],[power,-1,false],[power,0,true],[power,NaN,true]]as const){expect(wheelDriveWrench([p],supports,powered,input,driver).force).toEqual({x:0,y:0,z:0});}
  expect(wheelDriveWrench([p],[],power,-1,true).driven).toEqual([]);expect(p).toEqual(before);
  p.enabled=false;expect(wheelDriveWrench([p],supports,power,-1,true).driven).toEqual([]);
});
it('projects traction onto an upward slope and rejects excessive tilt instead of propelling vertically',()=>{
  const p=wheel();const n={x:0,y:Math.SQRT1_2,z:Math.SQRT1_2},forward=wheelRollingDirection(p,n)!;
  p.position.y=.65;const supported=wheelSupports([p],{solid:point=>point.y<point.z*.3});expect(supported).toHaveLength(1);expect(supported[0].normal.z).toBeLessThan(0);
  expect(dot(n,forward)).toBeCloseTo(0);expect(forward.z).toBeGreaterThan(0);expect(forward.y).toBeLessThan(0);
  const drive=wheelDriveWrench([p],[{partId:1,point:{x:0,y:0,z:0},normal:n,forward}],new Set([1]),-1,true);
  expect(dot(drive.force,n)).toBeCloseTo(0);expect(drive.force.z).toBeGreaterThan(0);
  expect(wheelRollingDirection(p,{x:0,y:.4,z:Math.sqrt(.84)})).toBeUndefined();
});
it('shares estimated normal load across grounded wheels with stable ID ordering and rejects duplicate support injection',()=>{
  const a=wheel(1,-.5),b=wheel(2,.5),parts=[a,b],supports=wheelSupports(parts,ground),power=new Set([1,2]);
  const one=wheelDriveWrench(parts,supports,power,-1,true),reversed=wheelDriveWrench([b,a],[...supports].reverse(),power,-1,true),duplicate=wheelDriveWrench(parts,[...supports,...supports],power,-1,true);
  expect(one).toEqual(reversed);expect(one).toEqual(duplicate);expect(one.force.z).toBeLessThanOrEqual((a.mass+b.mass)*9.8*WHEEL_TRACTION_LIMITS.grip);expect(one.torque.y).toBeCloseTo(0);
});
it('keeps invalid input and fixed sample budgets finite without looking at other assemblies or actors',()=>{
  let reads=0;const parts=Array.from({length:16},(_,i)=>wheel(i+1,i));
  const supports=wheelSupports(parts,{solid:p=>{reads++;return p.y<0;}});expect(supports).toHaveLength(16);expect(reads).toBeLessThanOrEqual(16*WHEEL_TRACTION_LIMITS.probes*8);
  const drive=wheelDriveWrench(parts,supports,new Set(parts.map(p=>p.id)),-1,true);expect([...Object.values(drive.force),...Object.values(drive.torque)].every(Number.isFinite)).toBe(true);
  const p=wheel();p.position.x=NaN;expect(wheelSupports([p],ground)).toEqual([]);expect(wheelDriveWrench([p],supports,new Set([1]),-1,true).driven).toEqual([]);
  p.position.x=0;p.velocity.x=Infinity;expect(wheelDriveWrench([p],supports,new Set([1]),-1,true).driven).toEqual([]);
  expect(wheelSupports([...parts,wheel(17)],ground)).toEqual([]);
});
