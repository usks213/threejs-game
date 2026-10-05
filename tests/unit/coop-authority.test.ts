import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCoopServer } from '../../apps/coop/local-server';
import { AuthorityRoom } from '../../src/networking/authority-room';
import type { CoopServerPacket } from '../../src/networking/coop-protocol';
import type { Snapshot } from '../../src/simulation/protocol';
const roomId='a'.repeat(48),keys=['1'.repeat(64),'2'.repeat(64)],alice=createHash('sha256').update(keys[0]).digest('hex'),bob=createHash('sha256').update(keys[1]).digest('hex');
async function connect(port:number,id:string){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/coop/${roomId}`),packets:CoopServerPacket[]=[],decoder=new CoopFrameDecoder(token=>socket.send(JSON.stringify({type:'delivery',token})));let state:Snapshot|undefined;
 socket.on('message',data=>{const packet=decoder.accept(JSON.parse(String(data)));packets.push(packet);if(packet.type==='welcome'||packet.type==='frame')state=packet.state;});
 await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 const send=(packet:unknown)=>socket.send(JSON.stringify(packet));send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:keys[id===alice?0:1]});
 await until(()=>packets.some(p=>p.type==='welcome'));
 return {socket,packets,send,get state(){return state!;},async close(){socket.close();await new Promise<void>(r=>socket.once('close',()=>r()));}};
}
async function until(predicate:()=>boolean){const deadline=performance.now()+8000;while(!predicate()){if(performance.now()>deadline)throw new Error('Room did not converge');await new Promise(r=>setTimeout(r,30));}}
it('real shared sockets converge, resolve duplicate pickup, resync, reconnect and restore after server restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'voxel-coop-'));
 const fixture=new AuthorityRoom(null,'fixture'),sim=fixture.authority.sim;
 sim.fluid.restore([]);sim.bodies.length=0;sim.adventure.state.enemies=[];sim.adventure.state.resources=[];
 const a=fixture.authority.join(alice),b=fixture.authority.join(bob);
 const y=sim.groundAt(0,8);Object.assign(a.player,{x:0,y,z:8});Object.assign(b.player,{x:1,y,z:8});
 sim.adventure.state.resources.push({id:9001,kind:'wood',x:.5,y:y+.2,z:8,amount:3,ready:0,drop:true});
 await writeFile(join(directory,roomId+'.json'),JSON.stringify(fixture.checkpoint()));
 let server=await startCoopServer(0,directory);const clients:Awaited<ReturnType<typeof connect>>[]=[];
 try{
  const a=await connect(server.port,alice),b=await connect(server.port,bob);clients.push(a,b);
  await until(()=>a.state.peers?.length===1&&b.state.peers?.length===1);
  expect(a.state.peers![0].id).toBe(bob);expect(b.state.peers![0].id).toBe(alice);
  const pickup=(commandId:string)=>({type:'action',commandId,message:{type:'game-action',action:'gather',id:'9001',aim:{x:0,y:0,z:-1}}});
  const packets=[pickup('pickup-alice'),pickup('pickup-bob')];
  packets.forEach((p,i)=>clients[i].send(p));
  await until(()=>a.packets.some(p=>p.type==='ack')&&b.packets.some(p=>p.type==='ack'));
  await until(()=>!a.state.adventure.resources.some(r=>r.id===9001)&&!b.state.adventure.resources.some(r=>r.id===9001));
  expect((a.state.adventure.inventory.wood??0)+(b.state.adventure.inventory.wood??0)).toBe(3);
  a.send(packets[0]);b.send(packets[1]);await new Promise(r=>setTimeout(r,160));
  expect((a.state.adventure.inventory.wood??0)+(b.state.adventure.inventory.wood??0)).toBe(3);
  const start=a.state.player.x;
  for(let sequence=1;sequence<=15;sequence++){a.send({type:'input',sequence,input:{x:1,z:0,jump:false}});await new Promise(r=>setTimeout(r,35));}
  await until(()=>a.state.player.x>start+.5&&b.state.peers!.some(p=>p.id===alice&&p.player.x>start+.5));
  const p=a.state.player;a.send({type:'action',commandId:'dig-once',message:{type:'action',tool:'dig',expectedRevision:a.state.edits,target:{x:p.x+4,y:sim.groundAt(p.x+4,p.z+2),z:p.z+2}}});
  await until(()=>a.state.edits===1&&b.state.edits===1);const afterFirstEdit=a.state.tick;
  await b.close();clients.splice(clients.indexOf(b),1);
  await until(()=>a.state.tick>=afterFirstEdit+8);
  a.send({type:'action',commandId:'dig-while-b-offline',message:{type:'action',tool:'dig',expectedRevision:a.state.edits,target:{x:p.x+4,y:sim.groundAt(p.x+4,p.z-2),z:p.z-2}}});
  await until(()=>a.packets.some(p=>p.type==='ack'&&p.commandId==='dig-while-b-offline'));const ack=a.packets.find(p=>p.type==='ack'&&p.commandId==='dig-while-b-offline');expect(ack).toMatchObject({accepted:true});await until(()=>a.state.edits===2);
  const returning=await connect(server.port,bob);clients.push(returning);expect(returning.state.edits).toBe(2);
  returning.send({type:'resync'});await until(()=>returning.packets.filter(p=>p.type==='welcome').length===2);
  const total=(a.state.adventure.inventory.wood??0)+(returning.state.adventure.inventory.wood??0);
  await Promise.all(clients.map(c=>c.close()));clients.length=0;await server.close();server=await startCoopServer(0,directory);
  const restoredA=await connect(server.port,alice),restoredB=await connect(server.port,bob);clients.push(restoredA,restoredB);
  expect(restoredA.state.edits).toBe(2);expect(restoredB.state.edits).toBe(2);expect((restoredA.state.adventure.inventory.wood??0)+(restoredB.state.adventure.inventory.wood??0)).toBe(total);
  restoredA.send(packets[0]);await new Promise(r=>setTimeout(r,140));expect((restoredA.state.adventure.inventory.wood??0)+(restoredB.state.adventure.inventory.wood??0)).toBe(3);
 }finally{await Promise.all(clients.map(c=>c.close()));await server.close();await rm(directory,{recursive:true,force:true});}
},30000);
