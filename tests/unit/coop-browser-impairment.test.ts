import {afterEach,expect,it,vi} from 'vitest';
import {installCoopBrowserImpairment} from '../helpers/coop-browser-impairment';
import {createCoopTransportDiagnostics} from '../helpers/coop-transport-diagnostics';
class Socket extends EventTarget {
 static OPEN=1;readyState=1;sent:string[]=[];constructor(readonly url:string){super();}send(data:unknown){this.sent.push(String(data));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}receive(packet:unknown){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(packet)}));}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function setup(serialized=false){vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});vi.stubGlobal('window',{WebSocket:Socket});vi.stubGlobal('location',{href:'https://game.example/'});if(serialized)new Function(`(${installCoopBrowserImpairment})(${createCoopTransportDiagnostics});`)();else installCoopBrowserImpairment();const socket=new window.WebSocket('wss://game.example/coop/'+'a'.repeat(48)) as unknown as Socket;window.coopDeliveryFault.enabled=true;const received:unknown[]=[];socket.addEventListener('message',event=>received.push(JSON.parse((event as MessageEvent).data)));return {socket,received,fault:window.coopDeliveryFault};}
it('delays both real directions by at least 75ms, preserves byte order and reports actual RTT without payloads',()=>{
 const {socket,received,fault}=setup();socket.send(JSON.stringify({type:'ping'}));socket.send('second');vi.advanceTimersByTime(74);expect(socket.sent).toEqual([]);vi.advanceTimersByTime(26);expect(socket.sent).toEqual(['{"type":"ping"}','second']);socket.receive({type:'pong'});expect(received).toEqual([]);vi.advanceTimersByTime(100);expect(received).toEqual([{type:'pong'}]);expect(fault.stats.pingRttMs[0]).toBeGreaterThanOrEqual(150);expect(fault.stats.outgoingDelayMs.every(value=>value>=75)).toBe(true);expect(fault.stats.incomingDelayMs.every(value=>value>=75)).toBe(true);expect(JSON.stringify(fault.stats)).not.toContain('second');
});
it('loses only selected deltas and the armed idle input, while duplicating the exact successful UI action once',()=>{
 const {socket,received,fault}=setup(),action=JSON.stringify({type:'action',commandId:'original',message:{type:'game-action',action:'gather',id:'17'}});socket.send(action);vi.advanceTimersByTime(100);socket.receive({type:'ack',commandId:'original',accepted:true});vi.advanceTimersByTime(200);expect(socket.sent.filter(text=>text===action)).toHaveLength(2);socket.receive({type:'ack',commandId:'original',accepted:true});vi.advanceTimersByTime(200);expect(socket.sent.filter(text=>text===action)).toHaveLength(2);expect(fault.stats.duplicatedActions).toBe(1);
 fault.dropNextIdle=true;socket.send(JSON.stringify({type:'input',input:{x:1,z:0,jump:false}}));socket.send(JSON.stringify({type:'input',input:{x:0,z:0,jump:false}}));socket.send(JSON.stringify({type:'input',input:{x:0,z:0,jump:false}}));vi.advanceTimersByTime(100);expect(fault.stats.droppedIdleInputs).toBe(1);expect(socket.sent.filter(text=>text.includes('"type":"input"'))).toHaveLength(2);
 for(let i=1;i<=100;i++)socket.receive({type:'delta',tick:i});vi.advanceTimersByTime(100);expect(fault.stats.droppedDeltas).toBe(2);expect(received.filter(packet=>(packet as {type:string}).type==='delta')).toHaveLength(98);
});
it('cancels delayed work on close, including credentials, and keeps disabled baseline traffic unmodified',()=>{
 const {socket,received,fault}=setup();socket.send('{"type":"hello","resumeKey":"private"}');socket.receive({type:'welcome'});expect(fault.stats.queued).toBe(2);socket.close();vi.advanceTimersByTime(1000);expect(socket.sent).toEqual([]);expect(received).toEqual([]);expect(fault.stats.queued).toBe(0);expect(JSON.stringify(fault)).not.toContain('private');
 const other=new window.WebSocket('wss://game.example/coop/'+'b'.repeat(48)) as unknown as Socket;fault.enabled=false;other.send('unaltered');expect(other.sent).toEqual(['unaltered']);
});

it('preserves both FIFO directions for fractional-time bursts whose jitter deadlines coincide',()=>{
 const {socket,received,fault}=setup();
 for(let sequence=1;sequence<=40;sequence++){socket.send(JSON.stringify({type:'input',sequence,input:{x:1,z:0,jump:false}}));socket.receive({type:'notice',sequence});vi.advanceTimersByTime(.21);}
 vi.advanceTimersByTime(250);const expected=Array.from({length:40},(_,i)=>i+1);
 expect(socket.sent.map(text=>JSON.parse(text).sequence)).toEqual(expected);expect(received.map(packet=>(packet as {sequence:number}).sequence)).toEqual(expected);expect(fault.stats.queued).toBe(0);
});

it('captures native sends separately from delayed or dropped attempts, and records close evidence before cancelling queued work',()=>{
 const {socket,fault}=setup(),input=JSON.stringify({type:'input',input:{x:0,z:0,jump:false}});
 fault.enabled=false;socket.send(JSON.stringify({type:'hello',resumeKey:'private-resume'}));fault.enabled=true;
 fault.dropNextIdle=true;socket.send(input);socket.send(JSON.stringify({type:'ping'}));socket.receive({type:'delta',delivery:'private-delivery'});
 expect(fault.stats.outgoing).toBe(2);expect(fault.transport().nativeSent).toBe(1);vi.advanceTimersByTime(100);
 expect(fault.transport().nativeSent).toBe(2);expect(fault.transport().nativeReceived).toBe(1);
 socket.send(input);socket.receive({type:'pong'});expect(fault.stats.queued).toBe(2);
 socket.readyState=3;socket.dispatchEvent(Object.assign(new Event('close'),{code:1008,reason:'Rate limit',wasClean:true}));
 const close=fault.transport().connections[0];expect(close.close).toMatchObject({code:1008,reason:'Rate limit',wasClean:true,pendingIncoming:1,pendingOutgoing:1});
 expect(close.sent.byType).toEqual({hello:1,ping:1});expect(close.received.byType).toEqual({delta:1,pong:1});
 vi.advanceTimersByTime(1000);expect(fault.transport().connections[0]).toEqual(close);expect(socket.sent).toHaveLength(2);expect(fault.stats.queued).toBe(0);expect(JSON.stringify(fault.transport())).not.toContain('private');
});

it('runs the exact serialized browser installer without imports, preserves FIFO and counts the one native duplicate',()=>{
 const {socket,fault}=setup(true),action=JSON.stringify({type:'action',commandId:'private-command',message:{type:'game-action',action:'gather',id:'17'}});
 socket.send(action);socket.send(JSON.stringify({type:'ping'}));vi.advanceTimersByTime(100);socket.receive({type:'ack',commandId:'private-command',accepted:true});vi.advanceTimersByTime(200);
 expect(socket.sent).toEqual([action,'{"type":"ping"}',action]);expect(fault.stats.duplicatedActions).toBe(1);expect(fault.transport().nativeSent).toBe(3);expect(fault.transport().connections[0].sent.byType).toEqual({action:2,ping:1});expect(JSON.stringify(fault.transport())).not.toContain('private-command');
 const unobserved=new window.WebSocket('wss://game.example/unrelated?token=private') as unknown as Socket;unobserved.send('private');unobserved.close();expect(fault.transport().connectionCount).toBe(1);expect(fault.transport().nativeSent).toBe(3);
});
