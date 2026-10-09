import { expect, it } from 'vitest';
import { CURRENT, PREVIOUS, SaveRepository, headToken } from '../../src/save/repository';
import type { SaveStore, StorageBatch, Manifest3 } from '../../src/save/repository';
import { encodeChunk } from '../../src/save/chunks';
import { legacySimulation } from '../helpers/legacy';
class MemoryStore implements SaveStore {
 worlds=new Map<string,unknown>();chunks=new Map<string,unknown>();fail:string|undefined;
 async read(name:'worlds'|'chunks',keys:readonly string[]){return new Map(keys.filter(key=>this[name].has(key)).map(key=>[key,structuredClone(this[name].get(key))]));}
 async keys(name:'worlds'|'chunks'){return [...this[name].keys()];}
 async commit(batch:StorageBatch){if(headToken(this.worlds.get(CURRENT))!==batch.expectedHead)throw Error('Concurrent change');const worlds=new Map(this.worlds),chunks=new Map(this.chunks);for(const[key,value]of batch.worlds)worlds.set(key,structuredClone(value));for(const[key,value]of batch.chunks)chunks.set(key,structuredClone(value));for(const key of batch.deleteWorlds??[])worlds.delete(key);for(const key of batch.deleteChunks??[])chunks.delete(key);if(this.fail){const error=this.fail;this.fail=undefined;throw Error(error);}this.worlds=worlds;this.chunks=chunks;}
}
function world(n=1){const save=legacySimulation().save();save.adventure!.inventory.wood=n;save.edits=[{id:1,kind:'dig' as const,position:{x:0,y:1,z:8},radius:1+n*.2,material:'stone' as const,tick:1}];return save;}
it('keeps immutable previous chunks and requires an explicit recovery before autosaving a corrupt current',async()=>{
 const store=new MemoryStore(),repo=new SaveRepository(store);expect(await repo.load()).toEqual({status:'empty'});await repo.save(world(1));const first=structuredClone(store.worlds.get(CURRENT)) as Manifest3;await repo.save(world(2));const current=store.worlds.get(CURRENT) as Manifest3;expect(current.chunks[0]).not.toBe(first.chunks[0]);expect(store.chunks.has(first.chunks[0])).toBe(true);
 store.chunks.set(current.chunks[0],{format:'json',bytes:new TextEncoder().encode('{}').buffer});const recovery=new SaveRepository(store),loaded=await recovery.load();expect(loaded.status).toBe('recoverable');await expect(recovery.save(world(3))).rejects.toThrow('保護中');
 const restored=await recovery.restorePrevious();expect(restored.adventure!.inventory.wood).toBe(1);expect([...store.worlds.keys()].some(key=>key.startsWith('protected:'))).toBe(true);
 const final=await new SaveRepository(store).load();expect(final.status).toBe('loaded');if(final.status==='loaded')expect(final.save.edits[0].radius).toBe(1.2);
});
it('protects both unreadable records and never silently turns corruption into a new world',async()=>{
 const store=new MemoryStore();store.worlds.set(CURRENT,{storageVersion:999,resumeKey:'legacy-unexpected-field',chunks:[]});store.worlds.set(PREVIOUS,{bad:true});const original=structuredClone([...store.worlds]),repo=new SaveRepository(store);
 expect((await repo.load()).status).toBe('blocked');await expect(repo.save(world())).rejects.toThrow('保護中');expect([...store.worlds]).toEqual(original);
 await repo.startNew();const archived=[...store.worlds].find(([key])=>key.startsWith('protected:'))![1] as {current:unknown;previous:unknown};expect(archived.current).toEqual(original[0][1]);expect(archived.previous).toEqual(original[1][1]);await repo.save(world(3));expect((await new SaveRepository(store).load()).status).toBe('loaded');
});
it('preserves the old current across quota or interrupted transaction failures, then safely retries cached chunks',async()=>{
 const store=new MemoryStore(),repo=new SaveRepository(store);await repo.load();await repo.save(world(1));const initial=structuredClone(store.worlds.get(CURRENT));
 for(const failure of ['QuotaExceededError','AbortError']){store.fail=failure;await expect(repo.save(world(2))).rejects.toThrow(failure);expect(store.worlds.get(CURRENT)).toEqual(initial);}
 await repo.save(world(2));const loaded=await new SaveRepository(store).load();expect(loaded.status).toBe('loaded');if(loaded.status==='loaded')expect(loaded.save.edits[0].radius).toBe(1.4);
});
it('migrates v2 chunk manifests and raw saves while preserving a readable previous generation',async()=>{
 for(const manifest of [false,true]){const store=new MemoryStore(),save=world(1);if(manifest){store.worlds.set(CURRENT,{storageVersion:2,save:{...save,edits:[],fluids:[],bodies:[]},chunks:['0,0,0']});store.chunks.set('0,0,0',await encodeChunk(JSON.stringify({edits:save.edits,fluids:[],bodies:[]})));}else store.worlds.set(CURRENT,save);
 const repo=new SaveRepository(store);expect((await repo.load()).status).toBe('loaded');await repo.save(world(2));expect((store.worlds.get(CURRENT) as Manifest3).storageVersion).toBe(3);store.worlds.set(CURRENT,{broken:true});expect((await new SaveRepository(store).load()).status).toBe('recoverable');}
});
it('does not start a new world if archiving fails and rejects a concurrent-tab overwrite',async()=>{
 const store=new MemoryStore();store.worlds.set(CURRENT,{broken:true});const repo=new SaveRepository(store);await repo.load();store.fail='QuotaExceededError';await expect(repo.startNew()).rejects.toThrow('Quota');expect(store.worlds.get(CURRENT)).toEqual({broken:true});await expect(repo.save(world())).rejects.toThrow('保護中');
 const clean=new MemoryStore(),one=new SaveRepository(clean),two=new SaveRepository(clean);await one.load();await two.load();await one.save(world(1));await expect(two.save(world(2))).rejects.toThrow('Concurrent');const loaded=await new SaveRepository(clean).load();if(loaded.status==='loaded')expect(loaded.save.adventure!.inventory.wood).toBe(1);
});
it('imports only validated saves and keeps the previous valid world after explicit new-game startup',async()=>{
 const store=new MemoryStore(),repo=new SaveRepository(store);await repo.load();await repo.save(world(1));await repo.startNew();await repo.save(world(2));store.worlds.set(CURRENT,{broken:true});const other=new SaveRepository(store);expect((await other.load()).status).toBe('recoverable');await expect(other.import({...world(),version:99} as never)).rejects.toBeDefined();
 const imported=await other.import(world(3));expect(imported.adventure!.inventory.wood).toBe(3);expect((await new SaveRepository(store).load()).status).toBe('loaded');
});

