/** Actual-input bridge acceptance. Fresh world, earned materials and real actions.
 * No world, player, inventory, terrain or part-state fixtures are assigned.
 * Expected rejection stays explicit in the trace so old socket runners fail closed. */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';
import {skySupportHeight} from '../src/game/skybound/platform';
import {PART_COST,MATERIAL_ITEM,type SkyMaterial} from '../src/game/skybound/types';
import type {ClientMessage} from '../src/simulation/protocol';
import {validateSave} from '../src/save/format';

const AIM={x:0,y:0,z:0};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** This is an actual refused transaction, not an action-success fixture. */
export function expectBridgeRejection(j:ContinuousCoopJourney,player:string,message:ClientMessage,errorIncludes:string):void {
 j.step(6);
 const before={inventory:structuredClone(j.actor(player).adventure.state.inventory),parts:structuredClone(j.sim.skybound.save().parts),blueprints:structuredClone(j.sim.skybound.save().blueprints),nextId:j.sim.skybound.save().nextId};
 let error:unknown;
 try{j.room.action(player,message);}catch(caught){error=caught;}
 const after={inventory:structuredClone(j.actor(player).adventure.state.inventory),parts:structuredClone(j.sim.skybound.save().parts),blueprints:structuredClone(j.sim.skybound.save().blueprints),nextId:j.sim.skybound.save().nextId};
 j.require(error, 'Expected rebuild rejection unexpectedly succeeded');
 j.event('action-rejected',{player,message,error:String(error),expected:true,evidence:{errorIncludes,before,after,beforeSha256:digest(before),afterSha256:digest(after)}});
 j.require(String(error).includes(errorIncludes),'Rebuild was rejected for the wrong reason: '+String(error));
 j.require(JSON.stringify(before)===JSON.stringify(after),'Rejected rebuild changed inventory, parts, blueprints or next part ID');
}

