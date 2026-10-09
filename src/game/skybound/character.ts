import {characterHeight} from '../../physics/character-shape';
import type { Vec3 } from '../../world/types';
import type { SkyPart } from './types';
import { PART_HALF } from './types';
import { local,global,orientation,rotate } from './orientation';
import {skySupportHeight} from './platform';
/** Upright capsule versus oriented cuboids; only sufficiently upward faces are walkable. */
export function collideSkyPlayer(parts:readonly SkyPart[],player:Vec3&{crouching?:boolean;vy:number;grounded:boolean},previousY:number):void{
 for(const part of parts){const h=PART_HALF[part.kind];if(Math.hypot(player.x-part.position.x,player.y+.7-part.position.y,player.z-part.position.z)>Math.hypot(h.x,h.y,h.z)+2)continue;
  const support=skySupportHeight(part,player);
  if(support!==undefined&&previousY>=support-.15&&player.y<=support+.05&&player.vy<=0){player.y=support;player.vy=0;player.grounded=true;continue;}
  for(let sampleIndex=0;sampleIndex<5;sampleIndex++){const height=.3+(characterHeight(player)-.6)*sampleIndex/4;const sample={x:player.x,y:player.y+height,z:player.z},p=local(sample,part),closest={x:Math.max(-h.x,Math.min(h.x,p.x)),y:Math.max(-h.y,Math.min(h.y,p.y)),z:Math.max(-h.z,Math.min(h.z,p.z))},d={x:p.x-closest.x,y:p.y-closest.y,z:p.z-closest.z};let length=Math.hypot(d.x,d.y,d.z),depth=.3-length;if(depth<=0)continue;
   if(length<1e-6){const faces=(['x','y','z'] as const).flatMap(axis=>[-1,1].map(sign=>{const direction={x:0,y:0,z:0};direction[axis]=sign;return {axis,sign,direction,gap:h[axis]-p[axis]*sign,normal:rotate(direction,orientation(part))};})).filter(face=>face.normal.y<.65).sort((a,b)=>a.gap-b.gap);const face=faces[0];d.x=d.y=d.z=0;d[face.axis]=face.sign;depth=.3+face.gap;length=1;}
   const n=rotate({x:d.x/length,y:d.y/length,z:d.z/length},orientation(part));player.x+=n.x*Math.min(.35,depth);player.y+=n.y*Math.min(.35,depth);player.z+=n.z*Math.min(.35,depth);if(n.y<-.5&&player.vy>0)player.vy=0;
  }
 }
}
