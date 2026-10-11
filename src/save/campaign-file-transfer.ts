import {hydrateCampaign,type CampaignSave} from '../prototype/campaign-session';
import {MAX_CHECKPOINT_FILE_BYTES,type CheckpointFileExport,type CheckpointImportInspection,type CheckpointStore,type CheckpointWrite} from './checkpoint';

export {MAX_CHECKPOINT_FILE_BYTES} from './checkpoint';

declare const preparedImportBrand:unique symbol;
/** The brand is compile-time only. Runtime authority lives in the module-private WeakMap. */
export interface PreparedCampaignImport {readonly [preparedImportBrand]:true;readonly savedAt:number;readonly sizeBytes:number}
const preparedImports=new WeakMap<object,{readonly store:CheckpointStore<CampaignSave>;readonly raw:string}>();
export type CampaignImportFileRead=({ok:true;raw:string;prepared:PreparedCampaignImport}&Extract<CheckpointImportInspection<CampaignSave>,{ok:true}>)|{ok:false;error:string};

/** Separate staging simulation validates every inventory, terrain, ledger and entity before
 * a browser save is touched. No imported code, URLs or HTML are ever executed. */
function validCampaignContents(data:CampaignSave):boolean {try{return hydrateCampaign(data)!==null;}catch{return false;}}
export function inspectCampaignImport(store:CheckpointStore<CampaignSave>,raw:string):CheckpointImportInspection<CampaignSave> {
 const checked=store.inspectImport(raw);if(!checked.ok)return checked;
 return validCampaignContents(checked.data)?checked:{ok:false,error:'保存ファイルの世界・地形・進行を検証できません。元の保存は変更していません'};
}
export function importCampaignFile(store:CheckpointStore<CampaignSave>,raw:string):CheckpointWrite {return store.importFile(raw,validCampaignContents);}
/** Only an actual proof issued for this exact store and immutable raw bytes skips another
 * expensive staging simulation. Generic import still rechecks size/schema/checksum/world,
 * current storage, archive capacity/collisions and every write. A successful proof is consumed. */
export function commitPreparedCampaignImport(store:CheckpointStore<CampaignSave>,prepared:unknown):CheckpointWrite {
 if(typeof prepared!=='object'||prepared===null)return {ok:false,error:'取り込み候補を確認できません。保存ファイルを選び直してください'};
 const proof=preparedImports.get(prepared);if(!proof||proof.store!==store)return {ok:false,error:'取り込み候補を確認できません。保存ファイルを選び直してください'};
 const result=store.importFile(proof.raw,()=>true);if(result.ok)preparedImports.delete(prepared);return result;
}
export function exportCampaignFile(store:CheckpointStore<CampaignSave>,archiveId?:string):CheckpointFileExport {
 const exported=store.exportFile(archiveId);if(!exported.ok)return exported;
 const checked=inspectCampaignImport(store,exported.raw);return checked.ok?exported:checked;
}
/** Structural file interface keeps browser APIs out of the rules and permits focused tests.
 * The browser's filename/MIME are advisory; only the bounded exact JSON bytes are trusted.
 * Legacy terrain validation is synchronous and may pause screen input for several seconds.
 * Paint the validation message first; the returned proof avoids repeating that work on confirm. */
export async function readCampaignImportFile(store:CheckpointStore<CampaignSave>,file:{size:number;text:()=>Promise<string>}):Promise<CampaignImportFileRead> {
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_CHECKPOINT_FILE_BYTES)return {ok:false,error:'保存ファイルは空でない12 MB以内のJSONを選んでください'};
 try{const raw=await file.text(),checked=inspectCampaignImport(store,raw);if(!checked.ok)return checked;if(checked.sizeBytes!==file.size)return {ok:false,error:'保存ファイルの読み取りサイズが一致しません。取り込みを中止しました'};const prepared=Object.freeze({savedAt:checked.savedAt,sizeBytes:checked.sizeBytes}) as PreparedCampaignImport;preparedImports.set(prepared,Object.freeze({store,raw}));return {...checked,raw,prepared};}
 catch{return {ok:false,error:'保存ファイルを読み取れません。別のファイルを選び直してください'};}
}
