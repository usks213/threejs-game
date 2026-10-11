import {SnapshotWireEncoder} from '../../src/networking/snapshot-wire';
import {encodeCompactFluidDelta} from '../../src/networking/compact-fluid';
import type {FluidDelta} from '../../src/networking/fluid-wire';
import {it,expect,vi,afterEach} from 'vitest';
import {CoopClient,type ConnectionState} from '../../src/networking/coop-client';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
class Socket{
 static OPEN=1;static CONNECTING=0;static all:Socket[]=[];readyState=0;sent:string[]=[];onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onclose:((e:{code:number})=>void)|null=null;onerror:(()=>void)|null=null;
 constructor(readonly url:string){Socket.all.push(this);}
 send(s:string){this.sent.push(s);}close(){this.readyState=2;/* Deliberate black hole: no close callback. */}
 open(){this.readyState=1;this.onopen?.();}welcome(){this.onmessage?.({data:JSON.stringify({type:'welcome',protocol:COOP_PROTOCOL,playerId:'same-player',epoch:'epoch',save:{},state:{ack:0,fluids:[]}})});}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();Socket.all=[];});
function setup(){vi.useFakeTimers();const events=new EventTarget(),storage=new Map<string,string>(),states:ConnectionState[]=[],notices:string[]=[];let online=true;vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('window',events);vi.stubGlobal('navigator',{get onLine(){return online;}});vi.stubGlobal('sessionStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});const packets:import('../../src/networking/coop-protocol').CoopServerPacket[]=[];const client=new CoopClient('a'.repeat(48),packet=>packets.push(packet),s=>states.push(s),s=>notices.push(s),'https://game.example');client.connect();Socket.all[0].open();Socket.all[0].welcome();return {client,states,events,notices,packets,setOnline:(value:boolean)=>online=value};}
it('exits online immediately on offline without waiting for a WebSocket close and restores the same resume key',()=>{const s=setup(),first=Socket.all[0],key=JSON.parse(first.sent[0]).resumeKey;s.setOnline(false);s.events.dispatchEvent(new Event('offline'));expect(s.states.at(-1)).toBe('reconnecting');expect(s.client.input({x:1,z:0,jump:false})).toBeNull();s.client.action({type:'action',tool:'dig',target:{x:1,y:1,z:1}});expect(s.notices.at(-1)).toContain('再接続');vi.advanceTimersByTime(20000);expect(Socket.all).toHaveLength(1);s.setOnline(true);s.events.dispatchEvent(new Event('online'));Socket.all[1].open();expect(JSON.parse(Socket.all[1].sent[0]).resumeKey).toBe(key);Socket.all[1].welcome();expect(s.states.at(-1)).toBe('online');s.client.disconnect();});
it('heartbeat forcibly retires a silent open socket even if closing never completes, ignoring stale replies',()=>{const s=setup(),old=Socket.all[0];vi.advanceTimersByTime(15001);expect(s.states.at(-1)).toBe('reconnecting');old.welcome();expect(s.states.at(-1)).toBe('reconnecting');vi.advanceTimersByTime(500);expect(Socket.all).toHaveLength(2);s.client.disconnect();s.events.dispatchEvent(new Event('online'));expect(Socket.all).toHaveLength(2);});
it('replays only an unacknowledged command with the original id and stops replaying after its server receipt',()=>{const s=setup();s.client.action({type:'action',tool:'dig',expectedRevision:0,target:{x:5,y:1,z:8}});const command=JSON.parse(Socket.all[0].sent.at(-1)!);s.setOnline(false);s.events.dispatchEvent(new Event('offline'));s.setOnline(true);s.events.dispatchEvent(new Event('online'));Socket.all[1].open();Socket.all[1].welcome();const replay=Socket.all[1].sent.map(text=>JSON.parse(text)).find(p=>p.type==='action');expect(replay.commandId).toBe(command.commandId);Socket.all[1].onmessage?.({data:JSON.stringify({type:'ack',commandId:command.commandId,accepted:true,message:'保存済み'})});s.setOnline(false);s.events.dispatchEvent(new Event('offline'));s.setOnline(true);s.events.dispatchEvent(new Event('online'));Socket.all[2].open();Socket.all[2].welcome();expect(Socket.all[2].sent.map(text=>JSON.parse(text)).some(p=>p.type==='action')).toBe(false);s.client.disconnect();});
it('pauses gameplay for pending administration and replays an unacknowledged management command without changing its identity',()=>{
 const s=setup(),socket=Socket.all[0];socket.onmessage?.({data:JSON.stringify({type:'room-access',access:{canManage:true,locked:false,revision:3,pending:false,readOnly:false,members:[]}})});expect(s.client.admin('lock')).toBe(true);expect(s.client.adminPending).toBe(true);expect(s.client.input({x:1,z:0,jump:false})).toBeNull();expect(s.client.admin('unlock')).toBe(false);const first=socket.sent.map(x=>JSON.parse(x)).find(p=>p.type==='room-admin');s.setOnline(false);s.events.dispatchEvent(new Event('offline'));s.setOnline(true);s.events.dispatchEvent(new Event('online'));Socket.all[1].open();Socket.all[1].welcome();const replay=Socket.all[1].sent.map(x=>JSON.parse(x)).find(p=>p.type==='room-admin');expect(replay).toEqual(first);Socket.all[1].onmessage?.({data:JSON.stringify({type:'ack',kind:'room-admin',commandId:first.commandId,accepted:true,message:'保存しました'})});Socket.all[1].onmessage?.({data:JSON.stringify({type:'room-access',access:{canManage:true,locked:true,revision:4,pending:false,readOnly:false,members:[]}})});expect(s.client.adminPending).toBe(false);expect(s.client.input({x:0,z:0,jump:false})).not.toBeNull();s.client.disconnect();
});
it('does not reconnect automatically after a ban, a new-player lock or a kick',()=>{
 for(const code of [4003,4004,4005]){const s=setup();Socket.all[0].onclose?.({code});expect(s.states.at(-1)).toBe('closed');vi.advanceTimersByTime(30000);expect(Socket.all).toHaveLength(1);s.events.dispatchEvent(new Event('online'));expect(Socket.all).toHaveLength(1);s.client.disconnect();vi.useRealTimers();vi.unstubAllGlobals();Socket.all=[];}
});

it('reconstructs exact water before delivery and requests a complete resync on a delta gap',()=>{const s=setup(),socket=Socket.all[0];const encoder=new SnapshotWireEncoder();encoder.reset({ack:0,fluids:[]});const frame=(water:FluidDelta)=>socket.onmessage?.({data:JSON.stringify({type:'delta',epoch:'epoch',tick:3,state:encoder.encode({ack:0,tick:3,fluids:[]}),editBase:0,edits:[],water:encodeCompactFluidDelta(water)})});frame({base:0,revision:1,count:1,changed:[[0,0,0,.5,.125,0,1,0,0]],removed:[]});const packet=s.packets.at(-1);expect(packet?.type).toBe('frame');if(packet?.type==='frame')expect(packet.state.fluids).toEqual([{x:0,y:0,z:0,size:.5,volume:.125,bottom:0,vx:1,vz:0,frozen:false}]);frame({base:2,revision:3,count:0,changed:[],removed:[]});expect(s.states.at(-1)).toBe('syncing');expect(JSON.parse(socket.sent.at(-1)!).type).toBe('resync');expect(s.client.input({x:1,z:0,jump:false})).toBeNull();socket.welcome();encoder.reset({ack:0,fluids:[]});frame({base:0,revision:1,count:0,changed:[],removed:[]});expect(s.states.at(-1)).toBe('online');const fresh=s.packets.at(-1);if(fresh?.type==='frame')expect(fresh.state.fluids).toEqual([]);s.client.disconnect();});
it('does not mistake pong traffic for a progressing world snapshot',()=>{const s=setup(),socket=Socket.all[0];for(let i=0;i<5;i++){vi.advanceTimersByTime(2900);socket.onmessage?.({data:JSON.stringify({type:'pong'})});}vi.advanceTimersByTime(600);expect(s.states.at(-1)).toBe('reconnecting');expect(s.client.input({x:1,z:0,jump:false})).toBeNull();s.client.disconnect();});
it('acknowledges a received complete welcome with its unpredictable delivery token',()=>{const s=setup(),socket=Socket.all[0],token=crypto.randomUUID();socket.onmessage?.({data:JSON.stringify({type:'welcome',protocol:COOP_PROTOCOL,playerId:'same-player',epoch:'epoch',delivery:token,save:{},state:{ack:0,fluids:[]}})});expect(socket.sent.map(t=>JSON.parse(t))).toContainEqual({type:'delivery',token});s.client.disconnect();});
it('continues the durable action sequence across reconnect without renumbering pending commands',()=>{const s=setup(),first=Socket.all[0];const welcome=(socket:Socket,actionSequence:number)=>socket.onmessage?.({data:JSON.stringify({type:'welcome',protocol:COOP_PROTOCOL,playerId:'same-player',epoch:'epoch',actionSequence,save:{},state:{ack:0,fluids:[]}})});welcome(first,300);s.client.action({type:'game-action',action:'sprint',aim:{x:0,y:0,z:1}});const original=JSON.parse(first.sent.at(-1)!);expect(original.commandId).toMatch(/^seq_301_/);s.setOnline(false);s.events.dispatchEvent(new Event('offline'));s.setOnline(true);s.events.dispatchEvent(new Event('online'));const second=Socket.all[1];second.open();welcome(second,301);expect(second.sent.map(text=>JSON.parse(text)).find(p=>p.type==='action').commandId).toBe(original.commandId);s.client.action({type:'game-action',action:'sprint',aim:{x:0,y:0,z:1}});expect(JSON.parse(second.sent.at(-1)!).commandId).toMatch(/^seq_302_/);s.client.disconnect();});
it('keeps input numbers monotonic across a same-epoch baseline and resets them for a new authority epoch',()=>{
 const s=setup(),socket=Socket.all[0],input={x:1,z:0,jump:false};expect(s.client.input(input)).toBe(1);expect(s.client.input(input)).toBe(2);expect(s.client.input(input)).toBe(3);
 const welcome=(epoch:string,ack:number)=>socket.onmessage?.({data:JSON.stringify({type:'welcome',protocol:COOP_PROTOCOL,playerId:'same-player',epoch,save:{},state:{ack,fluids:[]}})});
 welcome('epoch',1);expect(s.client.input(input)).toBe(4);expect(JSON.parse(socket.sent.at(-1)!).sequence).toBe(4);
 welcome('epoch',8);expect(s.client.input(input)).toBe(9);
 welcome('restarted-authority',0);expect(s.client.input(input)).toBe(1);expect(JSON.parse(socket.sent.at(-1)!).sequence).toBe(1);s.client.disconnect();
});
it('reports resync refusal without queueing or later replaying the refused click',()=>{
 const s=setup(),socket=Socket.all[0],action={type:'game-action',action:'sky-share',id:'1:on',aim:{x:0,y:0,z:1}} as const;
 s.client.resync();expect(s.client.action(action)).toEqual({status:'refused',reason:'offline'});
 socket.welcome();expect(socket.sent.map(text=>JSON.parse(text)).filter(packet=>packet.type==='action')).toEqual([]);
 const result=s.client.action(action);expect(result.status).toBe('queued');if(result.status==='queued')expect(JSON.parse(socket.sent.at(-1)!).commandId).toBe(result.commandId);s.client.disconnect();
});
it('returns the pending command identity even when transport delivery is delayed',()=>{
 const s=setup(),socket=Socket.all[0],action={type:'game-action',action:'sky-share',id:'1:on',aim:{x:0,y:0,z:1}} as const;
 vi.spyOn(socket,'send').mockImplementationOnce(()=>{});const result=s.client.action(action);expect(result.status).toBe('queued');
 expect(socket.sent.map(text=>JSON.parse(text)).some(packet=>packet.type==='action')).toBe(false);
 s.client.resync();socket.welcome();const replay=JSON.parse(socket.sent.at(-1)!);expect(replay).toMatchObject({type:'action',message:action});if(result.status==='queued')expect(replay.commandId).toBe(result.commandId);
 socket.onmessage?.({data:JSON.stringify({type:'ack',commandId:replay.commandId,accepted:true,message:'共有しました'})});
 const sent=socket.sent.length;socket.welcome();expect(socket.sent).toHaveLength(sent);s.client.disconnect();
});
it('keeps a queued command for exact-ID replay if its online socket is already closing',()=>{
 const s=setup(),socket=Socket.all[0];socket.readyState=2;
 const result=s.client.action({type:'game-action',action:'sky-share',id:'1:on',aim:{x:0,y:0,z:1}});expect(result.status).toBe('queued');expect(s.states.at(-1)).toBe('reconnecting');
 vi.advanceTimersByTime(500);const replacement=Socket.all[1];replacement.open();replacement.welcome();
 const actions=replacement.sent.map(text=>JSON.parse(text)).filter(packet=>packet.type==='action');expect(actions).toHaveLength(1);if(result.status==='queued')expect(actions[0].commandId).toBe(result.commandId);s.client.disconnect();
});
it('identifies administration, read-only and full-queue refusals without allocating commands',()=>{
 const s=setup(),socket=Socket.all[0],action={type:'game-action',action:'sky-share',id:'1:on',aim:{x:0,y:0,z:1}} as const;
 const access=(pending:boolean,readOnly:boolean)=>socket.onmessage?.({data:JSON.stringify({type:'room-access',access:{canManage:true,locked:false,revision:3,pending,readOnly,members:[]}})});
 access(true,false);expect(s.client.action(action)).toEqual({status:'refused',reason:'room-busy'});
 access(false,true);expect(s.client.action(action)).toEqual({status:'refused',reason:'read-only'});
 access(false,false);expect(s.client.admin('lock')).toBe(true);expect(s.client.action(action)).toEqual({status:'refused',reason:'room-busy'});
 const admin=JSON.parse(socket.sent.at(-1)!);socket.onmessage?.({data:JSON.stringify({type:'ack',kind:'room-admin',commandId:admin.commandId,accepted:true,message:'保存しました'})});
 expect(socket.sent.map(text=>JSON.parse(text)).filter(packet=>packet.type==='action')).toEqual([]);
 const results=Array.from({length:64},()=>s.client.action(action));expect(results.every(result=>result.status==='queued')).toBe(true);
 const sent=socket.sent.length;expect(s.client.action(action)).toEqual({status:'refused',reason:'backpressure'});expect(socket.sent).toHaveLength(sent);
 const first=results[0];if(first.status==='queued')socket.onmessage?.({data:JSON.stringify({type:'ack',commandId:first.commandId,accepted:true,message:'共有しました'})});
 expect(s.client.action(action).status).toBe('queued');s.client.disconnect();
});
it('gives a fresh resync its own deadline after a long healthy socket instead of closing before a delayed welcome',()=>{
 const s=setup(),socket=Socket.all[0];expect(s.client.input({x:0,z:0,jump:false})).toBe(1);
 // Keep the world healthy well beyond the initial 15-second handshake budget.
 for(let i=0;i<13;i++){vi.advanceTimersByTime(2900);socket.welcome();}
 vi.advanceTimersByTime(1290);s.client.resync();expect(s.states.at(-1)).toBe('syncing');
 // The next 3-second heartbeat is only 10ms away. The delayed full baseline
 // must still be admitted through this same live socket and authority epoch.
 vi.advanceTimersByTime(10);expect(socket.readyState).toBe(Socket.OPEN);expect(s.states.at(-1)).toBe('syncing');
 vi.advanceTimersByTime(90);socket.welcome();expect(s.states.at(-1)).toBe('online');expect(Socket.all).toHaveLength(1);
 expect(s.client.input({x:0,z:0,jump:false})).toBe(2);s.client.disconnect();
});
it('still expires one stalled resync despite repeated requests and fresh pong traffic',()=>{
 const s=setup(),socket=Socket.all[0];for(let i=0;i<6;i++){vi.advanceTimersByTime(2900);socket.welcome();}
 s.client.resync();for(let i=0;i<5;i++){vi.advanceTimersByTime(2900);socket.onmessage?.({data:JSON.stringify({type:'pong'})});s.client.resync();}
 vi.advanceTimersByTime(1101);expect(s.states.at(-1)).toBe('reconnecting');expect(socket.readyState).not.toBe(Socket.OPEN);
 expect(s.client.input({x:1,z:0,jump:false})).toBeNull();s.client.disconnect();
});
