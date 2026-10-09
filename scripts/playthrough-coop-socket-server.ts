/** Test-only deterministic clock around the production AuthorityRoom and wire protocol.
 * IPC can advance time, persist, or stop. Gameplay always arrives over WebSocket;
 * there is deliberately no IPC operation for setting world or player state. */
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {mkdir,open,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WebSocketServer,type WebSocket} from 'ws';
import {AuthorityRoom} from '../src/networking/authority-room';
import {authenticateCoopPacket} from '../src/networking/coop-identity';
import {COOP_PROTOCOL} from '../src/networking/coop-protocol';
import {sessionFrame} from '../src/networking/frame';
import {validateCheckpoint} from '../src/save/checkpoint';
import {snapshotDigest,fluidDigest} from './soak-coop-common';

const directory=process.argv[2],roomId=process.argv[3];
if(!directory||!roomId||!/^[a-f0-9]{48}$/.test(roomId)||!process.send)throw Error('Supply save directory and room ID, with IPC');
const file=resolve(directory,roomId+'.json');
await mkdir(directory,{recursive:true});
let checkpoint=null;
try{checkpoint=validateCheckpoint(JSON.parse(await readFile(file,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
function runtimeHash():string{const hash=createHash('sha256');const walk=(path:string)=>{for(const name of readdirSync(path).sort()){const file=resolve(path,name);if(statSync(file).isDirectory())walk(file);else if(file.endsWith('.ts')){hash.update(file.slice(process.cwd().length));hash.update(readFileSync(file));}}};walk(resolve('src'));for(const path of ['package.json','package-lock.json'])hash.update(readFileSync(path));return hash.digest('hex');}
const sourceHash=runtimeHash(),room=new AuthorityRoom(checkpoint,randomUUID(),roomId);
const http=createServer((_request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({service:'deterministic-coop-playthrough',protocol:COOP_PROTOCOL}));});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
interface Connection {id:string;socket:WebSocket;playerId?:string;receivedSequence:number;processing:Promise<void>}
const connections=new Map<string,Connection>();
let frames=0,actions=0,received=0,closing=false,fatal:Error|undefined,writes=Promise.resolve();
const emit=(event:Record<string,unknown>)=>process.send?.(event);
function fail(error:unknown){fatal=error instanceof Error?error:Error(String(error));emit({kind:'fatal',message:fatal.message});}
async function persist(){
 const text=JSON.stringify(validateCheckpoint(room.checkpoint()));
 const operation=writes.then(async()=>{await writeFile(file+'.tmp',text);const handle=await open(file+'.tmp','r+');try{await handle.sync();}finally{await handle.close();}await rename(file+'.tmp',file);const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}});
 writes=operation.catch(()=>{});await operation;
}
http.on('upgrade',(request,socket,head)=>{if(request.url!==`/coop/${roomId}`){socket.destroy();return;}wss.handleUpgrade(request,socket,head,client=>wss.emit('connection',client));});
wss.on('connection',(socket:WebSocket)=>{
 const connection:Connection={id:randomUUID(),socket,receivedSequence:0,processing:Promise.resolve()};connections.set(connection.id,connection);
 room.connect(connection.id,{
  close:(code,reason)=>socket.close(code,reason),
  send:(packet,serialized)=>{
   if(packet.type==='welcome'||packet.type==='delta'){
    const playerId=packet.type==='welcome'?packet.playerId:connection.playerId;
    if(playerId){const reference=sessionFrame(room.authority,playerId);emit({kind:'frame-reference',epoch:room.epoch,playerId,packetKind:packet.type,tick:reference.tick,waterRevision:packet.type==='delta'?packet.water.revision:0,snapshotHash:snapshotDigest(reference),waterHash:fluidDigest(reference.fluids)});frames++;}
   }
   if(socket.readyState===socket.OPEN)socket.send(serialized??JSON.stringify(packet));
  }
 });
 socket.on('message',data=>{
  connection.processing=connection.processing.then(async()=>{
   const verified=await authenticateCoopPacket(String(data));if(verified.playerId)connection.playerId=verified.playerId;
   const packet=JSON.parse(verified.text) as {type:string;sequence?:number};received++;
   const result=room.receive(connection.id,verified.text,verified.playerId);
   if(packet.type==='input'&&Number.isSafeInteger(packet.sequence))connection.receivedSequence=packet.sequence!;
   if(packet.type==='action')actions++;
   if(result.changed)await persist();result.acknowledgment?.();
  }).catch(error=>{fail(error);socket.close(1011,'Playthrough failed');});
 });
 socket.on('close',()=>{connections.delete(connection.id);room.disconnect(connection.id);});
 socket.on('error',fail);
});
interface Command {id:number;type:'step'|'checkpoint'|'stop';tick?:number;expectedInputs?:{playerId:string;sequence:number}[];expectedPlayers?:string[]}
let controls=Promise.resolve();
process.on('message',raw=>{
 const command=raw as Command;
 controls=controls.then(async()=>{
  if(fatal)throw fatal;
  if(command.type==='step'){
   const deadline=performance.now()+10000;
   while(!(command.expectedInputs??[]).every(expected=>[...connections.values()].some(c=>c.playerId===expected.playerId&&c.receivedSequence>=expected.sequence))){if(fatal)throw fatal;if(performance.now()>deadline)throw Error('Inputs did not arrive before deterministic step');await new Promise<void>(r=>setTimeout(r,1));}
   await Promise.all([...connections.values()].map(c=>c.processing));
   if(command.tick!==room.authority.sim.tick)throw Error(`Trace tick ${command.tick} differs from server tick ${room.authority.sim.tick}`);
   room.step();
   emit({kind:'reply',id:command.id,tick:room.authority.sim.tick});
  }else if(command.type==='checkpoint'){
   if(command.expectedPlayers){const expected=command.expectedPlayers,deadline=performance.now()+10000;while(room.authority.actors.size!==expected.length+1||!expected.every(id=>room.authority.actors.has(id))){if(performance.now()>deadline)throw Error('Connection membership barrier timed out');await new Promise<void>(r=>setTimeout(r,1));}}
   await Promise.all([...connections.values()].map(c=>c.processing));await persist();
   emit({kind:'reply',id:command.id,tick:room.authority.sim.tick,file,frames,actions,received});
  }else if(command.type==='stop'){
   if(closing)return;closing=true;await Promise.all([...connections.values()].map(c=>c.processing));await persist();
   for(const c of connections.values())c.socket.terminate();
   await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>http.close(()=>r()));
   emit({kind:'reply',id:command.id,tick:room.authority.sim.tick,frames,actions,received});process.disconnect?.();
  }else throw Error('Unsupported deterministic clock command');
 }).catch(error=>{fail(error);emit({kind:'reply',id:command.id,error:String(error)});});
});
try{
 await new Promise<void>((done,reject)=>{http.once('error',reject);http.listen(0,'127.0.0.1',done);});
 emit({kind:'ready',port:(http.address() as {port:number}).port,protocol:COOP_PROTOCOL,epoch:room.epoch,tick:room.authority.sim.tick,resumed:!!checkpoint,pid:process.pid,sourceHash});
}catch(error){emit({kind:'startup-error',message:String(error),code:(error as NodeJS.ErrnoException).code});process.exitCode=1;process.disconnect?.();}
