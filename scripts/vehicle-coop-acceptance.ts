/** Actual-input vehicle acceptance. Starts a pristine world and gathers its real
 * shared supplies. No player, inventory, terrain or part-state fixture is used.
 * A successful trace can be replayed by playthrough-coop-websocket.ts. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';
import type {SkyPartKind,SkyMaterial} from '../src/game/skybound/types';
import {local} from '../src/game/skybound/orientation';

export function vehicleAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players,aim={x:0,y:0,z:0},observations:Record<string,unknown>[]=[];
 const note=(stage:string,data:Record<string,unknown>={})=>{observations.push({stage,tick:j.sim.tick,...data});writeFileSync(resolve(j.output,'vehicle-observations.json'),JSON.stringify(observations,null,2));};
 j.stage='vehicle-gather';j.step(30);j.pair(0,9);
 for(const kind of ['wood','stone','resin']){const node=j.sim.adventure.state.resources.find(n=>n.drop&&n.kind===kind&&n.amount>0);j.require(node,'Missing real starting supply '+kind);j.act('gather',String(node.id));}
 j.require(j.actor(a).adventure.state.inventory.wood===12&&j.actor(a).adventure.state.inventory.stone===8&&j.actor(a).adventure.state.inventory.resin===4,'Unexpected starting supplies');
 j.pair(0,20);j.pair(7,20);j.pair(10,20);j.pair(10,-18);
 for(const id of j.players){j.step(30);j.act('sky-ascend-preview',undefined,undefined,id);j.act('sky-ascend',undefined,undefined,id);j.walk(15,-18,id);}
 j.pair(22,-24);j.walk(24,-24,b);j.walk(20,-24,a);
 j.require(j.players.every(id=>Math.abs(j.actor(id).player.y-25)<.1),'Both players must reach the real flat island');
 j.checkpoint('vehicle-island-arrival');
 j.stage='vehicle-production-assembly';const center={x:22,y:25.75,z:-22};
 const create=(kind:SkyPartKind,material:SkyMaterial,x:number,y:number,z:number)=>{
  const old=new Set(j.sim.skybound.state.parts.map(p=>p.id));j.act('sky-part',`${kind}:${material}`,{x:center.x+x,y:center.y+y,z:center.z+z},a,aim);
  const part=j.sim.skybound.state.parts.find(p=>!old.has(p.id));j.require(part,'Missing newly created '+kind);return part.id;
 };
 const root=create('slab','wood',0,0,0);j.act('sky-grab',String(root),undefined,a,aim);
 const attach=(kind:SkyPartKind,material:SkyMaterial,x:number,y:number,z:number)=>{const id=create(kind,material,x,y,z);j.act('sky-glue',`${root}:${id}`,undefined,a,aim);return id;};
 const seatA=attach('seat','wood',-.5,.375,.375),seatB=attach('seat','wood',.5,.375,.375),battery=attach('battery','wood',0,.5,-.75);
 const wheels=[attach('wheel','stone',-1.25,-.25,-.5),attach('wheel','stone',1.25,-.25,-.5),attach('wheel','stone',-1.25,-.25,.5),attach('wheel','stone',1.25,-.25,.5)];
 j.require(j.actor(a).adventure.state.inventory.wood===0&&j.actor(a).adventure.state.inventory.stone===0,'Vehicle must consume exactly 12 wood and 8 stone');
 j.act('sky-charge',String(battery));for(const id of wheels)j.act('sky-toggle',String(id));j.act('sky-release',String(root));j.step(60);
 const part=(id:number)=>{const p=j.sim.skybound.state.parts.find(p=>p.id===id);j.require(p,'Vehicle part disappeared '+id);return p;};
 j.require(j.sim.skybound.state.parts.length===8,'Exactly eight legally created vehicle parts expected');
 j.require(part(battery).energy===25&&j.actor(a).adventure.state.inventory.resin===3,'One resin must charge exactly 25 units before driving');
 note('production-built',{ids:{root,seatA,seatB,battery,wheels},parts:structuredClone(j.sim.skybound.state.parts)});j.checkpoint('vehicle-legally-assembled');
 j.act('sky-ride',String(seatA),undefined,a);j.act('sky-ride',String(seatB),undefined,b);j.step(1);
 j.require(j.sim.skybound.snapshot(a).riding?.driver===true&&j.sim.skybound.snapshot(b).riding?.driver===false,'Exactly one of two occupied seats must drive');
 const riderCheck=()=>{for(const [owner,id]of [[a,seatA],[b,seatB]]as const){j.require(j.sim.skybound.snapshot(owner).riding?.seat===id,'Rider was unexpectedly ejected');const p=local(j.actor(owner).player,part(id));j.require(Math.hypot(p.x,p.y-.26,p.z)<.015,'Rider drift exceeded the 1cm collision-skin allowance');}};
 const start={...part(root).position},energy=part(battery).energy!;
 for(let i=0;i<30;i++){j.step(1,{[a]:{x:0,z:-1,jump:false},[b]:{x:1,z:1,jump:false}});riderCheck();}
 j.require(part(root).position.z>start.z+.2,'Ground-contact wheels must drive without any thruster');j.require(part(battery).energy!<energy,'Driving must consume real battery energy');
 note('two-rider-forward',{start,end:{...part(root).position},energy:part(battery).energy});j.checkpoint('vehicle-two-riders-forward');
 const forward={...part(root).position};for(let i=0;i<120&&(i<20||part(root).position.z>=forward.z-.2);i++){j.step(1,{[a]:{x:0,z:1,jump:false}});riderCheck();}
 j.require(part(root).position.z<forward.z-.15,'Reverse input must reverse the powered vehicle');
 note('two-rider-reverse',{start:forward,end:{...part(root).position},energy:part(battery).energy});
 const heading=part(root).rotation;for(let i=0;i<12;i++){j.step(1,{[a]:{x:.5,z:0,jump:false}});riderCheck();}
 j.require(Math.abs(part(root).rotation-heading)>.1,'Steering must turn the real assembly with both riders');
 note('two-rider-turn',{before:heading,after:part(root).rotation});j.checkpoint('vehicle-steering');
 // Short opposite driving inputs spend the remaining energy without leaving
 // the finite island; no battery value is assigned by the test.
 for(let i=0;i<300&&j.sim.skybound.snapshot(a).parts.some(p=>wheels.includes(p.id)&&p.powered);i++){j.step(1,{[a]:{x:0,z:Math.floor(i/4)%2?1:-1,jump:false}});riderCheck();}
 for(let i=0;i<240&&part(battery).energy!>.27;i++){j.step(1,{[a]:{x:0,z:Math.floor(i/4)%2?1:-1,jump:false}});riderCheck();}
 j.step(6,{[a]:{x:0,z:-1,jump:false}});j.require(!j.sim.skybound.snapshot(a).parts.some(p=>wheels.includes(p.id)&&p.powered),'All powered wheels must stop after the available charge is depleted');
 j.require(part(battery).energy!>=0&&part(battery).energy!<.27,'Energy must remain nonnegative with insufficient charge for one tick');
 note('power-depleted',{energy:part(battery).energy,root:{...part(root).position}});j.checkpoint('vehicle-power-depleted');
 j.leave(a);j.step(1);j.require(j.sim.skybound.snapshot(b).riding?.driver===true,'Remaining rider must become driver after original driver disconnects');
 j.rejoin(a);j.step(1);j.require(!j.sim.skybound.snapshot(a).riding,'Reconnect must not silently restore a stale seat claim');j.act('sky-ride',String(seatB),undefined,b);j.step(12);
 j.require(!j.sim.skybound.snapshot(b).riding&&j.actor(b).adventure.state.health>0,'Second rider must dismount through a safe real exit');
 j.restart('vehicle-restart');j.require(j.sim.skybound.state.parts.length===8&&j.players.every(id=>!j.sim.skybound.snapshot(id).riding),'Save/restart must preserve all parts and clear transient rider claims');
 note('restart-and-dismount',{parts:8,energy:part(battery).energy});
 j.event('route-complete',{scope:'legal-two-player-wheel-vehicle',fixturesReplaced:false,assertions:observations.map(o=>o.stage)});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new ContinuousCoopJourney(process.env.VEHICLE_OUTPUT??'/tmp/voxel-vehicle-source');
 try{vehicleAcceptance(j);}catch(error){j.event('blocked',{message:String(error),players:j.players.filter(id=>j.room.actors.has(id)).map(id=>({id,player:{...j.actor(id).player},health:j.actor(id).adventure.state.health})),parts:structuredClone(j.sim.skybound.state.parts)});j.flush();process.exitCode=1;}
}
