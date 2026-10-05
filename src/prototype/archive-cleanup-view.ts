import type {CheckpointArchiveMetadata} from '../save/checkpoint';
export interface ArchiveCleanupInfo {request:number;entry:CheckpointArchiveMetadata;filename:string}
/** Confirmation belongs to one exact exported snapshot. A stale/detached view cannot
 * confirm a newly opened request, and download initiation is never called file receipt. */
export function createArchiveCleanupConfirmation(info:ArchiveCleanupInfo,canConfirm:()=>boolean,onConfirm:()=>void,onCancel:()=>void,signal:AbortSignal){
 const root=document.createElement('div');root.className='campaign-warning';root.setAttribute('role','group');root.setAttribute('aria-label','履歴の完全削除の確認');
 const paragraph=(text:string)=>{const p=document.createElement('p');p.textContent=text;root.append(p);};
 paragraph(`対象：${info.entry.id} · 保存日時：${new Date(info.entry.savedAt).toLocaleString('ja-JP')} · ${(info.entry.sizeBytes/1024).toFixed(1)} KiB（UTF-8）`);
 paragraph(`書き出しファイル：${info.filename}`);
 paragraph('ダウンロードを開始しました。端末でファイルを確認してから進めてください。選んだ履歴だけをこのブラウザから完全に削除します。この操作は元に戻せません。復元には書き出したJSONファイルが必要です。現在の旅・復旧用バックアップ・最新履歴・移行用原本は保持します。');
 const label=document.createElement('label');label.className='campaign-cleanup-ack';const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','書き出したJSONファイルを端末で確認しました');label.append(check,document.createTextNode('書き出したJSONファイルを端末で確認しました'));root.append(label);
 let closed=false;const confirm=document.createElement('button');confirm.type='button';confirm.textContent='選んだ履歴を完全に削除';confirm.disabled=true;
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='やめる';
 check.addEventListener('change',()=>{confirm.disabled=closed||!check.checked||!canConfirm();},{signal});
 confirm.addEventListener('click',()=>{if(closed||signal.aborted||!check.checked||!canConfirm())return;closed=true;confirm.disabled=true;onConfirm();},{signal});
 cancel.addEventListener('click',()=>{if(closed||signal.aborted)return;closed=true;confirm.disabled=true;onCancel();},{signal});root.append(confirm,cancel);return root;
}
