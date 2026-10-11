/** Cosmetic camera movement only. Weapon poses/hit detection remain authoritative. */
export function cameraMotion(seconds:number,stride:number,speed:number,impact:number,reduced:boolean){
 if(reduced)return {breath:0,bob:0,roll:0,impactPitch:0,handRoll:0};
 return {breath:Math.sin(seconds*1.7)*.002,bob:Math.sin(stride*2)*Math.min(.008,speed*.003),roll:Math.sin(stride)*Math.min(.003,speed*.001),impactPitch:impact*.006,handRoll:-impact*.012};
}
