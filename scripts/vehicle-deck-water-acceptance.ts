/** Separate bounded continuation from the action-earned car checkpoint. Never
 * alters actor coordinates, materials, fluid cells or a part graph directly. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContinuousCoopJourney} from './playthrough-coop';
import {global,local} from '../src/game/skybound/orientation';

const input=process.env.VEHICLE_RESUME;
if(!input)throw Error('VEHICLE_RESUME must name the action-earned vehicle-restart.save.json');
const j:ContinuousCoopJourney=new ContinuousCoopJourney(process.env.VEHICLE_OUTPUT??'/tmp/voxel-vehicle-deck-source',input);
const [a,b]=j.players;
const part=(id:number)=>{const p=j.sim.skybound.state.parts.find(p=>p.id===id);j.require(p,'Missing earned part '+id);return p;};
const observations:Record<string,unknown>[]=[];
const note=(stage:string,details:Record<string,unknown>={})=>{observations.push({stage,tick:j.sim.tick,...details});writeFileSync(resolve(j.output,'deck-water-observations.json'),JSON.stringify(observations,null,2));};
function boardOnFoot(owner:string,id:number){
 for(let tick=0;tick<300;tick++){
  const p=j.actor(owner).player,seat=part(id),top=global({x:0,y:.25,z:0},seat),dx=top.x-p.x,dz=top.z-p.z,d=Math.hypot(dx,dz);
  if(d<.18&&Math.abs(p.y-top.y)<.07&&p.grounded){j.step(3);return;}
  j.step(1,{[owner]:{x:d>.12?dx/Math.max(d,1e-9):0,z:d>.12?dz/Math.max(d,1e-9):0,jump:tick%20===0&&p.grounded}});
 }
 throw Error('Walking/jumping could not board the passenger seat top: '+JSON.stringify({player:j.actor(owner).player,part:part(id)}));
}
try{
 j.require(j.sim.skybound.state.parts.length===8&&part(4).energy!<.27,'Resume the verified eight-part, depleted car');
 j.stage='standing-deck-boarding';j.step(8);j.act('sky-charge','4');j.act('sky-ride','2',undefined,a);boardOnFoot(b,3);
 j.require(!j.sim.skybound.snapshot(b).riding,'Standing passenger must not have a seat claim');
 const relative=local(j.actor(b).player,part(3)),start={...part(1).position},beforeEnergy=part(4).energy!;let maxDrift=0;
 j.checkpoint('standing-deck-boarded');
 for(let tick=0;tick<30;tick++){
  j.step(1,{[a]:{x:0,z:-1,jump:false}});
  const now=local(j.actor(b).player,part(3));maxDrift=Math.max(maxDrift,Math.hypot(now.x-relative.x,now.y-relative.y,now.z-relative.z));
  j.require(!j.sim.skybound.snapshot(b).riding,'Deck passenger accidentally acquired a seat claim');
  j.require(maxDrift<.08,'Standing passenger drifted away from the moving floor');
 }
 j.require(Math.hypot(part(1).position.x-start.x,part(1).position.z-start.z)>.4,'Standing-deck vehicle must genuinely move');
 j.require(part(4).energy!<beforeEnergy,'Standing-deck drive must spend actual power');
 note('standing-deck-forward',{start,end:{...part(1).position},maxDrift,energy:part(4).energy,passengerRiding:false});j.checkpoint('standing-deck-forward');
 const beforeTurn=part(1).rotation;
 for(let tick=0;tick<12;tick++){j.step(1,{[a]:{x:.5,z:0,jump:false}});const now=local(j.actor(b).player,part(3));maxDrift=Math.max(maxDrift,Math.hypot(now.x-relative.x,now.y-relative.y,now.z-relative.z));j.require(maxDrift<.08,'Standing passenger drifted while turning');}
 j.require(Math.abs(part(1).rotation-beforeTurn)>.1,'Standing-deck drive must genuinely turn');
 note('standing-deck-turn',{before:beforeTurn,after:part(1).rotation,maxDrift});
 j.walk(24,-24,b);j.act('sky-ride','2',undefined,a);j.step(12);j.require(j.players.every(id=>j.actor(id).adventure.state.health>0&&!j.sim.skybound.snapshot(id).riding),'Both participants must safely leave the car');
 j.restart('standing-deck-saved');
 j.event('route-complete',{scope:'earned-car-standing-deck-continuation',fixturesReplaced:false,assertions:observations.map(o=>o.stage),notCovered:['water transport','overturning','real time','browser','device']});j.flush();
}catch(error){j.event('blocked',{message:String(error),players:j.players.filter(id=>j.room.actors.has(id)).map(id=>({id,player:{...j.actor(id).player},health:j.actor(id).adventure.state.health})),parts:structuredClone(j.sim.skybound.state.parts)});j.flush();process.exitCode=1;}
