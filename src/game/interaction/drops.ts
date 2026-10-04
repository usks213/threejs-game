import type { Adventure } from '../adventure';
import type { Vec3 } from '../../world/types';
import { canCarry } from '../meadows/inventory';
/** Ground items own their count until an explicit pickup transaction succeeds. */
export function dropItem(game:Adventure,id:string,count:number,point:Vec3):void {
 while(count>0){const n=Math.min(100,count);const existing=game.state.resources.find(r=>r.drop&&r.kind===id&&r.ready===0&&r.amount+n<=100&&Math.hypot(r.x-point.x,r.y-point.y,r.z-point.z)<.75);if(existing)existing.amount+=n;else game.state.resources.push({id:game.sim.allocateEntityId(),kind:id,amount:n,ready:0,drop:true,x:point.x,y:point.y,z:point.z,velocity:{x:0,y:1,z:0}});count-=n;}
}
export function pickupItem(game:Adventure,id:number):number {
 const n=game.state.resources.find(n=>n.id===id&&n.drop&&n.ready<=game.state.seconds);if(!n)throw new Error('品物はもうありません');const p=game.sim.player;if(Math.hypot(n.x-p.x,n.y-p.y,n.z-p.z)>3.5)throw new Error('品物に近づいてください');let count=n.amount;while(count>0&&!canCarry(game.state.inventory,n.kind,count,game.state.meadows!))count--;if(!count)throw new Error('持ち物に空きがありません');game.meadowRules.grant(n.kind,count);n.amount-=count;if(!n.amount)game.state.resources=game.state.resources.filter(r=>r!==n);return count;
}
export function stepDrops(game:Adventure,dt:number):void {
 const p=game.sim.player;for(const n of game.state.resources){if(!n.drop||Math.hypot(n.x-p.x,n.z-p.z)>48)continue;const v=n.velocity??(n.velocity={x:0,y:0,z:0}),water=game.sim.fluid.immersion(n,.3),flow=water?game.sim.fluid.current(n,.3):{x:0,z:0};v.x+=(flow.x-v.x)*Math.min(1,dt*(water?8:4));v.z+=(flow.z-v.z)*Math.min(1,dt*(water?8:4));v.y=Math.max(-12,v.y+(-9.8+water*12)*dt);n.x+=v.x*dt;n.z+=v.z*dt;n.y+=v.y*dt;const floor=game.sim.groundAt(n.x,n.z)+.08;if(n.y<floor){n.y=floor;v.y=0;}}
}
