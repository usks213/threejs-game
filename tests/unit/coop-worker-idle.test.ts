import {afterEach,beforeEach,expect,it,vi} from 'vitest';

interface Checkpoint { value:number; locked:boolean; members:string[] }
interface Packet { type:string; value?:number }
interface Wire { send(packet:Packet,serialized?:string):void; close(code:number,reason:string):void }
interface PendingWrite { checkpoint:Checkpoint; resolve:()=>void; reject:(error:Error)=>void }
const fixture=vi.hoisted(()=>({
 saved:null as Checkpoint|null,rooms:[] as MockRoom[],peers:[] as Peer[],writes:[] as PendingWrite[],reads:0,
 readGate:undefined as Promise<void>|undefined,
}));
vi.mock('cloudflare:workers',()=>({DurableObject:class{constructor(public ctx:unknown,public env:unknown){}}}));
vi.mock('../../src/save/room-storage',()=>({
 readRoom:async()=>{fixture.reads++;await fixture.readGate;return{checkpoint:structuredClone(fixture.saved),recovered:false,revision:fixture.saved?'saved':undefined};},
 writeRoom:async(_storage:unknown,checkpoint:Checkpoint)=>{await new Promise<void>((resolve,reject)=>fixture.writes.push({checkpoint:structuredClone(checkpoint),resolve:()=>{fixture.saved=structuredClone(checkpoint);resolve();},reject}));return'revision';},
}));
vi.mock('../../src/networking/coop-identity',()=>({authenticateCoopPacket:async(text:string)=>({text,playerId:'player'})}));
vi.mock('../../src/networking/authority-room',()=>({AuthorityRoom:class{
 authority={sim:{tick:0}};readOnly=false;value=0;locked=false;members:string[]=[];wires=new Map<string,Wire>();
 constructor(checkpoint:Checkpoint|null){if(checkpoint)Object.assign(this,structuredClone(checkpoint));fixture.rooms.push(this);}
 get size(){return this.wires.size;}
 connect(id:string,wire:Wire){if(this.readOnly){wire.close(1013,'Reload');return;}this.wires.set(id,wire);}
 disconnect(id:string){this.wires.delete(id);}
 receive(id:string,text:string){const wire=this.wires.get(id);if(!wire||this.readOnly)return{changed:false};const packet=JSON.parse(text) as Packet;if(packet.type==='mutate'){this.value=packet.value!;return{changed:true,acknowledgment:()=>wire.send({type:'ack'})};}wire.send({type:'pong'});return{changed:false};}
 step(){this.authority.sim.tick++;}notice(){}checkpoint(){if(this.readOnly)throw Error('Read only');return{value:this.value,locked:this.locked,members:[...this.members]};}
 recordPersistedRevision(){}failPersistence(){if(this.readOnly)return;this.readOnly=true;for(const wire of this.wires.values())wire.close(1011,'Persistence uncertain');}
}}));
interface MockRoom {
 authority:{sim:{tick:number}};readOnly:boolean;value:number;locked:boolean;members:string[];readonly size:number;
 wires:Map<string,Wire>;recordPersistedRevision():void;failPersistence():void;
}
class Peer {
 listeners=new Map<string,(event:{data?:unknown})=>void>();sent:string[]=[];closed:{code:number;reason:string}[]=[];sendFails=false;
 accept(){}send(text:string){if(this.sendFails)throw Error('Closed socket');this.sent.push(text);}close(code:number,reason:string){this.closed.push({code,reason});}
 addEventListener(type:string,listener:(event:{data?:unknown})=>void){this.listeners.set(type,listener);}
 emit(type:string,data?:unknown){this.listeners.get(type)?.({data});}
}
interface WorkerView {
 room:MockRoom|null;loading:Promise<MockRoom>|null;pendingJoins:number;pendingSaves:number;timer:unknown;timing:unknown;
 saves:{request():Promise<void>};fetch(request:Request):Promise<Response>;
}
const request=()=>new Request('https://preview.test/coop/'+'a'.repeat(48),{headers:{Upgrade:'websocket'}});
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
beforeEach(()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});vi.setSystemTime(0);
 fixture.saved=null;fixture.rooms=[];fixture.peers=[];fixture.writes=[];fixture.reads=0;fixture.readGate=undefined;
 vi.stubGlobal('scheduler',{wait:(delay:number,{signal}:{signal:AbortSignal})=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,delay);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});})});
 vi.stubGlobal('WebSocketPair',class{0=new Peer();1=new Peer();constructor(){fixture.peers.push(this[1]);}});
 vi.stubGlobal('Response',class{status:number;constructor(public body:unknown,options:{status:number}){this.status=options.status;}});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules();});
