import {wheelRollingDirection,WHEEL_TRACTION_LIMITS} from './wheel-traction';
import type { Vec3 } from '../../world/types';
import type { SkyPart, SkyContext } from './types';
import { PART_HALF } from './types';
import { cross,dot,global,heading,increment,multiply,orientation,plus,rotate,scale } from './orientation';
export const RIGID_BUDGET={substeps:2,iterations:4,contacts:24,maxAngularSpeed:4} as const;
type Matrix=[number,number,number,number,number,number,number,number,number];
const apply=(m:Matrix,v:Vec3):Vec3=>({x:m[0]*v.x+m[1]*v.y+m[2]*v.z,y:m[3]*v.x+m[4]*v.y+m[5]*v.z,z:m[6]*v.x+m[7]*v.y+m[8]*v.z});
function inverse(m:Matrix):Matrix{const[a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=c*h-b*i,C=b*f-c*e,D=f*g-d*i,E=a*i-c*g,F=c*d-a*f,G=d*h-e*g,H=b*g-a*h,I=a*e-b*d,det=a*A+b*D+c*G;if(Math.abs(det)<1e-10)return[1,0,0,0,1,0,0,0,1];return[A/det,B/det,C/det,D/det,E/det,F/det,G/det,H/det,I/det];}
export function massProperties(parts:readonly SkyPart[]):{mass:number;center:Vec3;inverseInertia:Matrix}{
 const mass=parts.reduce((sum,p)=>sum+p.mass,0),center=scale(parts.reduce((sum,p)=>plus(sum,scale(p.position,p.mass)),{x:0,y:0,z:0}),1/mass),tensor:Matrix=[0,0,0,0,0,0,0,0,0];
 for(const p of parts){const h=PART_HALF[p.kind],diag=[p.mass*(h.y*h.y+h.z*h.z)/3,p.mass*(h.x*h.x+h.z*h.z)/3,p.mass*(h.x*h.x+h.y*h.y)/3],axes=[rotate({x:1,y:0,z:0},orientation(p)),rotate({x:0,y:1,z:0},orientation(p)),rotate({x:0,y:0,z:1},orientation(p))],r=[p.position.x-center.x,p.position.y-center.y,p.position.z-center.z];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){const key=['x','y','z'] as const;tensor[row*3+col]+=axes.reduce((sum,a,k)=>sum+a[key[row]]*a[key[col]]*diag[k],0)+p.mass*((row===col?r.reduce((n,v)=>n+v*v,0):0)-r[row]*r[col]);}
 }
 return {mass,center,inverseInertia:inverse(tensor)};
}
export function wrench(parts:SkyPart[],force:Vec3,torque:Vec3,properties=massProperties(parts)):void{if(parts.some(p=>p.anchored))return;const {mass,inverseInertia}=properties,angular=apply(inverseInertia,torque);for(const p of parts){p.velocity=plus(p.velocity,scale(force,1/mass));p.angularVelocity=plus(p.angularVelocity??{x:0,y:0,z:0},angular);const speed=Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z),spin=Math.hypot(p.angularVelocity.x,p.angularVelocity.y,p.angularVelocity.z);if(speed>12)p.velocity=scale(p.velocity,12/speed);if(spin>RIGID_BUDGET.maxAngularSpeed)p.angularVelocity=scale(p.angularVelocity,RIGID_BUDGET.maxAngularSpeed/spin);p.sleeping=false;}}
export function impulse(parts:SkyPart[],force:Vec3,point:Vec3):void{const properties=massProperties(parts),{center}=properties;wrench(parts,force,cross({x:point.x-center.x,y:point.y-center.y,z:point.z-center.z},force),properties);}
interface Contact {point:Vec3;normal:Vec3;depth:number;rolling?:Vec3}
function contacts(parts:SkyPart[],solid:(p:Vec3)=>boolean,velocity:Vec3):Contact[]{
 const hits:Contact[]=[];
 const probes=[{x:0,y:-1,z:0},{x:-1,y:-1,z:-1},{x:1,y:-1,z:1},{x:-1,y:-1,z:1},{x:1,y:-1,z:-1},{x:0,y:1,z:0},{x:-1,y:0,z:0},{x:1,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:0,z:1},{x:-1,y:1,z:-1},{x:1,y:1,z:1},{x:-1,y:1,z:1},{x:1,y:1,z:-1}];
 for(const probe of probes)for(const part of parts){const h=PART_HALF[part.kind],x=probe.x*h.x,y=probe.y*h.y,z=probe.z*h.z;
  const point=global({x,y,z},part);if(!solid(point))continue;
  const normal={x:0,y:0,z:0};for(const axis of ['x','y','z'] as const)normal[axis]=Number(solid({...point,[axis]:point[axis]-.08}))-Number(solid({...point,[axis]:point[axis]+.08}));
  const length=Math.hypot(normal.x,normal.y,normal.z);if(length){normal.x/=length;normal.y/=length;normal.z/=length;}else{const axis=Math.abs(velocity.x)>Math.abs(velocity.y)&&Math.abs(velocity.x)>Math.abs(velocity.z)?'x':Math.abs(velocity.z)>Math.abs(velocity.y)?'z':'y';normal[axis]=velocity[axis]>0?-1:1;}
  let depth=.01;while(depth<.4&&solid(plus(point,scale(normal,depth))))depth+=.02;
  hits.push({point,normal,depth,rolling:wheelRollingDirection(part,normal)});if(hits.length>=RIGID_BUDGET.contacts)return hits;
 }return hits;
}
/** Fixed-budget sequential impulses against static terrain/voxel surfaces and other assemblies. */
export function stepRigid(parts:SkyPart[],velocity:Vec3,dt:number,context:SkyContext,solid:(point:Vec3)=>boolean,clear:(poses:SkyPart[])=>boolean):{contacts:number;supported:boolean}{
 if(parts.some(p=>p.anchored)){for(const p of parts){p.velocity={x:0,y:0,z:0};p.angularVelocity={x:0,y:0,z:0};}return{contacts:0,supported:true};}
 let angular={...(parts[0].angularVelocity??{x:0,y:0,z:0})},linear={...velocity},count=0,supported=false;
 for(let sub=0;sub<RIGID_BUDGET.substeps;sub++){
  const subDt=dt/RIGID_BUDGET.substeps,{mass,center,inverseInertia}=massProperties(parts);const radius=Math.max(...parts.map(p=>Math.hypot(p.position.x-center.x,p.position.y-center.y,p.position.z-center.z)+Math.hypot(PART_HALF[p.kind].x,PART_HALF[p.kind].y,PART_HALF[p.kind].z))),limit=Math.min(RIGID_BUDGET.maxAngularSpeed,.1/Math.max(.01,radius*subDt)),spinBefore=Math.hypot(angular.x,angular.y,angular.z);if(spinBefore>limit)angular=scale(angular,limit/spinBefore);const dq=increment(angular,subDt),to=plus(center,scale(linear,subDt));
  const poses=parts.map(p=>{const q=multiply(dq,orientation(p)),offset=rotate({x:p.position.x-center.x,y:p.position.y-center.y,z:p.position.z-center.z},dq);return{...p,position:plus(to,offset),q,rotation:heading(q)};});
  const hits=contacts(poses,solid,linear);count+=hits.length;const correction={x:0,y:0,z:0};
  for(const hit of hits)if(hit.normal.y>.65)supported=true;
  // Project every penetration constraint. Averaging could leave the deepest corner inside terrain.
  for(let iteration=0;iteration<RIGID_BUDGET.iterations;iteration++)for(const hit of hits){const remaining=hit.depth-dot(correction,hit.normal);if(remaining>0){const push=scale(hit.normal,remaining);correction.x+=push.x;correction.y+=push.y;correction.z+=push.z;}}
  for(let iteration=0;iteration<RIGID_BUDGET.iterations;iteration++)for(const hit of hits){const r={x:hit.point.x-to.x,y:hit.point.y-to.y,z:hit.point.z-to.z},contactVelocity=plus(linear,cross(angular,r)),normalSpeed=dot(contactVelocity,hit.normal);if(normalSpeed>=0)continue;
   const crossN=cross(r,hit.normal),effective=1/mass+dot(hit.normal,cross(apply(inverseInertia,crossN),r)),j=-normalSpeed/Math.max(.001,effective),normalImpulse=scale(hit.normal,j);linear=plus(linear,scale(normalImpulse,1/mass));angular=plus(angular,apply(inverseInertia,cross(r,normalImpulse)));
   const tangent=plus(contactVelocity,scale(hit.normal,-normalSpeed));
   const friction=(motion:Vec3,coefficient:number)=>{const speed=Math.hypot(motion.x,motion.y,motion.z);if(speed<=.0001)return;const force=scale(motion,-Math.min(j*coefficient,speed*mass/Math.max(1,hits.length))/speed);linear=plus(linear,scale(force,1/mass));angular=plus(angular,apply(inverseInertia,cross(r,force)));};
   if(hit.rolling){const rolling=scale(hit.rolling,dot(tangent,hit.rolling));friction(rolling,WHEEL_TRACTION_LIMITS.rollingResistance);friction(plus(tangent,scale(rolling,-1)),WHEEL_TRACTION_LIMITS.lateralFriction);}else friction(tangent,.5);
  }
  for(const pose of poses)pose.position=plus(pose.position,correction);
  // Full-volume guard catches thin voxel faces missed by the bounded contact manifold.
  if(clear(poses)){for(let i=0;i<parts.length;i++){parts[i].position=poses[i].position;parts[i].q=poses[i].q;parts[i].rotation=poses[i].rotation;}}
  else{linear={x:0,y:0,z:0};angular={x:0,y:0,z:0};}
  angular=scale(angular,Math.exp(-subDt*(supported?2:.15)));const spin=Math.hypot(angular.x,angular.y,angular.z);if(spin>RIGID_BUDGET.maxAngularSpeed)angular=scale(angular,RIGID_BUDGET.maxAngularSpeed/spin);
 }
 for(const p of parts){p.velocity={...linear};p.angularVelocity={...angular};}return{contacts:count,supported};
}
