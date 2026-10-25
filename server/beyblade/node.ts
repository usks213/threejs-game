import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './manager';
import type { ManagerOptions, Transport } from './manager';
export interface ServerOptions extends ManagerOptions { port?:number;host?:string;allowedOrigins?:string[];staticDirectory?:string }
export async function createArenaServer(options:ServerOptions={}) {
  const manager=new RoomManager(options);const staticRoot=resolve(options.staticDirectory??'dist');
  const server=createServer(async(req,res)=>{
    let url:URL;try{url=new URL(req.url??'/','http://localhost');}catch{res.writeHead(400);res.end();return;}
    if(url.pathname==='/api/beyblade/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({service:'beyblade-authoritative',version:1,online:true}));return;}
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    let pathname:string;try{pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
    const file=resolve(staticRoot,`.${pathname.endsWith('/')?`${pathname}index.html`:pathname}`);
    if(!file.startsWith(staticRoot+sep)){res.writeHead(403);res.end();return;}
    try{const data=await readFile(file);const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
  });
  const wsServer=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    let url:URL;try{url=new URL(request.url??'/','http://localhost');}catch{socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');socket.destroy();return;}
    const origin=request.headers.origin; const sameOrigin=origin===`http://${request.headers.host}`||origin===`https://${request.headers.host}`;
    const localOrigins=['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173'];
    if(url.pathname!=='/api/beyblade'||(origin&&!sameOrigin&&![...localOrigins,...(options.allowedOrigins??[])].includes(origin))){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wsServer.handleUpgrade(request,socket,head,ws=>{
      const transport:Transport={send:msg=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>512_000){ws.close(1013,'slow client');return;}ws.send(JSON.stringify(msg));}},close:()=>ws.close(1000,'session closed')};
      const token=manager.connect(transport,url.searchParams.get('resume')??undefined);if(!token)return;
      ws.on('message',(data,isBinary)=>{if(isBinary){ws.close(1003,'text required');return;}manager.receive(token,data.toString(),transport);});
      ws.on('close',()=>manager.disconnect(token,transport));ws.on('error',()=>manager.disconnect(token,transport));
    });
  });
  const ticker=setInterval(()=>manager.tick(),1000/60);
  try{await new Promise<void>((resolveListen,reject)=>{server.once('error',reject);server.listen(options.port??8787,options.host??'127.0.0.1',()=>{server.off('error',reject);resolveListen();});});}catch(error){clearInterval(ticker);wsServer.close();manager.dispose();throw error;}
  return {server,manager,address:server.address(),close:async()=>{clearInterval(ticker);manager.dispose();for(const ws of wsServer.clients)ws.terminate();await new Promise<void>(resolveClose=>wsServer.close(()=>resolveClose()));await new Promise<void>((resolveClose,reject)=>server.close(error=>error?reject(error):resolveClose()));}};
}
