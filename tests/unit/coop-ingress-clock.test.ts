import {expect,it} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
function fixture(){let now=0;const room=new AuthorityRoom(null,'ingress-clock',null,()=>now),packets:CoopWireServerPacket[]=[],closed:{code:number;reason:string}[]=[];room.connect('a',{send:p=>packets.push(p),close:(code,reason)=>closed.push({code,reason})});room.receive('a',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),'a'.repeat(64)).acknowledgment?.();return{room,packets,closed,time:(value:number)=>now=value};}
it('accepts ordinary real-time traffic while simulation ticks are completely stalled',()=>{
 const f=fixture();let sequence=0;
 for(let second=0;second<10;second++){f.time(second+1);for(let i=0;i<20;i++){f.room.receive('a',JSON.stringify({type:'input',sequence:++sequence,input:{x:0,z:0,jump:false}}));f.room.receive('a',JSON.stringify({type:'ping'}));}}
 expect(f.room.authority.sim.tick).toBe(0);expect(f.closed).toEqual([]);expect(f.packets.filter(p=>p.type==='pong')).toHaveLength(200);
});
it('still rejects a true ninety-first packet in one transport second and preserves the participant',()=>{
 const f=fixture();for(let i=0;i<89;i++)f.room.receive('a',JSON.stringify({type:'ping'}));expect(f.closed).toEqual([]);f.room.receive('a',JSON.stringify({type:'ping'}));expect(f.closed).toEqual([{code:1008,reason:'Rate limit'}]);expect(f.room.authority.hasRecordedPlayer('a'.repeat(64))).toBe(true);
});
it('resets the fixed ingress window at a real second boundary without advancing game time',()=>{
 const f=fixture();for(let i=0;i<89;i++)f.room.receive('a',JSON.stringify({type:'ping'}));f.time(1);for(let i=0;i<90;i++)f.room.receive('a',JSON.stringify({type:'ping'}));expect(f.closed).toEqual([]);expect(f.room.authority.sim.tick).toBe(0);
});
