import type {Vec3} from './voxel';
/** Escape an existing horizontal overlap only along a separating segment.
 * The caller still proves the old overlap and checks terrain/other bodies. */
export function separatesContact(from:Vec3,to:Vec3,body:Vec3):boolean {
 if(![from.x,from.z,to.x,to.z,body.x,body.z].every(Number.isFinite))return false;
 const x=from.x-body.x,z=from.z-body.z,dx=to.x-from.x,dz=to.z-from.z;
 return x*dx+z*dz>=-1e-10&&(x+dx)**2+(z+dz)**2>x*x+z*z+1e-10;
}
