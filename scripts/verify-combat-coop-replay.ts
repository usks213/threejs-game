/** Read-only acceptance of earned combat controls against the corresponding
 * real WebSocket checkpoints. Never edits a world, client or receipt. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {snapshotDigest} from './soak-coop-common';
import type {WorldSave} from '../src/save/format';

const source=resolve(process.argv[2]??'/tmp/voxel-combat-source-05');
const replay=resolve(process.argv[3]??'/tmp/voxel-combat-socket-03');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const summary=read(join(replay,'summary.json'));
if(summary.status!=='completed-source-route'||summary.sourceTerminalKind!=='route-complete'||summary.failures?.length||summary.unmatchedReferences||summary.unmatchedObserved||summary.fixturesReplaced!==false||summary.freshStart!==true||summary.players!==2)throw Error('Replay did not complete a fresh no-fixture two-player route');
if(summary.actions!==30||summary.steps!==1130||summary.checkpoints!==7||summary.restarts!==1||summary.disconnects!==0||summary.rejoins!==0||summary.expectedRejections!==0||summary.actions!==summary.acceptedActions)throw Error('Unexpected combat replay operation counts');
if(summary.frameChecks<20||summary.frameChecks!==summary.waterChecks||summary.frames!==summary.frameChecks)throw Error('Missing complete client-authority state/water comparisons');
const traceText=readFileSync(join(source,'trace.json'),'utf8');
if(createHash('sha256').update(traceText).digest('hex')!==summary.traceSha256)throw Error('Source controls do not match replay receipt');
const events=readFileSync(join(replay,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const start=events.find(e=>e.kind==='start');
if(!start?.players||start.players.length!==2)throw Error('Missing authenticated player mapping');
const mapping=new Map<string,string>(start.players.map((p:{sourceId:string;playerId:string})=>[p.sourceId,p.playerId]));
function normalize(value:unknown):unknown {
 if(typeof value==='string')return mapping.get(value)??value;
 if(Array.isArray(value))return value.map(normalize);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[mapping.get(k)??k,normalize(v)]));
 return value;
}
const checked:{stage:string;enemyHash:string;resourceHash:string;players:{id:string;personalHash:string;poseHash:string}[]}[]=[];
const worlds=new Map<string,WorldSave>();
for(const stage of summary.completed as string[]){
 const expected=read(join(source,stage+'.save.json')) as WorldSave;
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+stage+'.checkpoint.json'));
 if(files.length!==1)throw Error('Missing or ambiguous socket checkpoint '+stage);
 const actual=read(join(replay,files[0])).world as WorldSave;
 worlds.set(stage,actual);
 if(expected.adventure?.seconds!==actual.adventure?.seconds||!Number.isFinite(expected.adventure?.seconds))throw Error('Shared world clock differs at '+stage);
 for(const field of ['enemies','resources']as const)if(snapshotDigest(normalize(expected.adventure?.[field]))!==snapshotDigest(actual.adventure?.[field]))throw Error('Combat '+field+' differ at '+stage);
 const players=[];
 for(const [logical,authenticated]of mapping){
  const before=expected.members?.find(m=>m.id===logical),after=actual.members?.find(m=>m.id===authenticated);
  if(!before||!after)throw Error('Missing saved combat actor at '+stage);
  if(snapshotDigest(normalize(before.player))!==snapshotDigest(after.player))throw Error('Exact combat pose differs at '+stage+' for '+logical);
  // The source mirrors normal frame views, so personal time caches and enemy
  // respawn timers match exactly too. Only authenticated identity is mapped.
  if(snapshotDigest(normalize(before.adventure))!==snapshotDigest(after.adventure))throw Error('Exact saved combat/personal state differs at '+stage+' for '+logical);
  players.push({id:logical,personalHash:snapshotDigest(after.adventure),poseHash:snapshotDigest(after.player)});
 }
 checked.push({stage,enemyHash:snapshotDigest(actual.adventure?.enemies),resourceHash:snapshotDigest(actual.adventure?.resources),players});
}
const actor=(stage:string,id:string)=>worlds.get(stage)!.members!.find(member=>member.id===mapping.get(id))!;
const target=(stage:string)=>worlds.get(stage)!.adventure!.enemies.find(enemy=>enemy.id===3000111)!;
const a='journey-a',b='journey-b',loadout='combat-earned-loadout',block='combat-held-guard-block',dodge='combat-dodge-strike',parry='combat-timed-parry',heavy='combat-charged-melee-hit',ranged='combat-ranged-kill-ground-loot',restored='combat-reward-save-restart';
if(actor(loadout,a).adventure.inventory.shield!==1||actor(loadout,a).adventure.inventory.wood!==2||actor(loadout,a).adventure.inventory.resin!==0||actor(loadout,b).adventure.inventory.crudeBow!==1||actor(loadout,b).adventure.inventory.woodArrow!==12)throw Error('Actual socket loadout differs');
if(actor(block,a).adventure.health!==20||actor(block,a).adventure.stamina!==45.2||actor(block,a).adventure.meadows!.durability.shield!==199||(target(block).stagger??0)!==0)throw Error('Actual held block damage/payment differs');
const from=actor(block,a).player,to=actor(dodge,a).player;
if(actor(dodge,a).adventure.health!==20||actor(dodge,a).adventure.stamina!==28||Math.hypot(to.x-from.x,to.z-from.z)<1.5||target(dodge).windup!==0)throw Error('Actual dodge movement/health/payment differs');
if(actor(parry,a).adventure.health!==18||actor(parry,a).adventure.stamina!==45.2||target(parry).stagger!==2)throw Error('Actual parry/stagger differs');
if(!(target(heavy).health<target(parry).health&&target(heavy).health>0)||actor(heavy,a).adventure.stamina!==39.2)throw Error('Actual charged hit/payment differs');
if(target(ranged).health>0||actor(ranged,b).adventure.inventory.woodArrow!==11||actor(ranged,b).adventure.meadows!.durability.crudeBow!==49||actor(ranged,b).adventure.inventory.iron||actor(ranged,b).adventure.inventory.coins)throw Error('Actual ranged death/consumption differs or rewards were granted before pickup');
for(const [kind,amount]of [['stone',3],['iron',1],['coins',2]]as const)if(!worlds.get(ranged)!.adventure!.resources.some(node=>node.kind===kind&&node.drop&&node.amount===amount)||actor(restored,b).adventure.inventory[kind]!==amount)throw Error('Actual ground loot/pickup differs for '+kind);
const observations=read(join(source,'combat-observations.json')) as {stage:string;tick:number;[key:string]:unknown}[];
const required=['earned-shield-bow-arrows','held-guard-block','dodge-during-committed-strike','timed-parry-stagger','full-charge-melee-hit','second-actor-ranged-kill','ranged-actor-collected-reward'];
for(const stage of required)if(observations.filter(o=>o.stage===stage).length!==1)throw Error('Missing or repeated combat behavior assertion '+stage);
const sourceTrace=JSON.parse(traceText) as {kind:string;assertion?:string;tick:number;stage?:string}[];
for(const observation of observations)if(sourceTrace.filter(event=>event.kind==='combat-assertion'&&event.assertion===observation.stage&&event.tick===observation.tick).length!==1)throw Error('Combat assertion is not linked to exactly one replayed input tick');
const result={status:'passed',harness:'actual-input-combat-exact-socket-checkpoints',source,replay,traceSha256:summary.traceSha256,sourceHash:summary.sourceHash,players:2,fixturesReplaced:false,actions:summary.actions,steps:summary.steps,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,restarts:summary.restarts,checkpoints:checked,sourceAssertions:required,limits:['deterministic clock; not wall-clock load','no browser, public internet, or real-device evidence','one natural walker; simultaneous multiple-enemy variants not accepted here','large enemies, revival and disconnect/reward combinations are outside this bounded route','dodge avoided a committed strike through real movement/invulnerability; no isolated stationary invulnerability claim']};
writeFileSync(join(replay,'combat-verification.json'),JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result,null,2)+'\n');
