import {afterEach,describe,expect,it,vi} from 'vitest';
import {CheckpointStore,MAX_CHECKPOINT_ARCHIVES,type PreparedArchiveCleanup,type SaveStorage} from '../../src/save/checkpoint';
import {checksum,integer,record} from '../../src/save/validation';
interface World {wood:number}
const valid=(value:unknown):value is World=>record(value)&&integer(value.wood);
class Storage implements SaveStorage {
 data=new Map<string,string>();writes:string[]=[];removes:string[]=[];failSet='';dropSet='';failRemove='';dropRemove='';unavailable=false;afterWrite:(key:string)=>void=()=>{};afterRemove:(key:string)=>void=()=>{};
 getItem(key:string){if(this.unavailable)throw Error('offline');return this.data.get(key)??null;}
 setItem(key:string,value:string){if(this.unavailable||this.failSet===key)throw Error('quota');this.writes.push(key);if(this.dropSet!==key)this.data.set(key,value);this.afterWrite(key);}
 removeItem(key:string){if(this.unavailable||this.failRemove===key)throw Error('remove');this.removes.push(key);if(this.dropRemove!==key)this.data.delete(key);this.afterRemove(key);}
}
function entries(store:CheckpointStore<World>){const list=store.listArchives();if(!list.ok)throw Error(list.error);return list.entries;}
function fixture(count=4){let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now++);const storage=new Storage(),store=new CheckpointStore(storage,'world',valid);for(let wood=0;wood<count;wood++){expect(store.write({wood}).ok).toBe(true);expect(store.reset().ok).toBe(true);}store.write({wood:99});store.write({wood:100});const target=entries(store).at(-1)!;return {storage,store,target,key:store.archivePrefix+target.id};}
function prepared(store:CheckpointStore<World>,id:string){const result=store.prepareArchiveCleanup(id);if(!result.ok)throw Error(result.error);return result;}
afterEach(()=>vi.restoreAllMocks());
describe('explicit, export-first archive capacity management',()=>{
 it('prepares exact portable bytes read-only and only removes the confirmed selection',()=>{
  const {storage,store,target,key}=fixture();storage.data.set('world:migration-backup','migration-original');storage.data.set('other:archive:keep','other original');storage.data.set(store.corruptKey,'corrupt-original');
  const before=new Map(storage.data),writes=storage.writes.length,proof=prepared(store,target.id);expect(proof.raw).toBe(before.get(key));expect(proof.entry).toEqual(target);expect(proof.filename).toContain(checksum(proof.raw));expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(writes);
  expect(store.commitArchiveCleanup(proof.prepared)).toEqual({ok:true});expect(storage.getItem(key)).toBeNull();expect(entries(store)).toHaveLength(3);for(const [id,value] of before)if(id!==key&&id!==store.archiveIndexKey)expect(storage.data.get(id)).toBe(value);expect(storage.getItem(store.cleanupKey)).toBeNull();expect(store.inspectImport(proof.raw).ok).toBe(true);
 });
 it('releases a full 32-entry history without pruning any unselected record',()=>{
  const {storage,store,target,key}=fixture(MAX_CHECKPOINT_ARCHIVES);expect(store.reset().ok).toBe(false);const size=[...storage.data.values()].reduce((sum,raw)=>sum+raw.length,0);expect(store.commitArchiveCleanup(prepared(store,target.id).prepared).ok).toBe(true);expect([...storage.data.values()].reduce((sum,raw)=>sum+raw.length,0)).toBeLessThan(size);expect(entries(store)).toHaveLength(31);expect(store.reset().ok).toBe(true);expect(entries(store)).toHaveLength(32);expect(storage.getItem(key)).toBeNull();
 });
 it('protects current, backup and newest history independently',()=>{
  const {storage,store}=fixture(),all=entries(store),newest=all[0],active=all[1],backup=all[2];storage.data.set(store.key,storage.getItem(store.archivePrefix+active.id)!);storage.data.set(store.backupKey,storage.getItem(store.archivePrefix+backup.id)!);const before=new Map(storage.data);
  for(const item of [newest,active,backup])expect(store.prepareArchiveCleanup(item.id).ok).toBe(false);const list=store.listArchives();expect(list.ok&&Object.keys(list.cleanupProtection??{})).toHaveLength(3);expect(storage.data).toEqual(before);
 });
 it('permits explicitly selected import/restore archives while retaining every other original',()=>{
  const {storage,store,target}=fixture();const raw=storage.getItem(store.archiveIndexKey)!,index=JSON.parse(raw),values=JSON.parse(index.payload);values.find((item:{id:string})=>item.id===target.id).reason='import';index.payload=JSON.stringify(values);index.checksum=checksum(index.payload);storage.data.set(store.archiveIndexKey,JSON.stringify(index));expect(store.commitArchiveCleanup(prepared(store,target.id).prepared).ok).toBe(true);expect(entries(store)).toHaveLength(3);
 });
 it('cancels a proof, requires fresh selection on reopen, and rejects repeated commits',()=>{
  const {storage,store,target}=fixture(),before=new Map(storage.data),first=prepared(store,target.id);store.cancelArchiveCleanup(first.prepared);expect(store.commitArchiveCleanup(first.prepared).ok).toBe(false);expect(storage.data).toEqual(before);const next=prepared(store,target.id);expect(store.commitArchiveCleanup(next.prepared).ok).toBe(true);const done=new Map(storage.data);expect(store.commitArchiveCleanup(next.prepared).ok).toBe(false);expect(storage.data).toEqual(done);
 });
 it('rejects forged proofs, arbitrary IDs and proofs used with another store',()=>{
  const {storage,store,target}=fixture(),proof=prepared(store,target.id),other=new CheckpointStore(storage,'guest',valid),before=new Map(storage.data);
  expect(other.commitArchiveCleanup(proof.prepared).ok).toBe(false);expect(store.commitArchiveCleanup({...proof.prepared} as PreparedArchiveCleanup).ok).toBe(false);for(const id of ['../world','world:backup','unknown'])expect(store.prepareArchiveCleanup(id).ok).toBe(false);expect(storage.data).toEqual(before);
 });
 it.each(['primary','backup','index','record'])('rejects changed %s between export and confirmation without writes',slot=>{
  const {storage,store,target,key}=fixture(),proof=prepared(store,target.id);const changed=slot==='primary'?store.key:slot==='backup'?store.backupKey:slot==='index'?store.archiveIndexKey:key;storage.data.set(changed,'changed');const before=new Map(storage.data),writes=storage.writes.length;expect(store.commitArchiveCleanup(proof.prepared).ok).toBe(false);expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(writes);
 });
 it.each(['index','target','other','primary'])('refuses corrupt %s without any mutation',slot=>{
  const {storage,store,target,key}=fixture(),other=entries(store)[1];storage.data.set(slot==='index'?store.archiveIndexKey:slot==='target'?key:slot==='other'?store.archivePrefix+other.id:store.key,'broken');const before=new Map(storage.data);expect(store.prepareArchiveCleanup(target.id).ok).toBe(false);expect(storage.data).toEqual(before);
 });
 it('refuses cleanup when storage is unavailable',()=>{const {storage,store,target}=fixture();storage.unavailable=true;expect(store.prepareArchiveCleanup(target.id).ok).toBe(false);expect(store.recoverArchiveCleanup().ok).toBe(false);});
});

