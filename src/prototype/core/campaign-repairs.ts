import {capsule,type VoxelField} from './voxel';
/** Compatibility repair over the frozen campaign-v2 baseline. The original .14m
 * shaft missed all solid samples on the .25m lattice. Keep the authored baseline
 * identity and saved edits; add a real same-ID SDF layer thick enough to target. */
export function ensureCampaignAnchor(field:VoxelField){
 const c=field.get(28,15,-28);if(c?.object==='grapple-mist')return false;
 const a={x:7,y:3.25,z:-6.8},b={x:7,y:4.4,z:-6.8},r=.24;
 field.shape({x:a.x-r,y:a.y-r,z:a.z-r},{x:b.x+r,y:b.y+r,z:b.z+r},capsule(a,b,r),6,'grapple-mist');return true;
}
