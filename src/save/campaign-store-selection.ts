import {createCampaignStore,LEGACY_CAMPAIGN_STORE_KEY,STREAMED_CAMPAIGN_STORE_KEY,WESTERN_CAMPAIGN_STORE_KEY,hydrateCampaign,type CampaignSave} from '../prototype/campaign-session';
import {WEST_EXPEDITION_MANIFEST} from '../prototype/core/expedition-west';
import {prepareWesternMigrationPlan,preserveWesternMigrationBackup} from './western-campaign-migration';
import {checksum,record} from './validation';
import {CAMPAIGN_SAMPLE_MANIFEST,createCampaignSamplePrototype} from '../prototype/core/campaign-sample-provider';
import {prepareLegacyCampaignMigration,preserveLegacyMigrationBackup,migrationBackupKey} from './campaign-migration';
import type {CheckpointStore,CheckpointRead,SaveStorage} from './checkpoint';

export const CAMPAIGN_FORMAT_SELECTOR='ash-campaign-active-format';
export interface CampaignStoreSelection {western:boolean;streamed:boolean;store:CheckpointStore<CampaignSave>;loaded:CheckpointRead<CampaignSave>;blocked:boolean;migrated:boolean;error?:string}
/** A checksummed future payload is incompatible, not a corrupt save to downgrade via
 * an older rotating backup. Only corruption may use CheckpointStore recovery. */
function incompatiblePrimary(storage:SaveStorage,key:string,world:'campaign-v2'|'campaign-v3'|'campaign-v4'){
 try{const raw=storage.getItem(key);if(raw===null)return false;const e:unknown=JSON.parse(raw);if(!record(e)||e.format!=='voxel-campaign'||e.version!==1||typeof e.payload!=='string'||checksum(e.payload)!==e.checksum)return false;const data:unknown=JSON.parse(e.payload);if(!record(data))return false;
  if(typeof data.version==='number'&&data.version!==1||typeof data.world==='string'&&data.world!==world)return true;
  return world!=='campaign-v2'&&record(data.field)&&typeof data.field.baseline==='string'&&data.field.baseline!==(world==='campaign-v4'?WEST_EXPEDITION_MANIFEST:CAMPAIGN_SAMPLE_MANIFEST);
 }catch{return false;}
}
/** Storage-only startup transaction. Legacy mode is untouched without explicit opt-in or
 * the verified v3 selector. Keeping the selector through reset prevents old-world re-import. */
