import type { Vec3 } from '../../world/types';
import type { SkyPart } from './types';
import { PART_HALF } from './types';
import { local,global,orientation,rotate } from './orientation';
/** Upright capsule versus oriented cuboids; only sufficiently upward faces are walkable. */
export function collideSkyPlayer(parts:readonly SkyPart[],player:Vec3&{vy:number;grounded:boolean},previousY:number):void{
 for(const part of parts){const h=PART_HALF[part.kind];if(Math.hypot(player.x-part.position.x,player.y+.7-part.position.y,player.z-part.position.z)>Math.hypot(h.x,h.y,h.z)+2)continue;
  let support:number|null=null;
  for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){const direction={x:0,y:0,z:0};direction[axis]=sign;const normal=rotate(direction,orientation(part));if(normal.y<.65)continue;const y=part.position.y+(h[axis]-normal.x*(player.x-part.position.x)-normal.z*(player.z-part.position.z))/normal.y,p=local({x:player.x,y,z:player.z},part);
   if((['x','y','z'] as const).filter(a=>a!==axis).some(a=>Math.abs(p[a])>h[a]+.25)||previousY<y-.15||player.y>y+.05||player.vy>0)continue;support=Math.max(support??-Infinity,y);
  }
  if(support!==null){player.y=support;player.vy=0;player.grounded=true;continue;}
  for(let height=.3;height<=1.16;height+=.21){const sample={x:player.x,y:player.y+height,z:player.z},p=local(sample,part),closest={x:Math.max(-h.x,Math.min(h.x,p.x)),y:Math.max(-h.y,Math.min(h.y,p.y)),z:Math.max(-h.z,Math.min(h.z,p.z))},d={x:p.x-closest.x,y:p.y-closest.y,z:p.z-closest.z};let length=Math.hypot(d.x,d.y,d.z),depth=.3-length;if(depth<=0)continue;
   if(length<1e-6){const faces=(['x','y','z'] as const).flatMap(axis=>[-1,1].map(sign=>{const direction={x:0,y:0,z:0};direction[axis]=sign;return {axis,sign,direction,gap:h[axis]-p[axis]*sign,normal:rotate(direction,orientation(part))};})).filter(face=>face.normal.y<.65).sort((a,b)=>a.gap-b.gap);const face=faces[0];d.x=d.y=d.z=0;d[face.axis]=face.sign;depth=.3+face.gap;length=1;}
   const n=rotate({x:d.x/length,y:d.y/length,z:d.z/length},orientation(part));player.x+=n.x*Math.min(.35,depth);player.y+=n.y*Math.min(.35,depth);player.z+=n.z*Math.min(.35,depth);if(n.y<-.5&&player.vy>0)player.vy=0;
  }
 }
}
