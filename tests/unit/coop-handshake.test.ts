import {expect,it} from 'vitest';
import {authenticateCoopPacket} from '../../src/networking/coop-identity';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';
import {COOP_BUILD_ID,helloInfo,validateSessionInfo} from '../../src/networking/coop-handshake';
const roomId='e'.repeat(48);
it('sends explicit public build/room/seed/version/tick without exposing the resume capability',async()=>{
 const key='a'.repeat(64),verified=await authenticateCoopPacket(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key,roomId,buildId:'client-build',clientTick:8}));
 expect(JSON.parse(verified.text)).toEqual({type:'hello',protocol:COOP_PROTOCOL,roomId,buildId:'client-build',clientTick:8});expect(verified.text).not.toContain(key);
 const room=new AuthorityRoom(null,'epoch',roomId),out:CoopWireServerPacket[]=[];room.connect('a',{send:p=>out.push(p),close(){}});room.receive('a',verified.text,verified.playerId).acknowledgment?.();
 const packet=out.find(p=>p.type==='welcome');expect(packet?.type).toBe('welcome');if(packet?.type!=='welcome')throw Error('Missing welcome');
 expect(packet.session).toEqual({buildId:COOP_BUILD_ID,roomId,worldSeed:packet.save.seed,worldVersion:packet.save.version,generator:packet.save.generator,serverTick:packet.state.tick});expect(validateSessionInfo(packet.session,roomId,packet.save,packet.state)).toEqual(packet.session);expect(JSON.stringify(packet)).not.toContain(key);
 expect(()=>validateSessionInfo({...packet.session,roomId:'f'.repeat(48)},roomId,packet.save,packet.state)).toThrow('一致');expect(()=>validateSessionInfo({...packet.session,serverTick:packet.state.tick+1},roomId,packet.save,packet.state)).toThrow('一致');
});
it('rejects a valid but wrong invited room before assigning membership',async()=>{
 const room=new AuthorityRoom(null,'epoch',roomId),out:CoopWireServerPacket[]=[];room.connect('a',{send:p=>out.push(p),close(){}});const verified=await authenticateCoopPacket(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:'b'.repeat(64),roomId:'f'.repeat(48)}));room.receive('a',verified.text,verified.playerId).acknowledgment?.();expect(out.some(p=>p.type==='welcome')).toBe(false);expect(out.some(p=>p.type==='notice'&&p.message.includes('一致'))).toBe(true);expect(room.authority.actors.size).toBe(1);
});
it('keeps old protocol7 headers compatible but validates every supplied metadata field',async()=>{
 const verified=await authenticateCoopPacket(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:'c'.repeat(64)}));expect(JSON.parse(verified.text)).toEqual({type:'hello',protocol:COOP_PROTOCOL});
 for(const raw of [{buildId:'<script>'},{buildId:'x'.repeat(81)},{roomId:'../other'},{clientTick:-1},{clientTick:NaN},{clientTick:Infinity},{clientTick:1.5}])expect(()=>helloInfo(raw)).toThrow();
});
it('treats client tick as diagnostics, never as authority elapsed time',()=>{
 const room=new AuthorityRoom(null,'epoch',roomId),out:CoopWireServerPacket[]=[];room.connect('a',{send:p=>out.push(p),close(){}});room.receive('a',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),'d'.repeat(64)).acknowledgment?.();const actor=room.authority.actors.get('d'.repeat(64))!,before=actor.player.x;
 room.receive('a',JSON.stringify({type:'input',sequence:1,clientTick:Number.MAX_SAFE_INTEGER,input:{x:1,z:0,jump:false}}));room.step();expect(actor.player.x-before).toBeGreaterThan(0);expect(actor.player.x-before).toBeLessThan(.3);
 room.receive('a',JSON.stringify({type:'input',sequence:2,clientTick:-1,input:{x:1,z:0,jump:false}}));expect(out.some(p=>p.type==='notice'&&p.message.includes('入力時刻'))).toBe(true);expect(actor.sequence).toBe(1);
});
