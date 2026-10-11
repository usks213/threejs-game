import type { Vec3 } from '../../world/types';
import type { SkyPart } from './types';
export interface Quaternion {x:number;y:number;z:number;w:number}
export const yawQuaternion=(yaw:number):Quaternion=>({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)});
export function normalize(q:Quaternion):Quaternion{const n=Math.hypot(q.x,q.y,q.z,q.w);return n>1e-10?{x:q.x/n,y:q.y/n,z:q.z/n,w:q.w/n}:{x:0,y:0,z:0,w:1};}
export function multiply(a:Quaternion,b:Quaternion):Quaternion{return normalize({x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z});}
export function rotate(v:Vec3,q:Quaternion):Vec3{const tx=2*(q.y*v.z-q.z*v.y),ty=2*(q.z*v.x-q.x*v.z),tz=2*(q.x*v.y-q.y*v.x);return{x:v.x+q.w*tx+q.y*tz-q.z*ty,y:v.y+q.w*ty+q.z*tx-q.x*tz,z:v.z+q.w*tz+q.x*ty-q.y*tx};}
export const inverse=(q:Quaternion):Quaternion=>({x:-q.x,y:-q.y,z:-q.z,w:q.w});
export function increment(omega:Vec3,dt:number):Quaternion{const speed=Math.hypot(omega.x,omega.y,omega.z);if(speed<1e-10)return yawQuaternion(0);const s=Math.sin(speed*dt/2)/speed;return normalize({x:omega.x*s,y:omega.y*s,z:omega.z*s,w:Math.cos(speed*dt/2)});}
export const orientation=(p:Pick<SkyPart,'rotation'|'q'>):Quaternion=>p.q??yawQuaternion(p.rotation);
export function local(point:Vec3,part:Pick<SkyPart,'position'|'rotation'|'q'>):Vec3{return rotate({x:point.x-part.position.x,y:point.y-part.position.y,z:point.z-part.position.z},inverse(orientation(part)));}
export function global(point:Vec3,part:Pick<SkyPart,'position'|'rotation'|'q'>):Vec3{const p=rotate(point,orientation(part));return{x:p.x+part.position.x,y:p.y+part.position.y,z:p.z+part.position.z};}
export function heading(q:Quaternion):number{const forward=rotate({x:0,y:0,z:1},q);return Math.atan2(forward.x,forward.z);}
export const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const dot=(a:Vec3,b:Vec3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
export const plus=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const scale=(v:Vec3,n:number):Vec3=>({x:v.x*n,y:v.y*n,z:v.z*n});
