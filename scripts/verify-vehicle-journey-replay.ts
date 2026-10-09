/** Exact read-only comparison of composed vehicle/deck/water source checkpoints
 * with checkpoints earned independently by the real two-WebSocket replay. */
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {snapshotDigest} from './soak-coop-common';
const composed=resolve(process.argv[2]??'/tmp/voxel-vehicle-deck-water-composed-01'),replay=resolve(process.argv[3]??'/tmp/voxel-vehicle-deck-water-socket-01');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const provenance=read(join(composed,'provenance.json')),summary=read(join(replay,'summary.json'));
if(summary.status!=='completed-source-route'||summary.sourceTerminalKind!=='route-complete'||summary.failures?.length||summary.unmatchedReferences||summary.unmatchedObserved||summary.fixturesReplaced!==false||summary.freshStart!==true||summary.players!==2)throw Error('Require a completed fresh two-socket replay without fixtures or mismatches');
if(summary.traceSha256!==hash(readFileSync(join(composed,'trace.json'),'utf8'))||summary.traceSha256!==provenance.composedTraceSha256)throw Error('Composed trace/provenance mismatch');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),start=events.find(event=>event.kind==='start');
if(!Array.isArray(start?.players)||start.players.length!==2)throw Error('Missing authenticated identity mapping');
const mapping=new Map<string,string>(start.players.map((p:{sourceId:string;playerId:string})=>[p.sourceId,p.playerId]));
const normalize=(value:unknown):unknown=>typeof value==='string'?mapping.get(value)??value:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[mapping.get(key)??key,normalize(item)])):value;
const checks:Record<string,unknown>[]=[],clockNormalizations:Record<string,unknown>[]=[];
for(const segment of provenance.sourceSegments){
 const text=readFileSync(segment.path,'utf8');if(hash(text)!==segment.traceSha256)throw Error('Source trace hash changed');
 const trace=JSON.parse(text) as {kind:string;stage:string;file:string}[];
 const end=segment.throughCheckpoint?trace.findIndex(event=>event.kind==='checkpoint'&&event.stage===segment.throughCheckpoint):trace.length-1;
 if(end<0)throw Error('Missing source boundary');
 for(const event of trace.slice(0,end+1).filter(event=>event.kind==='checkpoint')){
  const source=read(join(dirname(segment.path),event.file)),files=readdirSync(replay).filter(file=>file.endsWith('-'+event.stage+'.checkpoint.json'));
  if(files.length!==1)throw Error('Ambiguous socket checkpoint '+event.stage);
  const actual=read(join(replay,files[0])).world;
  for(const field of ['skybound','edits'])if(snapshotDigest({value:normalize(source[field])})!==snapshotDigest({value:actual[field]}))throw Error(field+' differs at '+event.stage);
  if(snapshotDigest({fluids:source.fluids})!==snapshotDigest({fluids:actual.fluids}))throw Error('Complete saved water differs at '+event.stage);
  if(source.adventure.seconds!==actual.adventure.seconds)throw Error('Authoritative world clock differs at '+event.stage);
  for(const [logical,authenticated]of mapping){
   const expected=source.members?.find((member:{id:string})=>member.id===logical),member=actual.members?.find((member:{id:string})=>member.id===authenticated);
   if(!expected||!member||snapshotDigest(normalize(expected.player))!==snapshotDigest(member.player))throw Error('Player pose differs at '+event.stage+' '+logical);
   // Session.withActor synchronizes the actor-local clock whenever a network
   // snapshot is read. Direct stepPersonal can be one step ahead between reads.
   // The actual world clock must match exactly; accept only this bounded shadow
   // field difference, recording every normalization instead of hiding it.
   const clock=actual.adventure.seconds;
   for(const value of [expected.adventure.seconds,member.adventure.seconds])if(!Number.isFinite(value)||Math.min(Math.abs(value-clock),Math.abs(value-clock-1/30))>1e-9)throw Error('Actor clock outside one-step snapshot normalization at '+event.stage);
   if(expected.adventure.seconds!==member.adventure.seconds)clockNormalizations.push({stage:event.stage,player:logical,sourceSeconds:expected.adventure.seconds,socketSeconds:member.adventure.seconds,authoritativeSeconds:clock});
   if(snapshotDigest(normalize({...expected.adventure,seconds:clock}))!==snapshotDigest({...member.adventure,seconds:clock}))throw Error('Player personal save differs at '+event.stage+' '+logical);
  }
  checks.push({stage:event.stage,parts:actual.skybound?.parts.length??0,skyboundHash:snapshotDigest(actual.skybound),savedWaterHash:snapshotDigest({fluids:actual.fluids})});
 }
}
if(checks.length!==summary.completed.length)throw Error('Not all replay checkpoints were checked');
const result={status:'passed',harness:'composed-vehicle-deck-water-exact-checkpoints',sourceHash:summary.sourceHash,traceSha256:summary.traceSha256,freshStart:true,fixturesReplaced:false,players:2,actions:summary.actions,steps:summary.steps,restarts:summary.restarts,disconnects:summary.disconnects,rejoins:summary.rejoins,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints:checks,clockNormalizations,limits:['deterministic clock, not wall-clock performance','Node sockets, not browser/device/public transport','water movement is a short player-dug basin test, not an open-water voyage']};
writeFileSync(join(replay,'vehicle-journey-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
