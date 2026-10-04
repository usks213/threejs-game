import type { Vec3 } from '../world/types';
export interface BossAttack { windup: number; cooldown: number; radius: number; charge: boolean; shots: number; element: string }
const attacks: Record<string,BossAttack> = {
 stormstag: {windup:1.5,cooldown:5,radius:4.5,charge:false,shots:0,element:'lightning'},
 root: {windup:1.4,cooldown:4.5,radius:6,charge:false,shots:0,element:'physical'},
 tusk: {windup:1.1,cooldown:3.5,radius:2.5,charge:true,shots:0,element:'physical'},
 mirelord: {windup:1.2,cooldown:3.8,radius:3,charge:false,shots:3,element:'poison'},
 frostwing: {windup:1.6,cooldown:4.2,radius:4,charge:false,shots:5,element:'frost'},
 riftheart: {windup:1.8,cooldown:3.6,radius:7,charge:false,shots:7,element:'magic'},
};
export function bossAttack(id:string,enraged=false,kind?:string): BossAttack {
 if(id==='stormstag')return kind==='beam'?{windup:2,cooldown:7,radius:20,charge:false,shots:5,element:'lightning'}:kind==='stomp'?{windup:2.5,cooldown:8,radius:10,charge:false,shots:0,element:'lightning'}:{windup:1.2,cooldown:5,radius:4.5,charge:false,shots:0,element:'physical'};
 const a=attacks[id]; if(!a)throw new Error('Unknown boss');
 return {...a,cooldown:a.cooldown*(enraged?0.7:1),shots:a.shots+(enraged && a.shots?2:0)};
}
export function directedShot(from:Vec3,to:Vec3,offset:number,speed=9):Vec3{
 const dx=to.x-from.x,dz=to.z-from.z,angle=Math.atan2(dx,dz)+offset;
 const horizontal=Math.hypot(dx,dz),dy=to.y-from.y,length=Math.max(0.01,Math.hypot(horizontal,dy));
 return {x:Math.sin(angle)*horizontal/length*speed,y:dy/length*speed,z:Math.cos(angle)*horizontal/length*speed};
}

