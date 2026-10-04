import {checksum,record,integer,text} from './validation';
/** Storage is injected so private browsing, quota failure and corrupt writes are testable. */
export interface SaveStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export type CheckpointRead<T>=
 | {status:'empty'}
 | {status:'loaded'|'recovered';data:T;savedAt:number}
 | {status:'invalid'|'unsupported'|'unavailable';error:string};
export type CheckpointWrite={ok:true}|{ok:false;error:string};
interface Envelope {format:'voxel-campaign';version:1;savedAt:number;payload:string;checksum:string}
/** v1 is the first persisted format. Unknown versions are never silently downgraded.
 * A checksum detects accidental corruption; it is deliberately not anti-cheat/security. */
export class CheckpointStore<T> {
 readonly backupKey:string;readonly corruptKey:string;
 constructor(private readonly storage:SaveStorage,readonly key:string,private readonly validate:(value:unknown)=>value is T){this.backupKey=key+':backup';this.corruptKey=key+':corrupt';}
 private decode(raw:string):CheckpointRead<T>{
  if(raw.length>12000000)return {status:'invalid',error:'保存データが大きすぎます'};
  try{const e:unknown=JSON.parse(raw);if(!record(e)||e.format!=='voxel-campaign'||!integer(e.version,1))return {status:'invalid',error:'保存形式が不正です'};
   if(e.version!==1)return {status:'unsupported',error:'新しいバージョンの保存データです。この版では読み込めません'};
   if(!integer(e.savedAt)||typeof e.payload!=='string'||!text(e.checksum,8)||checksum(e.payload)!==e.checksum)return {status:'invalid',error:'保存データの検証に失敗しました'};
   const data:unknown=JSON.parse(e.payload);if(!this.validate(data))return {status:'invalid',error:'保存内容または世界バージョンが一致しません'};
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
 /** Caller obtains new-world confirmation first. The last world remains in backup. */
 reset():CheckpointWrite {try{const previous=this.storage.getItem(this.key);if(previous!==null){const destination=this.decode(previous).status==='loaded'?this.backupKey:this.corruptKey;this.storage.setItem(destination,previous);if(this.storage.getItem(destination)!==previous)return {ok:false,error:'元データを保護できません'};}this.storage.removeItem(this.key);return this.storage.getItem(this.key)===null?{ok:true}:{ok:false,error:'新規開始の準備ができません'};}catch{return {ok:false,error:'元データを保護できません。新規開始を中止しました'};}}
}
