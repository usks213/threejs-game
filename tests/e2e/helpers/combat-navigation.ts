export class CombatRecoveryNeeded extends Error {
 constructor(){super('Guard reserve reached; retreat through ordinary controls before another combat cycle');}
}
export function requireCombatReserve(stamina:number,reserve:number){if(reserve>0&&stamina<reserve)throw new CombatRecoveryNeeded();}
/** Inverse of production camera-relative movement; facing stays on the enemy. */
export function waypointAxes(player:{x:number;z:number},yaw:number,target:{x:number;z:number}){
 const dx=target.x-player.x,dz=target.z-player.z,length=Math.hypot(dx,dz);
 return length<.12?{x:0,z:0}:{x:(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/length,z:(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/length};
}
export function safeToLowerGuard(displacement:number,distance:number,phase:string){
 return displacement>.6&&(distance>2.8||distance>1.9&&['recover','stagger','dead'].includes(phase));
}
