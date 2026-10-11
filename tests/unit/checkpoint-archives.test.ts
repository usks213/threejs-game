import {afterEach,describe,expect,it,vi} from 'vitest';
import {CheckpointStore,MAX_CHECKPOINT_ARCHIVES,type SaveStorage} from '../../src/save/checkpoint';
import {checksum,record,integer} from '../../src/save/validation';
import {campaignSaveControls,cooperationControls} from '../../src/prototype/campaign-ui';

interface World {wood:number}
const validate=(value:unknown):value is World=>record(value)&&integer(value.wood);
class MemoryStorage implements SaveStorage {
 readonly data=new Map<string,string>();readonly reads:string[]=[];readonly writes:string[]=[];readonly removes:string[]=[];
 failKey='';dropKey='';unavailable=false;
 getItem(key:string){this.reads.push(key);if(this.unavailable)throw new Error('unavailable');return this.data.get(key)??null;}
 setItem(key:string,value:string){this.writes.push(key);if(key===this.failKey)throw new Error('quota');if(key!==this.dropKey)this.data.set(key,value);}
 removeItem(key:string){this.removes.push(key);if(key===this.failKey)throw new Error('remove blocked');if(key!==this.dropKey)this.data.delete(key);}
}
function fixture(){const storage=new MemoryStorage(),store=new CheckpointStore(storage,'world',validate);return {storage,store};}
function archives(store:CheckpointStore<World>){const result=store.listArchives();if(!result.ok)throw new Error(result.error);return result.entries;}
function rawId(raw:string){return `${JSON.parse(raw).savedAt.toString(36)}-${checksum(raw)}`;}
function rewriteIndex(storage:MemoryStorage,change:(entries:Record<string,unknown>[])=>void){const index=JSON.parse(storage.getItem('world:archives')!);const entries=JSON.parse(index.payload);change(entries);index.payload=JSON.stringify(entries);index.checksum=checksum(index.payload);storage.setItem('world:archives',JSON.stringify(index));}
afterEach(()=>vi.restoreAllMocks());

describe('immutable new-world checkpoint history',()=>{
 it('retains the old world through several autosaves and store reloads',()=>{
  vi.spyOn(Date,'now').mockReturnValue(1000);const {storage,store}=fixture();expect(store.write({wood:9})).toEqual({ok:true});const original=storage.getItem('world');
  expect(store.reset()).toEqual({ok:true});expect(store.read()).toEqual({status:'empty'});const first=archives(store)[0];expect(first).toMatchObject({scope:'world',savedAt:1000,archivedAt:1000,reason:'new-game',sizeBytes:new TextEncoder().encode(original!).byteLength});
  expect(store.write({wood:0}).ok).toBe(true);expect(store.write({wood:1}).ok).toBe(true);expect(store.write({wood:2}).ok).toBe(true);expect(storage.getItem('world:backup')).not.toBe(original);
  const reloaded=new CheckpointStore(storage,'world',validate);expect(reloaded.readArchiveMetadata(first.id)).toEqual({ok:true,entry:first});expect(reloaded.restore(first.id)).toEqual({ok:true});expect(reloaded.read()).toMatchObject({status:'loaded',data:{wood:9}});expect(storage.getItem('world:archive:'+first.id)).toBe(original);
  const prior=archives(reloaded).find(entry=>entry.id!==first.id)!;expect(prior.reason).toBe('restore');expect(reloaded.restore(prior.id).ok).toBe(true);expect(reloaded.read()).toMatchObject({data:{wood:2}});expect(archives(reloaded)).toHaveLength(2);
 });
 it('keeps several distinct new worlds and restores each exact raw save',()=>{
  const {storage,store}=fixture(),originals:string[]=[];for(const wood of [10,20,30]){expect(store.write({wood}).ok).toBe(true);originals.push(storage.getItem('world')!);expect(store.reset().ok).toBe(true);}
  expect(archives(store)).toHaveLength(3);for(const original of originals){const id=rawId(original);expect(store.restore(id).ok).toBe(true);expect(storage.getItem('world')).toBe(original);expect(store.write({wood:99}).ok).toBe(true);expect(store.write({wood:98}).ok).toBe(true);expect(storage.getItem('world:archive:'+id)).toBe(original);}
  expect(storage.removes.every(key=>key==='world')).toBe(true);
 });
 it('preserves legacy backup and corrupt recovery while keeping valid fallback history',()=>{
  const {storage,store}=fixture();store.write({wood:1});store.write({wood:2});const fallback=storage.getItem('world:backup');storage.setItem('world','broken');expect(store.read()).toMatchObject({status:'recovered',data:{wood:1}});
  expect(store.reset().ok).toBe(true);expect(storage.getItem('world:corrupt')).toBe('broken');expect(storage.getItem('world:backup')).toBe(fallback);const old=archives(store)[0];expect(storage.getItem('world:archive:'+old.id)).toBe(fallback);
  store.write({wood:3});store.write({wood:4});expect(store.restore(old.id).ok).toBe(true);expect(store.read()).toMatchObject({data:{wood:1}});
 });
 it('restores over corrupt primary only after retaining its exact bytes',()=>{
  const {storage,store}=fixture();store.write({wood:1});store.reset();const id=archives(store)[0].id;storage.setItem('world','corrupt-current');expect(store.restore(id).ok).toBe(true);expect(storage.getItem('world:corrupt')).toBe('corrupt-current');expect(store.read()).toMatchObject({status:'loaded',data:{wood:1}});
 });
 it('rejects future primaries before restoration without writes',()=>{
  const {storage,store}=fixture();store.write({wood:1});store.reset();const id=archives(store)[0].id;store.write({wood:2});const next=JSON.parse(storage.getItem('world')!);next.version=2;storage.setItem('world',JSON.stringify(next));const before=new Map(storage.data),count=storage.writes.length;
  expect(store.restore(id).ok).toBe(false);expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(count);
 });
 it('reads only its own validated namespace and rejects arbitrary archive IDs',()=>{
  const {storage,store}=fixture();storage.setItem('other-app-token','unrelated');store.write({wood:1});store.reset();const before=new Map(storage.data);expect(store.restore('../other-app-token').ok).toBe(false);expect(store.readArchiveMetadata('other-app-token').ok).toBe(false);expect(storage.data).toEqual(before);expect(storage.reads.every(key=>key==='world'||key.startsWith('world:'))).toBe(true);
 });
});

