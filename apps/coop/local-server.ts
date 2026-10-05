import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import {validateCheckpoint} from '../../src/save/checkpoint';
import {encodeRoomAccess,decodeRoomAccess,overlayRoomAccess} from '../../src/save/room-access';
import { authenticateCoopPacket } from '../../src/networking/coop-identity';
// Real WebSocket harness for the same authoritative room used in Cloudflare.
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AuthorityRoom, type RoomCheckpoint } from '../../src/networking/authority-room';
export async function startCoopServer(port = 2568, directory?: string) {
 const rooms = new Map<string, AuthorityRoom>(), sockets = new Map<WebSocket, { room: AuthorityRoom; id: string; key: string }>();
 const server = createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({service:'voxel-coop-authority',protocol:COOP_PROTOCOL,rooms:rooms.size}));});
 const ws = new WebSocketServer({noServer:true,maxPayload:8192}); let writes=Promise.resolve();
 const persist = async (key:string,room:AuthorityRoom) => {
  if(room.readOnly)return Promise.reject(new Error('Room reload required'));if(!directory)return Promise.resolve();const checkpoint=validateCheckpoint(room.checkpoint()),text=JSON.stringify(checkpoint);
  const op=writes.then(async()=>{if(room.readOnly)throw Error('Room reload required');await mkdir(directory,{recursive:true});const file=resolve(directory,key+'.json');try{await readFile(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);}if(checkpoint.access){const accessFile=file+'.access';await writeFile(accessFile+'.tmp',JSON.stringify(await encodeRoomAccess(checkpoint.access)));await rename(accessFile+'.tmp',accessFile);}await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);});writes=op.catch(()=>{});return op;
 };
 server.on('upgrade',(request,socket,head)=>{
  const match=request.url?.match(/^\/coop\/([a-f0-9]{48})$/);if(!match){socket.destroy();return;}
  ws.handleUpgrade(request,socket,head,client=>ws.emit('connection',client,match[1]));
 });
 const loads=new Map<string,Promise<AuthorityRoom>>();
 ws.on('connection',async(socket:WebSocket,key:string)=>{
  // Queue packets arriving while the persistent world loads, including hello.
  const early:string[]=[];const queue=(data:unknown)=>early.push(String(data));socket.on('message',queue);
  try {
   let pending=loads.get(key);if(!pending){pending=(async()=>{let checkpoint:RoomCheckpoint|null=null;if(directory)try{checkpoint=validateCheckpoint(JSON.parse(await readFile(resolve(directory,key+'.json'),'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(directory){try{const access=await decodeRoomAccess(JSON.parse(await readFile(resolve(directory,key+'.json.access'),'utf8')));if(!checkpoint)throw Error('World checkpoint is missing');checkpoint=overlayRoomAccess(checkpoint,access);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}const room=new AuthorityRoom(checkpoint,crypto.randomUUID());rooms.set(key,room);return room;})();loads.set(key,pending);}
   const room=await pending,id=crypto.randomUUID();if(socket.readyState!==socket.OPEN)return;
   sockets.set(socket,{room,id,key});room.connect(id,{send:(packet,serialized)=>{if(socket.readyState===socket.OPEN)socket.send(serialized??JSON.stringify(packet));},close:(code,reason)=>socket.close(code,reason)});
   const failed=()=>{if(room.readOnly)return;room.failPersistence();void writes.finally(()=>{if(rooms.get(key)===room){rooms.delete(key);loads.delete(key);}});};
   let processing=Promise.resolve();const receive=(data:unknown)=>{processing=processing.then(async()=>{const verified=await authenticateCoopPacket(String(data)),result=room.receive(id,verified.text,verified.playerId);if(result.changed)void persist(key,room).then(()=>result.acknowledgment?.()).catch(failed);else result.acknowledgment?.();}).catch(()=>socket.close(1008,'Invalid handshake'));};
   socket.off('message',queue);socket.on('message',receive);for(const data of early)receive(data);
   socket.on('close',()=>{sockets.delete(socket);room.disconnect(id);if(!room.readOnly)void persist(key,room).catch(failed);});
  }catch{if(!rooms.has(key))loads.delete(key);socket.close(1011,'Room load failed');}
 });
 const timer=setInterval(()=>{for(const room of rooms.values())if(room.size)room.step();},1000/30);
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {rooms,port:(server.address() as {port:number}).port,async close(){clearInterval(timer);for(const [socket,value]of sockets){value.room.disconnect(value.id);socket.terminate();}await Promise.all([...rooms].filter(([,room])=>!room.readOnly).map(([key,room])=>persist(key,room)));await writes;await new Promise<void>(r=>ws.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=await startCoopServer(Number(process.env.COOP_PORT??2568),process.env.COOP_SAVE_DIRECTORY);console.log(`Coop authority listening on 127.0.0.1:${server.port}`);for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit());});}
