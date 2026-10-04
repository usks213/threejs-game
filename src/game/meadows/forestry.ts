import type { Adventure } from '../adventure';
import type { ResourceNode } from '../types';
import type { Vec3 } from '../../world/types';
import { stepSphere, type SphereBody } from '../../physics/sphere';
import { TREE_KINDS } from '../../content/meadows/data';
export interface LogState { a:SphereBody; b:SphereBody; length:number; wood:string; fall:number; heading:number; hits:number[] }
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function fellTree(game:Adventure,n:ResourceNode,heading:number):void{
 const kind=n.kind,sim=game.sim;n.kind='stump';n.health=80;n.amount=2;
 const body=(x:number,y:number,z:number):SphereBody=>({id:0,position:{x,y,z},velocity:{x:Math.sin(heading)*1.5,y:0,z:Math.cos(heading)*1.5},radius:.32,sleeping:false,kind:'wood'});
 const log:ResourceNode={id:sim.allocateEntityId(),kind:'fallenLog',x:n.x,y:n.y+2,z:n.z,amount:20,ready:0,health:60,log:{a:body(n.x,n.y+.4,n.z),b:body(n.x,n.y+4.4,n.z),length:4,wood:kind==='beech'?'wood':'finewood',fall:0,heading,hits:[]}};
 game.state.resources.push(log);
}
export function chopWood(game:Adventure,n:ResourceNode):string{
 const damage=(game.state.equipment==='flintAxe'?30:20)*(1+(game.state.meadows?.skills.woodcutting??0)*.005);
 n.health=(n.health??(n.kind==='stump'?80:TREE_KINDS.has(n.kind)?80:60))-damage;
 if(n.health>0)return `伐採 · 残り ${n.health}`;
 if(TREE_KINDS.has(n.kind)){const p=game.sim.player;fellTree(game,n,Math.atan2(n.x-p.x,n.z-p.z));return '木が倒れます。幹から離れてください';}
 if(n.log&&n.log.length>2.5){
  const l=n.log,mid={x:(l.a.position.x+l.b.position.x)/2,y:(l.a.position.y+l.b.position.y)/2,z:(l.a.position.z+l.b.position.z)/2};
  const other=structuredClone(n);other.id=game.sim.allocateEntityId();other.log!.a.position={...mid};other.log!.length=2;other.log!.fall=2;other.health=60;other.amount=10;
  l.b.position={...mid};l.length=2;l.fall=2;n.health=60;n.amount=10;game.state.resources.push(other);return '丸太を二つに割りました。さらに斧で木材にできます';
 }
 game.meadowRules.grant(n.log?.wood??'wood',n.amount);n.ready=1e10;
 return `木材を回収 · ${n.amount}個`;
}
export function stepForestry(game:Adventure,dt:number):void{
 const sim=game.sim,actors=sim.targets.length?sim.targets:[{player:sim.player,adventure:game}];
 for(const n of game.state.resources){const l=n.log;if(!l||n.ready>game.state.seconds||!actors.some(a=>Math.hypot(a.player.x-n.x,a.player.z-n.z)<48))continue;
  const previous={x:n.x,y:n.y,z:n.z};
  if(l.fall<1.5){l.fall=Math.min(1.5,l.fall+dt);const angle=(l.fall/1.5)**2*Math.PI/2;l.b.position.x=l.a.position.x+Math.sin(l.heading)*Math.sin(angle)*l.length;l.b.position.z=l.a.position.z+Math.cos(l.heading)*Math.sin(angle)*l.length;l.b.position.y=l.a.position.y+Math.cos(angle)*l.length;}
  else{
   for(const b of [l.a,l.b]){const water=sim.fluid.immersion({x:b.position.x,y:b.position.y-.32,z:b.position.z},.64);if(water>0){b.sleeping=false;const flow=sim.fluid.current(b.position,.64);b.velocity.x+=(flow.x-b.velocity.x)*water*dt*6;b.velocity.z+=(flow.z-b.velocity.z)*water*dt*6;b.velocity.y+=24*water*dt;}stepSphere(b,sim.world,dt);}
   for(let i=0;i<4;i++){const a=l.a.position,b=l.b.position,d=Math.max(.001,dist(a,b)),k=(d-l.length)/d*.5,dx=(b.x-a.x)*k,dy=(b.y-a.y)*k,dz=(b.z-a.z)*k;a.x+=dx;a.y+=dy;a.z+=dz;b.x-=dx;b.y-=dy;b.z-=dz;stepSphere(l.a,sim.world,0);stepSphere(l.b,sim.world,0);}
  }
  const a=l.a.position,b=l.b.position;Object.assign(n,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
  const closest=(p:Vec3)=>{const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz||1)));return{x:a.x+dx*t,y:a.y+dy*t,z:a.z+dz*t};};
  const speed=dist(previous,n)/Math.max(dt,.001);
  for(const actor of actors){const p=actor.player,q=closest({x:p.x,y:p.y+.65,z:p.z}),d=Math.hypot(p.x-q.x,p.z-q.z);if(d<.65&&q.y>p.y-.2&&q.y<p.y+1.4){if(speed>1.5)actor.adventure.hurtPlayer(Math.min(30,speed*4),'physical',p,n);const dx=(p.x-q.x)/(d||1),dz=(p.z-q.z)/(d||1);p.x+=dx*(.65-d);p.z+=dz*(.65-d);if(l.fall>=1.5)for(const end of [l.a,l.b]){end.velocity.x-=dx*.5;end.velocity.z-=dz*.5;end.sleeping=false;}}}
  if(speed>2)for(const tree of game.state.resources){if(!TREE_KINDS.has(tree.kind)||tree.ready>game.state.seconds||l.hits.includes(tree.id))continue;const q=closest({x:tree.x,y:tree.y+1,z:tree.z});if(Math.hypot(q.x-tree.x,q.z-tree.z)<.65&&q.y>tree.y&&q.y<tree.y+4){l.hits.push(tree.id);tree.health=(tree.health??80)-60;if(tree.health<=0)fellTree(game,tree,l.heading);}}
 }
}
