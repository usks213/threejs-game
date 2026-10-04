// Real WebSocket harness for the same authoritative room used in Cloudflare.
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AuthorityRoom, type RoomCheckpoint } from '../../src/networking/authority-room';
export async function startCoopServer(port = 2568, directory?: string) {
 const rooms = new Map<string, AuthorityRoom>(), sockets = new Map<WebSocket, { room: AuthorityRoom; id: string; key: string }>();
 const server = createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({service:'voxel-coop-authority',protocol:1,rooms:rooms.size}));});
 const ws = new WebSocketServer({noServer:true,maxPayload:8192}); let writes=Promise.resolve();
 const persist = (key:string,room:AuthorityRoom) => {
  if(!directory)return Promise.resolve();const text=JSON.stringify(room.checkpoint());
  const op=writes.then(async()=>{await mkdir(directory,{recursive:true});const file=resolve(directory,key+'.json');await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);});writes=op.catch(()=>{});return op;
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
   let pending=loads.get(key);if(!pending){pending=(async()=>{let checkpoint:RoomCheckpoint|null=null;if(directory)try{checkpoint=JSON.parse(await readFile(resolve(directory,key+'.json'),'utf8')) as RoomCheckpoint;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}const room=new AuthorityRoom(checkpoint,crypto.randomUUID());rooms.set(key,room);return room;})();loads.set(key,pending);}
   const room=await pending,id=crypto.randomUUID();if(socket.readyState!==socket.OPEN)return;
   sockets.set(socket,{room,id,key});room.connect(id,{send:packet=>{if(socket.readyState===socket.OPEN)socket.send(JSON.stringify(packet));},close:(code,reason)=>socket.close(code,reason)});
   const receive=(data:unknown)=>{const result=room.receive(id,String(data));if(result.changed)void persist(key,room).then(()=>result.acknowledgment?.()).catch(()=>room.notice('保存に失敗しました'));};
   socket.off('message',queue);socket.on('message',receive);for(const data of early)receive(data);
   socket.on('close',()=>{sockets.delete(socket);room.disconnect(id);void persist(key,room);});
  }catch{socket.close(1011,'Room load failed');}
 });
 const timer=setInterval(()=>{for(const room of rooms.values())if(room.size)room.step();},1000/30);
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {rooms,port:(server.address() as {port:number}).port,async close(){clearInterval(timer);for(const [socket,value]of sockets){value.room.disconnect(value.id);socket.terminate();}await Promise.all([...rooms].map(([key,room])=>persist(key,room)));await writes;await new Promise<void>(r=>ws.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=await startCoopServer(Number(process.env.COOP_PORT??2568),process.env.COOP_SAVE_DIRECTORY);console.log(`Coop authority listening on 127.0.0.1:${server.port}`);for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit());});}
