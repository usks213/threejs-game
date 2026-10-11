import {it,expect} from 'vitest';
import {WebSocket} from 'ws';
import {startCoopServer} from '../../apps/coop/local-server';
import {COOP_PROTOCOL,type CoopServerPacket} from '../../src/networking/coop-protocol';
import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {DELIVERY_LIMITS} from '../../src/networking/delivery-window';
import type {Snapshot} from '../../src/simulation/protocol';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(test:()=>boolean,label:string,timeout=20000){const end=performance.now()+timeout;while(!test()){if(performance.now()>end)throw Error('Slow reader: '+label);await pause(25);}}
it('bounds an actual non-receipting peer, resumes without a delta gap, times out and restores the same inventory',async()=>{
 const server=await startCoopServer(0),room='f'.repeat(48),sockets:WebSocket[]=[];
 async function connect(key:string,receipts:boolean){
  const socket=new WebSocket(`ws://127.0.0.1:${server.port}/coop/${room}`);sockets.push(socket);
  let state:Snapshot|undefined,closed=0,allowed=receipts,latest='',delivered=0,bytes=0,lastDeliveryAt=0;const errors:string[]=[],packets:CoopServerPacket[]=[];
  const send=(packet:unknown)=>socket.send(JSON.stringify(packet));const decoder=new CoopFrameDecoder(token=>{latest=token;if(allowed)send({type:'delivery',token});});
  socket.on('message',data=>{const raw=JSON.parse(String(data));if(raw.delivery){delivered++;bytes+=Buffer.byteLength(String(data));lastDeliveryAt=performance.now();}try{const p=decoder.accept(raw);packets.push(p);if(p.type==='welcome'||p.type==='frame')state=p.state;}catch(error){errors.push(String(error));}});socket.on('close',code=>closed=code);await new Promise<void>((r,j)=>{socket.once('open',r);socket.once('error',j);});send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key});await until(()=>!!state,'welcome');
  return{socket,send,errors,packets,get state(){return state!;},get closed(){return closed;},get delivered(){return delivered;},get bytes(){return bytes;},get lastDeliveryAt(){return lastDeliveryAt;},get latest(){return latest;},set receipts(value:boolean){allowed=value;}};
 }
 try{
  const fast=await connect('7'.repeat(64),true),slow=await connect('8'.repeat(64),false);const wood=slow.state.adventure.resources.find(n=>n.drop&&n.kind==='wood'&&n.amount===12)!;
  slow.send({type:'action',commandId:'slow-pickup',message:{type:'game-action',action:'gather',id:String(wood.id),aim:{x:0,y:0,z:1}}});await until(()=>slow.packets.some(p=>p.type==='ack'&&p.commandId==='slow-pickup'&&p.accepted),'real pickup');
  await until(()=>performance.now()-slow.lastDeliveryAt>700,'bounded output pause');expect(slow.delivered).toBeLessThanOrEqual(DELIVERY_LIMITS.frames);expect(slow.bytes).toBeLessThan(DELIVERY_LIMITS.bytes+DELIVERY_LIMITS.packetBytes);
  const count=slow.delivered,stoppedTick=slow.state.tick,fastTick=fast.state.tick;slow.send({type:'delivery',token:crypto.randomUUID()});slow.send({type:'delivery',token:999});await pause(350);expect(slow.delivered).toBe(count);await until(()=>fast.state.tick>fastTick+6,'unaffected fast peer');
  slow.receipts=true;slow.send({type:'delivery',token:slow.latest});await until(()=>slow.state.tick>stoppedTick+6&&slow.state.adventure.inventory.wood===12,'cumulative receipt recovery');expect(slow.errors).toEqual([]);
  slow.receipts=false;await until(()=>performance.now()-slow.lastDeliveryAt>700,'second bounded output pause');const blockedCount=slow.delivered;await until(()=>slow.closed!==0,'receive timeout');expect(slow.closed).toBe(1013);expect(slow.delivered).toBe(blockedCount);expect(fast.closed).toBe(0);
  const returned=await connect('8'.repeat(64),true);expect(returned.state.adventure.inventory.wood).toBe(12);expect(returned.state.adventure.resources.some(n=>n.id===wood.id)).toBe(false);const tick=returned.state.tick;await until(()=>returned.state.tick>tick+6,'manual reconnect progression');expect(returned.errors).toEqual([]);expect(fast.errors).toEqual([]);
 }finally{for(const socket of sockets)socket.terminate();await server.close();}
},30000);
