import type { Adventure } from '../adventure';
import type { BuildingState } from '../types';
import type { Vec3 } from '../../world/types';
import { environmentAt } from '../../environment/time';
import { roofed,learn } from './state';
import { meadowEnemy } from './world';
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
export function waterHeight(game:Adventure,x:number,z:number):number|null{
 let top=-Infinity;for(let y=-12;y<15;y++){const c=game.sim.fluid.cells.get(`${Math.floor(x)},${y},${Math.floor(z)}`);if(c&&c.volume>.1)top=Math.max(top,y+c.volume);}
 return Number.isFinite(top)?top:null;
}
export function driveRaft(game:Adventure,x:number,z:number,dt:number):boolean{
 const m=game.state.meadows;if(!m?.riding)return false;const b=game.state.buildings.find(b=>b.id===m.riding&&b.definition==='raft');if(!b){m.riding=undefined;return false;}
 const p=game.sim.player,top=waterHeight(game,b.x,b.z);if(top===null){m.riding=undefined;return false;}
 const moving=Math.hypot(x,z)>.1;if(moving)b.rotation=Math.atan2(x,z);
 const wind=Math.sin(game.state.seconds/60),sail=.5+Math.max(0,Math.cos(b.rotation-wind));
 const flow=game.sim.fluid.current({x:b.x,y:top-.5,z:b.z},1),speed=moving?2*sail:0;
 const nx=b.x+(Math.sin(b.rotation)*speed+flow.x*.5)*dt,nz=b.z+(Math.cos(b.rotation)*speed+flow.z*.5)*dt;
 const next=waterHeight(game,nx,nz);if(next!==null&&game.sim.groundAt(nx,nz)<next-.5){b.x=nx;b.z=nz;b.y=next-.2;}
 p.x=b.x;p.y=b.y+.5;p.z=b.z;p.vy=0;p.grounded=true;p.heading=b.rotation;return true;
}
/** Once per world tick: shelter consequences, boats and husbandry. */
export function stepFacilities(game:Adventure,dt:number):void{
 const s=game.state,m=s.meadows!;if(game.owner!=='host')return;
 const env=environmentAt(s.seconds),rain=['rain','storm'].includes(env.weather);
 for(const b of s.buildings){
  if(b.definition==='raft'){const top=waterHeight(game,b.x,b.z);if(top!==null)b.y=top-.2;}
  const cover=roofed(b,s.buildings);
  if(rain&&!cover&&!['fire','raft'].includes(b.definition))b.health=Math.max(50,(b.health??100)-dt*.04);
  if(b.definition==='fire'&&(b.fuel??0)>0&&!b.open){
   const sealed=cover&&s.buildings.filter(w=>['wall','halfWall'].includes(w.definition)&&distance(w,b)<3).length>=3;
   for(const actor of game.sim.targets.length?game.sim.targets:[{player:game.sim.player,adventure:game}])if(distance(actor.player,b)<(sealed?2.5:.4))actor.adventure.hurtPlayer(sealed?2:4,'fire');
  }
 }
 const tame=s.enemies.filter(e=>e.definition==='boar'&&e.health>0&&(e.tame??0)>=1&&!e.baby&&(e.fed??0)>0);
 for(const e of tame){
  if(s.enemies.filter(n=>n.definition==='boar'&&n.health>0&&distance(n,e)<8).length>=5)continue;
  const mate=tame.find(n=>n.id!==e.id&&distance(n,e)<3);if(!mate)continue;
  e.breeding=(e.breeding??0)+dt;
  if(e.breeding>=300){e.breeding=0;const baby=meadowEnemy(game.sim,'boar',e.x+1,e.z,e.stars??0);baby.tame=1;baby.baby=600;s.enemies.push(baby);}
 }
 if(game.sim.tick%300===0&&s.defeated.includes('stormstag')&&env.daylight<.1&&s.enemies.filter(e=>e.definition==='greydwarf'&&e.health>0).length<3){const p=game.sim.player;s.enemies.push(meadowEnemy(game.sim,'greydwarf',p.x+20,p.z-18));}
 for(const fish of s.resources)if(['perch','pike'].includes(fish.kind)&&fish.ready<=s.seconds){const top=waterHeight(game,fish.x,fish.z);if(top!==null)fish.y=top-.2;}
 if(m.sneaking&&Math.hypot(game.sim.player.x,game.sim.player.z)>1)learn(s,'sneak',dt*.002);
}
export function nearestFacility(game:Adventure,ids:string[]):BuildingState|undefined{return game.state.buildings.filter(b=>ids.includes(b.definition)&&distance(b,game.sim.player)<3).sort((a,b)=>distance(a,game.sim.player)-distance(b,game.sim.player))[0];}
