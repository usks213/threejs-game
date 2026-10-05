/** Read-only checkpoint/negative-ACK verification for the actual-input power
 * contention route. Source saves are never supplied to the socket server. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {validateSave,type WorldSave} from '../src/save/format';
import {validateCheckpoint} from '../src/save/checkpoint';
import {snapshotDigest} from './soak-coop-common';
type Entry=Record<string,unknown>;
type Event=Entry&{kind:string;tick:number;stage:string;file?:string;player?:string;message?:Entry;error?:string;evidence?:{before:unknown;after:unknown;beforeSha256:string;afterSha256:string}};
const source=resolve(process.argv[2]??'/tmp/voxel-power-contention-source-01'),replay=resolve(process.argv[3]??'/tmp/voxel-power-contention-socket-final');
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const read=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8'));
function require(condition:unknown,message:string):asserts condition{if(!condition)throw Error(message);}
const summary=read(join(replay,'summary.json')) as Entry;
require(summary.status==='completed-source-route'&&summary.sourceTerminalKind==='route-complete'&&summary.freshStart===true&&summary.fixturesReplaced===false&&summary.players===2&&Array.isArray(summary.failures)&&!summary.failures.length&&summary.unmatchedReferences===0&&summary.unmatchedObserved===0,'Require a successful fresh actual two-socket receipt');
require(summary.actions===21&&summary.acceptedActions===18&&summary.expectedRejections===3&&summary.steps===604&&summary.checkpoints===4&&summary.restarts===1&&summary.disconnects===0&&summary.rejoins===0,'Power route operation counts differ');
require(Number(summary.frameChecks)>20&&summary.frameChecks===summary.waterChecks&&summary.frames===summary.frameChecks,'Missing exact decoded state/water comparisons');
const traceText=readFileSync(join(source,'trace.json'),'utf8'),trace=JSON.parse(traceText) as Event[];
require(hash(traceText)===summary.traceSha256&&trace.length===summary.sourceTraceEventCount&&trace[0]?.kind==='start'&&!trace[0].resume&&trace.at(-1)?.scope==='actual-input-recall-contention-and-occupied-ascend-exit'&&!trace.some(event=>event.kind==='blocked'),'Source trace is not the exact completed pristine power route');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line) as Entry),start=events.find(event=>event.kind==='start');
const players=start?.players as {sourceId:string;playerId:string}[];
require(Array.isArray(players)&&players.length===2&&players.every(player=>['journey-a','journey-b'].includes(player.sourceId)&&/^[a-f0-9]{64}$/.test(player.playerId))&&new Set(players.map(p=>p.sourceId)).size===2,'Invalid public player identity mapping');
const mapping=new Map(players.map(player=>[player.sourceId,player.playerId]));
const normalize=(value:unknown):unknown=>typeof value==='string'?mapping.get(value)??value:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[mapping.get(key)??key,normalize(item)])):value;
const equal=(left:unknown,right:unknown)=>snapshotDigest({value:normalize(left)})===snapshotDigest({value:right});
const ready=events.filter(event=>event.kind==='ready');require(ready.length===2&&ready.every(event=>event.sourceHash===summary.sourceHash),'Runtime source changed across own-save restart');
const checkpoints:Entry[]=[],normalizations:Entry[]=[];
for(const event of trace.filter(event=>event.kind==='checkpoint')){
 require(event.file&&basename(event.file)===event.file,'Unsafe source checkpoint path');
 const expected=read(join(source,event.file)) as WorldSave;validateSave(expected);
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+event.stage+'.checkpoint.json'));require(files.length===1,'Missing socket checkpoint '+event.stage);
 const actual=validateCheckpoint(read(join(replay,files[0]))).world;
 require(expected.seed===actual.seed&&expected.generator===actual.generator&&expected.version===actual.version,'World identity differs');
 for(const field of ['skybound','edits','fluids']as const)require(equal(expected[field],actual[field]),'Complete '+field+' differs at '+event.stage);
 require(expected.adventure?.seconds===actual.adventure?.seconds&&Number.isFinite(expected.adventure?.seconds),'Shared world clock differs');
 require(expected.members?.length===2&&actual.members?.length===2,'Unexpected saved party');
 for(const [logical,authenticated]of mapping){
  const before=expected.members.find(member=>member.id===logical),after=actual.members.find(member=>member.id===authenticated);require(before&&after,'Saved player missing');
  require(equal(before.player,after.player),'Player pose differs at '+event.stage+' '+logical);
  const left=structuredClone(before.adventure),right=structuredClone(after.adventure),seconds=expected.adventure!.seconds;
  for(const personal of [left,right])require(Math.abs(personal.seconds-seconds)<1e-12||Math.abs(personal.seconds-seconds-1/30)<1e-12,'Unexpected personal clock state');
  if(left.seconds!==right.seconds)normalizations.push({stage:event.stage,player:logical,field:'seconds',source:left.seconds,socket:right.seconds,shared:seconds,rule:'withActor shared-time cache or one stepPersonal tick'});
  left.seconds=right.seconds=seconds;
  if(left.meadows&&right.meadows){require((left.meadows.slotLimit??32)===32&&(right.meadows.slotLimit??32)===32,'Unexpected non-default capacity');if(left.meadows.slotLimit!==right.meadows.slotLimit)normalizations.push({stage:event.stage,player:logical,field:'meadows.slotLimit',source:left.meadows.slotLimit??null,socket:right.meadows.slotLimit??null,canonical:32,rule:'inventoryLimit default / snapshot refreshGrowth'});left.meadows.slotLimit=right.meadows.slotLimit=32;}
  require(equal(left,right),'Personal save differs beyond documented caches/defaults at '+event.stage+' '+logical);
 }
 checkpoints.push({stage:event.stage,sourceSaveSha256:hash(readFileSync(join(source,event.file),'utf8')),socketCheckpointSha256:hash(readFileSync(join(replay,files[0]),'utf8')),skyboundHash:snapshotDigest(actual.skybound),waterHash:snapshotDigest(actual.fluids)});
}
require(checkpoints.length===4&&JSON.stringify(checkpoints.map(check=>check.stage))===JSON.stringify(summary.completed),'Checkpoint sequence differs');
const rejected=trace.filter(event=>event.kind==='action-rejected'),checks:Entry[]=[];
require(rejected.length===3&&trace.filter(event=>event.kind==='action').length===18,'Unexpected source operation counts');
for(const event of rejected){
 const evidence=event.evidence;require(event.expected===true&&event.player&&event.message&&event.error&&evidence,'Missing explicit negative source evidence');
 require(evidence.beforeSha256===hash(JSON.stringify(evidence.before))&&evidence.afterSha256===hash(JSON.stringify(evidence.after))&&evidence.beforeSha256===evidence.afterSha256,'Source refused action changed paid state');
 const owner=mapping.get(event.player),reason=event.error.replace(/^Error: /,''),matches=events.filter(item=>item.kind==='expected-rejection-verified'&&item.tick===event.tick&&item.playerId===owner),acks=events.filter(item=>item.kind==='action'&&item.tick===event.tick&&item.playerId===owner&&item.accepted===false);
 require(matches.length===1&&acks.length===1,'Missing exact rejected wire action');const receipt=matches[0],ack=acks[0];
 require(receipt.reason===reason&&receipt.accepted===false&&receipt.unchangedClients===2&&receipt.extraSimulationSteps===0&&receipt.authoritativeAssertionSteps===0&&Number(receipt.clientObservedTick)>event.tick&&equal(event.message,receipt.action)&&ack.expectedRejection===true&&ack.result===reason&&equal(event.message,ack.message),'Rejected wire action/reason or atomic authority/client assertion differs');
 checks.push({tick:event.tick,playerId:owner,reason,authorityUnchangedHash:receipt.unchangedAuthorityHash,sourceUnchangedHash:evidence.beforeSha256,clientObservedTick:receipt.clientObservedTick,unchangedClients:2});
}
require(JSON.stringify(checks.map(check=>check.reason))===JSON.stringify(['別の冒険者が操作しています','軌跡を戻している途中です','出口が変わりました。もう一度確認してください']),'Expected semantic rejection reasons differ');
const result={status:'passed',harness:'actual-input-power-contention-exact-socket-checkpoints',sourceHash:summary.sourceHash,traceSha256:summary.traceSha256,source,replay,freshStart:true,fixturesReplaced:false,acceptedActions:18,expectedRejections:3,steps:604,restarts:1,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints,rejections:checks,sourcePhysicalEvidence:trace.filter(event=>event.kind==='power-contention-evidence'),personalComparison:{rawStrictMatch:normalizations.length===0,completeAfterDocumentedNormalization:true,normalizations},limits:['deterministic clock, not production wall-clock timing','Node local WebSockets, not browser/device/public transport','source physical observations plus exact socket checkpoints/ACKs; no rendered video evidence']};
writeFileSync(join(replay,'power-contention-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({status:result.status,checkpoints:checkpoints.length,normalizations:normalizations.length,frameChecks:result.frameChecks})+'\n');
