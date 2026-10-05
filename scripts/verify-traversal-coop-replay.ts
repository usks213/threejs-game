/** Read-only source/checkpoint and scheduled-client-observation verification. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {validateSave} from '../src/save/format';
import {validateCheckpoint} from '../src/save/checkpoint';
import {snapshotDigest} from './soak-coop-common';
const source=resolve(process.argv[2]??'/tmp/voxel-traversal-source-13'),replay=resolve(process.argv[3]??'/tmp/voxel-traversal-socket-02');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
function require(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
const summary=read(join(replay,'summary.json')),traceText=readFileSync(join(source,'trace.json'),'utf8'),trace=JSON.parse(traceText) as {kind:string;stage:string;tick:number;file:string;scope?:string;observation?:string;traversals?:{id:string;traversal:Record<string,unknown>;stamina:number;health:number}[]}[];
require(summary.status==='completed-source-route'&&summary.freshStart===true&&summary.fixturesReplaced===false&&summary.players===2&&!summary.failures.length&&!summary.unmatchedReferences&&!summary.unmatchedObserved,'Replay did not pass a fresh real two-client route');
require(summary.traceSha256===createHash('sha256').update(traceText).digest('hex')&&trace.at(-1)?.scope==='pristine-two-player-climb-hang-mantle-swim-bank-wet-slip','Source trace mismatch');
require(summary.actions===21&&summary.steps===1134&&summary.checkpoints===5&&summary.restarts===2,'Bounded traversal route counts changed');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),start=events.find(event=>event.kind==='start');
const mapping=new Map<string,string>(start.players.map((player:{sourceId:string;playerId:string})=>[player.sourceId,player.playerId]));require(mapping.size===2,'Missing identity mapping');
const normalize=(value:unknown):unknown=>typeof value==='string'?mapping.get(value)??value:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[mapping.get(key)??key,normalize(item)])):value;
const ready=events.filter(event=>event.kind==='ready');require(ready.length===3&&ready.every(event=>event.sourceHash===summary.sourceHash),'Source changed between server generations');
const assertions=events.filter(event=>event.kind==='traversal-observation-verified'),expected=trace.filter(event=>event.kind==='traversal-observation');
require(expected.length===12&&assertions.length===12,'Missing traversal assertions');
for(let i=0;i<expected.length;i++){
 const before=expected[i],actual=assertions[i];require(before.observation===actual.observation&&before.tick===actual.tick&&actual.tick%3===0&&actual.extraSimulationSteps===0&&actual.resyncRequests===0,'Observation timing or mechanism differs');
 require(actual.players.length===2&&before.traversals?.length===2,'Missing participant traversal state');
 for(const player of before.traversals){const found=actual.players.find((item:{sourceId:string})=>item.sourceId===player.id);require(found&&found.playerId===mapping.get(player.id),'Unexpected observed participant');require(snapshotDigest({traversal:found.traversal,stamina:found.stamina,health:found.health})===snapshotDigest({traversal:player.traversal,stamina:player.stamina,health:player.health}),'Transient traversal state differs; normalization is forbidden');}
}
for(const id of mapping.keys()){
 const state=(name:string)=>assertions.find(event=>event.observation===name)?.players.find((player:{sourceId:string})=>player.sourceId===id);
 const hang=state('both-hanging'),climb=state('both-climbing'),swim=state('both-swimming'),bank=state('bank-mantle-'+id),warning=state('wet-stone-warning-'+id),slip=state('wet-stone-slip-'+id);
 require(hang?.traversal.hanging&&hang.traversal.climbing&&hang.traversal.grip==='wood','Missing actual wooden-wall hang');
 require(climb?.traversal.climbing&&!climb.traversal.hanging&&climb.stamina<hang.stamina,'Missing paid climbing movement');
 require(swim?.traversal.swimming&&!bank?.traversal.swimming&&bank.health>0,'Missing real swim/bank exit');
 require(warning?.traversal.climbing&&warning.traversal.grip==='stone'&&warning.traversal.warning?.includes('間もなく'),'Missing wet-stone advance warning');
 require(!slip?.traversal.climbing&&slip?.traversal.warning?.includes('手が離れました')&&slip.health>0,'Missing real slip/recovery');
 const w=assertions.find(event=>event.observation==='wet-stone-warning-'+id),s=assertions.find(event=>event.observation==='wet-stone-slip-'+id);require(w.tick<s.tick,'Slip warning was not earlier than release');
}
const clockNormalizations:Record<string,unknown>[]=[],checkpoints:Record<string,unknown>[]=[];
for(const event of trace.filter(event=>event.kind==='checkpoint')){
 const before=validateSave(read(join(source,event.file))),files=readdirSync(replay).filter(file=>file.endsWith('-'+event.stage+'.checkpoint.json'));require(files.length===1,'Missing checkpoint '+event.stage);
 const after=validateCheckpoint(read(join(replay,files[0]))).world;
 require(before.adventure?.seconds===after.adventure?.seconds,'Shared clock differs');
 for(const field of ['skybound','edits','fluids']as const)require(snapshotDigest({value:normalize(before[field])})===snapshotDigest({value:after[field]}),field+' differs at '+event.stage);
 for(const [logical,authenticated]of mapping){const left=before.members?.find(member=>member.id===logical),right=after.members?.find(member=>member.id===authenticated);require(left&&right,'Missing saved member');require(snapshotDigest(left.player)===snapshotDigest(right.player),'Exact player pose differs');const seconds=after.adventure!.seconds;
  for(const value of [left.adventure.seconds,right.adventure.seconds])require(Math.min(Math.abs(value-seconds),Math.abs(value-seconds-1/30))<1e-9,'Unexpected personal clock state');
  if(left.adventure.seconds!==right.adventure.seconds)clockNormalizations.push({stage:event.stage,player:logical,sourceSeconds:left.adventure.seconds,socketSeconds:right.adventure.seconds,authoritativeSeconds:seconds});
  require(snapshotDigest(normalize({...left.adventure,seconds}))===snapshotDigest({...right.adventure,seconds}),'Personal save differs beyond the bounded clock cache');
 }
 checkpoints.push({stage:event.stage,skyboundHash:snapshotDigest(after.skybound),waterHash:snapshotDigest(after.fluids)});
}
const result={status:'passed',harness:'actual-input-two-client-traversal',sourceHash:summary.sourceHash,traceSha256:summary.traceSha256,actions:summary.actions,steps:summary.steps,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints,restarts:summary.restarts,normalFrameObservations:12,participantAssertions:24,transientStateNormalizations:0,clockNormalizations,fixturesReplaced:false,limits:['deterministic clock and Node clients','not browser input/rendering, phone performance or latency impairment','stone support is held through actual temporary player leases, not an injected anchor']};
writeFileSync(join(replay,'traversal-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
