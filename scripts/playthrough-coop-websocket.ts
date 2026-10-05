/** Replays an actual-input journey using two real sockets and a separate server.
 * Usage: node --import tsx scripts/playthrough-coop-websocket.ts TRACE OUTPUT [PROVENANCE]
 * Optional: --continue-from-replay COMPLETED_RUN (explicit new-player continuation)
 * Source upgrade requires --continuation-source-hash EXACT_NEW_SHA256.
 * Expected negative actions require --allow-expected-rejections and expected:true.
 * The trace contains controls only; saved fixtures are never imported. Server
 * restarts reload only checkpoints this run earned through real wire messages.
 * The deterministic clock is not wall-clock, browser, rendering, or device QA. */
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {WebSocket} from 'ws';
import {COOP_PROTOCOL,type CoopAction,type CoopClientPacket,type CoopServerPacket,type CoopWireServerPacket} from '../src/networking/coop-protocol';
import {CoopFrameDecoder} from '../src/networking/coop-frame-decoder';
import type {Snapshot,PlayerInput} from '../src/simulation/protocol';
import type {RoomAccessView} from '../src/networking/room-access';
import {validateCheckpoint} from '../src/save/checkpoint';
import {SITES,SITE_ROOMS,ANNEX_ROOMS} from '../src/content/adventure-sites';
import {ADVENTURE_DECORATIONS} from '../src/content/adventure-chapters';
import {decorationUnlocked} from '../src/game/adventure-progression';
import {snapshotDigest,fluidDigest,inventoryDigest} from './soak-coop-common';

