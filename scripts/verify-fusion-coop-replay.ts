/** Read-only checkpoint/negative-ACK verification for the actual-input fusion
 * transaction route. Source saves are never supplied to the socket server. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {validateSave,type WorldSave} from '../src/save/format';
import {validateCheckpoint} from '../src/save/checkpoint';
import {snapshotDigest} from './soak-coop-common';
type Entry=Record<string,unknown>;
type Event=Entry&{kind:string;tick:number;stage:string;file?:string;player?:string;message?:Entry;error?:string;evidence?:{before:unknown;after:unknown;beforeSha256:string;afterSha256:string}};
const source=resolve(process.argv[2]??'/tmp/voxel-fusion-source-01'),replay=resolve(process.argv[3]??'/tmp/voxel-fusion-socket-01');
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const read=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8'));
function require(condition:unknown,message:string):asserts condition{if(!condition)throw Error(message);}
const summary=read(join(replay,'summary.json')) as Entry;
require(summary.status==='completed-source-route'&&summary.sourceTerminalKind==='route-complete'&&summary.freshStart===true&&summary.fixturesReplaced===false&&summary.players===2&&Array.isArray(summary.failures)&&!summary.failures.length&&summary.unmatchedReferences===0&&summary.unmatchedObserved===0,'Require a successful fresh actual two-socket receipt');
require(summary.actions===37&&summary.acceptedActions===28&&summary.expectedRejections===9&&summary.steps===638&&summary.checkpoints===4&&summary.restarts===1&&summary.disconnects===0&&summary.rejoins===0,'Fusion route operation counts differ');
require(Number(summary.frameChecks)>20&&summary.frameChecks===summary.waterChecks&&summary.frames===summary.frameChecks,'Missing exact decoded state/water comparisons');
const traceText=readFileSync(join(source,'trace.json'),'utf8'),trace=JSON.parse(traceText) as Event[];
require(hash(traceText)===summary.traceSha256&&trace.length===summary.sourceTraceEventCount&&trace[0]?.kind==='start'&&!trace[0].resume&&trace.at(-1)?.scope==='pristine-two-player-fusion-transactions'&&!trace.some(event=>event.kind==='blocked'),'Source trace is not the exact completed pristine fusion route');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line) as Entry),start=events.find(event=>event.kind==='start');
const players=start?.players as {sourceId:string;playerId:string}[];
require(Array.isArray(players)&&players.length===2&&players.every(player=>['journey-a','journey-b'].includes(player.sourceId)&&/^[a-f0-9]{64}$/.test(player.playerId))&&new Set(players.map(p=>p.sourceId)).size===2,'Invalid public player identity mapping');
const mapping=new Map(players.map(player=>[player.sourceId,player.playerId]));
const normalize=(value:unknown):unknown=>typeof value==='string'?mapping.get(value)??value:Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[mapping.get(key)??key,normalize(item)])):value;
const equal=(left:unknown,right:unknown)=>snapshotDigest({value:normalize(left)})===snapshotDigest({value:right});
const ready=events.filter(event=>event.kind==='ready');require(ready.length===2&&ready.every(event=>event.sourceHash===summary.sourceHash),'Runtime source changed across own-save restart');
const checkpoints:Entry[]=[],normalizations:Entry[]=[],worlds=new Map<string,WorldSave>();
for(const event of trace.filter(event=>event.kind==='checkpoint')){
 require(event.file&&basename(event.file)===event.file,'Unsafe source checkpoint path');
 const expected=read(join(source,event.file)) as WorldSave;validateSave(expected);
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+event.stage+'.checkpoint.json'));require(files.length===1,'Missing socket checkpoint '+event.stage);
 const actual=validateCheckpoint(read(join(replay,files[0]))).world;
 worlds.set(event.stage,actual);
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
const member=(stage:string,logical:string)=>{const found=worlds.get(stage)?.members?.find(item=>item.id===mapping.get(logical));require(found,'Missing independently checked member');return found.adventure;};
const held=(stage:string,logical:string,kind:string)=>{const personal=member(stage,logical),id=personal.gearItems?.activeByKind[kind],lot=personal.gearItems?.lots.find(item=>item.id===id);require(lot,'Missing independently checked gear');return lot;};
const earned='fusion-earned-equipment',used='fusion-effects-consumed-once',saved='fusion-paid-state-restart',restored='fusion-restored-state';
const first=member(earned,'journey-a'),after=member(used,'journey-a'),lastA=member(restored,'journey-a'),lastB=member(restored,'journey-b');
require(first.inventory.wood===2&&first.inventory.stone===7&&first.inventory.resin===1&&first.inventory.woodArrow===12,'Socket earned equipment/material costs differ');
require(after.inventory.wood===2&&after.inventory.stone===5&&after.inventory.resin===0&&after.inventory.woodArrow===11&&after.inventory.fireArrow===0,'Socket fusion and projectile consumption differs');
require(lastA.inventory.stone===4&&lastA.inventory.shield===0&&lastB.inventory.stone===0&&lastB.inventory.shield===1,'Socket transfer/unfuse/refuse costs differ');
const firstClub=held(earned,'journey-a','club'),usedClub=held(used,'journey-a','club'),firstShield=held(earned,'journey-a','shield'),usedShield=held(used,'journey-a','shield'),lastShield=held(restored,'journey-b','shield');
require(firstClub.id===usedClub.id&&firstClub.quality===usedClub.quality&&usedClub.durability===firstClub.durability!-1&&usedClub.fusion?.material==='stone'&&usedClub.fusion.effect==='impact'&&usedClub.fusion.damage===6&&usedClub.fusion.durability===29,'Socket club identity, single-use wear or effect differs');
require(firstShield.id===usedShield.id&&firstShield.quality===usedShield.quality&&firstShield.durability===usedShield.durability&&usedShield.fusion?.material==='stone'&&usedShield.fusion.effect==='impact'&&usedShield.fusion.damage===6&&usedShield.fusion.durability===30&&snapshotDigest(usedShield)===snapshotDigest(lastShield),'Socket shield identity/effect or transfer differs');
const firstBow=held(earned,'journey-a','crudeBow'),usedBow=held(used,'journey-a','crudeBow');require(firstBow.id===usedBow.id&&usedBow.durability===firstBow.durability!-1,'Socket bow identity or single-shot wear differs');
for(const logical of mapping.keys()){const before=member(saved,logical),after=member(restored,logical);const paid=(personal:typeof before)=>({inventory:personal.inventory,gearItems:personal.gearItems,equipment:personal.equipment,offhand:personal.meadows?.gear.offhand});require(snapshotDigest(paid(before))===snapshotDigest(paid(after)),'Socket own-save restart changed inventory, identities or fusion effects');}
const shotEvidence=trace.find(event=>event.kind==='fusion-evidence'&&event.name==='shield-and-projectile'),shot=shotEvidence?.shot as {kind?:string;burn?:number}|undefined;
require(shot?.kind==='arrow'&&shot.burn===5,'Missing explicit source fire-arrow burn observation');
const rejected=trace.filter(event=>event.kind==='action-rejected'),checks:Entry[]=[];
require(rejected.length===9&&trace.filter(event=>event.kind==='action').length===28,'Unexpected source operation counts');
for(const event of rejected){
 const evidence=event.evidence;require(event.expected===true&&event.player&&event.message&&event.error&&evidence,'Missing explicit negative source evidence');
 require(evidence.beforeSha256===hash(JSON.stringify(evidence.before))&&evidence.afterSha256===hash(JSON.stringify(evidence.after))&&evidence.beforeSha256===evidence.afterSha256,'Source refused action changed paid state');
 const owner=mapping.get(event.player),reason=event.error.replace(/^Error: /,''),matches=events.filter(item=>item.kind==='expected-rejection-verified'&&item.tick===event.tick&&item.playerId===owner),acks=events.filter(item=>item.kind==='action'&&item.tick===event.tick&&item.playerId===owner&&item.accepted===false);
 require(matches.length===1&&acks.length===1,'Missing exact rejected wire action');const receipt=matches[0],ack=acks[0];
 require(receipt.reason===reason&&receipt.accepted===false&&receipt.unchangedClients===2&&receipt.extraSimulationSteps===0&&receipt.authoritativeAssertionSteps===0&&Number(receipt.clientObservedTick)>event.tick&&equal(event.message,receipt.action)&&ack.expectedRejection===true&&ack.result===reason&&equal(event.message,ack.message),'Rejected wire action/reason or atomic authority/client assertion differs');
 checks.push({tick:event.tick,playerId:owner,reason,authorityUnchangedHash:receipt.unchangedAuthorityHash,sourceUnchangedHash:evidence.beforeSha256,clientObservedTick:receipt.clientObservedTick,unchangedClients:2});
}
require(JSON.stringify(checks.map(check=>check.reason))===JSON.stringify(['拾えるものへ近づいてください','設計に必要な素材が足りません','素材を選ぶか、現在の合成を解除してください','持っている武器か盾を選んでください','設計に必要な素材が足りません','素材を選ぶか、現在の合成を解除してください','動作の回復を待ってください','設計に必要な素材が足りません','拾えるものへ近づいてください']),'Expected semantic rejection reasons differ');
const result={status:'passed',harness:'actual-input-fusion-transactions-exact-socket-checkpoints',sourceHash:summary.sourceHash,traceSha256:summary.traceSha256,source,replay,freshStart:true,fixturesReplaced:false,acceptedActions:28,expectedRejections:9,steps:638,restarts:1,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints,rejections:checks,positiveSocketAssertions:{earnedCraftCosts:true,fusionAndSingleShotCosts:true,clubIdentityAndSingleUseWear:true,shieldIdentityAndEffect:true,shieldTransferAndRefusion:true,bowIdentityAndSingleShotWear:true,ownSaveRestart:true},sourceFusionEvidence:trace.filter(event=>event.kind==='fusion-evidence'),personalComparison:{rawStrictMatch:normalizations.length===0,completeAfterDocumentedNormalization:true,normalizations},limits:['deterministic clock, not production wall-clock timing','Node local WebSockets, not browser/device/public transport','shot burn is a source observation; socket shot ACK and exact paid saves corroborate it, not a rendered hit', 'same-drop contention is sequential at authority arrival, not a simultaneous network race', 'representative stone weapon/shield and resin-arrow recipes only; no all-recipe or capacity-exhaustion claim']};
writeFileSync(join(replay,'fusion-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({status:result.status,checkpoints:checkpoints.length,normalizations:normalizations.length,frameChecks:result.frameChecks})+'\n');
