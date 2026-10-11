/** Compose actual-input route segments at their own earned checkpoints.
 * Usage: node --import tsx scripts/playthrough-coop-compose.ts MANIFEST OUTPUT
 * MANIFEST: {"segments":[{"trace":"fresh/trace.json","through":"checkpoint-stage"},
 *                        {"trace":"continuation/trace.json"}]}
 * This utility reads saves only to validate provenance. The socket replay starts
 * from an empty world and loads only checkpoints earned by that socket run. */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {validateSave,type WorldSave} from '../src/save/format';
import {snapshotDigest,inventoryDigest} from './soak-coop-common';

interface Segment {trace:string;through?:string}
interface TraceEvent {kind:string;stage?:string;tick:number;resume?:string|null;resumeSha256?:string;seed?:number;generator?:number;file?:string;players?:unknown[];completedTrials?:number[];completedSites?:number[];defeated?:string[];[key:string]:unknown}
interface CheckpointPlayer {id:string;player:{x:number;y:number;z:number};inventory:Record<string,number>;progression?:unknown}
interface EarnedCheckpoint {path:string;sha256:string;stage:string;active:string[];save:WorldSave}
const manifestPath=resolve(process.argv[2]??''),output=process.argv[3]?resolve(process.argv[3]):undefined;
if(!process.argv[2]||!output)throw Error('Supply a segment manifest and unused output directory');
const manifestText=readFileSync(manifestPath,'utf8'),manifest=JSON.parse(manifestText) as {segments?:Segment[]};
if(!Array.isArray(manifest.segments)||!manifest.segments.length||manifest.segments.length>32)throw Error('Manifest needs 1–32 ordered segments');
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const same=(a:unknown,b:unknown)=>snapshotDigest({value:a})===snapshotDigest({value:b});
const composed:TraceEvent[]=[],sources:Record<string,unknown>[]=[],insertedRestarts:Record<string,unknown>[]=[];
let previous:EarnedCheckpoint|undefined;
function validateEarned(event:TraceEvent,path:string):EarnedCheckpoint{
 if(!event.file||!event.stage||!event.players?.length)throw Error('Segment boundary must be a checkpoint with active players');
 const file=resolve(dirname(path),event.file),text=readFileSync(file,'utf8'),save=validateSave(JSON.parse(text)),players=event.players as CheckpointPlayer[];
 for(const expected of players){
  const member=save.members?.find(m=>m.id===expected.id);if(!member)throw Error('Earned checkpoint lacks '+expected.id);
  if(inventoryDigest(member.adventure.inventory)!==inventoryDigest(expected.inventory)||!same(member.adventure.progression,expected.progression))throw Error('Earned checkpoint personal progress differs from its trace: '+event.stage+' '+expected.id);
  if(Math.hypot(member.player.x-expected.player.x,member.player.y-expected.player.y,member.player.z-expected.player.z)>.00001)throw Error('Earned checkpoint position differs from its trace: '+event.stage+' '+expected.id);
 }
 if(!same(save.adventure?.trialWorld?.completed??[],event.completedTrials??[])||!same(save.adventure?.siteWorld?.completed??[],event.completedSites??[])||!same(save.adventure?.defeated??[],event.defeated??[]))throw Error('Earned checkpoint shared progress differs from its trace: '+event.stage);
 return {path:file,sha256:hash(text),stage:event.stage,active:players.map(p=>p.id),save};
}
for(const [index,specification]of manifest.segments.entries()){
 if(typeof specification.trace!=='string'||specification.through!==undefined&&typeof specification.through!=='string')throw Error('Invalid segment specification');
 const path=resolve(dirname(manifestPath),specification.trace),text=readFileSync(path,'utf8'),trace=JSON.parse(text) as TraceEvent[];
 if(!Array.isArray(trace)||!trace.length||trace.some(e=>!e||typeof e.kind!=='string'||!Number.isSafeInteger(e.tick)||e.tick<0)||trace[0].kind!=='start')throw Error('Invalid source trace '+path);
 let end=trace.length-1;
 if(specification.through){const matches=trace.flatMap((event,at)=>event.kind==='checkpoint'&&event.stage===specification.through?[at]:[]);if(matches.length!==1)throw Error('Checkpoint boundary must match exactly once: '+specification.through);end=matches[0];}
 if(index<manifest.segments.length-1&&!specification.through)throw Error('Every nonfinal segment needs a named checkpoint boundary');
 if(index===manifest.segments.length-1&&(specification.through||trace.at(-1)?.kind!=='route-complete'))throw Error('Final segment must end route-complete, without truncation');
 const included=trace.slice(0,end+1);if(included.some(e=>e.kind==='blocked'||e.kind==='action-rejected'))throw Error('Included segment contains a failed/rejected operation: '+path);
 const start=trace[0];let resumeValidation:Record<string,unknown>|undefined;
 if(index===0){if(start.resume)throw Error('First segment must begin a fresh world');}
 else{
  if(!previous||typeof start.resume!=='string'||resolve(start.resume)!==previous.path)throw Error('Continuation must resume the immediately preceding earned checkpoint');
  if(start.seed!==previous.save.seed||start.generator!==previous.save.generator)throw Error('Continuation world identity differs from earned checkpoint');
  if(!Array.isArray(start.players)||start.players.some(id=>typeof id!=='string')||!same(start.players,previous.active))throw Error('Continuation active-player order differs from boundary checkpoint');
  if(start.resumeSha256!==undefined&&start.resumeSha256!==previous.sha256)throw Error('Source-start checkpoint hash differs from earned save');
  resumeValidation={checkpointPath:previous.path,checkpointSha256:previous.sha256,sourceStartCapturedHash:start.resumeSha256!==undefined,sourceStartResumeSha256:start.resumeSha256??null,checkpointTraceFieldsMatched:true};
  const restart:TraceEvent={kind:'restart',stage:previous.stage,tick:start.tick,active:start.players};
  insertedRestarts.push({composedEventIndex:composed.length,event:restart,...resumeValidation});composed.push(restart);
 }
 const actual=index===0?included:included.slice(1);composed.push(...actual);
 let checkpoint:Record<string,unknown>|undefined;
 if(specification.through){previous=validateEarned(included.at(-1)!,path);checkpoint={stage:previous.stage,path:previous.path,sha256:previous.sha256,activePlayers:previous.active};}
 sources.push({path,traceSha256:hash(text),sourceEventCount:trace.length,includedEventCount:actual.length,includedEventsSha256:hash(JSON.stringify(actual)),omittedPrefixEvents:index===0?0:1,omittedSuffixEvents:trace.length-end-1,throughCheckpoint:specification.through??null,checkpoint,resumeValidation});
}
const text=JSON.stringify(composed),provenance={version:1,method:'actual-input-segments-linked-by-earned-checkpoint',createdAt:new Date().toISOString(),manifestPath,manifestSha256:hash(manifestText),composedTraceSha256:hash(text),composedEventCount:composed.length,sourceSegments:sources,insertedRestarts,sourceSavesReadForProvenanceOnly:true,sourceSavesImportedIntoSocketReplay:false,clock:'Real server-process restart at each composed boundary; socket replay earns and reloads its own checkpoint'};
mkdirSync(output,{recursive:true});for(const name of ['trace.json','provenance.json'])if(existsSync(resolve(output,name)))throw Error('Composition output already exists: '+resolve(output,name));
writeFileSync(resolve(output,'trace.json'),text);writeFileSync(resolve(output,'provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({trace:resolve(output,'trace.json'),provenance:resolve(output,'provenance.json'),events:composed.length,insertedRestarts:insertedRestarts.length,sha256:provenance.composedTraceSha256},null,2));
