import { RoomManager } from './manager';
import type { Transport } from './manager';
// Minimal structural interfaces keep Cloudflare globals out of the browser app.
interface Socket { accept():void;send(data:string):void;close(code?:number,reason?:string):void;addEventListener(type:'message',listener:(event:{data:unknown})=>void):void;addEventListener(type:'close'|'error',listener:()=>void):void }
interface Stub { fetch(request:Request):Promise<Response> }
interface Env { ARENA: { idFromName(name:string):unknown;get(id:unknown):Stub };ASSETS:{fetch(request:Request):Promise<Response>} }
interface DurableState { blockConcurrencyWhile<T>(callback:()=>Promise<T>):Promise<T> }
declare const WebSocketPair: {new():{0:Socket;1:Socket}};
/** Separate PR7-only SQLite DO namespace; no production Worker bindings are used. */
export class BeybladeArena {
  private manager=new RoomManager();private timer:ReturnType<typeof setInterval>|null=null;private active=0;
  constructor(_state:DurableState,_env:Env){}
  async fetch(request:Request):Promise<Response>{
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const url=new URL(request.url);const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return new Response('Origin denied',{status:403});
    const pair=new WebSocketPair();const [client,server]=[pair[0],pair[1]];server.accept();this.active++;
    if(!this.timer)this.timer=setInterval(()=>{this.manager.tick();if(this.active===0&&this.manager.rooms.size===0){if(this.timer)clearInterval(this.timer);this.timer=null;}},1000/60);
    const transport:Transport={send:message=>{try{server.send(JSON.stringify(message));}catch{/* close callback handles disconnect */}},close:()=>server.close(1000,'session closed')};
    const token=this.manager.connect(transport,url.searchParams.get('resume')??undefined);let closed=false;
    const disconnect=()=>{if(closed)return;closed=true;this.active--;if(token)this.manager.disconnect(token,transport);};
    server.addEventListener('message',event=>{if(typeof event.data!=='string'||event.data.length>4096){server.close(1009,'message limit');return;}if(token)this.manager.receive(token,event.data,transport);});server.addEventListener('close',disconnect);server.addEventListener('error',disconnect);
    return new Response(null,{status:101,webSocket:client} as ResponseInit);
  }
}
export default {async fetch(request:Request,env:Env){const url=new URL(request.url);if(url.pathname==='/api/beyblade/health')return Response.json({service:'beyblade-authoritative',version:1,online:true});if(url.pathname==='/api/beyblade')return env.ARENA.get(env.ARENA.idFromName('pr7-matchmaking-v1')).fetch(request);return env.ASSETS.fetch(request);}};
