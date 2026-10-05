/** Bounded water continuation using only an earned vehicle save and real
 * salvage, digging, pouring, mounting and movement actions. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContinuousCoopJourney} from './playthrough-coop';
import {assemblyBuoyancy} from '../src/game/skybound/buoyancy';
import {skyContext} from '../src/game/skybound/context';
import {global} from '../src/game/skybound/orientation';
import {PART_HALF} from '../src/game/skybound/types';

if(!process.env.VEHICLE_RESUME)throw Error('Supply an action-earned standing-deck checkpoint');
const j:ContinuousCoopJourney=new ContinuousCoopJourney(process.env.VEHICLE_OUTPUT??'/tmp/voxel-vehicle-water-source',process.env.VEHICLE_RESUME);const [a,b]=j.players;
const part=(id:number)=>{const p=j.sim.skybound.state.parts.find(p=>p.id===id);j.require(p,'Missing earned part '+id);return p;};
const observations:Record<string,unknown>[]=[];
const note=(stage:string,data:Record<string,unknown>={})=>{observations.push({stage,tick:j.sim.tick,...data});writeFileSync(resolve(j.output,'water-observations.json'),JSON.stringify(observations,null,2));};
try{
 j.require(j.sim.skybound.state.parts.length===8,'Expected the verified eight-part car');j.stage='water-convert-hull';j.step(8);j.walk(20,-24,a);j.walk(24,-24,b);
 for(const wheel of [5,6,7,8]){j.act('sky-grab',String(wheel));j.act('sky-salvage',String(wheel));}
 j.require(Number(j.sim.skybound.state.parts.length)===4&&j.sim.skybound.state.parts.every(p=>p.material==='wood'),'Only the earned four wooden hull/seat/battery parts remain');
 j.act('sky-grab','4');j.act('sky-salvage','4');const wood=j.sim.adventure.state.resources.filter(r=>r.drop&&r.kind==='wood'&&r.amount===4).at(-1);j.require(wood,'Battery salvage must return its four real wood');j.walk(wood.x-2,wood.z,a);j.act('gather',String(wood.id));j.walk(20,-24,a);
 j.act('sky-grab','1');j.act('sky-move','1',{x:22,y:26,z:-20},a,{x:0,y:0,z:1});
 j.act('sky-part','slab:wood',{x:19.875,y:26,z:-20});const board=j.sim.skybound.state.parts.filter(p=>p.kind==='slab'&&p.id!==1).at(-1)!;j.act('sky-glue',`1:${board.id}`);
 j.message(a,{type:'action',tool:'dig',target:{x:20,y:24.4,z:-20}});j.message(a,{type:'action',tool:'dig',target:{x:22,y:24.4,z:-20}},10);
 note('real-basin-excavated',{edits:j.sim.world.edits.length,parts:4,wood:j.actor(a).adventure.state.inventory.wood??0,stone:j.actor(a).adventure.state.inventory.stone??0});
 for(let i=0;i<5;i++)j.message(a,{type:'action',tool:'water',target:{x:i%2?20:22,y:23.5,z:-20}});
 j.act('sky-release','1');j.step(30);j.checkpoint('water-hull-and-basin');
 j.act('sky-ride','2',undefined,a);j.act('sky-ride','3',undefined,b);j.step(1);
 const start={...part(1).position};let maximumWet=0,maximumHorizontal=0,clearTicks=0;
 for(let tick=0;tick<150;tick++){
  if(tick%30===0){const root=part(1);j.message(a,{type:'action',tool:'water',target:{x:root.position.x,y:root.position.y-.5,z:root.position.z-.4}});}
  j.step(1);const parts=j.sim.skybound.state.parts,water=assemblyBuoyancy(parts,skyContext(j.sim)),root=part(1);maximumWet=Math.max(maximumWet,water.wet);
  const clear=parts.every(p=>{const h=PART_HALF[p.kind];return [-1,1].every(x=>[-1,1].every(z=>j.sim.world.density(global({x:x*h.x,y:-h.y,z:z*h.z},p))>.02));});
  if(water.wet>.1&&clear){clearTicks++;maximumHorizontal=Math.max(maximumHorizontal,Math.hypot(root.position.x-start.x,root.position.z-start.z));}
  if(tick%15===0)note('water-observation',{wet:water.wet,clear,root:{...root.position},riders:j.players.map(id=>j.sim.skybound.snapshot(id).riding),health:j.players.map(id=>j.actor(id).adventure.state.health)});
  j.require(j.players.every(id=>j.actor(id).adventure.state.health>0&&!!j.sim.skybound.snapshot(id).riding),'Both riders must remain alive aboard the floating hull');
  if(clearTicks>=15&&maximumHorizontal>.15)break;
 }
 j.require(maximumWet>.1&&clearTicks>=15,'Wooden hull must float clear of real terrain for at least fifteen wet ticks');
 j.require(maximumHorizontal>.15,'Real poured-water current must transport the two-rider hull by at least fifteen centimetres');
 note('water-transport-passed',{maximumWet,clearTicks,maximumHorizontal});j.restart('water-two-rider-transport');
 j.event('route-complete',{scope:'earned-hull-dug-basin-water-transport',fixturesReplaced:false,maximumWet,clearTicks,maximumHorizontal,notCovered:['open-water voyage','overturning','real time','browser','device']});j.flush();
}catch(error){j.event('blocked',{message:String(error),players:j.players.filter(id=>j.room.actors.has(id)).map(id=>({id,player:{...j.actor(id).player},health:j.actor(id).adventure.state.health})),parts:structuredClone(j.sim.skybound.state.parts)});j.flush();process.exitCode=1;}
