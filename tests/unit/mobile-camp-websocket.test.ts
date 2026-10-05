import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {expect,it} from 'vitest';
import {startCoopServer} from '../../apps/coop/local-server';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import type {CoopServerPacket} from '../../src/networking/coop-protocol';
import type {Snapshot} from '../../src/simulation/protocol';
import {legacySimulation} from '../helpers/legacy';
const roomId='c'.repeat(48),keys=['3'.repeat(64),'4'.repeat(64)],owners=keys.map(key=>createHash('sha256').update(key).digest('hex')),aim={x:0,y:0,z:1};
async function until(test:()=>boolean){const end=performance.now()+8000;while(!test()){if(performance.now()>end)throw Error('Mobile camp socket state did not converge');await new Promise(r=>setTimeout(r,25));}}
async function connect(port:number,key:string){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/coop/${roomId}`),packets:CoopServerPacket[]=[],decoder=new CoopFrameDecoder(token=>socket.send(JSON.stringify({type:'delivery',token})));let state:Snapshot|undefined;
 socket.on('message',data=>{const packet=decoder.accept(JSON.parse(String(data)));packets.push(packet);if(packet.type==='welcome'||packet.type==='frame')state=packet.state;});
 await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 const send=(packet:unknown)=>socket.send(JSON.stringify(packet));send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key});await until(()=>!!state);
 return {socket,packets,send,get state(){return state!;},async close(){if(socket.readyState===WebSocket.CLOSED)return;const closed=new Promise<void>(r=>socket.once('close',()=>r()));socket.close();await closed;}};
}
const command=(commandId:string,action:'sky-store'|'sky-take',count:number,epoch:number)=>({type:'action',commandId,message:{type:'game-action',action,id:`1:wood:${count}`,aim,expectedEpoch:epoch}});
it('two real WebSockets preserve cargo and each personal inventory across conflicts, duplicate commands and durable restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'voxel-mobile-camp-'));
 const fixture=new AuthorityRoom({version:1,world:legacySimulation().save(),receipts:[]},'cargo-fixture'),sim=fixture.authority.sim;
 sim.fluid.restore([]);sim.bodies.length=0;sim.adventure.state.enemies=[];sim.adventure.state.resources=[];
 const a=fixture.authority.join(owners[0]),b=fixture.authority.join(owners[1]),x=12,z=12,y=sim.groundAt(x,z);
 Object.assign(a.player,{x,y,z});Object.assign(b.player,{x:x+1,y:sim.groundAt(x+1,z),z});a.adventure.state.inventory={wood:30};b.adventure.state.inventory={wood:7};
 sim.skybound.state.parts.push({id:1,kind:'storage',material:'wood',mass:28,cargoMass:20,creator:owners[0],shared:true,position:{x:x+2,y:sim.groundAt(x+2,z)+.5,z},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[]});sim.skybound.state.storage={'1':{wood:10}};
 await writeFile(join(directory,roomId+'.json'),JSON.stringify(fixture.checkpoint()));
 let server=await startCoopServer(0,directory);const clients:Awaited<ReturnType<typeof connect>>[]=[];
 try{
  const first=await connect(server.port,keys[0]),second=await connect(server.port,keys[1]);clients.push(first,second);
  await until(()=>first.state.peers?.length===1&&second.state.peers?.length===1);
  const deposit=command('cargo-deposit','sky-store',5,0);first.send(deposit);
  await until(()=>first.packets.some(p=>p.type==='ack'&&p.commandId==='cargo-deposit'));expect(first.packets.find(p=>p.type==='ack'&&p.commandId==='cargo-deposit')).toMatchObject({accepted:true});
  await until(()=>first.state.adventure.inventory.wood===25&&second.state.adventure.skybound?.storage?.[0]?.items.wood===15);
  second.send(command('cargo-stale','sky-take',10,0));await until(()=>second.packets.some(p=>p.type==='ack'&&p.commandId==='cargo-stale'));expect(second.packets.find(p=>p.type==='ack'&&p.commandId==='cargo-stale')).toMatchObject({accepted:false});
  const withdrawal=command('cargo-withdraw','sky-take',10,1);second.send(withdrawal);await until(()=>second.packets.some(p=>p.type==='ack'&&p.commandId==='cargo-withdraw'));expect(second.packets.find(p=>p.type==='ack'&&p.commandId==='cargo-withdraw')).toMatchObject({accepted:true});
  await until(()=>second.state.adventure.inventory.wood===17&&first.state.adventure.skybound?.storage?.[0]?.items.wood===5);
  first.send(deposit);second.send(withdrawal);await new Promise(r=>setTimeout(r,100));
  expect(first.state.adventure.inventory.wood).toBe(25);expect(second.state.adventure.inventory.wood).toBe(17);
  await Promise.all(clients.map(c=>c.close()));clients.length=0;await server.close();server=await startCoopServer(0,directory);
  const restoredA=await connect(server.port,keys[0]),restoredB=await connect(server.port,keys[1]);clients.push(restoredA,restoredB);
  expect(restoredA.state.adventure.inventory.wood).toBe(25);expect(restoredB.state.adventure.inventory.wood).toBe(17);expect(restoredA.state.adventure.skybound?.storage?.[0]?.items.wood).toBe(5);
  restoredA.send(deposit);restoredB.send(withdrawal);await until(()=>restoredA.packets.some(p=>p.type==='ack')&&restoredB.packets.some(p=>p.type==='ack'));
  expect(restoredA.state.adventure.inventory.wood+restoredB.state.adventure.inventory.wood+restoredA.state.adventure.skybound!.storage![0].items.wood).toBe(47);
  restoredB.send({type:'export',requestId:'cargo-export'});await until(()=>restoredB.packets.some(p=>p.type==='export'));
  const exported=restoredB.packets.find(p=>p.type==='export');if(exported?.type!=='export')throw Error('Export response missing');
  expect(exported.save.adventure?.inventory).toEqual({wood:17});expect(exported.save.members).toBeUndefined();expect(exported.save.skybound?.storage?.[1]).toBeUndefined();expect(exported.save.skybound?.parts[0].cargoMass??0).toBe(0);expect(exported.save.skybound?.parts[0].mass).toBe(8);
 }finally{await Promise.all(clients.map(c=>c.close()));await server.close();await rm(directory,{recursive:true,force:true});}
},30000);
