import {afterEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({room:undefined as any,peers:[] as any[]}));
vi.mock('cloudflare:workers',()=>({DurableObject:class{constructor(public ctx:unknown,public env:unknown){}}}));
vi.mock('../../src/save/room-storage',()=>({readRoom:async()=>({checkpoint:null,recovered:false}),writeRoom:async()=> 'revision'}));
vi.mock('../../src/networking/checkpoint-queue',()=>({CheckpointQueue:class{request(){return Promise.resolve();}}}));
vi.mock('../../src/networking/coop-identity',()=>({authenticateCoopPacket:async(text:string)=>({text,playerId:'player'})}));
vi.mock('../../src/networking/authority-room',()=>({AuthorityRoom:class{
 authority={sim:{tick:0}};size=1;readOnly=false;send!:(packet:any,serialized?:string)=>void;
 constructor(){fixture.room=this;}connect(_id:string,wire:any){this.send=wire.send;}disconnect(){this.size=0;}
 receive(_id:string,text:string){if(JSON.parse(text).type==='ping'){this.send({type:'pong'},'{"type":"pong"}');return{changed:false,schedulerWake:true};}return{changed:false};}
 step(){this.authority.sim.tick++;}notice=vi.fn();checkpoint(){return{};}recordPersistedRevision(){}
}}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();fixture.peers=[];vi.resetModules();});
async function setup(waitFailure?:'sync'|'async'){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']});vi.setSystemTime(0);
 const wait=vi.fn((delay:number,{signal}:{signal:AbortSignal})=>{if(waitFailure==='sync')throw Error('wait unavailable');if(waitFailure==='async')return Promise.reject(Error('wait failed'));return new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,delay);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});});vi.stubGlobal('scheduler',{wait});
 class Peer{listeners=new Map<string,(event:any)=>void>();sent:string[]=[];accept(){}send(text:string){this.sent.push(text);}close(){}addEventListener(type:string,listener:(event:any)=>void){this.listeners.set(type,listener);}}
 vi.stubGlobal('WebSocketPair',class{0=new Peer();1=new Peer();constructor(){fixture.peers.push(this[1]);}});
 vi.stubGlobal('Response',class{constructor(public body:unknown,public options:unknown){}});
 // The Worker is typechecked by its own Cloudflare-only tsconfig, not the DOM test project.
 const pending:Promise<unknown>[]=[],module='../../apps/coop/src/index';const {CoopRoom}=await import(module);
 const worker=new CoopRoom({storage:{},waitUntil:(promise:Promise<unknown>)=>pending.push(promise)} as any,{} as any);
 await worker.fetch(new Request('https://preview.test/coop/'+'a'.repeat(48),{headers:{Upgrade:'websocket'}}));
 const peer=fixture.peers[0] as Peer;return{worker,peer,wait,ping:async()=>{const target=fixture.peers.at(-1) as Peer;target.listeners.get('message')!({data:'{"type":"ping"}'});await Promise.all(pending.splice(0));return JSON.parse(target.sent.at(-1)!);}};
}
it('adds real adapter telemetry to pongs despite the serialized fast path, keeping other bytes unchanged',async()=>{
 const f=await setup(),initial=await f.ping();expect(initial.timing).toMatchObject({version:1,clock:'worker-io',run:1,tick:0,lastStepIoMs:null,active:true});
 expect(f.wait).toHaveBeenCalledWith(34,{signal:expect.any(AbortSignal)});
 await vi.advanceTimersByTimeAsync(70);const later=await f.ping();expect(later.timing.tick).toBe(2);expect(later.timing.scheduler.steps).toBe(2);expect(later.timing.nowIoMs).toBe(70);expect(later.timing.lastStepIoMs).toBe(67);
 fixture.room.send({type:'notice',message:'unchanged'},'exact pre-serialized bytes');expect(f.peer.sent.at(-1)).toBe('exact pre-serialized bytes');
});
it('omits stopped scheduler diagnostics and assigns a new run after leave/rejoin',async()=>{
 const f=await setup();f.peer.listeners.get('close')!({});expect((await f.ping()).timing).toBeUndefined();expect(f.wait.mock.calls[0][1].signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 await f.worker.fetch(new Request('https://preview.test/coop/'+'a'.repeat(48),{headers:{Upgrade:'websocket'}}));
 const pong=await f.ping();expect(pong.timing).toMatchObject({run:2,lastStepIoMs:null,scheduler:{steps:0}});
});
it('stops the real adapter and reports a native wait failure rather than leaving an active silent clock',async()=>{
 for(const failure of ['sync','async'] as const){const f=await setup(failure);expect((await f.ping()).timing).toBeUndefined();expect(fixture.room.notice).toHaveBeenCalledExactlyOnceWith('共有シミュレーションを停止しました。再接続してください');expect(vi.getTimerCount()).toBe(0);}
});
it('stops native scheduling after a room-step error',async()=>{
 const f=await setup();vi.spyOn(fixture.room,'step').mockImplementation(()=>{throw Error('step failed');});await vi.advanceTimersByTimeAsync(100);
 expect((await f.ping()).timing).toBeUndefined();expect(fixture.room.notice).toHaveBeenCalledOnce();expect(f.wait).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('services an admitted due message from the server clock and aborts only its outdated wait',async()=>{
 const f=await setup(),now=vi.spyOn(performance,'now').mockReturnValue(34);
 try{await f.ping();expect(fixture.room.authority.sim.tick).toBe(1);expect(f.wait.mock.calls[0][1].signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(1);
  const pong=await f.ping();expect(fixture.room.authority.sim.tick).toBe(1);expect(f.wait).toHaveBeenCalledTimes(2);expect(pong.timing.events).toMatchObject({messageEntries:2,stepEntries:1});
  f.peer.listeners.get('close')!({});expect(vi.getTimerCount()).toBe(0);
 }finally{now.mockRestore();}
});
it('cancels the captured timer if the outer wake gate throws before entering a turn',async()=>{
 const f=await setup(),{FixedStepClock}=await import('../../src/networking/fixed-step-clock'),wake=vi.spyOn(FixedStepClock.prototype,'wake').mockImplementation(()=>{throw Error('clock read failed');});
 try{await f.ping();expect(f.wait.mock.calls[0][1].signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);expect((await f.ping()).timing).toBeUndefined();expect(fixture.room.notice).toHaveBeenCalledOnce();}finally{wake.mockRestore();}
});
