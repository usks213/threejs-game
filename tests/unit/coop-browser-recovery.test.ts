import {afterEach,expect,it,vi} from 'vitest';
import {CoopBrowserRecoveryObserver} from '../helpers/coop-browser-recovery';
import {installCoopBrowserImpairment} from '../helpers/coop-browser-impairment';
import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
import {SnapshotWireEncoder} from '../../src/networking/snapshot-wire';
import {FluidWireEncoder} from '../../src/networking/fluid-wire';
import {encodeCompactFluidDelta} from '../../src/networking/compact-fluid';
import type {Snapshot} from '../../src/simulation/protocol';

type Welcome=Extract<CoopWireServerPacket,{type:'welcome'}>;
const room=new AuthorityRoom(null,'observer-unit');let initial:Welcome|undefined;
room.connect('observer',{send:packet=>{if(packet.type==='welcome')initial=JSON.parse(JSON.stringify(packet)) as Welcome;},close:()=>{}});
room.receive('observer',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),'a'.repeat(64)).acknowledgment?.();
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

// Detached unit-only codec fixtures. The browser acceptance test never imports
// this file or injects these states, edits, inventory or game actions.
function fixture(){
 const welcome=structuredClone(initial!);welcome.state.tick=30;welcome.delivery='delivery-must-not-be-retained';
 welcome.state.adventure.inventory={berry:3,wood:9,stone:0};
 welcome.state.adventure.skybound!.parts=[{id:7,kind:'block',material:'wood',position:{x:4.125,y:2,z:3},velocity:{x:0,y:-.125,z:.25},rotation:.125,mass:6,links:[8],epoch:4,creator:'a'.repeat(64),shared:true,lease:{owner:'b'.repeat(64),expiresTick:180},recalling:false,powered:false,lightRadius:0}];
 welcome.save.edits=[{id:1,kind:'dig',position:{x:5,y:1,z:3},radius:1,material:'stone',tick:21}];
 const state=new SnapshotWireEncoder(),water=new FluidWireEncoder();state.reset({...welcome.state,fluids:[]});water.reset(welcome.state.fluids);
 const delta=(next:Snapshot):CoopWireServerPacket=>({type:'delta',epoch:welcome.epoch,tick:next.tick,state:state.encode({...next,fluids:[]}),water:encodeCompactFluidDelta(water.encode(next.fluids)),editBase:1,edits:[],delivery:'another-private-delivery'});
 return {welcome,delta};
}

it('passively decodes real protocol deltas while retaining only complete checked projections and full welcome edits',()=>{
 const {welcome,delta}=fixture(),observer=new CoopBrowserRecoveryObserver(),receive=observer.connection();receive(welcome);
 const next=structuredClone(welcome.state);next.tick+=3;next.adventure.inventory.wood=8;
 const part=next.adventure.skybound!.parts[0];part.position.x+=.125;part.links=[8,9];part.epoch++;part.lease={owner:'c'.repeat(64),expiresTick:190};
 receive(delta(next));
 expect(observer.latest).toEqual({epoch:welcome.epoch,tick:33,inventory:next.adventure.inventory,parts:next.adventure.skybound!.parts});
 expect(observer.welcome?.inventory).toEqual({berry:3,wood:9,stone:0});expect(observer.welcome?.edits).toEqual(welcome.save.edits);
 expect(observer.history.get(30)?.parts[0]).toMatchObject({position:{x:4.125},links:[8],epoch:4,lease:{owner:'b'.repeat(64),expiresTick:180}});
 expect(Object.keys(observer.latest!)).toEqual(['epoch','tick','inventory','parts']);
 const retained=JSON.stringify({latest:observer.latest,welcome:observer.welcome,history:[...observer.history]});
 for(const excluded of ['delivery-must-not-be-retained','another-private-delivery','"fluids"','"blueprints"','"fusions"','"session"','"save"'])expect(retained).not.toContain(excluded);
 welcome.save.edits[0].position.x=999;next.adventure.skybound!.parts[0].links.push(99);expect(observer.welcome?.edits[0].position.x).toBe(5);expect(observer.latest?.parts[0].links).toEqual([8,9]);expect(observer.decodeFailures).toEqual([]);
});

it('bounds tick-keyed history, keeps personal inventories separate and matches only the same epoch after the requested tick',()=>{
 const left=new CoopBrowserRecoveryObserver(2),right=new CoopBrowserRecoveryObserver(2),a=fixture(),b=fixture(),receiveA=left.connection(),receiveB=right.connection();
 b.welcome.state.adventure.inventory.wood=0;receiveA(a.welcome);receiveB(b.welcome);
 expect(left.commonFrame(right,30)).toBeUndefined();
 for(const tick of [33,36,39]){const x=structuredClone(a.welcome.state),y=structuredClone(b.welcome.state);x.tick=y.tick=tick;receiveA(a.delta(x));receiveB(b.delta(y));}
 expect([...left.history.keys()]).toEqual([36,39]);expect([...right.history.keys()]).toEqual([36,39]);
 const pair=left.commonFrame(right,36)!;expect(pair.left.tick).toBe(39);expect(pair.right.tick).toBe(39);expect(pair.left.parts).toEqual(pair.right.parts);expect(pair.left.inventory).not.toEqual(pair.right.inventory);
 const restarted=structuredClone(b.welcome);restarted.epoch='restarted';restarted.state.tick=39;receiveB(restarted);
 expect([...right.history.keys()]).toEqual([39]);expect(left.commonFrame(right,30)).toBeUndefined();
});