it('publishes only the revision of a committed manifest and retains it after failed writes or archive reset',async()=>{
 const store=new MemoryStore(),repo=new SaveRepository(store);await repo.load();expect(repo.persistedRevision).toBeUndefined();await repo.save(world(1));const first=repo.persistedRevision;expect(first).toBe((store.worlds.get(CURRENT) as Manifest3).revision);store.fail='quota';await expect(repo.save(world(2))).rejects.toThrow('quota');expect(repo.persistedRevision).toBe(first);store.fail='archive failure';await expect(repo.startNew()).rejects.toThrow('archive failure');expect(repo.persistedRevision).toBe(first);await repo.save(world(2));const second=repo.persistedRevision;expect(second).not.toBe(first);const loaded=new SaveRepository(store);await loaded.load();expect(loaded.persistedRevision).toBe(second);await loaded.startNew();expect(loaded.persistedRevision).toBeUndefined();
});
it('does not invent a revision for a legacy raw save or an uncommitted pending write',async()=>{
 const store=new MemoryStore();store.worlds.set(CURRENT,world(1));const repo=new SaveRepository(store);await repo.load();expect(repo.persistedRevision).toBeUndefined();let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve),original=store.commit.bind(store);store.commit=async batch=>{await gate;return original(batch);};const saving=repo.save(world(2));await new Promise(resolve=>setTimeout(resolve,10));expect(repo.persistedRevision).toBeUndefined();release();await saving;expect(repo.persistedRevision).toBe((store.worlds.get(CURRENT) as Manifest3).revision);
});
