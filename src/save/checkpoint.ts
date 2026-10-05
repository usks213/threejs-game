import {checksum,record,integer,text} from './validation';
/** Storage is injected so private browsing, quota failure and corrupt writes are testable. */
export interface SaveStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export type CheckpointRead<T>=
 | {status:'empty'}
 | {status:'loaded'|'recovered';data:T;savedAt:number}
 | {status:'invalid'|'unsupported'|'unavailable';error:string};
export type CheckpointWrite={ok:true}|{ok:false;error:string};
export type CheckpointImportInspection<T>={ok:true;data:T;savedAt:number;sizeBytes:number}|{ok:false;error:string};
export type CheckpointFileExport={ok:true;raw:string;filename:string;sizeBytes:number;savedAt:number;source:'current'|'backup'|'archive'}|{ok:false;error:string};
export interface CheckpointArchiveMetadata {
 id:string;scope:string;savedAt:number;archivedAt:number;sizeBytes:number;reason:'new-game'|'restore'|'import';
}
export type CheckpointArchives={ok:true;entries:CheckpointArchiveMetadata[]}|{ok:false;error:string};
export type CheckpointArchiveMetadataRead={ok:true;entry:CheckpointArchiveMetadata}|{ok:false;error:string};
interface Envelope {format:'voxel-campaign';version:1;savedAt:number;payload:string;checksum:string}
interface ArchiveEntry extends CheckpointArchiveMetadata {checksum:string}
interface ArchiveIndex {format:'voxel-campaign-archives';version:1;scope:string;payload:string;checksum:string}
interface ValidArchive {entry:ArchiveEntry;raw:string}
type ArchiveHistory={ok:true;entries:ValidArchive[];indexRaw:string|null}|{ok:false;error:string};
const MAX_SAVE_LENGTH=12000000;
/** Reject oversized uploads before reading File.text(), then verify UTF-8 bytes again. */
export const MAX_CHECKPOINT_FILE_BYTES=12000000;
/** The cap never prunes history. A full history stops a world switch with a visible error. */
export const MAX_CHECKPOINT_ARCHIVES=32;
const MAX_INDEX_LENGTH=32768;
const INCOMPATIBLE_CONTENT='保存内容または世界バージョンが一致しません';
const archiveSize=(raw:string)=>new TextEncoder().encode(raw).byteLength;
/** Blob UTF-8 encoding replaces lone UTF-16 surrogates; reject them rather than changing bytes. */
const portableUnicode=(raw:string)=>{for(let i=0;i<raw.length;i++){const code=raw.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=raw.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;};
const metadata=({checksum:_,...entry}:ArchiveEntry):CheckpointArchiveMetadata=>({...entry});
/** v1 is the first persisted format. Unknown versions are never silently downgraded.
 * A checksum detects accidental corruption; it is deliberately not anti-cheat/security. */
export class CheckpointStore<T> {
 readonly backupKey:string;readonly corruptKey:string;readonly archiveIndexKey:string;readonly archivePrefix:string;
 constructor(private readonly storage:SaveStorage,readonly key:string,private readonly validate:(value:unknown)=>value is T){this.backupKey=key+':backup';this.corruptKey=key+':corrupt';this.archiveIndexKey=key+':archives';this.archivePrefix=key+':archive:';}
 private decode(raw:string):CheckpointRead<T>{
  if(raw.length>MAX_SAVE_LENGTH)return {status:'invalid',error:'保存データが大きすぎます'};
  try{const e:unknown=JSON.parse(raw);if(!record(e)||e.format!=='voxel-campaign'||!integer(e.version,1))return {status:'invalid',error:'保存形式が不正です'};
   if(e.version!==1)return {status:'unsupported',error:'新しいバージョンの保存データです。この版では読み込めません'};
   if(!integer(e.savedAt)||typeof e.payload!=='string'||!text(e.checksum,8)||checksum(e.payload)!==e.checksum)return {status:'invalid',error:'保存データの検証に失敗しました'};
   const data:unknown=JSON.parse(e.payload);if(!this.validate(data))return {status:'invalid',error:INCOMPATIBLE_CONTENT};
   return {status:'loaded',data,savedAt:e.savedAt};
  }catch{return {status:'invalid',error:'保存データを読み取れません'};}
 }
 read():CheckpointRead<T>{try{const raw=this.storage.getItem(this.key);if(raw===null)return {status:'empty'};const result=this.decode(raw);if(result.status==='loaded'||result.status==='unsupported')return result;
  const backup=this.storage.getItem(this.backupKey),fallback=backup===null?null:this.decode(backup);return fallback?.status==='loaded'?{...fallback,status:'recovered'}:result;
 }catch{return {status:'unavailable',error:'ブラウザの保存領域にアクセスできません'};}}
 write(data:T):CheckpointWrite {
  try{if(!this.validate(data))return {ok:false,error:'無効な状態は保存できません'};const payload=JSON.stringify(data),envelope:Envelope={format:'voxel-campaign',version:1,savedAt:Date.now(),payload,checksum:checksum(payload)},raw=JSON.stringify(envelope);
   // Validate before touching the last successful checkpoint. localStorage.setItem is atomic.
   if(this.decode(raw).status!=='loaded')return {ok:false,error:'保存データを検証できません'};
   const previous=this.storage.getItem(this.key);if(previous!==null){const old=this.decode(previous);if(old.status!=='loaded')return {ok:false,error:'既存データを保護しています。バックアップの復元または新規開始を選んでください'};this.storage.setItem(this.backupKey,previous);if(this.storage.getItem(this.backupKey)!==previous)return {ok:false,error:'バックアップを確認できません'};}
   this.storage.setItem(this.key,raw);if(this.storage.getItem(this.key)!==raw)return {ok:false,error:'書き込んだ保存データを確認できません'};return {ok:true};
  }catch{return {ok:false,error:'保存できませんでした。ブラウザの空き容量と保存設定を確認してください'};}
 }
 /** Explicit recovery retains the corrupt original for diagnosis rather than erasing it. */
 recoverBackup():CheckpointWrite {try{const backup=this.storage.getItem(this.backupKey);if(backup===null||this.decode(backup).status!=='loaded')return {ok:false,error:'有効なバックアップがありません'};const current=this.storage.getItem(this.key);if(current!==null){if(this.decode(current).status==='unsupported')return {ok:false,error:'新しい版の保存データは上書きできません'};this.storage.setItem(this.corruptKey,current);if(this.storage.getItem(this.corruptKey)!==current)return {ok:false,error:'元データを保護できません'};}this.storage.setItem(this.key,backup);return this.storage.getItem(this.key)===backup?{ok:true}:{ok:false,error:'復元結果を確認できません'};}catch{return {ok:false,error:'バックアップを復元できません'};}}
 /** Reads only this store's validated index and listed records, never unrelated storage. */
 private history():ArchiveHistory {
  try{
   const indexRaw=this.storage.getItem(this.archiveIndexKey);if(indexRaw===null)return {ok:true,entries:[],indexRaw};
   if(indexRaw.length>MAX_INDEX_LENGTH)return {ok:false,error:'旅の履歴一覧が大きすぎます。元の保存は変更していません'};
   const index:unknown=JSON.parse(indexRaw);
   if(!record(index)||index.format!=='voxel-campaign-archives'||index.version!==1||index.scope!==this.key||typeof index.payload!=='string'||typeof index.checksum!=='string'||checksum(index.payload)!==index.checksum)return {ok:false,error:'旅の履歴一覧を検証できません。元の保存は変更していません'};
   const parsed:unknown=JSON.parse(index.payload);if(!Array.isArray(parsed)||parsed.length>MAX_CHECKPOINT_ARCHIVES)return {ok:false,error:'旅の履歴一覧が不正です。元の保存は変更していません'};
   const ids=new Set<string>(),entries:ValidArchive[]=[];
   for(const value of parsed){
    if(!record(value)||!text(value.id,40)||!/^([0-9a-z]+)-[0-9a-f]{8}$/.test(value.id)||ids.has(value.id)||value.scope!==this.key||!integer(value.savedAt)||!integer(value.archivedAt)||!integer(value.sizeBytes,1,MAX_SAVE_LENGTH*3)||typeof value.checksum!=='string'||!/^[0-9a-f]{8}$/.test(value.checksum)||(value.reason!=='new-game'&&value.reason!=='restore'&&value.reason!=='import'))return {ok:false,error:'旅の履歴情報が不正です。元の保存は変更していません'};
    const entry=value as unknown as ArchiveEntry,raw=this.storage.getItem(this.archivePrefix+entry.id);
    if(raw===null||raw.length>MAX_SAVE_LENGTH||entry.id!==`${entry.savedAt.toString(36)}-${entry.checksum}`||checksum(raw)!==entry.checksum||archiveSize(raw)!==entry.sizeBytes)return {ok:false,error:'旅の履歴データが欠けているか破損しています。元の保存は変更していません'};
    const saved=this.decode(raw);if(saved.status!=='loaded'||saved.savedAt!==entry.savedAt)return {ok:false,error:'旅の履歴の保存内容を検証できません。元の保存は変更していません'};
    ids.add(entry.id);entries.push({entry,raw});
   }
   return {ok:true,entries,indexRaw};
  }catch{return {ok:false,error:'旅の履歴を読み取れません。ブラウザの保存設定を確認してください'};}
 }
 listArchives():CheckpointArchives {const history=this.history();return history.ok?{ok:true,entries:history.entries.map(({entry})=>metadata(entry)).sort((a,b)=>b.archivedAt-a.archivedAt)}:history;}
 readArchiveMetadata(id:string):CheckpointArchiveMetadataRead {const history=this.history();if(!history.ok)return history;const found=history.entries.find(value=>value.entry.id===id);return found?{ok:true,entry:metadata(found.entry)}:{ok:false,error:'選んだ旅の履歴が見つかりません'};}
 /** No writes, normalization, migration, executable markup or filename-derived paths. */
 inspectImport(raw:string):CheckpointImportInspection<T> {
  if(typeof raw!=='string'||raw.length>MAX_CHECKPOINT_FILE_BYTES)return {ok:false,error:'保存ファイルが大きすぎるか、文字列ではありません'};
  if(!portableUnicode(raw))return {ok:false,error:'保存ファイルにUTF-8で保管できない文字が含まれています'};
  const sizeBytes=archiveSize(raw);if(sizeBytes>MAX_CHECKPOINT_FILE_BYTES)return {ok:false,error:'保存ファイルは12 MB以内にしてください'};
  const saved=this.decode(raw);return saved.status==='loaded'?{ok:true,data:saved.data,savedAt:saved.savedAt,sizeBytes}:{ok:false,error:'error' in saved?saved.error:'有効な保存ファイルではありません'};
 }
 /** Returns the exact verified envelope, including its original checksum and whitespace. */
 exportFile(archiveId?:string):CheckpointFileExport {
  try{
   let raw:string|null,source:'current'|'backup'|'archive'='current';
   if(archiveId!==undefined){const history=this.history();if(!history.ok)return history;const found=history.entries.find(value=>value.entry.id===archiveId);if(!found)return {ok:false,error:'選んだ旅の履歴が見つかりません'};raw=found.raw;source='archive';}
   else {
    raw=this.storage.getItem(this.key);if(raw===null)return {ok:false,error:'保存済みの旅がありません。先に旅を保存してください'};
    const current=this.decode(raw);
    // Never disguise a checksummed incompatible world/schema as an older fallback.
    if(current.status!=='loaded'){
     if(current.status==='unsupported'||current.status==='invalid'&&current.error===INCOMPATIBLE_CONTENT)return {ok:false,error:current.error};
     const backup=this.storage.getItem(this.backupKey);if(backup===null||this.decode(backup).status!=='loaded')return {ok:false,error:'書き出せる有効な保存がありません'};raw=backup;source='backup';
    }
   }
   const checked=this.inspectImport(raw);if(!checked.ok)return checked;
   return {ok:true,raw,source,savedAt:checked.savedAt,sizeBytes:checked.sizeBytes,filename:`seven-lights-${checked.savedAt.toString(36)}-${checksum(raw)}.json`};
  }catch{return {ok:false,error:'保存ファイルを書き出せません。ブラウザの保存設定を確認してください'};}
 }
 /** Imports are explicit world switches. Domain preflight must be read-only and synchronous.
  * Archive both valid original slots; neither rotating backup nor corrupt record is changed.
  * A damaged/future primary must use its existing recovery flow before importing a file. */
 importFile(raw:string,preflight:(data:T)=>boolean=this.validate):CheckpointWrite {
  const candidate=this.inspectImport(raw);if(!candidate.ok)return candidate;
  try{if(!preflight(candidate.data))return {ok:false,error:'保存ファイルの世界・地形・進行を検証できません。元の保存は変更していません'};}
  catch{return {ok:false,error:'保存ファイルの内容を検証できません。元の保存は変更していません'};}
  try{
   const history=this.history();if(!history.ok)return history;
   const previous=this.storage.getItem(this.key),backup=this.storage.getItem(this.backupKey);
   if(previous!==null&&this.decode(previous).status!=='loaded')return {ok:false,error:'既存の保存が破損しているか別の版・世界です。原本を保護するため取り込みを中止しました。対応する版で復元してください'};
   if(previous===raw)return {ok:true};
   const originals=[...new Set([previous,backup].filter((value):value is string=>value!==null&&this.decode(value).status==='loaded'))];
   const pending:ValidArchive[]=[],ids=new Map(history.entries.map(value=>[value.entry.id,value.raw]));
   // Preflight the entire batch, including unindexed records left by an interrupted write.
   for(const original of originals){
    const saved=this.decode(original);if(saved.status!=='loaded')return {ok:false,error:'元の保存を検証できません'};
    const hash=checksum(original),id=`${saved.savedAt.toString(36)}-${hash}`,indexed=ids.get(id),stored=this.storage.getItem(this.archivePrefix+id);
    if(indexed!==undefined&&indexed!==original||stored!==null&&stored!==original)return {ok:false,error:'旅の履歴IDが重複しています。元の保存は変更していません'};
    if(indexed===undefined){ids.set(id,original);pending.push({raw:original,entry:{id,scope:this.key,savedAt:saved.savedAt,archivedAt:Date.now(),sizeBytes:archiveSize(original),reason:'import',checksum:hash}});}
   }
   if(history.entries.length+pending.length>MAX_CHECKPOINT_ARCHIVES)return {ok:false,error:`旅の履歴は上限の${MAX_CHECKPOINT_ARCHIVES}件です。自動削除せず取り込みを中止しました`};
   const unchanged=()=>this.storage.getItem(this.key)===previous&&this.storage.getItem(this.backupKey)===backup;
   if(!unchanged()||this.storage.getItem(this.archiveIndexKey)!==history.indexRaw)return {ok:false,error:'別の画面で保存が更新されました。取り込みをやり直してください'};
   if(pending.length){
    const payload=JSON.stringify([...history.entries.map(value=>value.entry),...pending.map(value=>value.entry)]),index:ArchiveIndex={format:'voxel-campaign-archives',version:1,scope:this.key,payload,checksum:checksum(payload)},indexRaw=JSON.stringify(index);
    if(indexRaw.length>MAX_INDEX_LENGTH)return {ok:false,error:'旅の履歴一覧が大きすぎます。取り込みを中止しました'};
    for(const archived of pending){const key=this.archivePrefix+archived.entry.id,stored=this.storage.getItem(key);if(stored!==null&&stored!==archived.raw)return {ok:false,error:'旅の履歴IDが重複しています。元の保存は変更していません'};if(stored===null)this.storage.setItem(key,archived.raw);if(this.storage.getItem(key)!==archived.raw)return {ok:false,error:'元の旅の履歴を確認できません。取り込みを中止しました'};}
    if(!unchanged()||this.storage.getItem(this.archiveIndexKey)!==history.indexRaw)return {ok:false,error:'別の画面で保存が更新されました。取り込みを中止しました'};
    this.storage.setItem(this.archiveIndexKey,indexRaw);
    if(this.storage.getItem(this.archiveIndexKey)!==indexRaw)return {ok:false,error:'旅の履歴一覧の保管を確認できません。元の保存は変更していません'};
   }
   const verified=this.history();if(!verified.ok)return verified;
   if(originals.some(original=>!verified.entries.some(value=>value.raw===original)))return {ok:false,error:'元の旅の履歴を検証できません。取り込みを中止しました'};
   if(!unchanged())return {ok:false,error:'別の画面で保存が更新されました。取り込みを中止しました'};
   this.storage.setItem(this.key,raw);
   return this.storage.getItem(this.key)===raw&&this.decode(raw).status==='loaded'?{ok:true}:{ok:false,error:'取り込み結果を確認できません。元の旅は履歴に保管しています'};
  }catch{return {ok:false,error:'保存ファイルを取り込めません。空き容量と保存設定を確認してください。元の保存・履歴は削除していません'};}
 }
 /** Content-addressed records are never replaced or deleted. A checksum collision is an error. */
 private archive(raw:string,reason:ArchiveEntry['reason'],history:Extract<ArchiveHistory,{ok:true}>):CheckpointWrite {
  const saved=this.decode(raw);if(saved.status!=='loaded')return {ok:false,error:'有効な保存だけを旅の履歴へ保管できます'};
  const hash=checksum(raw),id=`${saved.savedAt.toString(36)}-${hash}`,existing=history.entries.find(value=>value.entry.id===id);
  if(existing)return existing.raw===raw?{ok:true}:{ok:false,error:'旅の履歴IDが重複しています。元の保存は変更していません'};
  if(history.entries.length>=MAX_CHECKPOINT_ARCHIVES)return {ok:false,error:`旅の履歴は上限の${MAX_CHECKPOINT_ARCHIVES}件です。自動削除せず、新規開始・復元を中止しました`};
  const archiveKey=this.archivePrefix+id,previous=this.storage.getItem(archiveKey);
  // A previous interrupted index write may have left the exact immutable record behind.
  if(previous!==null&&previous!==raw)return {ok:false,error:'旅の履歴IDが重複しています。元の保存は変更していません'};
  if(this.storage.getItem(this.archiveIndexKey)!==history.indexRaw)return {ok:false,error:'別の画面で旅の履歴が更新されました。操作をやり直してください'};
  if(previous===null)this.storage.setItem(archiveKey,raw);
  if(this.storage.getItem(archiveKey)!==raw)return {ok:false,error:'旅の履歴データの保管を確認できません。元の保存は変更していません'};
  const entry:ArchiveEntry={id,scope:this.key,savedAt:saved.savedAt,archivedAt:Date.now(),sizeBytes:archiveSize(raw),reason,checksum:hash};
  const entries=[...history.entries.map(value=>value.entry),entry],payload=JSON.stringify(entries),index:ArchiveIndex={format:'voxel-campaign-archives',version:1,scope:this.key,payload,checksum:checksum(payload)},indexRaw=JSON.stringify(index);
  if(indexRaw.length>MAX_INDEX_LENGTH)return {ok:false,error:'旅の履歴一覧が大きすぎます。新規開始・復元を中止しました'};
  this.storage.setItem(this.archiveIndexKey,indexRaw);
  if(this.storage.getItem(this.archiveIndexKey)!==indexRaw)return {ok:false,error:'旅の履歴一覧の保管を確認できません。元の保存は変更していません'};
  // Read back the complete index and archives before allowing the primary to change.
  const verified=this.history();if(!verified.ok)return verified;
  return verified.entries.some(value=>value.entry.id===id&&value.raw===raw)?{ok:true}:{ok:false,error:'旅の履歴の検証に失敗しました。元の保存は変更していません'};
 }
 /** Also retain the legacy rotating backup/corrupt records for existing recovery flows. */
 private preserveCurrent(raw:string,reason:ArchiveEntry['reason'],history:Extract<ArchiveHistory,{ok:true}>):CheckpointWrite {
  const loaded=this.decode(raw).status==='loaded';
  if(loaded){const archived=this.archive(raw,reason,history);if(!archived.ok)return archived;}
  else {const backup=this.storage.getItem(this.backupKey);if(backup!==null&&this.decode(backup).status==='loaded'){const archived=this.archive(backup,reason,history);if(!archived.ok)return archived;}}
  const destination=loaded?this.backupKey:this.corruptKey;
  this.storage.setItem(destination,raw);return this.storage.getItem(destination)===raw?{ok:true}:{ok:false,error:'元データを保護できません。切り替えを中止しました'};
 }
 /** Caller obtains confirmation first. Immutable history survives all later autosaves. */
 reset():CheckpointWrite {
  try{const history=this.history();if(!history.ok)return history;const previous=this.storage.getItem(this.key);
   if(previous!==null){const preserved=this.preserveCurrent(previous,'new-game',history);if(!preserved.ok)return preserved;}
   if(this.storage.getItem(this.key)!==previous)return {ok:false,error:'別の画面で保存が更新されました。新規開始を中止しました'};
   this.storage.removeItem(this.key);return this.storage.getItem(this.key)===null?{ok:true}:{ok:false,error:'新規開始の準備ができません'};
  }catch{return {ok:false,error:'元データを保護できません。空き容量と保存設定を確認してください。新規開始を中止しました'};}
 }
 /** Caller obtains confirmation first. The replaced world is archived before restoring. */
 restore(id:string):CheckpointWrite {
  try{const history=this.history();if(!history.ok)return history;const archive=history.entries.find(value=>value.entry.id===id);if(!archive)return {ok:false,error:'選んだ旅の履歴が見つかりません'};
   const previous=this.storage.getItem(this.key);if(previous===archive.raw)return {ok:true};
   if(previous!==null){if(this.decode(previous).status==='unsupported')return {ok:false,error:'新しい版の保存データは上書きできません'};const preserved=this.preserveCurrent(previous,'restore',history);if(!preserved.ok)return preserved;}
   if(this.storage.getItem(this.key)!==previous)return {ok:false,error:'別の画面で保存が更新されました。復元を中止しました'};
   // The selected archive is immutable and must still match the verified read.
   if(this.storage.getItem(this.archivePrefix+id)!==archive.raw)return {ok:false,error:'選んだ旅の履歴が変更されました。復元を中止しました'};
   this.storage.setItem(this.key,archive.raw);return this.storage.getItem(this.key)===archive.raw?{ok:true}:{ok:false,error:'復元結果を確認できません。元の旅は履歴に保管しています'};
  }catch{return {ok:false,error:'旅を復元できません。空き容量と保存設定を確認してください。元データは削除していません'};}
 }
}