type TraceEvent={observation?:string;traversals?:{id:string;traversal:Snapshot['adventure']['traversal'];stamina:number;health:number}[];expected?:boolean;error?:string;kind:string;stage?:string;tick:number;ticks?:number;inputs?:Record<string,PlayerInput>;player?:string;message?:CoopAction;result?:string;active?:string[];ids?:number[];owner?:string|null;completedTrials?:number[];completedSites?:number[];defeated?:string[];players?:{id:string;player:{x:number;y:number;z:number};inventory:Record<string,number>;progression?:unknown}[]};
type Ack=Extract<CoopServerPacket,{type:'ack'}>;
interface Reference {epoch:string;playerId:string;packetKind:string;tick:number;waterRevision:number;snapshotHash:string;waterHash:string}
interface ServerEvent extends Partial<Reference> {kind:string;id?:number;error?:string;message?:string;code?:string;port?:number;protocol?:number;file?:string;pid?:number;resumed?:boolean;sourceHash?:string}
const tracePath=resolve(process.argv[2]??'/tmp/voxel-continuous-clean/trace.json');
const output=resolve(process.argv[3]??'/tmp/voxel-coop-websocket-journey');mkdirSync(output,{recursive:true});
const saveDirectory=join(output,'saves'),roomId='f'.repeat(48),saveFile=join(saveDirectory,roomId+'.json');
if(existsSync(saveFile))throw Error('Fresh-start verification requires an empty output/save directory');
const traceText=readFileSync(tracePath,'utf8'),trace=JSON.parse(traceText) as TraceEvent[];
let continuationDirectory:string|undefined,continuationSourceHash:string|undefined,provenancePath:string|undefined,allowExpectedRejections=false;
for(let i=4;i<process.argv.length;i++){const option=process.argv[i];
 if(option==='--allow-expected-rejections'){if(allowExpectedRejections)throw Error('Repeated expected-rejection option');allowExpectedRejections=true;}
 else if(option==='--continue-from-replay'){if(continuationDirectory||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error('Continuation requires one completed replay directory');continuationDirectory=resolve(process.argv[++i]);}
 else if(option==='--continuation-source-hash'){if(continuationSourceHash||!process.argv[i+1]||!/^([a-f0-9]{64})$/.test(process.argv[i+1]))throw Error('Supply one exact continuation source SHA-256');continuationSourceHash=process.argv[++i];}
 else if(!option.startsWith('--')&&!provenancePath)provenancePath=resolve(option);else throw Error('Unknown or repeated replay option '+option);
}
if(trace.some(event=>event.kind==='action-rejected'&&event.expected===true)&&!allowExpectedRejections)throw Error('Expected rejection requires explicit --allow-expected-rejections');
if(continuationSourceHash&&!continuationDirectory)throw Error('A source transition requires an explicit own-checkpoint continuation');
const provenance=provenancePath?JSON.parse(readFileSync(provenancePath,'utf8')) as Record<string,unknown>:undefined;
if(provenance&&provenance.composedTraceSha256!==createHash('sha256').update(traceText).digest('hex'))throw Error('Provenance does not match the supplied input trace');
if(trace[0]?.kind!=='start')throw Error('The replay must start with a source start event');
interface Continuation {mode:'own-completed-websocket-checkpoint-new-clients';priorRun:string;priorSummarySha256:string;checkpointSha256:string;worldSha256:string;sourceHash:string;replaySourceHash:string;sourceTransition:'same-source'|'explicit-pinned-compatible-save-restore';priorPlayerIds:string[]}
const personalRecord=(adventure:{inventory:Record<string,number>;progression?:unknown;trialJournal?:number[];siteJournal?:number[];gearItems?:unknown})=>({inventory:adventure.inventory,progression:adventure.progression,trialJournal:adventure.trialJournal??[],siteJournal:adventure.siteJournal??[],gearItems:adventure.gearItems});
const originalMembers=new Map<string,unknown>();
const newClientInitialStates:Record<string,unknown>[]=[];
let preservedOriginalMembers=0,continuation:Continuation|undefined;
if(continuationDirectory){
 if(trace.at(-1)?.kind!=='route-complete'||trace.some(e=>e.kind==='blocked'||e.kind==='action-rejected'&&!(allowExpectedRejections&&e.expected===true)))throw Error('Continuation trace must be complete with no failed/rejected operations');
 const summaryText=readFileSync(join(continuationDirectory,'summary.json'),'utf8'),summary=JSON.parse(summaryText) as {status?:string;sourceTerminalKind?:string;failures?:unknown[];sourceHash?:string;frameChecks?:number;waterChecks?:number};
 if(summary.status!=='completed-source-route'||summary.sourceTerminalKind!=='route-complete'||!Array.isArray(summary.failures)||summary.failures.length||!summary.sourceHash||(summary.frameChecks??0)<20||(summary.waterChecks??0)<20)throw Error('Continuation requires a completed, verified actual-socket route receipt');
 const checkpointText=readFileSync(join(continuationDirectory,'saves',roomId+'.json'),'utf8'),checkpoint=validateCheckpoint(JSON.parse(checkpointText));
 if(!checkpoint.world.adventure?.defeated.includes('stormcore'))throw Error('Late-join epilogue continuation requires an earned completed-story checkpoint');
 const worldText=JSON.stringify(checkpoint.world),worldSha256=createHash('sha256').update(worldText).digest('hex'),start=trace[0] as unknown as {resume?:string;resumeSha256?:string;seed?:number;generator?:number};
 if(!start.resume||start.resumeSha256!==worldSha256||createHash('sha256').update(readFileSync(resolve(start.resume))).digest('hex')!==worldSha256||start.seed!==checkpoint.world.seed||start.generator!==checkpoint.world.generator)throw Error('Source continuation must read exactly the completed socket run’s earned world bytes');
 if(checkpoint.world.members?.some(m=>['journey-a','journey-b'].includes(m.id)))throw Error('Late-join source IDs already exist in the earned checkpoint');
 continuation={mode:'own-completed-websocket-checkpoint-new-clients',priorRun:continuationDirectory,priorSummarySha256:createHash('sha256').update(summaryText).digest('hex'),checkpointSha256:createHash('sha256').update(checkpointText).digest('hex'),worldSha256,sourceHash:summary.sourceHash,replaySourceHash:continuationSourceHash??summary.sourceHash,sourceTransition:continuationSourceHash&&continuationSourceHash!==summary.sourceHash?'explicit-pinned-compatible-save-restore':'same-source',priorPlayerIds:checkpoint.world.members?.map(m=>m.id)??[]};
 for(const member of checkpoint.world.members??[])originalMembers.set(member.id,personalRecord(member.adventure));
 mkdirSync(saveDirectory,{recursive:true});writeFileSync(saveFile,checkpointText);
}else if((trace[0] as unknown as {resume?:string|null}).resume)throw Error('The replay must start at a fresh initial world');
const events=join(output,'events.jsonl'),failures:string[]=[],completed:string[]=[],references=new Map<string,Reference>(),observed=new Map<string,Reference>();
const startedAt=new Date().toISOString(),started=performance.now(),idle:PlayerInput={x:0,z:0,jump:false};
let server:ChildProcess|undefined,port=0,tick=0,generation=0,commandSequence=0,stage='fresh-start',running=true,serverStopping=false,error:Error|undefined,frames=0,frameChecks=0,waterChecks=0,actions=0,acceptedActions=0,expectedRejections=0,steps=0,restarts=0,checkpoints=0,disconnects=0,rejoins=0;
let sourceHash:string|undefined=continuation?.replaySourceHash;
const pending=new Map<number,{resolve:(event:ServerEvent)=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function record(event:Record<string,unknown>){appendFileSync(events,JSON.stringify({at:new Date().toISOString(),stage,generation,...event})+'\n');}
function fail(reason:unknown){const e=reason instanceof Error?reason:Error(String(reason));error??=e;if(!failures.includes(e.message)){failures.push(e.message);record({kind:'failure',message:e.message});}}
function key(ref:Reference){return [ref.epoch,ref.playerId,ref.packetKind,ref.tick,ref.waterRevision].join(':');}
function compare(k:string){const wanted=references.get(k),actual=observed.get(k);if(!wanted||!actual)return;if(wanted.snapshotHash!==actual.snapshotHash)fail('Snapshot decoder mismatch '+k);else frameChecks++;if(wanted.waterHash!==actual.waterHash)fail('Water decoder mismatch '+k);else waterChecks++;references.delete(k);observed.delete(k);}
async function until(test:()=>boolean,label:string,timeout=15000){const deadline=performance.now()+timeout;while(!test()){if(error)throw error;if(performance.now()>deadline)throw Error('Timeout: '+label);await new Promise(r=>setTimeout(r,1));}}
function command(type:'step'|'checkpoint'|'stop',extra:Record<string,unknown>={}):Promise<ServerEvent>{if(error)return Promise.reject(error);if(!server?.connected)return Promise.reject(Error('Server is not connected'));const id=++commandSequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Server control timeout '+type));},20000);pending.set(id,{resolve,reject,timer});server!.send({id,type,...extra});});}
async function startServer(){
 generation++;serverStopping=false;let ready=false;
 const child=server=spawn(process.execPath,['--import','tsx','scripts/playthrough-coop-socket-server.ts',saveDirectory,roomId],{cwd:process.cwd(),stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',raw=>{const event=raw as ServerEvent;
  if(event.kind==='ready'){port=event.port!;tick=event.tick!;if(sourceHash&&sourceHash!==event.sourceHash)fail('Gameplay source changed across server restarts');sourceHash??=event.sourceHash;if(event.protocol!==COOP_PROTOCOL)fail('Protocol mismatch');ready=true;record(event as unknown as Record<string,unknown>);}
  else if(event.kind==='frame-reference'){const ref=event as Reference;references.set(key(ref),ref);compare(key(ref));}
  else if(event.kind==='reply'){const item=pending.get(event.id!);if(item){clearTimeout(item.timer);pending.delete(event.id!);if(event.error)item.reject(Error(event.error));else item.resolve(event);}}
  else if(event.kind==='fatal'||event.kind==='startup-error')fail(event.message??event.kind);
 });
 child.stdout!.on('data',(data:Buffer)=>record({kind:'server-stdout',text:data.toString()}));child.stderr!.on('data',(data:Buffer)=>record({kind:'server-stderr',text:data.toString()}));
 child.on('error',fail);child.on('exit',(code,signal)=>{record({kind:'server-exit',code,signal});if(running&&!serverStopping)fail('Unexpected server exit '+code);});
 await until(()=>ready,'server startup');
}
async function stopServer(){if(!server||server.exitCode!==null)return;serverStopping=true;for(const c of clients)c.plannedClose=true;await command('stop');await until(()=>server!.exitCode!==null||server!.signalCode!==null,'server shutdown');if(server.exitCode!==0)throw Error('Server did not stop successfully');}
class Client {
 private readonly resumeKey=randomBytes(32).toString('hex');
 readonly publicId=createHash('sha256').update(this.resumeKey).digest('hex');
 socket:WebSocket|undefined;state:Snapshot|undefined;access:RoomAccessView|undefined;epoch='';sequence=0;actionSequence=0;welcomes=0;plannedClose=false;active=true;
 private decoder=new CoopFrameDecoder(token=>this.send({type:'delivery',token}));
 private acknowledgments=new Map<string,{resolve:(ack:Ack)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(readonly sourceId:string){}
 send(packet:CoopClientPacket){if(this.socket?.readyState!==WebSocket.OPEN)throw Error(this.sourceId+' is disconnected');this.socket.send(JSON.stringify(packet));}
 async connect(){
  this.active=true;this.state=undefined;this.sequence=0;this.access=undefined;this.plannedClose=false;this.decoder=new CoopFrameDecoder(token=>this.send({type:'delivery',token}));
  const socket=this.socket=new WebSocket(`ws://127.0.0.1:${port}/coop/${roomId}`);
  socket.on('message',data=>{try{const wire=JSON.parse(String(data)) as CoopWireServerPacket,packet=this.decoder.accept(wire);
   if(packet.type==='welcome'){if(packet.playerId!==this.publicId)throw Error('Authenticated identity mismatch');this.state=packet.state;this.epoch=packet.epoch;this.actionSequence=packet.actionSequence??0;this.welcomes++;}
   if(packet.type==='frame'){this.state=packet.state;this.epoch=packet.epoch;}
   if(packet.type==='welcome'||packet.type==='frame'){frames++;const ref:Reference={epoch:this.epoch,playerId:this.publicId,packetKind:wire.type,tick:packet.state.tick,waterRevision:wire.type==='delta'?wire.water.revision:0,snapshotHash:snapshotDigest(packet.state),waterHash:fluidDigest(packet.state.fluids)};observed.set(key(ref),ref);compare(key(ref));}
   if(packet.type==='room-access')this.access=packet.access;
   if(packet.type==='ack'){const ack=this.acknowledgments.get(packet.commandId);if(ack){clearTimeout(ack.timer);this.acknowledgments.delete(packet.commandId);ack.resolve(packet);}}
   if(packet.type==='notice')throw Error(this.sourceId+' server notice: '+packet.message);
  }catch(reason){fail(reason);}});
  socket.on('error',fail);socket.on('close',(code,reason)=>{if(!this.plannedClose&&running)fail(`${this.sourceId} disconnected: ${code} ${reason}`);});
  await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  this.send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:this.resumeKey,roomId,buildId:'local'});
  await until(()=>!!this.state&&!!this.access&&!this.access.pending,this.sourceId+' welcome');
  if(continuation&&generation===1&&this.welcomes===1){const a=this.state!.adventure;if((a.progression?.records.length??0)>0||(a.progression?.tutorial??0)>0||(a.trialJournal?.length??0)>0||(a.siteJournal?.length??0)>0)throw Error('A late joiner inherited personal progress');newClientInitialStates.push({playerId:this.publicId,sourceId:this.sourceId,...structuredClone(personalRecord(a))});}
 }
 async close(){this.active=false;this.plannedClose=true;const socket=this.socket;if(!socket||socket.readyState===WebSocket.CLOSED)return;await new Promise<void>(resolve=>{socket.once('close',()=>resolve());socket.close();});}
 input(input:PlayerInput){this.send({type:'input',sequence:++this.sequence,input,clientTick:tick});}
 async act(message:CoopAction,expectRejection=false){
  if(message.type==='game-action'&&message.id){const sourceId=message.id;if(clients.some(c=>c.sourceId===sourceId))message={...message,id:getClient(sourceId).publicId};}
  if(message.type==='action'&&(message.tool==='dig'||message.tool==='add'))message={...message,expectedRevision:this.state!.edits};
  if(message.type==='game-action'&&['sky-store','sky-take','sky-camp','sky-move','sky-glue','sky-unglue','sky-recall','sky-salvage','sky-toggle','sky-charge','sky-ride','sky-share','sky-upright','sky-throw'].includes(message.action)){
   const partId=Number(message.id?.split(':')[0]),part=this.state!.adventure.skybound?.parts.find(p=>p.id===partId);if(!part)throw Error('Missing client-observed part for '+message.action+' '+message.id);message={...message,expectedEpoch:part.epoch};
  }
  const commandId=`seq_${++this.actionSequence}_${randomUUID()}`;
  const result=new Promise<Ack>((resolve,reject)=>{const timer=setTimeout(()=>{this.acknowledgments.delete(commandId);reject(Error('Action ACK timeout '+commandId));},15000);this.acknowledgments.set(commandId,{resolve,reject,timer});});
  this.send({type:'action',commandId,message,clientTick:tick});const ack=await result;actions++;
  record({kind:'action',playerId:this.publicId,sourceId:this.sourceId,commandId,tick,message,accepted:ack.accepted,result:ack.message,...(expectRejection?{expectedRejection:true}:{})});
  if(ack.accepted)acceptedActions++;if(expectRejection){if(ack.accepted)throw Error('Expected rejection was accepted '+commandId);return ack;}
  if(!ack.accepted)throw Error(`Rejected ${this.sourceId} ${JSON.stringify(message)}: ${ack.message}`);return ack;
 }
}
const clients=[new Client('journey-a'),new Client('journey-b')];
function getClient(id:string){const c=clients.find(c=>c.sourceId===id);if(!c)throw Error('Unknown trace client '+id);return c;}
async function step(inputs:Record<string,PlayerInput>){
 const active=clients.filter(c=>c.active);for(const c of active)c.input(inputs[c.sourceId]??idle);
 const reply=await command('step',{tick,expectedInputs:active.map(c=>({playerId:c.publicId,sequence:c.sequence}))});tick=reply.tick!;steps++;
 if(tick%3===0){await until(()=>active.every(c=>c.state?.tick===tick),'both client snapshots at tick '+tick);verifyExpectedRejectionFrames();}
}
/** Reject atomically without advancing time. Observe paid client state on the
 * next normal trace-driven frame, respecting the production resync rate limit. */
type PaidPart={id:number;kind:string;material:string;mass:number;links:number[];epoch:number;creator?:string;shared?:boolean;trial?:number;loan?:unknown};
type PaidPlan={id:number;owner:string;name:string;parts:{kind:string;material:string;links:number[]}[]};
const paidProjection=(inventory:Record<string,number>,parts:readonly PaidPart[]=[],plans:readonly PaidPlan[]=[])=>snapshotDigest({inventory,parts:parts.map(p=>({id:p.id,kind:p.kind,material:p.material,mass:p.mass,links:p.links,epoch:p.epoch,creator:p.creator,shared:p.shared,trial:p.trial,loan:p.loan})),blueprints:plans.map(p=>({id:p.id,owner:p.owner,name:p.name,parts:p.parts.map(q=>({kind:q.kind,material:q.material,links:q.links}))}))});
const pendingRejections:{tick:number;playerId:string;action:CoopAction;reason:string;authorityHash:string;clients:{client:Client;hash:string}[]}[]=[];
function verifyExpectedRejectionFrames(){
 for(let i=pendingRejections.length-1;i>=0;i--){const pending=pendingRejections[i];if(!pending.clients.every(({client})=>client.state&&client.state.tick>pending.tick))continue;
  for(const {client,hash}of pending.clients){const state=client.state!.adventure;if(paidProjection(state.inventory,state.skybound?.parts,state.skybound?.blueprints)!==hash)throw Error('Rejected operation changed observed client inventory/part graph/blueprints '+client.sourceId);}
  expectedRejections++;record({kind:'expected-rejection-verified',tick:pending.tick,clientObservedTick:tick,playerId:pending.playerId,action:pending.action,reason:pending.reason,accepted:false,unchangedAuthorityHash:pending.authorityHash,unchangedClients:pending.clients.length,extraSimulationSteps:0,authoritativeAssertionSteps:0});pendingRejections.splice(i,1);
 }
}
async function verifyExpectedRejection(event:TraceEvent){
 if(!allowExpectedRejections||event.expected!==true||event.tick!==tick||!event.player||!event.message||typeof event.error!=='string')throw Error('Unapproved or incomplete expected-rejection event');
 const ownWorld=()=>validateCheckpoint(JSON.parse(readFileSync(saveFile,'utf8'))).world;
 const ownProjection=(world:ReturnType<typeof ownWorld>)=>snapshotDigest({nextEntityId:world.nextEntityId,hostInventory:world.adventure?.inventory,members:world.members?.map(m=>({id:m.id,inventory:m.adventure.inventory,gearItems:m.adventure.gearItems})),skybound:world.skybound,resources:world.adventure?.resources,edits:world.edits});
 await command('checkpoint');const before=ownWorld(),beforeHash=ownProjection(before);
 const ack=await getClient(event.player).act(event.message,true),reason=event.error.replace(/^(?:Error|TypeError|RangeError): /,'');if(ack.message!==reason)throw Error('Rejection reason diverged: expected '+reason+'; got '+ack.message);
 await command('checkpoint');const after=ownWorld(),afterHash=ownProjection(after);if(beforeHash!==afterHash)throw Error('Rejected operation mutated inventory, parts, blueprints, drops, terrain or entity allocation');
 pendingRejections.push({tick,playerId:getClient(event.player).publicId,action:event.message,reason,authorityHash:afterHash,clients:clients.filter(c=>c.active).map(client=>{const member=after.members?.find(m=>m.id===client.publicId);if(!member)throw Error('Rejected-action member disappeared');return {client,hash:paidProjection(member.adventure.inventory,after.skybound?.parts,after.skybound?.blueprints.filter(plan=>plan.owner===client.publicId))};})});
}
function verifyCheckpoint(event:TraceEvent){
 const checkpoint=validateCheckpoint(JSON.parse(readFileSync(saveFile,'utf8'))),world=checkpoint.world;
 for(const expected of event.players??[]){
  const client=getClient(expected.id),member=world.members?.find(m=>m.id===client.publicId);if(!member)throw Error('Checkpoint member missing '+expected.id);
  if(inventoryDigest(member.adventure.inventory)!==inventoryDigest(expected.inventory))throw Error('Inventory diverged at '+event.stage+' '+expected.id);
  if(snapshotDigest({progression:member.adventure.progression})!==snapshotDigest({progression:expected.progression}))throw Error('Progression diverged at '+event.stage+' '+expected.id);
  if(Math.hypot(member.player.x-expected.player.x,member.player.y-expected.player.y,member.player.z-expected.player.z)>.00001)throw Error('Position diverged at '+event.stage+' '+expected.id+': '+JSON.stringify({expected:expected.player,actual:member.player}));
 }
 for(const [field,expected]of [['completedTrials',event.completedTrials],['completedSites',event.completedSites],['defeated',event.defeated]]as const){const actual=field==='completedTrials'?world.adventure?.trialWorld?.completed:field==='completedSites'?world.adventure?.siteWorld?.completed:world.adventure?.defeated;if(JSON.stringify(actual??[])!==JSON.stringify(expected??[]))throw Error(field+' diverged at '+event.stage);}
 writeFileSync(join(output,`${String(checkpoints).padStart(2,'0')}-${event.stage}.checkpoint.json`),JSON.stringify(checkpoint));
 return {beacons:world.adventure?.resources.filter(n=>n.id>=810001&&n.id<=810004&&n.ready>1e9).map(n=>n.id)??[],trials:world.adventure?.trialWorld?.completed??[],sites:world.adventure?.siteWorld?.completed??[],defeated:world.adventure?.defeated??[],players:world.members?.map(m=>({id:m.id,position:m.player,tutorial:m.adventure.progression?.tutorial,inventory:m.adventure.inventory}))};
}
try{
 record({kind:'start',traceSha256:createHash('sha256').update(traceText).digest('hex'),sourceTrace:tracePath,provenancePath,protocol:COOP_PROTOCOL,clock:'deterministic 30Hz steps through IPC',gameplayTransport:'two real WebSocket clients',freshStart:!continuation,continuation,fixturesReplaced:false,players:clients.map(c=>({sourceId:c.sourceId,playerId:c.publicId}))});
 await startServer();for(const c of clients)await c.connect();
 for(const event of trace){
  if(error)throw error;if(event.stage)stage=event.stage;
  if(event.kind==='input'){
   if(event.tick!==tick)throw Error(`Input trace expected tick ${event.tick}, server has ${tick}`);
   for(let i=0;i<(event.ticks??0);i++)await step(event.inputs??{});
  }else if(event.kind==='action'){
   if(event.tick!==tick||!event.player||!event.message)throw Error('Invalid action trace at '+tick);if(pendingRejections.length)throw Error('Source must include a normal client observation frame after expected rejection before another action');
   const ack=await getClient(event.player).act(event.message);if(ack.message!==event.result)throw Error('Action outcome diverged: expected '+event.result+'; got '+ack.message);
  }else if(event.kind==='action-rejected'){await verifyExpectedRejection(event);}
  else if(event.kind==='assembly-lease-observation'){
   if(event.tick!==tick||!event.ids?.length||event.ids.some(id=>!Number.isSafeInteger(id))||(event.owner!==null&&typeof event.owner!=='string'))throw Error('Invalid assembly lease observation');
   const active=clients.filter(client=>client.active),owner=event.owner===null?undefined:getClient(event.owner!).publicId;
   if(JSON.stringify(active.map(client=>client.sourceId))!==JSON.stringify(event.active))throw Error('Lease observation membership differs');
   for(const client of active){if(client.state?.tick!==tick)throw Error('Lease observation requires a current normal client frame');for(const id of event.ids){const part=client.state.adventure.skybound?.parts.find(item=>item.id===id);if(!part||part.lease?.owner!==owner)throw Error('Client-observed assembly lease differs for '+client.sourceId+' part '+id);}}
   record({kind:'assembly-lease-verified',tick,ids:event.ids,owner:owner??null,clients:active.map(client=>client.publicId),partChecks:event.ids.length*active.length});
  }
  else if(event.kind==='traversal-observation'){
   const active=clients.filter(client=>client.active);
   if(event.tick!==tick||tick%3!==0||typeof event.observation!=='string'||!event.observation||!Array.isArray(event.traversals)||event.traversals.length!==active.length||new Set(event.traversals.map(item=>item.id)).size!==active.length)throw Error('Invalid or incomplete traversal observation');
   const checked=[];
   for(const expected of event.traversals){
    const client=getClient(expected.id);
    if(!client.active||client.state?.tick!==tick||!expected.traversal||!Number.isFinite(expected.stamina)||!Number.isFinite(expected.health))throw Error('Traversal observation requires current normal frames and complete values');
    const actual={traversal:client.state.adventure.traversal,stamina:client.state.adventure.stamina,health:client.state.adventure.health};
    if(snapshotDigest(actual)!==snapshotDigest({traversal:expected.traversal,stamina:expected.stamina,health:expected.health}))throw Error('Client traversal flags/stamina/health differ for '+expected.id+' at '+event.observation);
    checked.push({sourceId:expected.id,playerId:client.publicId,...actual});
   }
   record({kind:'traversal-observation-verified',observation:event.observation,tick,players:checked,extraSimulationSteps:0,resyncRequests:0});
  }
  else if(event.kind==='blocked')throw Error('Source route was blocked at '+event.stage);
  else if(event.kind==='checkpoint'){
   await command('checkpoint');checkpoints++;const evidence=verifyCheckpoint(event);completed.push(stage);record({kind:'checkpoint',tick,...evidence});console.log(JSON.stringify({kind:'checkpoint',stage,tick,trials:evidence.trials.length}));
  }else if(event.kind==='leave'){
   if(!event.player)throw Error('Leave event has no player');await getClient(event.player).close();await command('checkpoint',{expectedPlayers:clients.filter(c=>c.active).map(c=>c.publicId)});disconnects++;record({kind:'leave',playerId:getClient(event.player).publicId,tick});
  }else if(event.kind==='rejoin'){
   if(!event.player)throw Error('Rejoin event has no player');await getClient(event.player).connect();rejoins++;record({kind:'rejoin',playerId:getClient(event.player).publicId,tick});
  }else if(event.kind==='restart'){
   const before=validateCheckpoint(JSON.parse(readFileSync(saveFile,'utf8')));
   const active=clients.filter(c=>c.active);if(event.active&&JSON.stringify(active.map(c=>c.sourceId))!==JSON.stringify(event.active))throw Error('Restart active-client mapping differs from source');
   await stopServer();await startServer();for(const c of active)await c.connect();
   for(const c of active){const member=before.world.members!.find(m=>m.id===c.publicId)!;if(inventoryDigest(c.state!.adventure.inventory)!==inventoryDigest(member.adventure.inventory))throw Error('Restart inventory mismatch '+c.sourceId);if(c.state!.adventure.progression?.tutorial!==member.adventure.progression?.tutorial)throw Error('Restart tutorial mismatch '+c.sourceId);}
   if(tick!==event.tick)throw Error('Restart tick diverged');restarts++;record({kind:'restart',tick,fromOwnPersistedCheckpoint:true,inventoryMatched:true});
  }
 }
 await command('checkpoint');await until(()=>references.size===0&&observed.size===0,'all snapshot and water hashes matched');if(pendingRejections.length)throw Error('Expected rejection lacks a subsequent normal client observation frame');
 if(!completed.length||actions===0||frameChecks<20)throw Error('Insufficient replay evidence');
 record({kind:'route-controls-complete',completed,actions,acceptedActions,expectedRejections,steps,restarts,disconnects,rejoins,frameChecks,waterChecks});
}catch(reason){fail(reason);}
finally{
 if(server?.connected&&!error)try{await stopServer();}catch(reason){fail(reason);}
 running=false;serverStopping=true;for(const c of clients){c.plannedClose=true;c.socket?.terminate();}if(server&&server.exitCode===null)server.kill('SIGTERM');
 for(const wait of pending.values()){clearTimeout(wait.timer);wait.reject(Error('Replay ended'));}pending.clear();
 let storedProgress:Record<string,unknown>|undefined;try{if(existsSync(saveFile)){const world=validateCheckpoint(JSON.parse(readFileSync(saveFile,'utf8'))).world;for(const [id,expected]of originalMembers){const member=world.members?.find(m=>m.id===id);if(!member||snapshotDigest(personalRecord(member.adventure))!==snapshotDigest(expected))throw Error('Original member personal inventory/progress was not preserved: '+id);preservedOriginalMembers++;}storedProgress={beacons:world.adventure?.resources.filter(n=>n.id>=810001&&n.id<=810004&&n.ready>1e9).map(n=>n.id)??[],trials:world.adventure?.trialWorld?.completed??[],sites:world.adventure?.siteWorld?.completed??[],defeated:world.adventure?.defeated??[],sharedReported:world.adventure?.siteWorld?.regional?.reported??[],sharedEpilogue:world.adventure?.siteWorld?.regional?.epilogue??[],sharedMechanismsSolved:world.adventure?.siteWorld?.regional?.solved??[],availableRoomCount:SITES.length*(SITE_ROOMS.length+ANNEX_ROOMS.length),placedDecorations:world.adventure?.buildings.filter(b=>(b.health??100)>0&&ADVENTURE_DECORATIONS.some(d=>d.id===b.definition)).map(b=>({id:b.id,definition:b.definition,creator:b.creator,position:{x:b.x,y:b.y,z:b.z},health:b.health??100}))??[],players:world.members?.map(m=>{const roomIds=(m.adventure.siteJournal??[]).filter(id=>SITES.some(site=>id>=site.id*10&&id<=site.id*10+5)),records=m.adventure.progression?.records??[];return {playerId:m.id,sourceId:clients.find(c=>c.publicId===m.id)?.sourceId,tutorial:m.adventure.progression?.tutorial,health:m.adventure.health,roomIds,roomCount:roomIds.length,roomsBySite:SITES.map(site=>({site:site.id,roomIds:roomIds.filter(id=>id>=site.id*10&&id<=site.id*10+5)})),records,recordCount:records.length,unlockedDecorations:ADVENTURE_DECORATIONS.filter(d=>decorationUnlocked({...m.adventure,siteWorld:world.adventure?.siteWorld},d.id)).map(d=>d.id)};})};}}catch(reason){fail(reason);}
 const result={status:failures.length?'failed':'completed-source-route',harness:'real-websocket-deterministic-clock',startedAt,elapsedMs:performance.now()-started,traceSha256:createHash('sha256').update(traceText).digest('hex'),sourceTrace:tracePath,sourceTraceEventCount:trace.length,sourceTerminalKind:trace.at(-1)?.kind,sourceProvenance:provenance,continuation,preservedOriginalMembers,newClientInitialStates,freshStart:!continuation,sourceHash,stage,completed,storedProgress,protocol:COOP_PROTOCOL,players:2,actions,acceptedActions,expectedRejections,steps,restarts,disconnects,rejoins,checkpoints,frames,frameChecks,waterChecks,unmatchedReferences:references.size,unmatchedObserved:observed.size,fixturesReplaced:false,notCovered:['wall-clock scheduling','browser input/rendering','real device performance','public internet transport','stages absent from source trace'],failures};
 if(!failures.length)record({kind:'success',completed,actions,acceptedActions,expectedRejections,steps,restarts,disconnects,rejoins,frameChecks,waterChecks,preservedOriginalMembers});
 writeFileSync(join(output,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,summary:join(output,'summary.json'),completed,failures},null,2));if(failures.length)process.exitCode=1;
}
