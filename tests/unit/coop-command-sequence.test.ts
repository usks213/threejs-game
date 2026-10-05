import {expect,it} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
import {validateCheckpoint} from '../../src/save/checkpoint';
const player='f'.repeat(64);
function connect(room:AuthorityRoom){const out:CoopWireServerPacket[]=[];room.connect('c',{send:p=>out.push(p),close(){}});room.receive('c',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),player).acknowledgment?.();return out;}
function command(room:AuthorityRoom,id:string){room.step();return room.receive('c',JSON.stringify({type:'action',commandId:id,message:{type:'game-action',action:'sprint'}}));}
it('rejects expired sequenced effects after 256 later commands and durable restart',()=>{
 const room=new AuthorityRoom(null,'one');connect(room);let calls=0;room.authority.action=()=>{calls++;return {message:'ok',dirty:[]};};
 for(let n=1;n<=300;n++)command(room,`seq_${n}_test`).acknowledgment?.();expect(calls).toBe(300);
 command(room,'seq_1_test');expect(calls).toBe(300);
 const checkpoint=validateCheckpoint(room.checkpoint());expect(checkpoint.actionSequences).toEqual([[player,300]]);
 const restored=new AuthorityRoom(checkpoint,'two'),out=connect(restored);restored.authority.action=()=>{calls++;return {message:'ok',dirty:[]};};command(restored,'seq_1_test');expect(calls).toBe(300);expect(out.some(p=>p.type==='ack'&&!p.accepted)).toBe(true);command(restored,'seq_301_next');expect(calls).toBe(301);
});
it('never evicts legacy receipts and safely requests upgrade when their bounded store fills',()=>{
 const room=new AuthorityRoom(null,'one'),out=connect(room);let calls=0;room.authority.action=()=>{calls++;return {message:'ok',dirty:[]};};for(let n=0;n<256;n++)command(room,'legacy_'+n).acknowledgment?.();command(room,'legacy_overflow');command(room,'legacy_0').acknowledgment?.();expect(calls).toBe(256);expect(out.some(p=>p.type==='ack'&&!p.accepted&&p.message.includes('更新'))).toBe(true);command(room,'seq_1_upgrade');expect(calls).toBe(257);
});
it('rejects malformed durable sequence records rather than losing replay protection',()=>{
 const room=new AuthorityRoom(null,'one');connect(room);const checkpoint=room.checkpoint();for(const actionSequences of [[[player,-1]],[[player,1.5]],[[player,1],[player,2]]])expect(()=>validateCheckpoint({...checkpoint,actionSequences})).toThrow('連番');
});
