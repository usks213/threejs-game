/** CPU-only production-authority profile, not sockets, browser FPS or Workers memory.
 * node --import tsx scripts/profile-authority.ts [output-prefix] [ticks=600] [checkpoint|-] [combined|server-only]
 * Runs the real four-player initial/restored world. Production room.step is timed
 * separately from in-process client decoding and the soak's extra byte accounting.
 * For bundle-only timing: esbuild this script into scripts/.profile-authority.mjs,
 * then run node --expose-gc on that file with the same arguments; remove it afterward.
 * CPU sampling and GC observation cover measured ticks only; all tick samples,
 * including cold ticks, are retained. No entities or water are replaced/deleted.
 */
import {Session} from 'node:inspector/promises';
import {createHash} from 'node:crypto';
import {PerformanceObserver} from 'node:perf_hooks';
import {readFile,writeFile} from 'node:fs/promises';
import {setImmediate} from 'node:timers/promises';
import {AuthorityRoom,type RoomCheckpoint} from '../src/networking/authority-room';
import {SessionAuthority} from '../src/simulation/session';
import {FluidGrid} from '../src/fluid/fluid';
import {IndexedFluidCells} from '../src/fluid/indexed-cells';
import {SnapshotWireEncoder} from '../src/networking/snapshot-wire';
import {FluidWireEncoder} from '../src/networking/fluid-wire';
import {CoopFrameDecoder} from '../src/networking/coop-frame-decoder';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../src/networking/coop-protocol';
import {sessionFrame} from '../src/networking/frame';
import {distribution,snapshotDigest} from './soak-coop-common';
const output=process.argv[2]??'/tmp/authority-profile',ticks=Number(process.argv[3]??600),mode=process.argv[5]??'combined';
if(!['combined','server-only'].includes(mode))throw Error('mode must be combined or server-only');
if(!Number.isSafeInteger(ticks)||ticks<1)throw Error('ticks must be a positive integer');
const metrics=new Map<string,number[]>(),time=<T>(name:string,fn:()=>T):T=>{const start=performance.now();try{return fn();}finally{const samples=metrics.get(name)??[];samples.push(performance.now()-start);metrics.set(name,samples);}};
function instrument<T extends object,K extends keyof T>(prototype:T,key:K,name:string){const original=prototype[key] as (...args:unknown[])=>unknown;(prototype[key] as unknown)=function(this:T,...args:unknown[]){return time(name,()=>original.apply(this,args));};}
instrument(SessionAuthority.prototype,'step','simulation');instrument(SessionAuthority.prototype,'view','stateView');
instrument(FluidGrid.prototype,'step','fluidStep');instrument(FluidGrid.prototype,'snapshot','fluidSnapshot');instrument(FluidGrid.prototype,'setObstacles','waterObstacles');
instrument(IndexedFluidCells.prototype,'nearest','waterNearest');instrument(SnapshotWireEncoder.prototype,'encode','stateEncoding');instrument(FluidWireEncoder.prototype,'encode','waterDictionary');
const checkpoint:RoomCheckpoint|null=process.argv[4]&&process.argv[4]!=='-'?JSON.parse(await readFile(process.argv[4],'utf8')):null;
let ingressSeconds=0;
const initialization=performance.now(),room=new AuthorityRoom(checkpoint,'profile',null,()=>ingressSeconds),queue:{id:string;packet:CoopWireServerPacket;text:string}[]=[],decoders=new Map<string,CoopFrameDecoder>();
let bytes=0,frames=0,accountedBytes=0,sequence=0,measuring=false,exactStateChecks=0;
const ids=checkpoint?.world.members?.slice(0,4).map(m=>m.id)??Array.from({length:4},(_,i)=>createHash('sha256').update(`profile_${i}`).digest('hex'));
if(ids.length!==4)throw Error('The checkpoint needs four recorded members');
function drain(){for(const message of queue.splice(0)){const {id,packet,text}=message;
 if(mode==='server-only'){if('delivery' in packet)room.receive(id,JSON.stringify({type:'delivery',token:packet.delivery}));continue;}
 const decoded=time('clientDecoding',()=>decoders.get(id)!.accept(JSON.parse(text)));
 if(measuring&&decoded.type==='frame'&&decoded.state.tick%150===0)time('exactStateValidation',()=>{if(snapshotDigest(decoded.state)!==snapshotDigest(sessionFrame(room.authority,id)))throw Error('Decoded state diverged from the actual authority');exactStateChecks++;});
 // This is extra diagnostic work the original soak did inside production send().
 time('soakByteAccounting',()=>{accountedBytes+=Buffer.byteLength(text);if(packet.type==='delta'){accountedBytes+=Buffer.byteLength(JSON.stringify(packet.water));accountedBytes+=Buffer.byteLength(JSON.stringify(packet.state));}});
}}
for(const id of ids){decoders.set(id,new CoopFrameDecoder(token=>room.receive(id,JSON.stringify({type:'delivery',token}))));room.connect(id,{close:(code,reason)=>{throw Error(`Unexpected close ${code}: ${reason}`);},send:(packet,text)=>{const serialized=text??JSON.stringify(packet);if(measuring){bytes+=Buffer.byteLength(serialized);if(packet.type==='delta')frames++;}queue.push({id,packet,text:serialized});}});room.receive(id,JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),id).acknowledgment?.();drain();}
if(room.authority.actors.size!==5)throw Error('Four authenticated actors did not join');
const initializationMs=performance.now()-initialization;metrics.clear();
const explicitGc=typeof globalThis.gc==='function';globalThis.gc?.();
const gc:{duration:number;kind:number}[]=[];const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())gc.push({duration:entry.duration,kind:(entry as unknown as {detail:{kind:number}}).detail.kind});});observer.observe({entryTypes:['gc']});
const inspector=new Session();inspector.connect();await inspector.post('Profiler.enable');await inspector.post('Profiler.start');
const memory=[process.memoryUsage()],cpuStart=process.cpuUsage(),start=performance.now();measuring=true;
for(let tick=0;tick<ticks;tick++){
 ingressSeconds+=1/30;
 for(const[i,id]of ids.entries()){const phase=Math.floor(tick/90)%4;room.receive(id,JSON.stringify({type:'input',sequence:++sequence,input:{x:i%2===0?(phase===0?.25:phase===2?-.25:0):0,z:i%2===1?(phase===1?.25:phase===3?-.25:0):0,jump:false}}));}
 time('productionRoomStep',()=>room.step());drain();if(tick%30===0)memory.push(process.memoryUsage());await setImmediate();
}
const elapsedMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);measuring=false;const {profile}=await inspector.post('Profiler.stop');inspector.disconnect();await setImmediate();observer.disconnect();
const sampleTime=new Map<number,number>();for(const[i,id]of(profile.samples??[]).entries())sampleTime.set(id,(sampleTime.get(id)??0)+(profile.timeDeltas?.[i]??0));
const functionTotals=new Map<string,{function:string;file:string;line:number;selfMs:number}>();
for(const node of profile.nodes){const frame=node.callFrame,key=JSON.stringify([frame.functionName,frame.url,frame.lineNumber,frame.columnNumber]),row=functionTotals.get(key)??{function:frame.functionName,file:frame.url,line:frame.lineNumber+1,selfMs:0};row.selfMs+=(sampleTime.get(node.id)??0)/1000;functionTotals.set(key,row);}
const topFunctions=[...functionTotals.values()].sort((a,b)=>b.selfMs-a.selfMs).slice(0,35);
const saveDigest=snapshotDigest(room.authority.save());
const sourceFiles=['src/game/voxel/model.ts','src/networking/fluid-wire.ts','src/networking/snapshot-wire.ts','src/networking/authority-room.ts'];
const sourceDigest=createHash('sha256');for(const file of sourceFiles)sourceDigest.update(file).update(await readFile(new URL('../'+file,import.meta.url)));
const beforeFinalGc=process.memoryUsage();globalThis.gc?.();const afterFinalGc=process.memoryUsage();
const sum=(values:readonly number[])=>values.reduce((a,b)=>a+b,0),result={method:'Real four-player production authority; synchronous transport and 30Hz virtual ingress clock; combined mode includes separate client decode, exact checks, and soak JSON byte accounting; server-only omits all three. Inclusive subphase timers overlap. Node process includes profiling overhead; no persistence/socket/Workers/browser/device claim',checkpoint:process.argv[4]??null,mode,sourceHash:sourceDigest.digest('hex'),saveDigest,exactStateChecks,ticks,players:4,initializationMs,elapsedMs,cpu,stepsPerMeasuredWorkSecond:ticks/(sum(metrics.get('productionRoomStep')!)/1000),bytes,frames,accountedBytes,world:{water:room.authority.sim.fluid.cells.size,resources:room.authority.sim.adventure.state.resources.length,enemies:room.authority.sim.adventure.state.enemies.length,edits:room.authority.sim.world.edits.length},phases:Object.fromEntries([...metrics].map(([name,values])=>[name,{...distribution(values),totalMs:sum(values)}])),gc:{count:gc.length,totalMs:sum(gc.map(g=>g.duration)),maxMs:Math.max(0,...gc.map(g=>g.duration)),byKind:gc.reduce((out,g)=>({...out,[g.kind]:(out[g.kind]??0)+g.duration}),{} as Record<number,number>)},nodeMemory:{explicitGc,beforeFinalGc,afterFinalGc,rss:distribution(memory.map(m=>m.rss)),heapUsed:distribution(memory.map(m=>m.heapUsed)),final:process.memoryUsage()},topFunctions};
await writeFile(output+'.cpuprofile',JSON.stringify(profile));await writeFile(output+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
