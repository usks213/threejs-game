import type { Vec3 } from '../../world/types';
import type { SkyContext, SkyPart } from './types';
import { PART_HALF, SKY_LIMITS } from './types';
import { cross, dot, global, orientation, plus, rotate, scale } from './orientation';

/** Game-unit ground traction assistance; there is no axle, wheel joint or suspension state. */
export const WHEEL_TRACTION_LIMITS = {
  probes: 5, supportReach: .06, minUp: .65, speed: 6, motorForce: 45,
  grip: .65, response: 4, energyPerSecond: 2, rollingResistance: .02, lateralFriction: .5,
} as const;
export interface WheelSupport { partId: number; point: Vec3; normal: Vec3; forward: Vec3 }
export interface WheelWrench { force: Vec3; torque: Vec3; driven: number[] }
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const finite = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
const length = (v: Vec3) => Math.hypot(v.x,v.y,v.z);
function validPose(part: SkyPart): boolean {
  const q=orientation(part);
  return finite(part.position) && length(part.position)<1e6 && [q.x,q.y,q.z,q.w].every(Number.isFinite) && Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)<.001;
}
function eligible(parts: readonly SkyPart[]): boolean {
  return parts.length>0 && parts.length<=SKY_LIMITS.assembly && parts.every(p=>Number.isSafeInteger(p.id)&&p.id>0) && !parts.some(p=>p.anchored || (p.frozen??0)>0 || p.trial!==undefined || p.loan!==undefined) && new Set(parts.map(p=>p.id)).size===parts.length;
}
/** Forward projected onto an upward support plane, only while the box-wheel is upright. */
export function wheelRollingDirection(part: SkyPart, normal: Vec3): Vec3 | undefined {
  if(part.kind!=='wheel' || !validPose(part) || !finite(normal))return;
  const normalLength=length(normal);if(normalLength<1e-6)return;
  const n=scale(normal,1/normalLength),up=rotate({x:0,y:1,z:0},orientation(part));
  if(n.y<WHEEL_TRACTION_LIMITS.minUp || up.y<WHEEL_TRACTION_LIMITS.minUp)return;
  const forward=rotate({x:0,y:0,z:1},orientation(part)),tangent=plus(forward,scale(n,-dot(forward,n))),size=length(tangent);
  if(size<.1)return;
  return scale(tangent,1/size);
}
/** At most five tread probes per wheel. Solid terrain/voxel geometry only; dynamic occupied bodies are vetoes. */
export function wheelSupports(parts: readonly SkyPart[], context: Pick<SkyContext,'solid'|'occupied'|'protected'>): WheelSupport[] {
  if(!eligible(parts))return[];
  const support:WheelSupport[]=[],h=PART_HALF.wheel;
  const tread=[{x:0,y:-h.y,z:0},{x:-h.x,y:-h.y,z:-h.z},{x:h.x,y:-h.y,z:h.z},{x:-h.x,y:-h.y,z:h.z},{x:h.x,y:-h.y,z:-h.z}];
  const solid=(point:Vec3)=>context.solid(point);
  for(const part of [...parts].sort((a,b)=>a.id-b.id)){
    if(part.kind!=='wheel' || !validPose(part) || rotate({x:0,y:1,z:0},orientation(part)).y<WHEEL_TRACTION_LIMITS.minUp)continue;
    const points:Vec3[]=[],normals:Vec3[]=[];
    for(const sample of tread){
      const point=global(sample,part),below={...point,y:point.y-WHEEL_TRACTION_LIMITS.supportReach};
      if(context.protected?.(point)||context.protected?.(below)||context.occupied?.(point)||context.occupied?.(below)||!solid(below)||solid({...point,y:point.y+.04}))continue;
      const normal=zero();for(const axis of['x','y','z']as const)normal[axis]=Number(solid({...point,[axis]:point[axis]-.08}))-Number(solid({...point,[axis]:point[axis]+.08}));
      const size=length(normal);if(size<1e-6)continue;
      const n=scale(normal,1/size);if(!wheelRollingDirection(part,n))continue;
      points.push(point);normals.push(n);
    }
    if(!points.length)continue;
    const point=scale(points.reduce(plus,zero()),1/points.length),sum=normals.reduce(plus,zero()),normal=scale(sum,1/length(sum)),forward=wheelRollingDirection(part,normal);
    if(forward)support.push({partId:part.id,point,normal,forward});
  }
  return support;
}
/** Pure force/torque result. Caller owns current support refresh, battery debit and dt integration. */
export function wheelDriveWrench(parts: readonly SkyPart[], supports: readonly WheelSupport[], powered: ReadonlySet<number>, inputZ: number, driverActive: boolean): WheelWrench {
  const result:WheelWrench={force:zero(),torque:zero(),driven:[]};
  if(!driverActive || !Number.isFinite(inputZ) || Math.abs(inputZ)<=.01 || !eligible(parts))return result;
  if(parts.some(p=>!validPose(p)||!Number.isFinite(p.mass)||p.mass<=0||p.mass>1000||!finite(p.velocity)||length(p.velocity)>50||!finite(p.angularVelocity??zero())||length(p.angularVelocity??zero())>4.001))return result;
  const mass=parts.reduce((sum,p)=>sum+p.mass,0),center=scale(parts.reduce((sum,p)=>plus(sum,scale(p.position,p.mass)),zero()),1/mass);
  const wheels=new Map(parts.filter(p=>p.kind==='wheel').map(p=>[p.id,p]));
  const seen=new Set<number>(),grounded=supports.filter(s=>{
    const part=wheels.get(s.partId);
    if(!part||seen.has(s.partId)||!finite(s.point)||!finite(s.normal)||length(subtract(s.point,part.position))>1||!wheelRollingDirection(part,s.normal))return false;
    seen.add(s.partId);return true;
  }).sort((a,b)=>a.partId-b.partId);
  for(const support of grounded){
    const part=wheels.get(support.partId)!;if(!part.enabled||!powered.has(part.id))continue;
    const normal=scale(support.normal,1/length(support.normal)),forward=wheelRollingDirection(part,normal)!;
    const contactVelocity=plus(part.velocity,cross(part.angularVelocity??zero(),subtract(support.point,center)));
    const target=-Math.max(-1,Math.min(1,inputZ))*WHEEL_TRACTION_LIMITS.speed;
    const requested=(target-dot(contactVelocity,forward))*mass/grounded.length*WHEEL_TRACTION_LIMITS.response;
    const limit=Math.min(WHEEL_TRACTION_LIMITS.motorForce,WHEEL_TRACTION_LIMITS.grip*mass*9.8*normal.y/grounded.length);
    const force=scale(forward,Math.max(-limit,Math.min(limit,requested)));
    result.force=plus(result.force,force);result.torque=plus(result.torque,cross(subtract(support.point,center),force));result.driven.push(part.id);
  }
  return result;
}
