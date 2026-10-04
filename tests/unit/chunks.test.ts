import { legacySimulation } from '../helpers/legacy';
import {it,expect} from 'vitest';
import {partitionWorld,encodeChunk,decodeChunk} from '../../src/save/chunks';
import {GameSimulation} from '../../src/simulation/game-simulation';
it('groups sparse world changes by chunk and keeps edit identities',()=>{
 const sim=legacySimulation();sim.editGround('dig',{x:0,y:sim.player.y,z:8},1);
 const save=sim.save(),chunks=partitionWorld(save);
 expect(chunks.size).toBe(1);expect([...chunks.values()][0].edits[0].id).toBe(1);
});
it('losslessly compresses a saved chunk and falls back to JSON for tiny data',async()=>{
 const text=JSON.stringify({edits:Array.from({length:500},(_,i)=>({id:i,x:i%4,y:0,z:0}))});
 const encoded=await encodeChunk(text);expect(encoded.bytes.byteLength).toBeLessThan(new TextEncoder().encode(text).byteLength);expect(await decodeChunk(encoded)).toBe(text);
 expect(await decodeChunk(await encodeChunk('{}'))).toBe('{}');
});

