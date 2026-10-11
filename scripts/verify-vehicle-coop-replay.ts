/** Read-only verification of the vehicle source route against its own real
 * WebSocket replay. Names are normalized only through the replay's explicit
 * source-ID/authenticated-ID mapping. No world or receipt is rewritten. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {snapshotDigest} from './soak-coop-common';

const source=resolve(process.argv[2]??'/tmp/voxel-vehicle-source-03');
const replay=resolve(process.argv[3]??'/tmp/voxel-vehicle-socket-01');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const summary=read(join(replay,'summary.json'));
if(summary.status!=='completed-source-route'||summary.sourceTerminalKind!=='route-complete'||summary.failures?.length||summary.unmatchedReferences||summary.unmatchedObserved||summary.fixturesReplaced!==false||summary.freshStart!==true||summary.players!==2)throw Error('Replay did not complete a fresh, no-fixture two-player route');
const traceText=readFileSync(join(source,'trace.json'),'utf8');
if(createHash('sha256').update(traceText).digest('hex')!==summary.traceSha256)throw Error('Source trace does not match the replay receipt');
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
const checked:{stage:string;parts:number;skyboundHash:string}[]=[];
for(const stage of summary.completed as string[]){
 const sourceWorld=read(join(source,stage+'.save.json'));
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+stage+'.checkpoint.json'));
 if(files.length!==1)throw Error('Missing or ambiguous own socket checkpoint '+stage);
 const actual=read(join(replay,files[0])).world;
 const expectedHash=snapshotDigest(normalize(sourceWorld.skybound)),actualHash=snapshotDigest(actual.skybound);
 if(expectedHash!==actualHash)throw Error('Vehicle parts/poses/energy/design state differ at '+stage);
 for(const [logical,authenticated]of mapping){
  const before=sourceWorld.members?.find((m:{id:string})=>m.id===logical),after=actual.members?.find((m:{id:string})=>m.id===authenticated);
  if(!before||!after||snapshotDigest(normalize(before.player))!==snapshotDigest(after.player))throw Error('Exact rider pose differs at '+stage+' for '+logical);
 }
 checked.push({stage,parts:actual.skybound?.parts.length??0,skyboundHash:actualHash});
}
const observations=read(join(source,'vehicle-observations.json')) as {stage:string;tick:number;[key:string]:unknown}[];
for(const stage of ['production-built','two-rider-forward','two-rider-reverse','two-rider-turn','power-depleted','restart-and-dismount'])if(!observations.some(o=>o.stage===stage))throw Error('Missing source behavior assertion '+stage);
const result={status:'passed',harness:'actual-input-vehicle-exact-socket-checkpoints',source,replay,traceSha256:summary.traceSha256,sourceHash:summary.sourceHash,players:2,fixturesReplaced:false,actions:summary.actions,steps:summary.steps,frameChecks:summary.frameChecks,waterChecks:summary.waterChecks,checkpoints:checked,restarts:summary.restarts,disconnects:summary.disconnects,rejoins:summary.rejoins,sourceAssertions:observations.map(o=>o.stage),limits:['deterministic clock; not wall-clock load','no browser or real-device evidence','standing deck, water transport, overturning and mass-comparison not exercised']};
writeFileSync(join(replay,'vehicle-verification.json'),JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result,null,2)+'\n');
