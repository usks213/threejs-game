/** A short crouched cardinal pulse corrects a close waypoint without orbiting it.
 * This chooses ordinary keyboard input only; game state is never written. */
export function closeApproachKey(yaw:number,dx:number,dz:number):'KeyW'|'KeyA'|'KeyS'|'KeyD'{
 const right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
 const forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz;
 return Math.abs(right)>Math.abs(forward)?(right>0?'KeyD':'KeyA'):(forward>0?'KeyW':'KeyS');
}
