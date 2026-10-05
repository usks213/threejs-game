/** Bounded four-client measurement on the existing preview. No Worker memory is
 * inferred from this Node client, and a fresh-room run is not a mature-world test. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {WebSocket} from 'ws';
import {CoopTimingWindow} from '../src/networking/coop-timing';
import {CoopFrameDecoder} from '../src/networking/coop-frame-decoder';
import {COOP_PROTOCOL,type CoopClientPacket,type CoopWireServerPacket} from '../src/networking/coop-protocol';
import type {Snapshot} from '../src/simulation/protocol';
export const LOAD_BUDGET={clients:4,defaultDurationMs:60000,maxDurationMs:120000,maxMessages:16000,maxReceivedBytes:256*1024*1024} as const;
export function loadTarget(base:string,expected:string){const url=new URL(base),local=['127.0.0.1','localhost'].includes(url.hostname);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use an origin without credentials or query');if(local){if(!['http:','https:'].includes(url.protocol)||expected!=='local'&&!/^[a-f0-9]{40}$/.test(expected))throw Error('Invalid local probe origin');}else if(url.origin!=='https://pr-5-voxel-coop-adventure.usks213.workers.dev'||!/^[a-f0-9]{40}$/.test(expected))throw Error('Only the verified existing PR5 preview and exact commit are allowed');return{url,local};}
export function sampleDistribution(values:readonly number[]){if(!values.length)return{count:0,p50:0,p95:0,max:0};const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,p50:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.floor((sorted.length-1)*.95)],max:sorted.at(-1)!};}
interface Client {socket:WebSocket;timing:CoopTimingWindow;state?:Snapshot;id?:string;epoch?:string;sequence:number;frames:number;baselines:number;receivedBytes:number;measuredBytes:number;lastPingAt:number;tickAtStart?:number;tickAtEnd?:number;lastFrameAt?:number;gaps:number[];pings:number[];pingAt?:number;start:{x:number;z:number};closing:boolean}
export async function measurePublicCoop(options:{base:string;expected:string;output?:string;durationMs?:number;warmupMs?:number}){
 const target=loadTarget(options.base,options.expected),duration=options.durationMs??LOAD_BUDGET.defaultDurationMs,warmup=options.warmupMs??5000;
 if(!Number.isSafeInteger(duration)||duration<(target.local?500:30000)||duration>LOAD_BUDGET.maxDurationMs||!Number.isSafeInteger(warmup)||warmup<0||warmup>10000)throw Error('Probe duration exceeds the bounded measurement policy');
 const output=resolve(options.output??'test-results/public-coop-load.json');mkdirSync(dirname(output),{recursive:true});
 const clients:Client[]=[],failures:string[]=[],room=randomBytes(24).toString('hex'),startedAt=new Date().toISOString();let messages=0,sentBytes=0,receivedBytes=0,measuring=false,measuredMs=0,measurementStart=0,measuredBytes=0,healthVerified=false;
 const fail=(reason:unknown)=>{const message=reason instanceof Error?reason.message:String(reason);if(!failures.includes(message))failures.push(message);};
 const send=(client:Client,packet:CoopClientPacket)=>{if(client.socket.readyState!==WebSocket.OPEN)throw Error('Client is not connected');if(++messages>LOAD_BUDGET.maxMessages)throw Error('Bounded message budget exceeded');const text=JSON.stringify(packet);sentBytes+=Buffer.byteLength(text);client.socket.send(text);};
 const wait=async(predicate:()=>boolean,label:string,timeout=20000)=>{const end=performance.now()+timeout;while(!predicate()){if(failures.length)throw Error(failures[0]);if(performance.now()>end)throw Error('Timeout: '+label);await new Promise(r=>setTimeout(r,25));}};
 try{
  if(!target.local){
   const [assetResponse,healthResponse]=await Promise.all([fetch(new URL('/deployment.json?commit='+options.expected,target.url),{signal:AbortSignal.timeout(10000),cache:'no-store'}),fetch(new URL('/coop/health',target.url),{signal:AbortSignal.timeout(10000),cache:'no-store'})]);
   if(!assetResponse.ok||!healthResponse.ok)throw Error('Preview identity endpoints failed');const asset=await assetResponse.json(),health=await healthResponse.json();if(asset.commit!==options.expected||health.buildId!==options.expected||health.service!=='voxel-coop-authority'||health.protocol!==COOP_PROTOCOL||health.maxPlayers!==4)throw Error('Asset/authority/expected commit mismatch');healthVerified=true;
  }
  for(let index=0;index<LOAD_BUDGET.clients;index++){
   const url=new URL('/coop/'+room,target.url);url.protocol=url.protocol==='http:'?'ws:':'wss:';
   const socket=new WebSocket(url),client:Client={socket,timing:new CoopTimingWindow(),sequence:0,frames:0,baselines:0,receivedBytes:0,measuredBytes:0,lastPingAt:-Infinity,gaps:[],pings:[],start:{x:0,z:8},closing:false};clients.push(client);
   const decoder=new CoopFrameDecoder(token=>send(client,{type:'delivery',token}));
   socket.on('error',error=>{if(!client.closing)fail(error);});socket.on('close',(code,reason)=>{if(!client.closing)fail(`Client${index+1} unexpectedly closed ${code}: ${String(reason).slice(0,160)}`);});
   socket.on('message',bytes=>{if(client.closing)return;try{
    const size=Buffer.byteLength(bytes as Buffer);receivedBytes+=size;client.receivedBytes+=size;if(measuring){measuredBytes+=size;client.measuredBytes+=size;}if(receivedBytes>LOAD_BUDGET.maxReceivedBytes)throw Error('Bounded receive budget exceeded');
    const packet=decoder.accept(JSON.parse(String(bytes)) as CoopWireServerPacket);
    if(packet.type==='welcome'){
     if(packet.protocol!==COOP_PROTOCOL||packet.session?.buildId!==options.expected||packet.session.roomId!==room||client.id&&(client.id!==packet.playerId||client.epoch!==packet.epoch))throw Error('Unexpected welcome identity or build/room mismatch');if(!client.id)client.start={x:packet.state.player.x,z:packet.state.player.z};client.baselines++;client.id=packet.playerId;client.epoch=packet.epoch;client.sequence=Math.max(client.sequence,packet.state.ack??0);
    }
    if(packet.type==='welcome'||packet.type==='frame'){
     if(packet.epoch!==client.epoch||!Number.isSafeInteger(packet.state.tick)||client.state&&packet.state.tick<client.state.tick)throw Error('Unexpected room epoch/tick regression');client.state=packet.state;
     if(measuring){const now=performance.now();if(client.lastFrameAt!==undefined)client.gaps.push(now-client.lastFrameAt);client.lastFrameAt=now;client.frames++;client.tickAtEnd=packet.state.tick;}
    }else if(packet.type==='pong'&&client.pingAt!==undefined){if(measuring&&client.pingAt>=measurementStart){const now=performance.now();client.pings.push(now-client.pingAt);client.timing.observe(packet.timing,now);}client.pingAt=undefined;}
    else if(packet.type==='notice')fail('Authority notice: '+packet.message);
   }catch(error){fail(error);}});
   await wait(()=>socket.readyState===WebSocket.OPEN,'open client'+index);send(client,{type:'hello',protocol:COOP_PROTOCOL,buildId:options.expected,roomId:room,resumeKey:randomBytes(32).toString('hex')});await wait(()=>!!client.state,'welcome client'+index);
  }
  if(new Set(clients.map(c=>c.id)).size!==4)throw Error('Player identities are not independent');await wait(()=>clients.every(c=>c.state?.peers?.length===3),'four-way peer membership');
  const drive=async(milliseconds:number)=>{const start=performance.now(),end=start+milliseconds;while(performance.now()<end){if(failures.length)throw Error(failures[0]);const elapsed=(performance.now()-start)/1000;for(const [index,client]of clients.entries()){
    const p=client.state!.player,angle=elapsed/8+index*Math.PI/2,dx=client.start.x+Math.cos(angle)*2-p.x,dz=client.start.z+Math.sin(angle)*2-p.z,d=Math.max(1,Math.hypot(dx,dz));send(client,{type:'input',sequence:++client.sequence,input:{x:dx/d,z:dz/d,jump:false}});
    const now=performance.now();if(client.pingAt!==undefined&&now-client.pingAt>15000)throw Error('Heartbeat exceeded 15 seconds');if(client.pingAt===undefined&&now-client.lastPingAt>=2000){client.pingAt=now;client.lastPingAt=now;send(client,{type:'ping'});}
   }await new Promise(r=>setTimeout(r,50));}return performance.now()-start;};
  await drive(warmup);for(const client of clients){client.tickAtStart=client.state!.tick;client.tickAtEnd=client.state!.tick;}measurementStart=performance.now();measuring=true;measuredMs=await drive(duration);measuring=false;
  for(const client of clients){send(client,{type:'input',sequence:++client.sequence,input:{x:0,z:0,jump:false}});if(client.frames<2||client.tickAtEnd!<=client.tickAtStart!)throw Error('Insufficient advancing frames');if(client.state?.peers?.length!==3)throw Error('Lost party membership');}
 }catch(error){fail(error);}
 finally{for(const client of clients){client.closing=true;client.socket.close(1000,'Probe finished');}await Promise.all(clients.map(client=>new Promise<void>(resolve=>{if(client.socket.readyState===WebSocket.CLOSED)return resolve();const timer=setTimeout(()=>{client.socket.terminate();resolve();},1500);client.socket.once('close',()=>{clearTimeout(timer);resolve();});})));}
 const minimumTickHz=measuredMs&&clients.length?Math.min(...clients.map(c=>((c.tickAtEnd??0)-(c.tickAtStart??0))*1000/measuredMs)):0;
 const result={status:failures.length?'failed':'completed',startedAt,finishedAt:new Date().toISOString(),scope:target.local?'local four-socket probe validation':'actual existing Cloudflare preview, fresh room, four sockets, gentle movement',expectedCommit:options.expected,healthVerified,protocol:COOP_PROTOCOL,clients:clients.length,requiredMs:duration,measuredMs,warmupMs:warmup,messages,sentBytes,receivedBytes,measuredReceivedBytes:measuredBytes,measuredReceiveBytesPerSecond:measuredMs?measuredBytes*1000/measuredMs:0,targetTickHz:30,minimumTickHz,withinTwoPercentOfTarget:minimumTickHz>=29.4,performanceAcceptance:'measurement only; collection success is not performance acceptance',clientsMeasured:clients.map((client,index)=>({client:index+1,frames:client.frames,fullBaselines:client.baselines,tickDelta:(client.tickAtEnd??0)-(client.tickAtStart??0),observedTickHz:measuredMs?((client.tickAtEnd??0)-(client.tickAtStart??0))*1000/measuredMs:0,frameGapsMs:sampleDistribution(client.gaps),pingRttMs:sampleDistribution(client.pings),workerTiming:client.timing.summary(),receivedBytes:client.receivedBytes,measuredReceivedBytes:client.measuredBytes})),workerMemoryUsage:'not exposed; no inference from Node client RSS',limitations:['fresh room rather than mature saved world','not browser rendering or real-device FPS','no forced Worker restart or backend memory counter','optional Worker timing covers measured pong endpoints, not the exact full load interval; event-clock time is not CPU time','not an unlimited-load or long-term service guarantee'],failures};
 writeFileSync(output,JSON.stringify(result,null,2));if(failures.length)throw Error(failures.join('; '));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const result=await measurePublicCoop({base:process.env.E2E_BASE_URL??'',expected:process.env.EXPECTED_COMMIT??''});console.log('PUBLIC_COOP_LOAD '+JSON.stringify(result));}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}}
