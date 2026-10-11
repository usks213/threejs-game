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
const roomId='d'.repeat(48),keys=['5'.repeat(64),'6'.repeat(64)],owners=keys.map(key=>createHash('sha256').update(key).digest('hex')),aim={x:0,y:0,z:1};
async function until(test:()=>boolean){const end=performance.now()+8000;while(!test()){if(performance.now()>end)throw Error('Equipment socket state did not converge');await new Promise(r=>setTimeout(r,25));}}
async function connect(port:number,key:string){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/coop/${roomId}`),packets:CoopServerPacket[]=[],decoder=new CoopFrameDecoder(token=>socket.send(JSON.stringify({type:'delivery',token})));let state:Snapshot|undefined;
 socket.on('message',data=>{const packet=decoder.accept(JSON.parse(String(data)));packets.push(packet);if(packet.type==='welcome'||packet.type==='frame')state=packet.state;});
 await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});const send=(packet:unknown)=>socket.send(JSON.stringify(packet));send({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key});await until(()=>!!state);
 return{socket,packets,send,get state(){return state!;},async close(){if(socket.readyState===WebSocket.CLOSED)return;const done=new Promise<void>(r=>socket.once('close',()=>r()));socket.close();await done;}};
}
const command=(commandId:string,action:'drop'|'gather'|'equip',id:string)=>({type:'action',commandId,message:{type:'game-action',action,id,aim}});
it('two real protocol clients transfer one exact fused item through duplicate commands and durable restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'voxel-equipment-')),fixture=new AuthorityRoom(null,'equipment-fixture'),sim=fixture.authority.sim;
 sim.fluid.restore([]);sim.bodies.length=0;sim.adventure.state.enemies=[];sim.adventure.state.resources=[];sim.adventure.state.buildings=[];
 const a=fixture.authority.join(owners[0]),b=fixture.authority.join(owners[1]);Object.assign(a.player,{x:12,y:sim.groundAt(12,12),z:12});Object.assign(b.player,{x:13,y:sim.groundAt(13,12),z:12});
 a.adventure.state.inventory={club:1};a.adventure.gear.commit(migrateGear(a.adventure.state.inventory,()=>sim.allocateEntityId(),{quality:{club:3},durability:{club:7},fusions:[{equipment:'club',material:'resin',damage:4,durability:12,effect:'fire'}]}));
 b.adventure.state.inventory={club:1};b.adventure.gear.commit(migrateGear(b.adventure.state.inventory,()=>sim.allocateEntityId(),{quality:{club:1},durability:{club:88}}));const original=structuredClone(a.adventure.state.gearItems!.lots[0]),otherId=b.adventure.state.gearItems!.lots[0].id;
 await writeFile(join(directory,roomId+'.json'),JSON.stringify(fixture.checkpoint()));let server=await startCoopServer(0,directory);const clients:Awaited<ReturnType<typeof connect>>[]=[];
 try{
  const first=await connect(server.port,keys[0]),second=await connect(server.port,keys[1]);clients.push(first,second);
  const drop=command('gear-drop','drop',`gear:${original.id}:1`);first.send(drop);await until(()=>first.packets.some(p=>p.type==='ack'&&p.commandId==='gear-drop'));expect(first.packets.find(p=>p.type==='ack'&&p.commandId==='gear-drop')).toMatchObject({accepted:true});
  await until(()=>second.state.adventure.resources.some(n=>n.gearItems?.lots.some(l=>l.id===original.id)));const node=second.state.adventure.resources.find(n=>n.gearItems?.lots.some(l=>l.id===original.id))!;
  const pickup=command('gear-pickup','gather',String(node.id));second.send(pickup);await until(()=>second.packets.some(p=>p.type==='ack'&&p.commandId==='gear-pickup'));expect(second.packets.find(p=>p.type==='ack'&&p.commandId==='gear-pickup')).toMatchObject({accepted:true});
  await until(()=>second.state.adventure.gearItems?.lots.some(l=>l.id===original.id)===true&&first.state.adventure.inventory.club===0);
  expect(second.state.adventure.gearItems!.lots).toContainEqual(original);expect(second.state.adventure.gearItems!.activeByKind.club).toBe(otherId);expect(second.state.adventure.meadows!.durability.club).toBe(88);
  first.send(drop);second.send(pickup);await new Promise(r=>setTimeout(r,100));expect(second.state.adventure.inventory.club).toBe(2);expect(first.state.adventure.gearItems!.lots).toEqual([]);
  await Promise.all(clients.map(c=>c.close()));clients.length=0;await server.close();server=await startCoopServer(0,directory);
  const restoredA=await connect(server.port,keys[0]),restoredB=await connect(server.port,keys[1]);clients.push(restoredA,restoredB);restoredA.send(drop);restoredB.send(pickup);await until(()=>restoredA.packets.some(p=>p.type==='ack')&&restoredB.packets.some(p=>p.type==='ack'));
  expect(restoredA.state.adventure.inventory.club).toBe(0);expect(restoredB.state.adventure.inventory.club).toBe(2);expect(restoredB.state.adventure.gearItems!.lots).toContainEqual(original);
  restoredB.send(command('gear-select','equip',`gear:${original.id}`));await until(()=>restoredB.state.adventure.gearItems?.activeByKind.club===original.id);expect(restoredB.state.adventure.skybound?.fusions).toEqual([original.fusion]);expect(restoredB.state.adventure.meadows!.quality.club).toBe(3);
  restoredA.send({type:'export',requestId:'gear-private-export'});await until(()=>restoredA.packets.some(p=>p.type==='export'));const exported=restoredA.packets.find(p=>p.type==='export');if(exported?.type!=='export')throw Error('No export');expect(exported.save.adventure!.gearItems!.lots).toEqual([]);expect(JSON.stringify(exported.save)).not.toContain(`\"id\":${original.id},\"kind\":\"club\"`);
 }finally{await Promise.all(clients.map(c=>c.close()));await server.close();await rm(directory,{recursive:true,force:true});}
},30000);
