/** Actual-input mass comparison from an earned car. Ordinary salvage supplies
 * the crate and cargo; no inventory, position, graph, mass or velocity is set. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContinuousCoopJourney} from './playthrough-coop';
import {massProperties} from '../src/game/skybound/rigid';
import type {SkyPart} from '../src/game/skybound/types';

if(!process.env.VEHICLE_RESUME)throw Error('VEHICLE_RESUME must name the earned vehicle-restart.save.json');
const j:ContinuousCoopJourney=new ContinuousCoopJourney(process.env.VEHICLE_OUTPUT??'/tmp/voxel-cargo-mass-source',process.env.VEHICLE_RESUME),[a,b]=j.players;
const part=(id:number)=>{const value=j.sim.skybound.state.parts.find(p=>p.id===id);j.require(value,'Missing earned part '+id);return value;};
const observations:Record<string,unknown>[]=[];
const note=(stage:string,data:Record<string,unknown>={})=>{observations.push({stage,tick:j.sim.tick,...data});writeFileSync(resolve(j.output,'cargo-mass-observations.json'),JSON.stringify(observations,null,2));};
const aim={x:0,y:0,z:1},at={x:22,y:26.5,z:-22};
const geometry=(parts:readonly SkyPart[])=>parts.map(p=>({id:p.id,kind:p.kind,material:p.material,links:[...p.links],position:{...p.position},q:{...p.q!}}));
const conservedStone=(crate:number)=>(j.actor(a).adventure.state.inventory.stone??0)+(j.actor(b).adventure.state.inventory.stone??0)+(j.sim.skybound.state.storage?.[crate]?.stone??0);
try{
 j.stage='cargo-convert-earned-car';j.require(j.sim.skybound.state.parts.length===8,'Resume the verified eight-part vehicle');j.step(8);j.walk(20,-24,a);j.walk(24,-24,b);
 for(const id of [5,6,7,8,4]){j.act('sky-grab',String(id));j.act('sky-salvage',String(id));}
 for(const kind of ['wood','stone']){
  const drops=j.sim.adventure.state.resources.filter(r=>r.drop&&r.kind===kind&&r.amount>0&&Math.hypot(r.x-j.actor(a).player.x,r.y-j.actor(a).player.y,r.z-j.actor(a).player.z)<3.5);
  for(const drop of drops)j.act('gather',String(drop.id));
 }
 j.require(j.actor(a).adventure.state.inventory.wood===4&&j.actor(a).adventure.state.inventory.stone===8,'Ordinary salvage/pickup must supply exactly four wood and eight stone');
 j.walk(19.5,-22,a);j.walk(24.5,-22,b);j.act('sky-grab','1');j.act('sky-upright','1');j.act('sky-move','1',at,a,aim);
 const old=new Set(j.sim.skybound.state.parts.map(p=>p.id));j.act('sky-part','storage:wood',{x:at.x,y:at.y+.75,z:at.z-.625});
 const crate=j.sim.skybound.state.parts.find(p=>!old.has(p.id))!;j.require(crate?.kind==='storage','Expected the legally constructed storage crate');j.act('sky-glue',`1:${crate.id}`);j.act('sky-release','1');j.act('sky-share',`${crate.id}:on`);
 j.require(j.actor(a).adventure.state.inventory.wood===0&&conservedStone(crate.id)===8,'The new crate spends only recovered wood and keeps all cargo');
 const throws:{stage:string;mass:number;speed:number;distance:number;geometry:ReturnType<typeof geometry>}[]=[];
 const trial=(stage:string,expectedMass:number)=>{
  j.stage=stage;j.act('sky-grab','1');j.act('sky-upright','1');j.act('sky-move','1',at,a,aim);
  const before=massProperties(j.sim.skybound.state.parts),shape=geometry(j.sim.skybound.state.parts);j.require(Math.abs(before.mass-expectedMass)<1e-9,'Unexpected authority mass at '+stage);
  j.act('sky-throw','1',undefined,a,aim);const velocity={...part(1).velocity};
  j.require(Math.abs(velocity.x)<1e-12&&Math.abs(velocity.y)<1e-12&&Math.abs(velocity.z-60/expectedMass)<1e-9,'The same capped throw impulse must respect actual cargo mass');
  for(let tick=0;tick<4;tick++){j.step(1);j.require(j.sim.skybound.snapshot(a).physics!.contacts===0,'Comparison must remain airborne without collision impulses');}
  const after=massProperties(j.sim.skybound.state.parts),distance=Math.hypot(after.center.x-before.center.x,after.center.z-before.center.z);
  const result={stage,mass:before.mass,speed:velocity.z,distance,geometry:shape};throws.push(result);
  j.require(conservedStone(crate.id)===8,'Throwing must neither consume nor duplicate the cargo');note(stage,{...result,stoneTotal:conservedStone(crate.id),cargo:structuredClone(j.sim.skybound.state.storage?.[crate.id]??{})});j.checkpoint(stage);
 };
 trial('cargo-empty-throw',24);
 j.act('sky-grab','1');j.act('sky-upright','1');j.act('sky-move','1',at,a,aim);j.act('sky-store',`${crate.id}:stone:8`);j.act('sky-release','1');
 j.require(crate.cargoMass===16&&crate.mass===24&&j.actor(a).adventure.state.inventory.stone===0,'Eight actual stone must add sixteen mass only to the storage');
 for(const id of j.players)j.require(j.sim.skybound.snapshot(id).storage?.find(entry=>entry.part===crate.id)?.items.stone===8,'Shared cargo must be visible identically to both players');
 trial('cargo-loaded-throw',40);
 j.act('sky-take',`${crate.id}:stone:8`,undefined,b);j.require(j.actor(b).adventure.state.inventory.stone===8&&conservedStone(crate.id)===8,'The second player must receive all eight real stones exactly once');
 trial('cargo-unloaded-throw',24);
 const [empty,loaded,unloaded]=throws;
 // Upright/move rebuild the same pose through production collision checks.
 let maximumGeometryError=0;
 for(const comparison of [loaded,unloaded])for(let i=0;i<empty.geometry.length;i++){
  const x=empty.geometry[i],y=comparison.geometry[i];j.require(x.id===y.id&&JSON.stringify(x.links)===JSON.stringify(y.links),'Comparison must preserve the identical assembly graph');
  for(const key of ['x','y','z']as const)maximumGeometryError=Math.max(maximumGeometryError,Math.abs(x.position[key]-y.position[key]));
  for(const key of ['x','y','z','w']as const)maximumGeometryError=Math.max(maximumGeometryError,Math.abs(x.q[key]-y.q[key]));
 }
 j.require(maximumGeometryError<1e-8,'Only cargo may differ between compared launch poses');
 j.require(Math.abs(loaded.speed/empty.speed-.6)<1e-9&&Math.abs(loaded.distance/empty.distance-.6)<1e-7,'Loaded impulse and airborne displacement must scale inversely with mass');
 j.require(Math.abs(unloaded.speed-empty.speed)<1e-9&&Math.abs(unloaded.distance-empty.distance)<1e-7,'Taking cargo back out must restore the empty response');
 j.restart('cargo-comparison-saved');j.require(conservedStone(crate.id)===8&&j.actor(b).adventure.state.inventory.stone===8&&(part(crate.id).cargoMass??0)===0,'Save/restart must preserve the shared cargo transfer without duplication');
 note('comparison-complete',{maximumGeometryError,emptySpeed:empty.speed,loadedSpeed:loaded.speed,unloadedSpeed:unloaded.speed,emptyDistance:empty.distance,loadedDistance:loaded.distance,unloadedDistance:unloaded.distance,stoneTotal:8,receivedBy:b});
 j.event('route-complete',{scope:'earned-vehicle-cargo-mass-comparison',fixturesReplaced:false,emptyMass:24,loadedMass:40,loadedResponseRatio:.6,notCovered:['cargo buoyancy','long driving comparison','wall-clock load','browser','device']});j.flush();
}catch(error){j.event('blocked',{message:String(error),players:j.players.filter(id=>j.room.actors.has(id)).map(id=>({id,player:{...j.actor(id).player},inventory:{...j.actor(id).adventure.state.inventory}})),parts:structuredClone(j.sim.skybound.state.parts)});j.flush();process.exitCode=1;}
