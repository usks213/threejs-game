import {expect,it} from 'vitest';
import {WebSocket} from 'ws';
import {startCoopServer} from '../../apps/coop/local-server';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
it('keeps a real client connected at normal input frequency while authority ticking is paused',async()=>{
 const server=await startCoopServer(0),key='a'.repeat(48),socket=new WebSocket(`ws://127.0.0.1:${server.port}/coop/${key}`);let welcomed=false,pongs=0;const closes:{code:number;reason:string}[]=[];
 socket.on('message',bytes=>{const packet=JSON.parse(String(bytes));if(typeof packet.delivery==='string')socket.send(JSON.stringify({type:'delivery',token:packet.delivery}));if(packet.type==='welcome')welcomed=true;if(packet.type==='pong')pongs++;});
 socket.on('close',(code,reason)=>closes.push({code,reason:String(reason)}));
 try{
  await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});socket.send(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:'b'.repeat(64)}));
  const end=performance.now()+8000;while(!welcomed){if(performance.now()>end)throw Error('Welcome timeout');await wait(20);}
  const room=server.rooms.get(key)!;room.step=()=>{};const tick=room.authority.sim.tick;
  // 25 real input messages/sec plus five heartbeats/sec stays well below90/sec.
  // Pausing the server tick must not turn four wall seconds into one budget window.
  for(let sequence=1;sequence<=100;sequence++){expect(socket.readyState).toBe(WebSocket.OPEN);socket.send(JSON.stringify({type:'input',sequence,input:{x:0,z:0,jump:false}}));if(sequence%5===0)socket.send(JSON.stringify({type:'ping'}));await wait(40);}
  expect(room.authority.sim.tick).toBe(tick);expect(socket.readyState).toBe(WebSocket.OPEN);expect(closes).toEqual([]);expect(pongs).toBe(20);
 }finally{socket.terminate();await server.close();}
},15000);