type BaseSelection=Omit<CampaignStoreSelection,'western'>;
function selectBaseCampaignStore(storage:SaveStorage,optInStreaming=false):BaseSelection {
 const legacy=createCampaignStore(false,storage),streamed=createCampaignStore(true,storage);
 const failure=(message:string,unsupported=false):BaseSelection=>({streamed:true,store:streamed,loaded:{status:unsupported?'unsupported':'invalid',error:message},blocked:true,migrated:false,error:message});
 const selectV3=()=>{try{storage.setItem(CAMPAIGN_FORMAT_SELECTOR,'campaign-v3');return storage.getItem(CAMPAIGN_FORMAT_SELECTOR)==='campaign-v3';}catch{return false;}};
 let selector:string|null;try{selector=storage.getItem(CAMPAIGN_FORMAT_SELECTOR);}catch{
  if(optInStreaming)return failure('保存領域にアクセスできないため移行を開始できません。元の保存は変更していません');
  return {streamed:false,store:legacy,loaded:legacy.read(),blocked:false,migrated:false};
 }
 if(selector!==null&&selector!=='campaign-v3')return failure('この版で扱えない保存形式が選択されています。元の保存を保護しています',true);
 if(!optInStreaming&&selector===null){const loaded=legacy.read();return {streamed:false,store:legacy,loaded,blocked:false,migrated:false,...('error' in loaded?{error:loaded.error}:{})};}
 if(incompatiblePrimary(storage,STREAMED_CAMPAIGN_STORE_KEY,'campaign-v3'))return failure('新形式の保存は別の版・世界で作られています。古いバックアップへ戻さず原本を保護しました',true);
 const existing=streamed.read();
 if(existing.status!=='empty'){
  if(existing.status==='invalid'||existing.status==='unsupported'||existing.status==='unavailable')return {streamed:true,store:streamed,loaded:existing,blocked:true,migrated:false,error:existing.error};
  if(selector===null&&!selectV3())return failure('新形式の保存はありますが、保存形式の選択を確認できません。再読み込みして再試行してください');
  return {streamed:true,store:streamed,loaded:existing,blocked:false,migrated:false};
 }
 // Once selected, an empty v3 slot means New Game, never a request to resurrect v2.
 if(selector==='campaign-v3')return {streamed:true,store:streamed,loaded:existing,blocked:false,migrated:false};
 if(incompatiblePrimary(storage,LEGACY_CAMPAIGN_STORE_KEY,'campaign-v2'))return failure('旧形式の保存はこの版に対応していません。原本を保護しました',true);
 const original=legacy.read();
 if(original.status==='invalid'||original.status==='unsupported'||original.status==='unavailable')return failure('旧形式の保存を検証できないため移行を中止しました。'+original.error,original.status==='unsupported');
 if(original.status==='empty'){
  if(!selectV3())return failure('新形式の選択を保存できません。保存設定と空き容量を確認してください');
  return {streamed:true,store:streamed,loaded:{status:'empty'},blocked:false,migrated:false};
 }
 if(original.status!=='loaded'&&original.status!=='recovered')return failure('旧形式の保存を読み込めません');
 const sourceKey=original.status==='recovered'?legacy.backupKey:LEGACY_CAMPAIGN_STORE_KEY;let originalBytes:string;
 try{const raw=storage.getItem(sourceKey);if(raw===null)return failure('移行中に元の保存が見つからなくなりました。移行を中止しました');const envelope=JSON.parse(raw);if(envelope.savedAt!==original.savedAt||JSON.stringify(JSON.parse(envelope.payload))!==JSON.stringify(original.data))return failure('別のタブで元の保存が更新されました。原本を保護して移行を中止しました');originalBytes=raw;}catch{return failure('移行元の保存を再確認できません。原本を保護しました');}
 const candidate=prepareLegacyCampaignMigration(original.data,createCampaignSamplePrototype());
 if(!candidate)return failure('旧形式の世界または保存内容に対応する移行を確認できません。原本を保護しました');
 // Recovery never overwrites a corrupt old primary: archive the selected valid backup.
 const archive=preserveLegacyMigrationBackup(storage,sourceKey,migrationBackupKey(LEGACY_CAMPAIGN_STORE_KEY),originalBytes);
 if(!archive.ok)return failure(`旧形式の移行用バックアップを確認できません（${archive.reason}）。元の保存は変更していません`);
 const write=streamed.write(candidate);if(!write.ok)return failure('新形式への保存に失敗しました。原本と移行用バックアップを保護しています。'+write.error);
 const verified=streamed.read();if(verified.status!=='loaded'||verified.data.world!=='campaign-v3')return failure('新形式への書き込みを検証できません。旧形式の原本を保護しています');
 if(!selectV3())return failure('新形式の保存は完了しましたが、保存形式の選択を確認できません。原本は保持しています');
 return {streamed:true,store:streamed,loaded:verified,blocked:false,migrated:true};
}

/** Optional western selection adds a separate v4 transaction; old selection stays intact
 * until a complete migration, immutable v3 archive and v4 read-back have succeeded. */
