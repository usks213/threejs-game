/** Read-only source-to-socket comparison. Source saves are comparison inputs,
 * never restoration fixtures. Only the final verification receipt is written. */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {validateSave,type WorldSave} from '../src/save/format';
import {validateCheckpoint,type SafeCheckpoint} from '../src/save/checkpoint';
import {snapshotDigest} from './soak-coop-common';

type Entry=Record<string,unknown>;
interface TraceEvent extends Entry {kind:string;stage:string;tick:number;file?:string;player?:string;message?:Entry;error?:string;expected?:boolean;evidence?:{before:unknown;after:unknown;beforeSha256:string;afterSha256:string;errorIncludes:string}}
interface Summary {status:string;sourceTerminalKind:string;sourceHash:string;traceSha256:string;sourceTrace:string;sourceTraceEventCount:number;failures:unknown[];unmatchedReferences:number;unmatchedObserved:number;fixturesReplaced:boolean;freshStart:boolean;players:number;actions:number;acceptedActions:number;expectedRejections:number;steps:number;restarts:number;disconnects:number;rejoins:number;checkpoints:number;frames:number;frameChecks:number;waterChecks:number;completed:string[]}
let includeLeaseTail=false,expectedRuntimeHash:string|undefined;
for(let i=4;i<process.argv.length;i++){
 const option=process.argv[i];
 if(option==='--include-lease-tail'&&!includeLeaseTail)includeLeaseTail=true;
 else if(option==='--expected-runtime-hash'&&!expectedRuntimeHash&&/^[a-f0-9]{64}$/.test(process.argv[i+1]??''))expectedRuntimeHash=process.argv[++i];
 else throw Error('Unknown, repeated or incomplete verifier option '+option);
}
if(includeLeaseTail&&!expectedRuntimeHash)throw Error('Lease-tail comparison requires an explicit --expected-runtime-hash; it does not fabricate source-start provenance');
const source=resolve(process.argv[2]??'/tmp/voxel-bridge-source-final'),replay=resolve(process.argv[3]??'/tmp/voxel-bridge-socket-final');
const expected=includeLeaseTail?{actions:47,accepted:44,rejected:3,steps:1774,checkpoints:13,restarts:2,disconnects:1,rejoins:1,scope:'legal-two-player-bridge-with-assembly-disconnect-lease-recovery'}:{actions:41,accepted:39,rejected:2,steps:1711,checkpoints:11,restarts:1,disconnects:0,rejoins:0,scope:'legal-two-player-bridge-blueprint-salvage-rebuild'};
const read=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8'));
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
function require(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}
const summary=read(join(replay,'summary.json')) as Summary;
require(summary.status==='completed-source-route'&&summary.sourceTerminalKind==='route-complete'&&Array.isArray(summary.failures)&&summary.failures.length===0&&summary.unmatchedReferences===0&&summary.unmatchedObserved===0&&summary.fixturesReplaced===false&&summary.freshStart===true&&summary.players===2,'Require a completed fresh two-socket replay with zero unexplained failures or unmatched frames');
require(summary.actions===expected.actions&&summary.acceptedActions===expected.accepted&&summary.expectedRejections===expected.rejected&&summary.steps===expected.steps&&summary.checkpoints===expected.checkpoints&&summary.restarts===expected.restarts&&summary.disconnects===expected.disconnects&&summary.rejoins===expected.rejoins,'Bridge operation, tick, checkpoint or restart counts differ');
require(summary.frameChecks>20&&summary.waterChecks===summary.frameChecks&&summary.frames===summary.frameChecks,'Missing complete decoded snapshot/water verification');
const traceText=readFileSync(join(source,'trace.json'),'utf8'),trace=JSON.parse(traceText) as TraceEvent[];
require(hash(traceText)===summary.traceSha256&&summary.sourceTraceEventCount===trace.length,'Source trace differs from replay receipt');
require(trace[0]?.kind==='start'&&!trace[0].resume&&trace.at(-1)?.kind==='route-complete'&&trace.at(-1)?.scope===expected.scope&&!trace.some(e=>e.kind==='blocked'),'Source must be the complete fresh, actual-input bridge route');
const rejected=trace.filter(e=>e.kind==='action-rejected');
require(rejected.length===expected.rejected&&rejected.every(e=>e.expected===true)&&trace.filter(e=>e.kind==='action').length===expected.accepted,'Source contains unexplained rejected or missing accepted operations');
require(trace.filter(e=>e.kind==='input').reduce((n,e)=>n+Number(e.ticks),0)===expected.steps,'Source input count differs');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line) as Entry);
require(!events.some(e=>['failure','fatal','startup-error'].includes(String(e.kind))),'Replay event log contains a failure');
const starts=events.filter(e=>e.kind==='start');require(starts.length===1,'Ambiguous replay start');
const identities=starts[0].players as {sourceId:string;playerId:string}[];
require(Array.isArray(identities)&&identities.length===2&&identities.every(p=>['journey-a','journey-b'].includes(p.sourceId)&&/^[a-f0-9]{64}$/.test(p.playerId))&&new Set(identities.map(p=>p.sourceId)).size===2&&new Set(identities.map(p=>p.playerId)).size===2,'Missing or invalid authenticated public identity mapping');
const mapping=new Map(identities.map(p=>[p.sourceId,p.playerId]));
const normalize=(value:unknown):unknown=>typeof value==='string'?mapping.get(value)??value:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[mapping.get(key)??key,normalize(item)])):value;
const same=(left:unknown,right:unknown)=>snapshotDigest({value:normalize(left)})===snapshotDigest({value:right});
const ready=events.filter(e=>e.kind==='ready');require(ready.length===expected.restarts+1&&ready.every(e=>e.sourceHash===summary.sourceHash),'Gameplay source changed across server processes');
if(expectedRuntimeHash)require(summary.sourceHash===expectedRuntimeHash,'Socket runtime differs from explicit expected hash');
const runtimeReceipt=join(source,'bridge-verification.json');
if(existsSync(runtimeReceipt)){const sourceVerification=read(runtimeReceipt) as Entry;require(sourceVerification.status==='passed'&&sourceVerification.runtimeHash===summary.sourceHash&&sourceVerification.traceSha256===summary.traceSha256,'Source route receipt and actual socket runtime differ');}
const checkpoints=trace.filter(e=>e.kind==='checkpoint'),checks:Entry[]=[],personalNormalizations:Entry[]=[];
require(checkpoints.length===expected.checkpoints&&new Set(checkpoints.map(e=>e.stage)).size===expected.checkpoints&&JSON.stringify(checkpoints.map(e=>e.stage))===JSON.stringify(summary.completed),'Missing, duplicate or reordered source checkpoints');
for(const event of checkpoints){
 require(typeof event.file==='string'&&basename(event.file)===event.file,'Unsafe or missing source checkpoint filename');
 const expected=read(join(source,event.file)) as WorldSave;validateSave(expected);
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+event.stage+'.checkpoint.json'));
 require(files.length===1,'Missing or ambiguous socket checkpoint '+event.stage);
 const socket=read(join(replay,files[0])) as SafeCheckpoint;validateCheckpoint(socket);const actual=socket.world;
 require(expected.generator===actual.generator&&expected.seed===actual.seed&&expected.version===actual.version,'World identity differs at '+event.stage);
 require(same(expected.skybound,actual.skybound),'Complete skybound state differs at '+event.stage);
 require(same(expected.edits,actual.edits),'Terrain edits differ at '+event.stage);
 require(expected.adventure?.seconds===actual.adventure?.seconds&&Number.isFinite(expected.adventure?.seconds),'Shared authoritative world clock differs at '+event.stage);
 require(snapshotDigest({fluids:expected.fluids})===snapshotDigest({fluids:actual.fluids}),'Complete saved water differs at '+event.stage);
 require(expected.members?.length===2&&actual.members?.length===2,'Missing or unexpected saved members at '+event.stage);
 const members:Entry[]=[];
 for(const [logical,authenticated]of mapping){
  const before=expected.members.find(m=>m.id===logical),after=actual.members.find(m=>m.id===authenticated);
  require(before&&after,'Missing saved member '+logical+' at '+event.stage);
  require(same(before.player,after.player),'Full player pose differs at '+event.stage+' '+logical);
  const rawPersonalEqual=same(before.adventure,after.adventure),sourcePersonal=structuredClone(before.adventure),socketPersonal=structuredClone(after.adventure),worldSeconds=expected.adventure!.seconds;
  // SessionAuthority.withActor resets the shared-time cache before every view or
  // action; stepPersonal increments it once. The socket's normal view can thus
  // leave either shared time or shared time+one tick in a personal save. Keep the
  // authoritative shared clock exact and reject anything outside those two states.
  const checkpointPlayers=event.players as {id:string}[];require(Array.isArray(checkpointPlayers),'Missing source checkpoint active membership');
  const dormant=includeLeaseTail&&!checkpointPlayers.some(member=>member.id===logical);
  if(dormant)require(sourcePersonal.seconds===socketPersonal.seconds,'Dormant personal clock differs at '+event.stage+' '+logical);
  else {
  for(const personal of [sourcePersonal,socketPersonal])require(Math.abs(personal.seconds-worldSeconds)<1e-12||Math.abs(personal.seconds-(worldSeconds+1/30))<1e-12,'Personal time is not the known one-tick view cache at '+event.stage+' '+logical);
  if(sourcePersonal.seconds!==socketPersonal.seconds)personalNormalizations.push({stage:event.stage,player:logical,path:'seconds',source:sourcePersonal.seconds,replay:socketPersonal.seconds,canonical:worldSeconds,rule:'withActor shared clock / stepPersonal one-tick cache'});
  sourcePersonal.seconds=socketPersonal.seconds=worldSeconds;
  }
  // inventoryLimit treats an absent slotLimit as32; snapshot.refreshGrowth
  // materializes that same default. No other optional personal field is changed.
  if(sourcePersonal.meadows&&socketPersonal.meadows){
   require((sourcePersonal.meadows.slotLimit??32)===32&&(socketPersonal.meadows.slotLimit??32)===32,'Unexpected non-default inventory capacity in fresh bridge route');
   if(sourcePersonal.meadows.slotLimit!==socketPersonal.meadows.slotLimit)personalNormalizations.push({stage:event.stage,player:logical,path:'meadows.slotLimit',source:sourcePersonal.meadows.slotLimit??null,replay:socketPersonal.meadows.slotLimit??null,canonical:32,rule:'inventoryLimit default / snapshot refreshGrowth'});
   sourcePersonal.meadows.slotLimit=socketPersonal.meadows.slotLimit=32;
  }
  require(same(sourcePersonal,socketPersonal),'Full personal adventure differs beyond the documented shared-time/default caches at '+event.stage+' '+logical);
  members.push({sourceId:logical,playerId:authenticated,poseHash:snapshotDigest(after.player),rawPersonalEqual,rawSourceAdventureHash:snapshotDigest(normalize(before.adventure)),rawSocketAdventureHash:snapshotDigest(after.adventure),normalizedAdventureHash:snapshotDigest(socketPersonal)});
 }
 checks.push({stage:event.stage,sourceSaveSha256:hash(readFileSync(join(source,event.file),'utf8')),socketCheckpointSha256:hash(readFileSync(join(replay,files[0]),'utf8')),parts:actual.skybound?.parts.length??0,skyboundHash:snapshotDigest({value:actual.skybound}),editsHash:snapshotDigest({value:actual.edits}),savedWaterHash:snapshotDigest({fluids:actual.fluids}),members});
}
const observed=read(join(source,'bridge-observations.json')) as Entry[];
const crossings:Entry[]=[];
for(const [stage,player]of [['first-player-crossing','journey-a'],['second-player-crossing','journey-b']]as const){
 const observations=observed.filter(e=>e.stage===stage),traced=trace.filter(e=>e.kind==='bridge-evidence'&&e.stage===stage);
 require(observations.length===1&&traced.length===1,'Missing or ambiguous crossing observation '+stage);
 const observation=observations[0],{kind:_kind,...traceObservation}=traced[0];
 require(snapshotDigest(observation)===snapshotDigest(traceObservation),'Crossing observation is not bound to the hashed trace '+stage);
 require(observation.player===player&&observation.supportedTicks===50&&observation.crossingTicks===50,'Each crossing must have 50/50 genuinely grounded central-span ticks');
 const samples=observation.samples as {tick:number;player:string;position:{x:number;y:number;z:number;grounded:boolean};supporting:{id:number;y:number}[];ground:number}[];
 require(Array.isArray(samples)&&samples.length===10&&samples.every(s=>s.player===player&&s.position.grounded&&s.position.x>25.2&&s.position.x<30.8&&s.ground<-9&&Array.isArray(s.supporting)&&s.supporting.some(p=>Math.abs(p.y-s.position.y)<.08)),'Source crossing samples lack real deck support over the chasm');
 require(summary.completed.includes('bridge-'+player+'-midspan'),'Socket replay lacks the individual midspan checkpoint');
 crossings.push({player,groundedTicks:50,centralSpanTicks:50,retainedSamples:samples.length,midspanCheckpoint:'bridge-'+player+'-midspan'});
}
const actionEvents=events.filter(e=>e.kind==='action'),verified=events.filter(e=>e.kind==='expected-rejection-verified');
require(actionEvents.length===expected.actions&&actionEvents.filter(e=>e.accepted===true).length===expected.accepted&&actionEvents.filter(e=>e.accepted===false&&e.expectedRejection===true).length===expected.rejected&&verified.length===expected.rejected,'Missing accepted actions or explicit verified rejection events');
const rejectionChecks:Entry[]=[];
for(const rejection of rejected){
 const evidence=rejection.evidence;require(evidence&&rejection.message&&rejection.player&&typeof rejection.error==='string','Expected rejection lacks source evidence');
 require(evidence.beforeSha256===hash(JSON.stringify(evidence.before))&&evidence.afterSha256===hash(JSON.stringify(evidence.after))&&evidence.beforeSha256===evidence.afterSha256,'Source rejection altered paid state or has invalid evidence hashes');
 const reason=rejection.error.replace(/^(?:Error|TypeError|RangeError): /,''),playerId=mapping.get(rejection.player);
 const receipts=verified.filter(e=>e.tick===rejection.tick&&e.playerId===playerId),acks=actionEvents.filter(e=>e.tick===rejection.tick&&e.playerId===playerId&&e.accepted===false);
 require(receipts.length===1&&acks.length===1,'Missing exact wire rejection acknowledgment or verification');
 const receipt=receipts[0],ack=acks[0];
 require(receipt.accepted===false&&receipt.reason===reason&&receipt.unchangedClients===2&&receipt.extraSimulationSteps===0&&receipt.authoritativeAssertionSteps===0&&Number(receipt.clientObservedTick)>rejection.tick&&typeof receipt.unchangedAuthorityHash==='string'&&/^[a-f0-9]{64}$/.test(receipt.unchangedAuthorityHash)&&same(rejection.message,receipt.action),'Rejected action lacks exact atomic authority/client verification');
 require(ack.expectedRejection===true&&ack.result===reason&&same(rejection.message,ack.message),'Wire rejected action or exact reason differs from source');
 rejectionChecks.push({tick:rejection.tick,playerId,reason,sourceUnchangedHash:evidence.beforeSha256,authorityUnchangedHash:receipt.unchangedAuthorityHash,unchangedClients:2,clientObservedTick:receipt.clientObservedTick,extraSimulationSteps:0,authoritativeAssertionSteps:0});
}
const sourceLeases=trace.filter(e=>e.kind==='assembly-lease-observation'),socketLeases=events.filter(e=>e.kind==='assembly-lease-verified'),leaseChecks:Entry[]=[];
if(includeLeaseTail){
 require(sourceLeases.length===9&&socketLeases.length===9,'Lease tail needs nine exact source/wire observations');
 const owners=['journey-a',null,'journey-b','journey-b','journey-b',null,'journey-a',null,null];
 const baseline=read(join(source,'bridge-save-restart.save.json')) as WorldSave;validateSave(baseline);
 const ids=baseline.skybound?.parts.map(p=>p.id);require(ids?.length===5,'Lease tail requires the five paid bridge parts');
 for(let i=0;i<sourceLeases.length;i++){
  const observed=sourceLeases[i],wire=socketLeases[i],active=i===1||i===2?['journey-b']:['journey-a','journey-b'];
  require(observed.owner===owners[i]&&same(observed.active,normalize(active))&&same(observed.ids,ids),'Source lease owner, membership or complete assembly IDs differ at observation '+i);
  require(observed.tick===wire.tick&&observed.stage===wire.stage&&same(observed.ids,wire.ids)&&same(observed.owner,wire.owner)&&same(observed.active,wire.clients)&&wire.partChecks===5*active.length,'Wire lease observation differs at index '+i);
  const inventories=observed.inventories as {id:string;inventory:Record<string,number>}[];
  require(Array.isArray(inventories)&&inventories.length===active.length&&inventories.every(record=>active.includes(record.id)&&same(record.inventory,baseline.members?.find(member=>member.id===record.id)?.adventure.inventory)),'Lease observation changed a paid inventory');
  leaseChecks.push({stage:observed.stage,tick:observed.tick,ids:wire.ids,owner:wire.owner,clients:wire.clients,partChecks:wire.partChecks});
 }
 require(leaseChecks.reduce((sum,e)=>sum+Number(e.partChecks),0)===80,'Lease tail needs eighty real-client part lease checks');
 require(summary.completed.at(-2)==='bridge-remaining-player-reclaimed-assembly'&&summary.completed.at(-1)==='bridge-lease-reconnect-save','Missing lease handoff/save checkpoints');
 require(trace.filter(e=>e.kind==='leave').length===1&&trace.filter(e=>e.kind==='rejoin').length===1&&events.filter(e=>e.kind==='leave').length===1&&events.filter(e=>e.kind==='rejoin').length===1,'Lease tail must include one real disconnect/rejoin');
}else require(sourceLeases.length===0&&socketLeases.length===0,'Lease tail requires explicit --include-lease-tail');
const result={status:'passed',harness:includeLeaseTail?'single-trace-bridge-lease-exact-socket-checkpoints':'single-trace-bridge-exact-socket-checkpoints',source,replay,sourceHash:summary.sourceHash,traceSha256:summary.traceSha256,sourceRuntimeReceipt:existsSync(runtimeReceipt)?'verified':'not-present; source checkpoint equivalence still required',...(includeLeaseTail?{runtimePin:{expectedHash:expectedRuntimeHash,sourceStartPin:false,recorded:'Expected runtime supplied after source completion and before socket replay; no source-start timing claim'},leaseObservations:leaseChecks,leasePartChecks:80,disconnects:summary.disconnects,rejoins:summary.rejoins}:{}),freshStart:true,fixturesReplaced:false,players:2,actions:summary.actions,acceptedActions:summary.acceptedActions,expectedRejections:summary.expectedRejections,steps:summary.steps,restarts:summary.restarts,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints:checks,crossings,rejections:rejectionChecks,personalComparison:{rawStrictMatch:personalNormalizations.length===0,completeAfterDocumentedNormalization:true,normalizations:personalNormalizations},limits:['deterministic clock, not wall-clock performance','Node sockets, not browser/device/public transport','Raw personal saves differ in the recorded view-time cache/default fields; every other field compares exactly','50/50 support assertions originate in the actual-input source route; exact socket checkpoints include each player at midspan']};
writeFileSync(join(replay,includeLeaseTail?'bridge-lease-journey-verification.json':'bridge-journey-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