describe('cleanup quota failures, rollback and interrupted-browser recovery',()=>{
 it.each(['journal quota','journal dropped','index quota','index dropped','remove failed','remove dropped'])('preserves complete original history on %s',failure=>{
  const {storage,store,target,key}=fixture(),proof=prepared(store,target.id),before=new Map(storage.data);
  if(failure==='journal quota')storage.failSet=store.cleanupKey;if(failure==='journal dropped')storage.dropSet=store.cleanupKey;if(failure==='index quota')storage.failSet=store.archiveIndexKey;if(failure==='index dropped')storage.dropSet=store.archiveIndexKey;if(failure==='remove failed')storage.failRemove=key;if(failure==='remove dropped')storage.dropRemove=key;
  expect(store.commitArchiveCleanup(proof.prepared).ok).toBe(false);expect(storage.data).toEqual(before);expect(entries(store)).toHaveLength(4);
 });
 it('keeps bounded recovery metadata when index rollback also fails; reopen restores without deleting',()=>{
  const {storage,store,target,key}=fixture(),proof=prepared(store,target.id),before=new Map(storage.data);storage.failRemove=key;storage.afterWrite=changed=>{if(changed===store.archiveIndexKey)storage.failSet=store.archiveIndexKey;};expect(store.commitArchiveCleanup(proof.prepared).ok).toBe(false);expect(storage.getItem(key)).toBe(before.get(key));expect(storage.getItem(store.cleanupKey)!.length).toBeLessThan(131072);expect(store.listArchives()).toMatchObject({ok:true,cleanupPending:expect.any(String)});
  storage.failSet='';storage.failRemove='';storage.afterWrite=()=>{};const reloaded=new CheckpointStore(storage,'world',valid),removes=storage.removes.length;expect(reloaded.recoverArchiveCleanup()).toEqual({ok:true});expect(storage.data).toEqual(before);expect(storage.removes.slice(removes)).toEqual([store.cleanupKey]);expect(reloaded.recoverArchiveCleanup()).toEqual({ok:true});
 });
 it.each(['journal','index','record'])('never resumes deletion automatically after interruption at %s',stage=>{
  const {storage,store,target,key}=fixture(),proof=prepared(store,target.id),before=new Map(storage.data);storage.afterWrite=changed=>{if(changed===(stage==='journal'?store.cleanupKey:stage==='index'?store.archiveIndexKey:'none'))storage.unavailable=true;};storage.afterRemove=changed=>{if(stage==='record'&&changed===key)storage.unavailable=true;};expect(store.commitArchiveCleanup(proof.prepared).ok).toBe(false);
  storage.unavailable=false;storage.afterWrite=()=>{};storage.afterRemove=()=>{};const reloaded=new CheckpointStore(storage,'world',valid),observed=new Map(storage.data),removes=storage.removes.length;expect(reloaded.listArchives()).toMatchObject({ok:true,cleanupPending:expect.any(String)});expect(storage.data).toEqual(observed);expect(reloaded.reset().ok).toBe(false);expect(reloaded.restore(entries(reloaded)[0].id).ok).toBe(false);expect(reloaded.prepareArchiveCleanup(entries(reloaded).at(-1)!.id).ok).toBe(false);expect(reloaded.importFile(proof.raw).ok).toBe(false);expect(storage.data).toEqual(observed);
  expect(reloaded.recoverArchiveCleanup()).toEqual({ok:true});expect(storage.removes.slice(removes)).toEqual([store.cleanupKey]);expect(storage.getItem(store.key)).toBe(before.get(store.key));expect(storage.getItem(store.backupKey)).toBe(before.get(store.backupKey));if(stage==='record'){expect(storage.getItem(key)).toBeNull();expect(entries(reloaded)).toHaveLength(3);}else expect(storage.data).toEqual(before);
 });
 it('reports an unverified final receipt and supports explicit recovery without another removal',()=>{
  const {storage,store,target,key}=fixture();storage.failRemove=store.cleanupKey;expect(store.commitArchiveCleanup(prepared(store,target.id).prepared).ok).toBe(false);expect(storage.getItem(key)).toBeNull();expect(store.listArchives()).toMatchObject({ok:true,cleanupPending:expect.any(String)});storage.failRemove='';const count=storage.removes.filter(id=>id===key).length;expect(store.recoverArchiveCleanup().ok).toBe(true);expect(storage.removes.filter(id=>id===key)).toHaveLength(count);
 });
 it('preserves every byte when recovery metadata is corrupt or points at another namespace',()=>{
  const {storage,store}=fixture();for(const raw of ['broken',JSON.stringify({format:'voxel-campaign-cleanup',version:1,scope:'other',payload:'{}',checksum:checksum('{}')})]){storage.data.set(store.cleanupKey,raw);const before=new Map(storage.data);expect(store.listArchives().ok).toBe(false);expect(store.recoverArchiveCleanup().ok).toBe(false);expect(storage.data).toEqual(before);}
 });
 it('does not replace a concurrently updated history during rollback or recovery',()=>{
  const {storage,store,target,key}=fixture();storage.afterWrite=changed=>{if(changed===store.archiveIndexKey){storage.data.set(store.archiveIndexKey,'concurrent index');storage.failRemove=key;}};expect(store.commitArchiveCleanup(prepared(store,target.id).prepared).ok).toBe(false);const before=new Map(storage.data);expect(store.recoverArchiveCleanup().ok).toBe(false);expect(storage.data).toEqual(before);expect(storage.getItem(key)).not.toBeNull();
 });
});
