import {COOP_PROTOCOL} from '../../src/networking/coop-protocol';
import { it, expect } from 'vitest';
import { authenticateCoopPacket } from '../../src/networking/coop-identity';
it('derives a stable public ID from a private resume key and ignores a claimed public identity',async()=>{
 const key='a'.repeat(64),packet=JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:key,playerId:'victim'});
 const first=await authenticateCoopPacket(packet),again=await authenticateCoopPacket(packet),other=await authenticateCoopPacket(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:'b'.repeat(64)}));
 expect(first).toEqual(again);expect(JSON.stringify(first)).not.toContain(key);expect(JSON.stringify(first)).not.toContain('victim');expect(first.playerId).toMatch(/^[a-f0-9]{64}$/);expect(first).not.toEqual(other);
 await expect(authenticateCoopPacket(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,playerId:first.playerId}))).rejects.toThrow('復帰');
});

it('rejects the preceding protocol instead of loading incompatible rigid-body saves',async()=>{await expect(authenticateCoopPacket(JSON.stringify({type:'hello',protocol:2,resumeKey:'a'.repeat(64)}))).rejects.toThrow('版');});
