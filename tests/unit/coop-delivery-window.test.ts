import {it,expect} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
// These cases step complete worlds; the limit is runner wall time, not a gameplay latency assertion.
function join(room:AuthorityRoom,id:string,receive:(p:CoopWireServerPacket)=>void,close:(code:number)=>void=()=>{}){room.connect(id,{send:receive,close});room.receive(id,JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),id.repeat(64)).acknowledgment?.();}
it('bounds a slow receiver without stopping another player, then continues its exact delta baseline after receipts',()=>{
 const room=new AuthorityRoom(null,'delivery'),slow:CoopWireServerPacket[]=[],fast=new CoopFrameDecoder(token=>room.receive('a',JSON.stringify({type:'delivery',token})));let fastFrames=0;
 join(room,'a',p=>{if(fast.accept(p).type==='frame')fastFrames++;});join(room,'b',p=>slow.push(structuredClone(p)));
 for(let i=0;i<90;i++)room.step();const sent=slow.filter(p=>p.type==='delta').length;expect(sent).toBeGreaterThan(0);expect(sent).toBeLessThanOrEqual(20);expect(fastFrames).toBe(30);
 const decoder=new CoopFrameDecoder(token=>room.receive('b',JSON.stringify({type:'delivery',token})));for(const packet of slow.splice(0))decoder.accept(packet);
 for(let i=0;i<6;i++)room.step();expect(slow.some(p=>p.type==='delta')).toBe(true);for(const packet of slow)expect(()=>decoder.accept(packet)).not.toThrow();
},20000);
it('closes a stalled receiver after the bound while preserving its recorded participant and save',()=>{
 const room=new AuthorityRoom(null,'delivery'),slow:CoopWireServerPacket[]=[];let closed=0;join(room,'b',p=>slow.push(p),code=>closed=code);for(let i=0;i<340;i++)room.step();expect(closed).toBe(1013);expect(room.authority.hasRecordedPlayer('b'.repeat(64))).toBe(true);expect(room.checkpoint().world).toBeDefined();expect(slow.filter(p=>p.type==='delta').length).toBeLessThanOrEqual(20);
},20000);
