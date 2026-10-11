import { expect, it } from 'vitest';
import { decodeCheckpoint, encodeCheckpoint, selectCheckpoint, validateCheckpoint } from '../../src/save/checkpoint';
import { legacySimulation } from '../helpers/legacy';
const checkpoint=()=>({version:1 as const,world:legacySimulation().save(),receipts:[['player',['cmd-1']]] as [string,string[]][]});
it('validates old checkpoints, strips unknown outer fields and rejects malformed or future receipt versions',()=>{
 const old=checkpoint();expect(validateCheckpoint({...old,resumeKey:'private'})).toEqual(old);expect(()=>validateCheckpoint({...old,version:2})).toThrow();expect(()=>validateCheckpoint({...old,receipts:[['player',['repeat','repeat']]]})).toThrow();
});
it('checks all immutable generation segments and their checksum before restoring',async()=>{
 const encoded=await encodeCheckpoint(checkpoint(),'generation-1');expect(await decodeCheckpoint(encoded.manifest,async key=>encoded.segments[key])).toEqual(checkpoint());
 await expect(decodeCheckpoint(encoded.manifest,async()=>undefined)).rejects.toThrow('断片');const key=Object.keys(encoded.segments)[0];encoded.segments[key]+='x';await expect(decodeCheckpoint(encoded.manifest,async key=>encoded.segments[key])).rejects.toThrow('検証値');
});
it('chooses the normal previous checkpoint on corruption and blocks rather than resets when neither can load',()=>{
 expect(selectCheckpoint(undefined,undefined).status).toBe('empty');expect(selectCheckpoint(checkpoint(),undefined).status).toBe('loaded');expect(selectCheckpoint({version:999},checkpoint()).status).toBe('recovered');expect(selectCheckpoint({version:999},{version:999}).status).toBe('blocked');expect(selectCheckpoint(undefined,checkpoint()).status).toBe('recovered');
});
