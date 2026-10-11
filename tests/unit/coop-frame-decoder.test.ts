import {it,expect} from 'vitest';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
import {sessionFrame} from '../../src/networking/frame';
const canonical=(value:unknown)=>JSON.parse(JSON.stringify(value));
const snapshot=(value:ReturnType<typeof sessionFrame>)=>canonical({...value,fluids:[...value.fluids].sort((a,b)=>a.x-b.x||a.y-b.y||a.z-b.z)});
it('reconstructs the entire current authority snapshot, including water, from protocol6 wire deltas',()=>{
 const room=new AuthorityRoom(null,'codec'),decoder=new CoopFrameDecoder(),owner='a'.repeat(64);let frames=0;
 room.connect('a',{send:raw=>{const packet=decoder.accept(canonical(raw));if(packet.type==='frame'){frames++;expect(snapshot(packet.state)).toEqual(snapshot(sessionFrame(room.authority,owner)));expect(raw.type).toBe('delta');}},close:()=>{}});
 room.receive('a',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),owner).acknowledgment?.();for(let tick=0;tick<12;tick++)room.step();expect(frames).toBe(4);
});
it('does not deliver a partial compound update and requires a new welcome after a missing or malformed delta',()=>{
 const room=new AuthorityRoom(null,'codec'),wire:CoopWireServerPacket[]=[],owner='a'.repeat(64);room.connect('a',{send:p=>wire.push(canonical(p)),close:()=>{}});room.receive('a',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),owner).acknowledgment?.();for(let i=0;i<9;i++)room.step();const welcome=wire.find(p=>p.type==='welcome')!,deltas=wire.filter(p=>p.type==='delta'),decoder=new CoopFrameDecoder();decoder.accept(welcome);decoder.accept(deltas[0]);expect(()=>decoder.accept(deltas[2])).toThrow();expect(()=>decoder.accept(deltas[1])).toThrow('再同期');decoder.accept(welcome);expect(decoder.accept(deltas[0]).type).toBe('frame');
 const broken=structuredClone(deltas[1]);if(broken.type!=='delta')throw Error('missing delta');broken.water.data='AAAA';expect(()=>decoder.accept(broken)).toThrow();expect(()=>decoder.accept(deltas[1])).toThrow('再同期');decoder.accept(welcome);expect(decoder.accept(deltas[0]).type).toBe('frame');
});
