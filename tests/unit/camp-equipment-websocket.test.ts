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
import {migrateGear} from '../../src/game/equipment/items';
const roomId='e'.repeat(48),keys=['7'.repeat(64),'8'.repeat(64)],owners=keys.map(key=>createHash('sha256').update(key).digest('hex')),aim={x:0,y:0,z:1};
async function until(test:()=>boolean){const end=performance.now()+8000;while(!test()){if(performance.now()>end)throw Error('Camp equipment socket state did not converge');await new Promise(r=>setTimeout(r,25));}}
async function connect(port:number,key:string){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/coop/${roomId}`),packets:CoopServerPacket[]=[],decoder=new CoopFrameDecoder(token=>socket.send(JSON.stringify({type:'delivery',token})));let state:Snapshot|undefined;
 socket.on('message',data=>{const packet=decoder.accept(JSON.parse(String(data)));packets.push(packet);if(packet.type==='welcome'||packet.type==='frame')state=packet.state;});await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 const send=(packet:unknown)=>socket.send(JSON.stringify(packet));send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key});await until(()=>!!state);
 return{socket,packets,send,get state(){return state!;},async close(){if(socket.readyState===WebSocket.CLOSED)return;const done=new Promise<void>(r=>socket.once('close',()=>r()));socket.close();await done;}};
}
const command=(commandId:string,action:'sky-store'|'sky-take',gear:number,epoch:number)=>({type:'action',commandId,message:{type:'game-action',action,id:`1:gear-${gear}:1`,aim,expectedEpoch:epoch}});
it('two real clients preserve one exact camp-held item through stale epochs, lost/replayed commands, reconnect and server restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'voxel-camp-equipment-')),fixture=new AuthorityRoom(null,'camp-equipment-fixture'),sim=fixture.authority.sim;
 sim.fluid.restore([]);sim.bodies.length=0;sim.adventure.state.enemies=[];sim.adventure.state.resources=[];sim.adventure.state.buildings=[];
 const a=fixture.authority.join(owners[0]),b=fixture.authority.join(owners[1]);Object.assign(a.player,{x:12,y:sim.groundAt(12,12),z:12});Object.assign(b.player,{x:13,y:sim.groundAt(13,12),z:12});
 a.adventure.state.inventory={club:1};a.adventure.gear.commit(migrateGear(a.adventure.state.inventory,()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:7},fusions:[{equipment:'club',material:'resin',damage:4,durability:12,effect:'fire'}]}));b.adventure.state.inventory={club:1};b.adventure.gear.commit(migrateGear(b.adventure.state.inventory,()=>sim.allocateEntityId(),{quality:{club:1},durability:{club:88}}));
 const original=structuredClone(a.adventure.state.gearItems!.lots[0]),other=b.adventure.state.gearItems!.activeByKind.club;
 sim.skybound.state.parts.push({id:1,kind:'storage',material:'wood',mass:8,creator:owners[0],shared:true,position:{x:14,y:sim.groundAt(14,12)+.5,z:12},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[]});
 await writeFile(join(directory,roomId+'.json'),JSON.stringify(fixture.checkpoint()));let server=await startCoopServer(0,directory);const clients:Awaited<ReturnType<typeof connect>>[]=[];
 try{
  const first=await connect(server.port,keys[0]),second=await connect(server.port,keys[1]);clients.push(first,second);const store=command('camp-store-once','sky-store',original.id,0);first.send(store);
  await until(()=>first.packets.some(p=>p.type==='ack'&&p.commandId==='camp-store-once'));expect(first.packets.find(p=>p.type==='ack'&&p.commandId==='camp-store-once')).toMatchObject({accepted:true});
  await until(()=>first.state.adventure.inventory.club===0&&second.state.adventure.skybound?.storage?.[0]?.gearItems?.lots[0]?.id===original.id);expect(second.state.adventure.skybound!.storage![0].gearItems!.lots).toEqual([original]);
  // A reconnect repeats the same command ID after a successful durable write.
  await first.close();clients.splice(clients.indexOf(first),1);const again=await connect(server.port,keys[0]);clients.push(again);again.send(store);await until(()=>again.packets.some(p=>p.type==='ack'));expect(again.packets.find(p=>p.type==='ack')).toMatchObject({accepted:true});expect(again.state.adventure.inventory.club).toBe(0);
  second.send(command('camp-take-stale','sky-take',original.id,0));await until(()=>second.packets.some(p=>p.type==='ack'&&p.commandId==='camp-take-stale'));expect(second.packets.find(p=>p.type==='ack'&&p.commandId==='camp-take-stale')).toMatchObject({accepted:false});
  const take=command('camp-take-once','sky-take',original.id,1);second.send(take);await until(()=>second.packets.some(p=>p.type==='ack'&&p.commandId==='camp-take-once'));expect(second.packets.find(p=>p.type==='ack'&&p.commandId==='camp-take-once')).toMatchObject({accepted:true});
  await until(()=>second.state.adventure.inventory.club===2&&again.state.adventure.skybound?.storage?.[0]?.gearItems?.lots.length===0);expect(second.state.adventure.gearItems!.lots).toContainEqual(original);expect(second.state.adventure.gearItems!.activeByKind.club).toBe(other);
  await Promise.all(clients.map(c=>c.close()));clients.length=0;await server.close();server=await startCoopServer(0,directory);
  const restoredA=await connect(server.port,keys[0]),restoredB=await connect(server.port,keys[1]);clients.push(restoredA,restoredB);restoredA.send(store);restoredB.send(take);await until(()=>restoredA.packets.some(p=>p.type==='ack')&&restoredB.packets.some(p=>p.type==='ack'));
  expect(restoredA.state.adventure.inventory.club).toBe(0);expect(restoredB.state.adventure.inventory.club).toBe(2);expect(restoredB.state.adventure.gearItems!.lots).toContainEqual(original);expect(restoredA.state.adventure.skybound!.storage![0].gearItems!.lots).toEqual([]);expect(restoredA.state.adventure.skybound!.parts[0].cargoMass).toBe(0);
  restoredA.send({type:'export',requestId:'camp-gear-export'});await until(()=>restoredA.packets.some(p=>p.type==='export'));const exported=restoredA.packets.find(p=>p.type==='export');if(exported?.type!=='export')throw Error('No export');expect(exported.save.adventure!.gearItems!.lots).toEqual([]);expect(exported.save.skybound!.storageGear![1].lots).toEqual([]);expect(exported.save.members).toBeUndefined();
 }finally{await Promise.all(clients.map(c=>c.close()));await server.close();await rm(directory,{recursive:true,force:true});}
},30000);