export function selectCampaignStore(storage:SaveStorage,optInStreaming=false,optInWestern=false):CampaignStoreSelection {
 let selector:string|null=null,selectorUnreadable=false;try{selector=storage.getItem(CAMPAIGN_FORMAT_SELECTOR);}catch{if(!optInWestern)return {...selectBaseCampaignStore(storage,optInStreaming),western:false};selectorUnreadable=true;}
 if(!optInWestern&&selector!=='campaign-v4')return {...selectBaseCampaignStore(storage,optInStreaming),western:false};
 const store=createCampaignStore(true,storage,true);
 const failure=(error:string,unsupported=false):CampaignStoreSelection=>({streamed:true,western:true,store,loaded:{status:unsupported?'unsupported':'invalid',error},blocked:true,migrated:false,error});
 if(selectorUnreadable)return failure('保存形式を確認できないため、西方への移行を開始できません。原本は変更していません');
 const selectV4=()=>{try{storage.setItem(CAMPAIGN_FORMAT_SELECTOR,'campaign-v4');return storage.getItem(CAMPAIGN_FORMAT_SELECTOR)==='campaign-v4';}catch{return false;}};
 if(selector!==null&&selector!=='campaign-v3'&&selector!=='campaign-v4')return failure('未知の保存形式が選択されています。西方への移行を中止し原本を保護しました',true);
 if(incompatiblePrimary(storage,WESTERN_CAMPAIGN_STORE_KEY,'campaign-v4'))return failure('西方の保存は別の版で作られています。原本を保護しました',true);
 const existing=store.read();if(existing.status!=='empty'){
  if(existing.status==='invalid'||existing.status==='unsupported'||existing.status==='unavailable')return {streamed:true,western:true,store,loaded:existing,blocked:true,migrated:false,error:existing.error};
  if(selector!=='campaign-v4'&&!selectV4())return failure('西方の保存形式の選択を確認できません。原本は保持しています');
  return {streamed:true,western:true,store,loaded:existing,blocked:false,migrated:false};
 }
 if(selector==='campaign-v4')return {streamed:true,western:true,store,loaded:{status:'empty'},blocked:false,migrated:false};
 const base=selectBaseCampaignStore(storage,true);if(base.blocked)return failure(base.error??'移行元の保存を確認できません',base.loaded.status==='unsupported');
 if(base.loaded.status==='empty'){if(!selectV4())return failure('西方の保存形式を選択できません。保存設定を確認してください');return {streamed:true,western:true,store,loaded:{status:'empty'},blocked:false,migrated:false};}
 if(base.loaded.status!=='loaded'&&base.loaded.status!=='recovered')return failure('移行元の保存を読み込めません');
 const source=base.loaded,sourceKey=source.status==='recovered'?base.store.backupKey:STREAMED_CAMPAIGN_STORE_KEY;let originalBytes:string;
 try{const raw=storage.getItem(sourceKey);if(raw===null)return failure('移行元の保存が見つかりません');const envelope=JSON.parse(raw);if(envelope.savedAt!==source.savedAt||JSON.stringify(JSON.parse(envelope.payload))!==JSON.stringify(source.data))return failure('別のタブで元の保存が更新されました。移行を中止しました');originalBytes=raw;}catch{return failure('移行元の保存を再確認できません');}
 const migration=prepareWesternMigrationPlan(source.data);if(!migration.ok)return failure(migration.reason==='content-overlap'?'追加地形が既存の編集・建築に重なるため、西方への移行を中止しました。原本は変更していません':`西方への移行を検証できません（${migration.reason}）。原本は変更していません`);
 if(!hydrateCampaign(migration.candidate))return failure('西方の地形・進行・敵の組合せを検証できません。原本を保護しました');
 const archived=preserveWesternMigrationBackup(storage,sourceKey,originalBytes);if(!archived.ok)return failure(`西方への移行用バックアップを確認できません（${archived.reason}）`);
 const written=store.write(migration.candidate);if(!written.ok)return failure('西方の保存に失敗しました。v3原本と専用バックアップを保持しています。'+written.error);
 const verified=store.read();if(verified.status!=='loaded'||verified.data.world!=='campaign-v4')return failure('西方の保存を書き込み後に確認できません');
 if(!selectV4())return failure('西方の保存は完了しましたが形式選択を確認できません。旧形式は保持しています');
 return {streamed:true,western:true,store,loaded:verified,blocked:false,migrated:true};
}