export function bridgeAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players,observations:Record<string,unknown>[]=[];
 const note=(stage:string,data:Record<string,unknown>={})=>{const entry={stage,tick:j.sim.tick,...data};observations.push(entry);j.event('bridge-evidence',entry);writeFileSync(resolve(j.output,'bridge-observations.json'),JSON.stringify(observations,null,2));};
 const inventory=()=>structuredClone(j.actor(a).adventure.state.inventory);
 const parts=()=>j.sim.skybound.state.parts.filter(p=>p.creator===a);
 j.stage='bridge-gather';j.step(30);j.pair(0,9);
 for(const kind of ['wood','stone','resin']){const drop=j.sim.adventure.state.resources.find(n=>n.drop&&n.kind===kind&&n.amount>0);j.require(drop,'Missing real starting '+kind+' supply');j.act('gather',String(drop.id));}
 j.require(inventory().wood===12&&inventory().stone===8&&inventory().resin===4,'Unexpected shared starting supply');
 j.pair(0,20);j.pair(16,20);j.pair(28,13);j.walk(26,13,b);j.walk(28,12.5,a);
 j.checkpoint('bridge-real-materials-and-chasm');
 j.stage='bridge-construction';
 const create=(x:number,material:SkyMaterial)=>{const ids=new Set(j.sim.skybound.state.parts.map(p=>p.id));j.act('sky-part',`slab:${material}`,{x,y:5.375,z:8},a,AIM);const part=parts().find(p=>!ids.has(p.id));j.require(part,'Missing paid slab');return part.id;};
 const root=create(24,'wood');j.act('sky-grab',String(root),undefined,a,AIM);let previous=root;
 for(const [x,material]of [[26,'wood'],[28,'wood'],[30,'stone'],[32,'stone']]as const){const next=create(x,material);j.act('sky-glue',`${previous}:${next}`,undefined,a,AIM);previous=next;}
 j.require(parts().length===5&&inventory().wood===0&&inventory().stone===0&&inventory().resin===4,'Five connected slabs must cost exactly 12 wood and 8 stone');
 j.act('sky-blueprint',`${root}:Chasm crossing`,undefined,a,AIM);
 const blueprint=j.sim.skybound.state.blueprints.find(p=>p.owner===a);j.require(blueprint&&blueprint.parts.length===5,'Blueprint must capture all five connected slabs');
 j.require(blueprint.parts.every(p=>p.offset.y===0),'Construction must preserve a continuous flat deck before settling');
 const paid:Record<string,number>={};for(const part of blueprint.parts){const item=MATERIAL_ITEM[part.material];paid[item]=(paid[item]??0)+PART_COST[part.kind];}
 j.require(paid.wood===12&&paid.stone===8,'Blueprint cost differs from genuine construction');
 j.act('sky-release',String(root),undefined,a,AIM);
 // The second player handles the genuine connected assembly for final placement.
 j.act('sky-grab',String(root),undefined,b,AIM);j.act('sky-move',String(root),{x:24,y:5,z:8},b,AIM);j.act('sky-release',String(root),undefined,b,AIM);j.step(90);
 note('paid-connected-bridge',{cost:paid,blueprint:structuredClone(blueprint),parts:structuredClone(parts()),inventory:inventory(),chasm:{x:28,z:8,radius:3.5,groundAtCenter:j.sim.groundAt(28,8)}});
 j.checkpoint('bridge-assembled-and-blueprinted');
 // Walk around the southern bank before boarding the higher east end. The middle of
 // this route is over the authored chasm, about fifteen metres above its floor.
 j.pair(34,13);j.pair(34,8);
 const crossing=(player:string,z:number,label:string)=>{
  j.walk(34,z,player);j.walk(32,z,player);j.step(20);
  const samples:Record<string,unknown>[]=[];let supportedTicks=0,crossingTicks=0,midspan=false;
  for(let tick=0;tick<500&&j.actor(player).player.x>23.4;tick++){
   const p=j.actor(player).player,dx=22-p.x,dz=z-p.z,d=Math.hypot(dx,dz);
   j.step(1,{[player]:{x:dx/d,z:dz/d,jump:false}});
   const foot=j.actor(player).player;
   if(foot.x>25.2&&foot.x<30.8){const below=parts().map(part=>({id:part.id,y:skySupportHeight(part,foot)})).filter((p):p is {id:number;y:number}=>p.y!==undefined),supporting=below.filter(p=>Math.abs(p.y-foot.y)<.08);
    crossingTicks++;if(foot.grounded&&supporting.length)supportedTicks++;
    j.require(foot.grounded&&supporting.length>0,'Chasm crossing lost genuine assembly support');
    j.require(j.sim.groundAt(foot.x,foot.z)<-9,'Crossing evidence must be over the real chasm');
    if(!midspan&&foot.x<=28&&foot.grounded&&supporting.length){j.checkpoint('bridge-'+player+'-midspan');midspan=true;}
    if(tick%5===0)samples.push({tick:j.sim.tick,player,position:{...foot},supporting,ground:j.sim.groundAt(foot.x,foot.z)});
   }
  }
  note(label+'-path',{player,samples,supportedTicks,crossingTicks,midspan,end:{...j.actor(player).player}});
  j.require(j.actor(player).player.x<=23.4&&samples.length>=8&&midspan&&supportedTicks===crossingTicks,'Player did not walk across the genuine bridge');
  j.walk(22,z,player);note(label,{player,samples,supportedTicks,crossingTicks,end:{...j.actor(player).player}});
 };
 crossing(a,7.65,'first-player-crossing');crossing(b,8.35,'second-player-crossing');
 j.checkpoint('bridge-both-players-crossed');
 // The duplicate placement overlaps the existing bridge. Even with empty paid
 // materials, clearance must reject before any cost, ID or graph is committed.
 j.walk(22,13,a);j.walk(28,13,a);j.walk(28,12.5,a);
 expectBridgeRejection(j,a,{type:'game-action',action:'sky-rebuild',id:String(blueprint.id),target:{...parts()[0].position},aim:AIM},'重なっています');
 j.checkpoint('bridge-rejected-rebuild-preserved-state');
 // Salvage individual parts using actual leases; each paid unit is first a
 // physical resource drop. Materials are never granted by this driver.
 j.stage='bridge-salvage';j.walk(28,13,a);j.walk(27,12.5,a);
 // Move the whole bridge onto the southern bank before dismantling it, so the
 // returned physical materials can be picked up without falling into the chasm.
 j.act('sky-grab',String(root),undefined,a,AIM);j.act('sky-move',String(root),{x:24,y:6.5,z:8},a,AIM);j.act('sky-move',String(root),{x:26,y:6.5,z:8},a,AIM);j.act('sky-move',String(root),{x:26,y:6.5,z:16},a,AIM);j.act('sky-release',String(root),undefined,a,AIM);
 j.walk(22,13,a);j.walk(22,19,a);j.walk(30,19,a);j.step(60);
 const initialInventory=inventory(),sourceIds=parts().map(p=>p.id),dropIds=new Set<number>();
 for(const id of sourceIds){const before=new Set(j.sim.adventure.state.resources.map(n=>n.id));j.act('sky-grab',String(id),undefined,a,AIM);j.act('sky-salvage',String(id),undefined,a,AIM);for(const node of j.sim.adventure.state.resources)if(node.drop&&!before.has(node.id))dropIds.add(node.id);j.require(JSON.stringify(inventory())===JSON.stringify(initialInventory),'Salvage must not directly credit inventory');}
 j.require(parts().length===0,'Salvage left bridge parts behind');
 const drops=j.sim.adventure.state.resources.filter(n=>dropIds.has(n.id));note('salvage-ground-drops',{inventory:inventory(),drops:structuredClone(drops)});
 j.checkpoint('bridge-salvaged-to-ground-drops');
 for(const id of dropIds){const drop=j.sim.adventure.state.resources.find(n=>n.id===id);if(!drop)continue;j.walk(drop.x,drop.z,a);j.act('gather',String(id),undefined,a,AIM);}
 j.require(inventory().wood===12&&inventory().stone===8,'Legal pickup must recover precisely the paid materials');
 note('salvage-legally-picked-up',{inventory:inventory(),sourceIds,dropIds:[...dropIds]});j.checkpoint('bridge-materials-recovered');
 j.stage='bridge-rebuild';j.walk(28,13,a);j.walk(28,12.5,a);
 expectBridgeRejection(j,a,{type:'game-action',action:'sky-rebuild',id:String(blueprint.id),target:{x:24,y:3,z:8},aim:AIM},'重なっています');
 j.checkpoint('bridge-paid-rebuild-rejected-without-loss');j.act('sky-rebuild',String(blueprint.id),{x:24,y:4.875,z:8},a,AIM);j.step(90);
 j.require(parts().length===5&&inventory().wood===0&&inventory().stone===0&&inventory().resin===4,'Rebuild must pay exactly the recovered materials');
 j.require(parts().every(p=>!sourceIds.includes(p.id)),'Rebuild must create fresh part IDs');
 note('rebuild-from-recovered-materials',{cost:paid,parts:structuredClone(parts()),inventory:inventory()});j.checkpoint('bridge-rebuilt');
 j.require(j.players.every(id=>j.actor(id).adventure.state.health>0),'Both players must survive the earned route');
 j.restart('bridge-save-restart');j.require(parts().length===5&&j.sim.skybound.state.blueprints.some(p=>p.id===blueprint.id&&p.parts.length===5),'Bridge and blueprint must survive restart');
 j.event('route-complete',{scope:'legal-two-player-bridge-blueprint-salvage-rebuild',fixturesReplaced:false,expectedRejections:2,assertions:observations.map(n=>n.stage)});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new ContinuousCoopJourney(process.env.BRIDGE_OUTPUT??'/tmp/voxel-bridge-source');
 try{bridgeAcceptance(j);}catch(error){j.event('blocked',{message:String(error),stack:error instanceof Error?error.stack:undefined,players:j.players.map(id=>({id,player:{...j.actor(id).player},health:j.actor(id).adventure.state.health})),parts:structuredClone(j.sim.skybound.state.parts)});writeFileSync(resolve(j.output,'blocked-state.save.json'),JSON.stringify(validateSave(j.room.save())));j.flush();process.exitCode=1;}
}