describe('archive transaction failures do not replace the original',()=>{
 it.each(['record','index','backup'])('rejects quota failure at %s and permits a safe retry',stage=>{
  const {storage,store}=fixture();store.write({wood:7});const original=storage.getItem('world')!,id=rawId(original);storage.failKey=stage==='record'?'world:archive:'+id:stage==='index'?'world:archives':'world:backup';
  expect(store.reset().ok).toBe(false);expect(storage.getItem('world')).toBe(original);expect(storage.removes).toEqual([]);storage.failKey='';expect(store.reset().ok).toBe(true);expect(archives(store)).toHaveLength(1);expect(storage.getItem('world:archive:'+id)).toBe(original);
 });
 it.each(['record','index','backup'])('rejects unverified %s writes before clearing the primary',stage=>{
  const {storage,store}=fixture();store.write({wood:7});const original=storage.getItem('world')!;storage.dropKey=stage==='record'?'world:archive:'+rawId(original):stage==='index'?'world:archives':'world:backup';
  expect(store.reset().ok).toBe(false);expect(storage.getItem('world')).toBe(original);expect(storage.removes).toEqual([]);
 });
 it('leaves the current world and target archive intact when final restore write fails',()=>{
  const {storage,store}=fixture();store.write({wood:7});store.reset();const target=archives(store)[0];store.write({wood:8});const original=storage.getItem('world');storage.failKey='world';
  expect(store.restore(target.id).ok).toBe(false);expect(storage.getItem('world')).toBe(original);expect(store.read()).toMatchObject({data:{wood:8}});expect(archives(store)).toHaveLength(2);expect(storage.getItem('world:archive:'+target.id)).not.toBeNull();
 });
 it('rejects a record key collision without overwriting either candidate',()=>{
  const {storage,store}=fixture();store.write({wood:7});const original=storage.getItem('world')!,key='world:archive:'+rawId(original);storage.setItem(key,'another immutable record');const before=new Map(storage.data),count=storage.writes.length;
  expect(store.reset()).toMatchObject({ok:false,error:expect.stringContaining('ID')});expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(count);expect(storage.removes).toEqual([]);
 });
 it('detects a genuine checksum collision with a valid existing archive',()=>{
  const raw=(label:string)=>{const payload=JSON.stringify({wood:7,label});return JSON.stringify({format:'voxel-campaign',version:1,savedAt:1000,payload,checksum:checksum(payload)});};
  const first=raw('variant-22008'),second=raw('variant-51641');expect(first).not.toBe(second);expect(checksum(first)).toBe(checksum(second));
  const {storage,store}=fixture();storage.setItem('world',first);expect(store.reset().ok).toBe(true);storage.setItem('world',second);const before=new Map(storage.data),count=storage.writes.length;
  expect(store.reset()).toMatchObject({ok:false,error:expect.stringContaining('ID')});expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(count);
 });
 it('never silently prunes a full history and still permits restoring already archived saves',()=>{
  const {storage,store}=fixture();for(let wood=0;wood<MAX_CHECKPOINT_ARCHIVES;wood++){expect(store.write({wood}).ok).toBe(true);expect(store.reset().ok).toBe(true);}
  const entries=archives(store),allHistory=new Map([...storage.data].filter(([key])=>key.startsWith('world:archive')));expect(entries).toHaveLength(MAX_CHECKPOINT_ARCHIVES);
  store.write({wood:100});const original=storage.getItem('world');expect(store.reset()).toMatchObject({ok:false,error:expect.stringContaining('上限')});expect(store.restore(entries[0].id).ok).toBe(false);expect(storage.getItem('world')).toBe(original);expect(new Map([...storage.data].filter(([key])=>key.startsWith('world:archive')))).toEqual(allHistory);
  storage.setItem('world',storage.getItem('world:archive:'+entries[1].id)!);expect(store.restore(entries[0].id).ok).toBe(true);expect(archives(store)).toHaveLength(MAX_CHECKPOINT_ARCHIVES);
 });
 it('does not clear primary when removal fails or storage is inaccessible',()=>{
  const {storage,store}=fixture();store.write({wood:7});const original=storage.getItem('world');storage.failKey='world';expect(store.reset().ok).toBe(false);expect(storage.getItem('world')).toBe(original);storage.unavailable=true;
  expect(store.listArchives().ok).toBe(false);expect(store.readArchiveMetadata('unknown').ok).toBe(false);expect(store.reset().ok).toBe(false);expect(store.restore('unknown').ok).toBe(false);expect(storage.data.get('world')).toBe(original);
 });
});

