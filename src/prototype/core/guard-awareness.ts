import {enemyCanSee,type EnemySightField} from './enemy-tactics';
import type {Vec3} from './voxel';
export type GuardMode='idle'|'alert'|'chase'|'search'|'return';
export interface GuardAwareness {home:Vec3;lastSeen:Vec3;mode:GuardMode;time:number;unseen:number;probeTime:number;visible:boolean}
export const createGuardAwareness=(home:Vec3):GuardAwareness=>({home:{...home},lastSeen:{...home},mode:'idle',time:0,unseen:0,probeTime:0,visible:false});
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
/** Ordinary sentries retain authored swept-weapon combat. This perception layer
 * shares the regional SDF sight rule, remembers only a last-seen point, and never
 * restores health when a player escapes. It is not a full navigation mesh. */
export function updateGuardAwareness(state:GuardAwareness,position:Vec3,target:Vec3,targetAlive:boolean,field:EnemySightField,dt:number){
 if(!Number.isFinite(dt)||dt<=0)return {mode:state.mode,visible:state.visible,target:null,canAttack:false,noticed:false};
 dt=Math.min(dt,.1);state.time+=dt;state.probeTime-=dt;let noticed=false;
 if(state.probeTime<=0){state.probeTime=.1;state.visible=enemyCanSee({position,targetPosition:target,targetAlive,field},10);}
 const transition=(mode:GuardMode)=>{if(state.mode!==mode){state.mode=mode;state.time=0;}};
 if(state.visible){state.lastSeen={...target};state.unseen=0;}else state.unseen+=dt;
 if(!targetAlive||distance(position,state.home)>18)transition('return');
 else if(state.mode==='idle'&&state.visible){transition('alert');noticed=true;}
 else if(state.mode==='alert'&&state.time>=.45)transition(state.visible?'chase':'search');
 else if(state.mode==='chase'&&!state.visible&&state.unseen>=.6)transition('search');
 else if(state.mode==='search'){if(state.visible)transition('chase');else if(state.time>=3)transition('return');}
 else if(state.mode==='return'&&distance(position,state.home)<.5)transition('idle');
 const destination=state.mode==='chase'?state.lastSeen:state.mode==='search'&&distance(position,state.lastSeen)>.6?state.lastSeen:state.mode==='return'&&distance(position,state.home)>.4?state.home:null;
 return {mode:state.mode,visible:state.visible,target:destination,canAttack:state.mode==='chase'&&state.visible,noticed};
}
