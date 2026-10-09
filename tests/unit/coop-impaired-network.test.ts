import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {startCoopServer} from '../../apps/coop/local-server';
import {COOP_PROTOCOL,type CoopServerPacket} from '../../src/networking/coop-protocol';
import type {Snapshot} from '../../src/simulation/protocol';
const until=async(predicate:()=>boolean)=>{const end=Date.now()+10000;while(!predicate()){if(Date.now()>end)throw Error('Impaired connection did not converge');await new Promise(r=>setTimeout(r,20));}};
it('converges two real sockets through 150ms application proxy latency, skipped snapshots and reconnect without duplicate pickup/edit',async()=>{
 const authority=await startCoopServer(0),http=createServer(),proxy=new WebSocketServer({server:http}),timers=new Set<ReturnType<typeof setTimeout>>(),wires=new Set<WebSocket>();let skipped=0,resyncs=0,recovered=0;
 const later=(callback:()=>void)=>{const timer=setTimeout(()=>{timers.delete(timer);callback();},75);timers.add(timer);};
 proxy.on('connection',(client,request)=>{const server=new WebSocket(`ws://127.0.0.1:${authority.port}${request.url}`),early:string[]=[];wires.add(client);wires.add(server);let frames=0;client.on('message',data=>{const text=String(data);if(server.readyState!==WebSocket.OPEN)early.push(text);else later(()=>{if(server.readyState===WebSocket.OPEN)server.send(text);});});server.on('open',()=>{for(const text of early)later(()=>{if(server.readyState===WebSocket.OPEN)server.send(text);});});server.on('message',data=>{const text=String(data),packet=JSON.parse(text);if(packet.type==='delta'&&++frames%7===0){skipped++;return;}later(()=>{if(client.readyState===WebSocket.OPEN)client.send(text);});});client.on('close',()=>server.close());server.on('close',()=>client.close());server.on('error',()=>client.close());client.on('error',()=>server.close());});
 await new Promise<void>(r=>http.listen(0,'127.0.0.1',r));const port=(http.address()as {port:number}).port,room='d'.repeat(48),keys=['a'.repeat(64),'b'.repeat(64)],clients:WebSocket[]=[];
 async function join(i:number){const ws=new WebSocket(`ws://127.0.0.1:${port}/coop/${room}`),packets:CoopServerPacket[]=[],view:{state?:Snapshot}={},decoder=new CoopFrameDecoder(token=>ws.send(JSON.stringify({type:'delivery',token})));let syncing=false;clients.push(ws);ws.on('message',data=>{const raw=JSON.parse(String(data));if(syncing&&raw.type==='delta')return;try{const packet=decoder.accept(raw);if(packet.type==='welcome'&&syncing){syncing=false;recovered++;}packets.push(packet);if(packet.type==='welcome'||packet.type==='frame')view.state=packet.state;}catch{if(!syncing){syncing=true;resyncs++;ws.send(JSON.stringify({type:'resync'}));}}});await new Promise<void>((r,j)=>{ws.once('open',r);ws.once('error',j);});const send=(packet:unknown)=>ws.send(JSON.stringify(packet));send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:keys[i]});await until(()=>!!view.state);return {ws,send,packets,get state(){return view.state!;}};}
 try{
  const a=await join(0),b=await join(1);await until(()=>a.state.peers?.length===1&&b.state.peers?.length===1);
  const ping=Date.now();a.send({type:'ping'});await until(()=>a.packets.some(p=>p.type==='pong'));expect(Date.now()-ping).toBeGreaterThanOrEqual(140);
  const wood=a.state.adventure.resources.find(r=>r.drop&&r.kind==='wood')!;const pickup=(id:string)=>({type:'action',commandId:id,message:{type:'game-action',action:'gather',id:String(wood.id),aim:{x:0,y:0,z:-1}}});a.send(pickup('pickup-a'));b.send(pickup('pickup-b'));
  await until(()=>!a.state.adventure.resources.some(r=>r.id===wood.id)&&!b.state.adventure.resources.some(r=>r.id===wood.id));expect((a.state.adventure.inventory.wood??0)+(b.state.adventure.inventory.wood??0)).toBe(12);
  const receiptCount=(packets:CoopServerPacket[],id:string)=>packets.filter(packet=>packet.type==='ack'&&packet.commandId===id).length;
  await until(()=>receiptCount(a.packets,'pickup-a')>=1&&receiptCount(b.packets,'pickup-b')>=1);
  a.send(pickup('pickup-a'));b.send(pickup('pickup-b'));await until(()=>receiptCount(a.packets,'pickup-a')>=2&&receiptCount(b.packets,'pickup-b')>=2);
  // A rejected pickup can still consume the actor's action cooldown. Network
  // latency is not a promise that four simulation ticks have elapsed, especially
  // with bounded catch-up/overload. Wait for a post-replay authority frame, then
  // the real gameplay interval before submitting the next distinct action.
  const afterReceipts=a.state.tick;await until(()=>a.state.tick>afterReceipts);const readyTick=a.state.tick+4;await until(()=>a.state.tick>=readyTick);
  const p=a.state.player,target={x:5,y:p.y,z:10},command={type:'action',commandId:'delayed-edit',message:{type:'action',tool:'dig',expectedRevision:a.state.edits,target}};a.send(command);a.send(command);await until(()=>a.packets.some(packet=>packet.type==='ack'&&packet.commandId==='delayed-edit'));const editAcks=a.packets.filter(packet=>packet.type==='ack'&&packet.commandId==='delayed-edit');expect(editAcks,JSON.stringify({editAcks,tick:a.state.tick,edits:a.state.edits,target,player:a.state.player,authorityTick:authority.rooms.get(room)?.authority.sim.tick})).toContainEqual(expect.objectContaining({accepted:true}));await until(()=>a.state.edits===1&&b.state.edits===1);
  for(let sequence=1;sequence<=12;sequence++){b.send({type:'input',sequence,input:{x:1,z:0,jump:false}});await new Promise(r=>setTimeout(r,50));}await until(()=>b.state.ack===12);const receivedTick=b.state.tick;await until(()=>b.state.tick>=receivedTick+20);const stopped=b.state.player.x;await until(()=>b.state.tick>=receivedTick+32);expect(Math.abs(b.state.player.x-stopped)).toBeLessThan(.01);
  b.ws.close();await until(()=>a.state.peers?.length===0);const restored=await join(1);expect(restored.state.edits).toBe(1);expect((a.state.adventure.inventory.wood??0)+(restored.state.adventure.inventory.wood??0)).toBe(12);expect(skipped).toBeGreaterThan(0);expect(resyncs).toBeGreaterThan(0);expect(recovered).toBeGreaterThan(0);
 }finally{for(const timer of timers)clearTimeout(timer);for(const ws of[...clients,...wires])ws.terminate();await new Promise<void>(r=>proxy.close(()=>r()));await new Promise<void>(r=>http.close(()=>r()));await authority.close();}
},20000);
