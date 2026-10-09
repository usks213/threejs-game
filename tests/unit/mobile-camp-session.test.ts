import {expect,it} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import type {CoopWireServerPacket} from '../../src/networking/coop-protocol';
import {validateCheckpoint} from '../../src/save/checkpoint';
import {validateSave} from '../../src/save/format';
import {SessionAuthority} from '../../src/simulation/session';
import {legacySimulation} from '../helpers/legacy';
import {canCarry} from '../../src/game/meadows/inventory';
import {newMeadows} from '../../src/game/meadows/state';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {WORLD} from '../../src/world/types';
const aim={x:0,y:0,z:1},alice='a'.repeat(64),bob='b'.repeat(64);
function connected(room:AuthorityRoom,id:string,socket:string){const messages:CoopWireServerPacket[]=[];room.connect(socket,{send:p=>messages.push(p),close:()=>{}});room.receive(socket,JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),id).acknowledgment?.();return messages;}
function fixture(){
 const room=new AuthorityRoom({version:1,world:legacySimulation().save(),receipts:[]},'first');const a=connected(room,alice,'a'),b=connected(room,bob,'b'),sim=room.authority.sim,player=room.authority.actors.get(alice)!.player;
 sim.skybound.state.parts.push({id:1,kind:'storage',material:'wood',mass:20,cargoMass:12,position:{x:player.x+2,y:player.y+.5,z:player.z},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[],creator:alice,shared:true});
 sim.skybound.state.storage={'1':{wood:6}};room.authority.actors.get(alice)!.adventure.state.inventory={wood:10};room.authority.actors.get(bob)!.adventure.state.inventory={};
 return {room,a,b,sim};
}
function command(commandId:string,action:'sky-store'|'sky-take'|'sky-share'|'sky-camp',id:string,expectedEpoch?:number){return JSON.stringify({type:'action',commandId,message:{type:'game-action',action,id,aim,...(expectedEpoch===undefined?{}:{expectedEpoch})}});}
it('saves both sides before ACK, survives lost ACK/reconnect/restart, and rejects stale competing withdrawals',()=>{
 const {room,a,b,sim}=fixture();const store=command('store-once','sky-store','1:wood:3',0);
 const first=room.receive('a',store);expect(first.changed).toBe(true);expect(a.some(p=>p.type==='ack'&&p.commandId==='store-once')).toBe(false);
 const durable=validateCheckpoint(room.checkpoint());expect(durable.world.skybound?.storage?.[1]).toEqual({wood:9});expect(durable.world.members?.find(m=>m.id===alice)?.adventure.inventory.wood).toBe(7);
 // Simulate a completed durable write followed by disconnection before the success ACK reaches Alice.
 room.disconnect('a');const restarted=new AuthorityRoom(durable,'second'),newA=connected(restarted,alice,'again-a'),newB=connected(restarted,bob,'again-b');
 restarted.receive('again-a',store).acknowledgment?.();expect(newA.at(-1)).toMatchObject({type:'ack',accepted:true});
 expect(restarted.authority.actors.get(alice)?.adventure.state.inventory.wood).toBe(7);expect(restarted.authority.sim.skybound.state.storage?.[1]).toEqual({wood:9});
 restarted.receive('again-b',command('take-stale','sky-take','1:wood:5',0));expect(newB.at(-1)).toMatchObject({type:'ack',accepted:false});
 restarted.receive('again-b',command('take-current','sky-take','1:wood:5',1)).acknowledgment?.();expect(newB.at(-1)).toMatchObject({type:'ack',accepted:true});
 expect(restarted.authority.actors.get(bob)?.adventure.state.inventory.wood).toBe(5);expect(restarted.authority.sim.skybound.state.storage?.[1]).toEqual({wood:4});
 restarted.receive('again-b',command('take-current','sky-take','1:wood:5',1)).acknowledgment?.();expect(restarted.authority.sim.skybound.state.storage?.[1]).toEqual({wood:4});
 const total=restarted.authority.actors.get(alice)!.adventure.state.inventory.wood+restarted.authority.actors.get(bob)!.adventure.state.inventory.wood+restarted.authority.sim.skybound.state.storage![1].wood;expect(total).toBe(16);
 expect(restarted.authority.view(alice).adventure.inventory).toEqual({wood:7});expect(restarted.authority.view(bob).adventure.inventory).toEqual({wood:5});
 expect(sim.skybound.state.storage?.[1]).toEqual({wood:9});expect(b.some(p=>p.type==='ack')).toBe(false);
});
it('rejects missing storage epochs at the public boundary without spending',()=>{
 const {room,a}=fixture();const before=room.checkpoint();room.receive('a',command('missing','sky-store','1:wood:1'));
 expect(a.at(-1)).toMatchObject({type:'ack',accepted:false});expect(room.authority.sim.skybound.state.storage).toEqual(before.world.skybound?.storage);expect(room.authority.actors.get(alice)?.adventure.state.inventory.wood).toBe(10);
});
it('revocation increments epochs and denies former shared users even after a reconnect',()=>{
 const {room,a,b,sim}=fixture();room.receive('a',command('private','sky-share','1:off',0)).acknowledgment?.();expect(a.at(-1)).toMatchObject({type:'ack',accepted:true});
 room.receive('b',command('former-share','sky-take','1:wood:1',0));expect(b.at(-1)).toMatchObject({type:'ack',accepted:false});expect(sim.skybound.state.parts[0].epoch).toBe(1);
 room.receive('b',command('private-current','sky-take','1:wood:1',1));expect(b.at(-1)).toMatchObject({type:'ack',accepted:false});expect(room.authority.view(bob).adventure.skybound?.storage).toEqual([]);
 const restored=new SessionAuthority(validateSave(room.authority.save()),true);restored.join(bob);expect(restored.view(bob).adventure.skybound?.storage).toEqual([]);expect(restored.sim.skybound.state.storage?.[1]).toEqual({wood:6});
});
it('capacity callback respects split slots and carrying weight without dropping overflow onto the ground',()=>{
 const inventory={coins:399,wood:149},m=newMeadows();m.slots=Array.from({length:32},()=>({id:'coins',count:1}));
 const powers=new SkyboundPowers({version:2,parts:[{id:1,kind:'storage',material:'wood',mass:12,cargoMass:4,creator:'a',shared:false,position:{x:2,y:2,z:0},velocity:{x:0,y:0,z:0},rotation:0,epoch:0,links:[]}],storage:{'1':{wood:2}},blueprints:[],fusions:{}});
 const context={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory,actors:[],solid:()=>false,canReceiveItem:(id:string,n:number)=>canCarry(inventory,id,n,m)};
 expect(()=>powers.action('a','sky-take','1:wood:1',undefined,aim,context)).toThrow('空き');expect(inventory.wood).toBe(149);expect(powers.state.storage?.[1].wood).toBe(2);
 m.slots=[];expect(()=>powers.action('a','sky-take','1:wood:2',undefined,aim,context)).toThrow('空き');expect(inventory.wood).toBe(149);expect(powers.state.storage?.[1].wood).toBe(2);
 powers.action('a','sky-take','1:wood:1',undefined,aim,context);expect(inventory.wood).toBe(150);expect(powers.state.storage?.[1].wood).toBe(1);
});
