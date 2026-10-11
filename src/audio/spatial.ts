import type {Vec3} from '../world/types';
import {skyboundLayer} from '../world/skybound-terrain';
/** Bounded original sound mix. Layer muffling is an approximation, not acoustic ray tracing. */
export function spatialSound(listener:Vec3,source:Vec3,heading:number,range=24):{gain:number;pan:number}{
 const dx=source.x-listener.x,dy=source.y-listener.y,dz=source.z-listener.z,distance=Math.hypot(dx,dy,dz),horizontal=Math.hypot(dx,dz);
 if(!Number.isFinite(distance)||!Number.isFinite(heading)||range<=0||distance>=range)return {gain:0,pan:0};
 return {gain:(1-distance/range)**2*(skyboundLayer(listener.y)===skyboundLayer(source.y)?1:.15),pan:Math.max(-1,Math.min(1,(dx*Math.cos(heading)-dz*Math.sin(heading))/Math.max(1,horizontal)))};
}
