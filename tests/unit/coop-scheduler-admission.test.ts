import {expect,it} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
function fixture(){const packets:CoopWireServerPacket[]=[],room=new AuthorityRoom(null,'wake'),id='a'.repeat(64);room.connect('a',{send:p=>packets.push(p),close:()=>{}});const send=(p:unknown)=>room.receive('a',JSON.stringify(p),id);return{room,packets,send,hello:()=>send({type:'hello',protocol:COOP_PROTOCOL})};}
it('admits wakes only from accepted authenticated inputs, real delivery receipts and valid pings',()=>{
 const f=fixture();expect(f.send({type:'ping'}).schedulerWake).toBeUndefined();const hello=f.hello();expect(hello.schedulerWake).toBeUndefined();expect(f.send({type:'ping'}).schedulerWake).toBeUndefined();hello.acknowledgment!();
 expect(f.send({type:'ping'}).schedulerWake).toBe(true);const input={type:'input',sequence:1,clientTick:Number.MAX_SAFE_INTEGER,input:{x:0,z:0,jump:false}};
 expect(f.send(input).schedulerWake).toBe(true);expect(f.send(input).schedulerWake).toBeUndefined();expect(f.send({...input,sequence:2,input:{x:100,z:0,jump:false}}).schedulerWake).toBeUndefined();
 expect(f.send({type:'delivery',token:'forged'}).schedulerWake).toBeUndefined();const welcome=f.packets.find(p=>p.type==='welcome')!;expect('delivery'in welcome).toBe(true);const token='delivery'in welcome?welcome.delivery:undefined;
 expect(f.send({type:'delivery',token}).schedulerWake).toBe(true);expect(f.send({type:'delivery',token}).schedulerWake).toBeUndefined();expect(f.send({type:'resync'}).schedulerWake).toBeUndefined();expect(f.send({type:'unknown'}).schedulerWake).toBeUndefined();expect(f.room.authority.sim.tick).toBe(0);
});
it('does not admit a wake from over-rate or failed-room traffic',()=>{
 const f=fixture();f.hello().acknowledgment!();for(let i=0;i<89;i++)expect(f.send({type:'ping'}).schedulerWake).toBe(true);expect(f.send({type:'ping'}).schedulerWake).toBeUndefined();f.room.failPersistence();expect(f.send({type:'ping'}).schedulerWake).toBeUndefined();
});