it('records a missing delta without accepting partial state or repairing the transport, then recovers only on a real welcome',()=>{
 const {welcome,delta}=fixture(),observer=new CoopBrowserRecoveryObserver(),receive=observer.connection();receive(welcome);
 const next=structuredClone(welcome.state);next.tick=33;delta(next);next.tick=36;receive(delta(next));
 expect(observer.latest?.tick).toBe(30);expect(observer.history.size).toBe(1);expect(observer.decodeFailures).toEqual([{type:'delta',tick:36}]);
 next.tick=39;receive(delta(next));expect(observer.latest?.tick).toBe(30);
 const recovered=structuredClone(welcome);recovered.state.tick=42;receive(recovered);expect(observer.latest?.tick).toBe(42);expect(observer.welcomeCount).toBe(2);expect(observer.decodeFailures).toHaveLength(2);
});

it('uses a fresh decoder per WebSocket and ignores a superseded socket without retaining unbounded failures',()=>{
 const {welcome,delta}=fixture(),observer=new CoopBrowserRecoveryObserver(),oldSocket=observer.connection();oldSocket(welcome);
 const next=structuredClone(welcome.state);next.tick=33;oldSocket(delta(next));
 const newSocket=observer.connection(),returned=structuredClone(welcome);returned.state.tick=60;newSocket(returned);
 next.tick=36;oldSocket(delta(next));expect(observer.latest?.tick).toBe(60);expect(observer.welcomeCount).toBe(2);
 for(let tick=63;tick<100;tick+=3){next.tick=tick;newSocket(delta(next));}
 expect(observer.decodeFailures).toHaveLength(8);expect(observer.latest?.tick).toBe(60);
 for(const limit of [0,-1,Infinity,1.5])expect(()=>new CoopBrowserRecoveryObserver(limit)).toThrow('positive finite');
});

it('keeps native observation complete when the impairment drops an application delta and the app resynchronizes',()=>{
 const observer=new CoopBrowserRecoveryObserver(),nativeReceive=observer.connection();
 // Playwright Chromium emits framereceived from CDP Network events, upstream
 // of DOM dispatch. This test boundary mirrors that order and runs the actual
 // impairment helper; it is not a claim that a real browser was launched.
 class Socket extends EventTarget {
  static OPEN=1;readyState=1;sent:string[]=[];
  constructor(readonly url:string){super();}
  send(data:unknown){this.sent.push(String(data));}
  receive(packet:CoopWireServerPacket){nativeReceive(packet);this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(packet)}));}
 }
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});vi.stubGlobal('window',{WebSocket:Socket});vi.stubGlobal('location',{href:'https://game.example/'});installCoopBrowserImpairment();
 const socket=new window.WebSocket('wss://game.example/coop/'+'a'.repeat(48)) as unknown as Socket,app=new CoopFrameDecoder(),appTicks:number[]=[];let appFailures=0;
 socket.addEventListener('message',event=>{try{const packet=app.accept(JSON.parse((event as MessageEvent).data));if(packet.type==='welcome'||packet.type==='frame')appTicks.push(packet.state.tick);}catch{appFailures++;}});
 const {welcome,delta}=fixture();socket.receive(welcome);window.coopDeliveryFault.enabled=true;window.coopDeliveryFault.skipNextDelta=true;
 const next=structuredClone(welcome.state);next.tick=33;socket.receive(delta(next));next.tick=36;socket.receive(delta(next));vi.advanceTimersByTime(200);
 expect(window.coopDeliveryFault.skipped).toBe(1);expect(appTicks).toEqual([30]);expect(appFailures).toBe(1);expect(observer.latest?.tick).toBe(36);expect(observer.decodeFailures).toEqual([]);
 // The real app would request this subsequent welcome. Neither the passive
 // observer nor this receive-only unit decoder emits the request or an ACK.
 const recovered=fixture();recovered.welcome.state.tick=60;socket.receive(recovered.welcome);const resumed=structuredClone(recovered.welcome.state);resumed.tick=63;socket.receive(recovered.delta(resumed));vi.advanceTimersByTime(200);
 expect(appTicks).toEqual([30,60,63]);expect(appFailures).toBe(1);expect(observer.welcomeCount).toBe(2);expect(observer.latest?.tick).toBe(63);expect(observer.decodeFailures).toEqual([]);expect(socket.sent).toEqual([]);
 window.coopDeliveryFault.enabled=false;expect(window.coopDeliveryFault.stats.queued).toBe(0);
});
