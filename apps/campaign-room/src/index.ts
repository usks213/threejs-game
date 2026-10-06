import {DungeonServer,type DungeonCheckpoint} from '../../../src/dungeon/server';
import {CampaignRelayRoom,validRelayCheckpoint,type RelayCheckpoint} from '../../../src/prototype/network/relay-room';
import {validRoomCode,type ServerPacket} from '../../../src/prototype/network/protocol';
/** Structural runtime types avoid introducing a build dependency in the game. */
interface RelayStorage {get<T>(key:string):Promise<T|undefined>;put(key:string,value:unknown):Promise<void>;setAlarm(time:number):Promise<void>}
interface RelayState {storage:RelayStorage;blockConcurrencyWhile<T>(fn:()=>Promise<T>):Promise<T>}
interface RelayNamespace {idFromName(name:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}}
interface RelayEnvironment {CAMPAIGN_ROOMS:RelayNamespace;PUBLIC_ORIGIN?:string}
interface ServerSocket extends WebSocket {accept():void}
declare const WebSocketPair:{new():{0:WebSocket;1:ServerSocket}};

export default {
 async fetch(request:Request,env:RelayEnvironment){const url=new URL(request.url),match=/^\/campaign-room\/([a-f0-9]{64})$/.exec(url.pathname);if(!match||!validRoomCode(match[1]))return new Response('Not found',{status:404});if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const origin=request.headers.get('Origin');if(!origin||origin!==url.origin&&origin!==env.PUBLIC_ORIGIN)return new Response('Origin denied',{status:403});return env.CAMPAIGN_ROOMS.get(env.CAMPAIGN_ROOMS.idFromName(match[1])).fetch(request);},
};
/** Only identities, permissions, sequence receipts are durable. World snapshots
 * remain in browser-host memory/save; the relay never runs voxel physics. */
export class CampaignRoom {
 private room!:CampaignRelayRoom;private readonly ready:Promise<void>;
 private dungeon: DungeonServer|null=null;private dungeonTimer:ReturnType<typeof setInterval>|null=null;
 private failed=false;private serial:Promise<void>=Promise.resolve();private outbox:(()=>void)[]|null=null;
 constructor(private readonly state:RelayState){this.ready=state.blockConcurrencyWhile(async()=>{const saved=await state.storage.get<RelayCheckpoint>('relay-v1');if(saved&&!validRelayCheckpoint(saved))throw new Error('Relay metadata corrupted; refusing ownership reset');this.room=new CampaignRelayRoom(crypto.randomUUID(),Date.now,saved);const dungeon=await state.storage.get<DungeonCheckpoint>('dungeon-v1');if(dungeon!==undefined)this.dungeon=new DungeonServer({save:checkpoint=>state.storage.put('dungeon-v1',checkpoint)},Date.now,dungeon);});}
 async fetch(request:Request){await this.ready;if(new URL(request.url).pathname.startsWith('/dungeon-room/'))return this.dungeonFetch();if(this.failed)return new Response('Relay unavailable',{status:503});if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const pair=new WebSocketPair(),server=pair[1],id=crypto.randomUUID();server.accept();
  const queue=(fn:()=>void)=>this.outbox?this.outbox.push(fn):fn();
  this.room.connect(id,{send:(packet:ServerPacket)=>queue(()=>{try{server.send(JSON.stringify(packet));}catch{this.room.disconnect(id);}}),close:(code,reason)=>queue(()=>{try{server.close(code,reason);}catch{/* already closed */}})});
  server.addEventListener('message',event=>{if(typeof event.data!=='string'){server.close(1003,'Text packets only');return;}const text=event.data;let type='';try{type=JSON.parse(text)?.type;}catch{/* pure relay reports malformed JSON */}const durable=['hello','command','ack','permission','snapshot-end'].includes(type);this.enqueue(()=>this.room.receive(id,text),durable,server);});
  server.addEventListener('close',()=>this.enqueue(()=>this.room.disconnect(id),true));server.addEventListener('error',()=>this.enqueue(()=>this.room.disconnect(id),true));await this.state.storage.setAlarm(Date.now()+3000);return new Response(null,{status:101,webSocket:pair[0]} as ResponseInit&{webSocket:WebSocket});
 }
 private enqueue(action:()=>void,persist:boolean,socket?:ServerSocket){this.serial=this.serial.then(async()=>{if(this.failed){socket?.close(1011,'Relay persistence unavailable');return;}this.outbox=[];try{action();if(persist)await this.state.storage.put('relay-v1',this.room.checkpoint());const outbound=this.outbox;this.outbox=null;for(const send of outbound)send();}catch{this.failed=true;this.outbox=null;socket?.close(1011,'Relay persistence unavailable');}});}
 private async dungeonFetch(){if(!this.dungeon)this.dungeon=new DungeonServer({save:checkpoint=>this.state.storage.put('dungeon-v1',checkpoint)});const game=this.dungeon,pair=new WebSocketPair(),socket=pair[1],id=crypto.randomUUID();socket.accept();game.connect(id,{send:text=>socket.send(text),close:(code,reason)=>socket.close(code,reason)});socket.addEventListener('message',event=>{if(typeof event.data!=='string'){socket.close(1003,'Text packets only');return;}void game.receive(id,event.data);});socket.addEventListener('close',()=>{void game.disconnect(id);});socket.addEventListener('error',()=>{void game.disconnect(id);});if(!this.dungeonTimer)this.dungeonTimer=setInterval(()=>{void game.tick();if(!game.active&&this.dungeonTimer){clearInterval(this.dungeonTimer);this.dungeonTimer=null;}},100);await this.state.storage.setAlarm(Date.now()+1000);return new Response(null,{status:101,webSocket:pair[0]} as ResponseInit&{webSocket:WebSocket});}
 async alarm(){await this.ready;if(this.dungeon){await this.dungeon.tick();if(this.dungeon.active)await this.state.storage.setAlarm(Date.now()+1000);return;}this.enqueue(()=>this.room.tick(),true);await this.serial;if(this.room.size&&!this.failed)await this.state.storage.setAlarm(Date.now()+3000);}
}