describe('bounded archive index validation',()=>{
 it.each(['broken json','future version','bad checksum','duplicate id','wrong scope','bad size','missing record','corrupt record','malicious id','oversized index'])('rejects %s without any mutation',damage=>{
  const {storage,store}=fixture();store.write({wood:7});store.reset();const target=archives(store)[0];store.write({wood:8});
  if(damage==='broken json')storage.setItem('world:archives','broken');
  if(damage==='future version'){const index=JSON.parse(storage.getItem('world:archives')!);index.version=2;storage.setItem('world:archives',JSON.stringify(index));}
  if(damage==='bad checksum'){const index=JSON.parse(storage.getItem('world:archives')!);index.checksum='00000000';storage.setItem('world:archives',JSON.stringify(index));}
  if(damage==='duplicate id')rewriteIndex(storage,entries=>entries.push({...entries[0]}));
  if(damage==='wrong scope')rewriteIndex(storage,entries=>entries[0].scope='another-world');
  if(damage==='bad size')rewriteIndex(storage,entries=>entries[0].sizeBytes=1);
  if(damage==='missing record')storage.data.delete('world:archive:'+target.id);
  if(damage==='corrupt record')storage.setItem('world:archive:'+target.id,'broken');
  if(damage==='malicious id')rewriteIndex(storage,entries=>entries[0].id='../another-app');
  if(damage==='oversized index')storage.setItem('world:archives',' '.repeat(32769));
  const before=new Map(storage.data),count=storage.writes.length;expect(store.listArchives().ok).toBe(false);expect(store.readArchiveMetadata(target.id).ok).toBe(false);expect(store.reset().ok).toBe(false);expect(store.restore(target.id).ok).toBe(false);expect(storage.data).toEqual(before);expect(storage.writes).toHaveLength(count);
 });
 it('returns detached metadata and cannot mutate stored history through a caller',()=>{
  const {store}=fixture();store.write({wood:1});store.reset();const first=archives(store)[0];first.scope='changed';first.id='changed';expect(archives(store)[0].scope).toBe('world');expect(archives(store)[0].id).not.toBe('changed');
 });
});

describe('save-management display guards',()=>{
 it('allows leaving an unjoined guest preview while offline and blocks room creation',()=>{const state={enabled:false,status:'offline',role:null,invite:'invite',guestBuild:false,muted:false,players:0,messages:[],canJoin:false,guestPreview:true} as const;const controls=cooperationControls({...state,messages:[]});expect(controls.leave).toBe(true);expect(controls.create).toBe(false);expect(cooperationControls({...state,enabled:true,messages:[]}).create).toBe(false);});
 it('disables all save mutations during guest preview and guest participation',()=>{expect(campaignSaveControls({available:true,label:'',status:'',disabledForGuest:true})).toEqual({save:false,continue:false,newGame:false,restore:false});});
 it('blocks switching with invalid history while leaving ordinary saves available',()=>{expect(campaignSaveControls({available:true,label:'',status:'',archiveError:'履歴破損'})).toEqual({save:true,continue:true,newGame:false,restore:false});});
});
