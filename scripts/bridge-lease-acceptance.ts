/** A real bridge assembly lease is released on departure, claimed by the other
 * player, and remains exclusive after the original identity reconnects.
 * Default execution builds the entire paid bridge route in a fresh world first.
 * BRIDGE_LEASE_RESUME is for solving only; a resumed trace is not fresh proof. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {ContinuousCoopJourney} from './playthrough-coop';
import {bridgeAcceptance,expectBridgeRejection} from './bridge-coop-acceptance';
const AIM={x:0,y:0,z:0};

export function bridgeLeaseAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players,parts=j.sim.skybound.state.parts.filter(part=>part.creator===a);
 j.require(parts.length===5,'Lease tail requires the five actually paid and rebuilt bridge parts');
 const root=parts[0].id,ids=parts.map(part=>part.id),before=j.players.map(id=>({id,inventory:structuredClone(j.actor(id).adventure.state.inventory)}));
 const observed=(owner:string|undefined)=>{
  // These ordinary input ticks produce a normal client frame in the socket
  // replay; no resync requests, arbitrary clock changes or injected snapshots.
  j.step(3);
  for(const viewer of j.players.filter(id=>j.room.actors.has(id))){
   const snapshot=j.room.view(viewer).adventure.skybound;
   j.require(snapshot&&ids.every(id=>snapshot.parts.find(part=>part.id===id)?.lease?.owner===owner),'Every connected part must have the expected client-visible lease');
  }
  j.event('assembly-lease-observation',{ids,owner:owner??null,active:j.players.filter(id=>j.room.actors.has(id)),inventories:j.players.filter(id=>j.room.actors.has(id)).map(id=>({id,inventory:structuredClone(j.actor(id).adventure.state.inventory)}))});
 };
 j.stage='bridge-assembly-lease-departure';
 j.act('sky-grab',String(root),undefined,a,AIM);observed(a);
 j.leave(a);observed(undefined);
 j.act('sky-grab',String(root),undefined,b,AIM);observed(b);
 j.checkpoint('bridge-remaining-player-reclaimed-assembly');
 j.rejoin(a);observed(b);
 expectBridgeRejection(j,a,{type:'game-action',action:'sky-grab',id:String(root),aim:AIM},'別の冒険者');
 observed(b);
 j.act('sky-release',String(root),undefined,b,AIM);observed(undefined);
 j.act('sky-grab',String(root),undefined,a,AIM);observed(a);
 j.act('sky-release',String(root),undefined,a,AIM);observed(undefined);
 for(const expected of before)j.require(JSON.stringify(j.actor(expected.id).adventure.state.inventory)===JSON.stringify(expected.inventory),'Reconnect or lease transfer changed a paid inventory');
 j.require(j.sim.skybound.state.parts.filter(part=>ids.includes(part.id)).length===5,'Lease handoff lost bridge parts');
 j.restart('bridge-lease-reconnect-save');observed(undefined);
 j.event('route-complete',{scope:'legal-two-player-bridge-with-assembly-disconnect-lease-recovery',fixturesReplaced:false,expectedRejections:j.trace.filter(event=>event.kind==='action-rejected'&&event.expected===true).length});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new ContinuousCoopJourney(process.env.BRIDGE_LEASE_OUTPUT??'/tmp/voxel-bridge-lease-source',process.env.BRIDGE_LEASE_RESUME);
 try{if(!process.env.BRIDGE_LEASE_RESUME)bridgeAcceptance(j);bridgeLeaseAcceptance(j);}
 catch(error){j.event('blocked',{message:String(error),stack:error instanceof Error?error.stack:undefined});j.flush();writeFileSync(resolve(j.output,'failure.txt'),String(error));process.exitCode=1;}
}
