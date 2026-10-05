import {loadWorldState,saveWorld,restorePreviousWorld,startNewWorld,importWorld} from '../save/storage';
import {validateSave,type WorldSave} from '../save/format';
import type {ClientMessage} from '../simulation/protocol';
export function persistenceUI(send:(message:ClientMessage)=>void,signal:AbortSignal,notice:(message:string)=>void,shared?:{active:()=>boolean;exportWorld:()=>void}){
 const status=document.querySelector<HTMLElement>('#save-status')!,file=document.querySelector<HTMLInputElement>('#import-file')!;
 let writeGeneration=0;let exportNext=false,last:WorldSave|null=null,writes=Promise.resolve(),pending:Promise<WorldSave|null>|null=null,resolvePending:((save:WorldSave|null)=>void)|null=null,busy=false;
 const recovery=document.createElement('section');recovery.id='recovery-panel';recovery.hidden=true;recovery.setAttribute('role','dialog');recovery.setAttribute('aria-label','保存データの復旧');recovery.innerHTML='<h2>保存データを保護しています</h2><p id="recovery-message"></p><div class="panel-actions"><button id="recover-previous">直前の正常な保存へ戻す</button><button id="recover-import">バックアップJSONを読み込む</button><button id="recover-new">元データを保護して新しく始める</button></div><p>操作を選ぶまで自動保存を止めています。元のデータを黙って上書きしません。</p>';document.querySelector('#app')!.append(recovery);
 const write=(save:WorldSave)=>{if(busy||pending)return;last=save;const generation=writeGeneration;writes=writes.then(async()=>{if(generation===writeGeneration)await saveWorld(save);}).then(()=>{if(generation!==writeGeneration)return;status.textContent=`保存済み · 編集 ${save.edits.length}`;status.dataset.edits=String(save.edits.length);status.dataset.bodies=String(save.bodies.length);status.dataset.fluids=String(save.fluids.length);}).catch(error=>{status.textContent=error instanceof Error?error.message:'保存できません。書出でバックアップしてください';});};
 const download=(save:WorldSave)=>{const checked=validateSave(save),url=URL.createObjectURL(new Blob([JSON.stringify(checked)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='skybound-world-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('ワールドと自分の冒険をJSONへ書き出しました');};
 const finish=(save:WorldSave|null)=>{last=save;recovery.hidden=true;const resolve=resolvePending;resolvePending=null;pending=null;if(resolve)resolve(save);else send({type:'init',save});};
 const perform=async(task:()=>Promise<WorldSave|null>)=>{if(busy)return;busy=true;writeGeneration++;for(const button of recovery.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;try{const save=await task();if(!signal.aborted){finish(save);status.textContent='元の保存を保護して復旧しました';}}catch(error){const message=error instanceof Error?error.message:'復旧できませんでした。元の保存は保持しています';recovery.querySelector('#recovery-message')!.textContent=message;notice(message);}finally{busy=false;for(const button of recovery.querySelectorAll<HTMLButtonElement>('button'))button.disabled=false;}};
 recovery.querySelector('#recover-previous')!.addEventListener('click',()=>{void perform(()=>restorePreviousWorld());},{signal});
 recovery.querySelector('#recover-new')!.addEventListener('click',()=>{void perform(async()=>{await startNewWorld();return null;});},{signal});
 recovery.querySelector('#recover-import')!.addEventListener('click',()=>file.click(),{signal});
 document.querySelector('#save')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドはサーバーが保存しています。書出で自分のバックアップも保存できます');return;}send({type:'save'});},{signal});
 document.querySelector('#export')!.addEventListener('click',()=>{if(shared?.active()){shared.exportWorld();return;}exportNext=true;send({type:'save'});},{signal});
 document.querySelector('#import')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドから退出して、個人ワールドへ読み込んでください');return;}file.click();},{signal});
 file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected||busy)return;busy=true;writeGeneration++;try{if(shared?.active())throw Error('共有ワールドから退出してから読み込んでください');if(selected.size>16*1024*1024)throw Error('セーブファイルが大きすぎます');const save=await importWorld(validateSave(JSON.parse(await selected.text())));if(!signal.aborted){finish(save);status.textContent='バックアップを読み込みました';notice('元のワールドを保護して、セーブを読み込みました');}}catch(error){notice(error instanceof Error?error.message:'読込に失敗しました');}finally{busy=false;file.value='';}},{signal});
 const newWorld=document.createElement('section');newWorld.id='new-world-controls';newWorld.innerHTML='<h3>個人ワールドを新しく始める</h3><button id="new-world-open">新しい個人ワールド</button><div id="new-world-confirm" hidden><p>今の個人ワールドを保護して、新しい冒険を始めます。持ち物と進行は新規状態になります。必要なら先にJSONを書き出してください。</p><button id="new-world-confirmed">保護して新しく始める</button><button id="new-world-cancel">やめる</button></div>';document.querySelector('#system-panel')!.append(newWorld);
 const confirmation=newWorld.querySelector<HTMLElement>('#new-world-confirm')!;
 newWorld.querySelector('#new-world-open')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドから退出してから個人ワールドを作ってください');return;}confirmation.hidden=false;},{signal});
 newWorld.querySelector('#new-world-cancel')!.addEventListener('click',()=>confirmation.hidden=true,{signal});
 newWorld.querySelector('#new-world-confirmed')!.addEventListener('click',()=>{if(shared?.active()||busy)return;confirmation.hidden=true;void perform(async()=>{await startNewWorld();return null;});},{signal});
 signal.addEventListener('abort',()=>newWorld.remove(),{once:true});
 const timer=window.setInterval(()=>{if(!document.hidden&&!pending&&!busy)send({type:'save'});},5000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!pending&&!busy&&!shared?.active()){if(last)write(last);send({type:'save'});}},{signal});
 signal.addEventListener('abort',()=>{clearInterval(timer);if(last&&!pending&&!shared?.active())write(last);resolvePending?.(null);recovery.remove();},{once:true});
 return {
  async load():Promise<WorldSave|null>{if(pending)return pending;const result=await loadWorldState().catch(error=>({status:'blocked' as const,message:error instanceof Error?error.message:'保存領域にアクセスできません'}));
   if(result.status==='empty')return null;if(result.status==='loaded'){last=result.save;return result.save;}
   status.textContent='保存データを保護中 · 復旧操作を選んでください';recovery.querySelector('#recovery-message')!.textContent=result.message;(recovery.querySelector('#recover-previous')as HTMLButtonElement).hidden=result.status!=='recoverable';recovery.hidden=false;pending=new Promise(resolve=>resolvePending=resolve);return pending;
  },
  receive(save:WorldSave){if(busy||pending)return;write(save);if(exportNext){exportNext=false;download(save);}},
  exportSave(save:WorldSave){download(save);},
 };
}