async function setup(join=true){
 const module='../../apps/coop/src/index';const {CoopRoom}=await import(module),pending:Promise<unknown>[]=[];
 const worker=new CoopRoom({storage:{},waitUntil:(promise:Promise<unknown>)=>pending.push(promise)}, {}) as WorkerView;
 if(join)await worker.fetch(request());return{worker,pending};
}
it('releases the room and resolved load only after the final disconnect checkpoint commits',async()=>{
 const{worker,pending}=await setup(),room=worker.room!,loading=worker.loading;room.value=7;room.locked=true;room.members=['owner','guest'];
 fixture.peers[0].emit('close');expect(worker.timer).toBeUndefined();expect(worker.room).toBe(room);expect(worker.loading).toBe(loading);
 await vi.advanceTimersByTimeAsync(80);expect(fixture.writes).toHaveLength(1);expect(worker.room).toBe(room);
 fixture.writes[0].resolve();await Promise.all(pending);expect(worker.room).toBeNull();expect(worker.loading).toBeNull();expect(worker.timing).toBeUndefined();expect(vi.getTimerCount()).toBe(0);
 await worker.fetch(request());expect(fixture.reads).toBe(2);expect(worker.room).not.toBe(room);expect(worker.room).toMatchObject({value:7,locked:true,members:['owner','guest']});
});
it('keeps later queued checkpoints alive after an earlier batch commits',async()=>{
 const{worker,pending}=await setup(),room=worker.room!;fixture.peers[0].emit('message','{"type":"mutate","value":1}');await settle();await vi.advanceTimersByTimeAsync(80);
 room.value=2;fixture.peers[0].emit('close');expect(worker.pendingSaves).toBe(2);fixture.writes[0].resolve();await settle();expect(worker.room).toBe(room);expect(worker.pendingSaves).toBe(1);
 await vi.advanceTimersByTimeAsync(80);expect(fixture.writes).toHaveLength(2);expect(fixture.writes[1].checkpoint.value).toBe(2);
 fixture.writes[1].resolve();await Promise.all(pending);expect(worker.room).toBeNull();expect(fixture.saved?.value).toBe(2);
});
it('retains the active generation when a peer rejoins during its delayed final write',async()=>{
 const{worker,pending}=await setup(),room=worker.room!;fixture.peers[0].emit('close');await vi.advanceTimersByTimeAsync(80);
 await worker.fetch(request());const timer=worker.timer;fixture.writes[0].resolve();await Promise.all(pending);
 expect(worker.room).toBe(room);expect(worker.room?.size).toBe(1);expect(worker.timer).toBe(timer);expect(fixture.reads).toBe(1);
 fixture.peers[1].emit('close');await vi.advanceTimersByTimeAsync(80);fixture.writes[1].resolve();await Promise.all(pending);expect(worker.room).toBeNull();
});
it('leases the room before awaiting an already resolved load when final-save cleanup wins the microtask race',async()=>{
 const{worker,pending}=await setup(),room=worker.room!,original=worker.saves.request.bind(worker.saves);let joining:Promise<Response>|undefined;
 vi.spyOn(worker.saves,'request').mockImplementation(()=>{const saved=original();void saved.then(()=>{queueMicrotask(()=>{joining=worker.fetch(request());});});return saved;});
 fixture.peers[0].emit('close');await vi.advanceTimersByTimeAsync(80);fixture.writes[0].resolve();await Promise.all(pending);await joining;
 expect(worker.room).toBe(room);expect(worker.loading).not.toBeNull();expect(worker.pendingJoins).toBe(0);expect(room.size).toBe(1);expect(worker.timer).toBeDefined();expect(fixture.reads).toBe(1);
});
it('shares one pending cold load between concurrent fetches',async()=>{
 let release!:()=>void;fixture.readGate=new Promise<void>(resolve=>release=resolve);const{worker}=await setup(false),a=worker.fetch(request()),b=worker.fetch(request());
 expect(worker.pendingJoins).toBe(2);expect(fixture.reads).toBe(1);release();await Promise.all([a,b]);expect(fixture.rooms).toHaveLength(1);expect(worker.room?.size).toBe(2);expect(worker.pendingJoins).toBe(0);
});
it('fails closed and drains later save batches before a cold reload after a write failure',async()=>{
 const{worker,pending}=await setup(),room=worker.room!;fixture.peers[0].emit('message','{"type":"mutate","value":9}');await settle();await vi.advanceTimersByTimeAsync(80);
 fixture.peers[0].emit('close');fixture.writes[0].reject(Error('Storage unavailable'));await settle();expect(room.readOnly).toBe(true);expect(worker.room).toBe(room);expect(worker.pendingSaves).toBe(1);
 expect((await worker.fetch(request())).status).toBe(503);expect(fixture.reads).toBe(1);expect(fixture.peers[0].sent).not.toContain('{"type":"ack"}');
 await vi.advanceTimersByTimeAsync(80);await Promise.all(pending);expect(fixture.writes).toHaveLength(1);expect(worker.room).toBeNull();expect(worker.loading).toBeNull();expect(fixture.saved).toBeNull();
 await worker.fetch(request());expect(fixture.reads).toBe(2);expect(worker.room).not.toBe(room);expect(worker.room?.value).toBe(0);
});
it('makes duplicate close/error harmless and ignores old events after a cold rejoin',async()=>{
 const{worker,pending}=await setup(),old=fixture.peers[0];old.emit('close');old.emit('error');expect(worker.pendingSaves).toBe(1);await vi.advanceTimersByTimeAsync(80);fixture.writes[0].resolve();await Promise.all(pending);
 await worker.fetch(request());const room=worker.room,timer=worker.timer;old.emit('error');old.emit('close');old.emit('message','{"type":"mutate","value":99}');await settle();
 expect(worker.room).toBe(room);expect(worker.timer).toBe(timer);expect(worker.pendingSaves).toBe(0);expect(room?.value).toBe(0);expect(fixture.writes).toHaveLength(1);
});
it('does not let delayed old close or failure callbacks discard a replacement generation',async()=>{
 const{worker,pending}=await setup(),old=fixture.peers[0],room=worker.room!;old.emit('message','{"type":"mutate","value":99}');await settle();await vi.advanceTimersByTimeAsync(80);fixture.writes[0].reject(Error('Uncertain save'));await Promise.all(pending);
 expect(room.readOnly).toBe(true);expect(old.closed).toContainEqual({code:1011,reason:'Persistence uncertain'});expect(worker.room).toBeNull();await worker.fetch(request());const current=worker.room,timer=worker.timer;
 old.emit('close');old.emit('error');expect(worker.room).toBe(current);expect(worker.timer).toBe(timer);expect(worker.pendingSaves).toBe(0);
});
it('treats a send failure as an idempotent disconnect even without a platform close event',async()=>{
 const{worker,pending}=await setup();fixture.peers[0].sendFails=true;fixture.peers[0].emit('message','{"type":"ping"}');await settle();expect(worker.room?.size).toBe(0);expect(worker.timer).toBeUndefined();
 await vi.advanceTimersByTimeAsync(80);fixture.writes[0].resolve();await Promise.all(pending);expect(worker.room).toBeNull();
});
