import {isSavedRevision,shortSavedRevision} from '../save/revision';
import {prepareNextAdventureCycle} from '../save/adventure-cycle';
import {loadWorldState,saveWorld,restorePreviousWorld,startNewWorld,importWorld,savedWorldRevision} from '../save/storage';
import {validateSave,type WorldSave} from '../save/format';
import type {ClientMessage} from '../simulation/protocol';
export function persistenceUI(send:(message:ClientMessage)=>void,signal:AbortSignal,notice:(message:string)=>void,shared?:{active:()=>boolean;exportWorld:()=>void}){
 const status=document.querySelector<HTMLElement>('#save-status')!,file=document.querySelector<HTMLInputElement>('#import-file')!;
 const showRevision=(scope:'local'|'room',revision:string|undefined,label:string)=>{status.dataset.saveScope=scope;if(revision){status.dataset.revision=revision;status.title=`${scope==='room'?'共有':'個人'}の保存世代: ${revision}`;}else{delete status.dataset.revision;status.title='保存世代はまだ確認できていません';}status.textContent=label+(revision?` · 世代 ${shortSavedRevision(revision)}`:' · 保存世代未確認');};
 const localStatus=(label:string)=>{if(!shared?.active())showRevision('local',savedWorldRevision(),label);};
 let writeGeneration=0;let exportNext=false,last:WorldSave|null=null,writes=Promise.resolve(),pending:Promise<WorldSave|null>|null=null,resolvePending:((save:WorldSave|null)=>void)|null=null,busy=false;
 let capture:((save:WorldSave)=>void)|undefined;
 const freshSave=()=>new Promise<WorldSave>((resolve,reject)=>{const timeout=setTimeout(()=>{capture=undefined;reject(Error('最新のワールドを保存できませんでした。元の冒険は変更していません'));},10000);capture=save=>{clearTimeout(timeout);capture=undefined;resolve(save);};send({type:'save'});});
 const recovery=document.createElement('section');recovery.id='recovery-panel';recovery.hidden=true;recovery.setAttribute('role','dialog');recovery.setAttribute('aria-label','保存データの復旧');recovery.innerHTML='<h2>保存データを保護しています</h2><p id="recovery-message"></p><div class="panel-actions"><button id="recover-previous">直前の正常な保存へ戻す</button><button id="recover-import">バックアップJSONを読み込む</button><button id="recover-new">元データを保護して新しく始める</button></div><p>操作を選ぶまで自動保存を止めています。元のデータを黙って上書きしません。</p>';document.querySelector('#app')!.append(recovery);
 const write=(save:WorldSave)=>{if(busy||pending)return;last=save;const generation=writeGeneration;writes=writes.then(async()=>{if(generation===writeGeneration)await saveWorld(save);}).then(()=>{if(generation!==writeGeneration)return;localStatus(`保存済み · 編集 ${save.edits.length}`);status.dataset.edits=String(save.edits.length);status.dataset.bodies=String(save.bodies.length);status.dataset.fluids=String(save.fluids.length);}).catch(error=>{localStatus(error instanceof Error?error.message:'保存できません。書出でバックアップしてください');});};
 const download=(save:WorldSave)=>{const checked=validateSave(save),url=URL.createObjectURL(new Blob([JSON.stringify(checked)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='skybound-world-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('ワールドと自分の冒険をJSONへ書き出しました');};
 const finish=(save:WorldSave|null)=>{last=save;recovery.hidden=true;const resolve=resolvePending;resolvePending=null;pending=null;if(resolve)resolve(save);else send({type:'init',save});};
 const perform=async(task:()=>Promise<WorldSave|null>)=>{if(busy)return;busy=true;writeGeneration++;for(const button of recovery.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;try{const save=await task();if(!signal.aborted){finish(save);localStatus('元の保存を保護して復旧しました');}}catch(error){const message=error instanceof Error?error.message:'復旧できませんでした。元の保存は保持しています';recovery.querySelector('#recovery-message')!.textContent=message;localStatus(message);notice(message);}finally{busy=false;for(const button of recovery.querySelectorAll<HTMLButtonElement>('button'))button.disabled=false;}};
 recovery.querySelector('#recover-previous')!.addEventListener('click',()=>{void perform(()=>restorePreviousWorld());},{signal});
 recovery.querySelector('#recover-new')!.addEventListener('click',()=>{void perform(async()=>{await startNewWorld();return null;});},{signal});
 recovery.querySelector('#recover-import')!.addEventListener('click',()=>file.click(),{signal});
 document.querySelector('#save')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドはサーバーが保存しています。書出で自分のバックアップも保存できます');return;}send({type:'save'});},{signal});
 document.querySelector('#export')!.addEventListener('click',()=>{if(shared?.active()){shared.exportWorld();return;}exportNext=true;send({type:'save'});},{signal});
 document.querySelector('#import')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドから退出して、個人ワールドへ読み込んでください');return;}file.click();},{signal});
 file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected||busy)return;busy=true;writeGeneration++;try{if(shared?.active())throw Error('共有ワールドから退出してから読み込んでください');if(selected.size>16*1024*1024)throw Error('セーブファイルが大きすぎます');const save=await importWorld(validateSave(JSON.parse(await selected.text())));if(!signal.aborted){finish(save);localStatus('バックアップを読み込みました');notice('元のワールドを保護して、セーブを読み込みました');}}catch(error){notice(error instanceof Error?error.message:'読込に失敗しました');}finally{busy=false;file.value='';}},{signal});
 const newWorld=document.createElement('section');newWorld.id='new-world-controls';newWorld.innerHTML='<h3>個人ワールドを新しく始める</h3><button id="new-world-open">新しい個人ワールド</button><button id="next-cycle-open">クリア後の次の航路</button><div id="new-world-confirm" hidden><p>今の個人ワールドを保護して、新しい冒険を始めます。持ち物と進行は新規状態になります。必要なら先にJSONを書き出してください。</p><button id="new-world-confirmed">保護して新しく始める</button><button id="new-world-cancel" data-modal-cancel>やめる</button></div>';document.querySelector('#system-panel')!.append(newWorld);
 let nextCycle=false;
 const confirmation=newWorld.querySelector<HTMLElement>('#new-world-confirm')!;
 newWorld.querySelector('#new-world-open')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドから退出してから個人ワールドを作ってください');return;}nextCycle=false;confirmation.querySelector('p')!.textContent='今の個人ワールドを保護して、新しい冒険を始めます。持ち物と進行は新規状態になります。必要なら先にJSONを書き出してください。';confirmation.hidden=false;},{signal});
 newWorld.querySelector('#next-cycle-open')!.addEventListener('click',()=>{if(shared?.active()){notice('共有ワールドの進行は変えません。退出後、クリアした個人ワールドで選んでください');return;}if(!last?.adventure?.defeated.includes('stormcore')){notice('嵐心を鎮めた個人ワールドを保存してから選んでください');return;}nextCycle=true;confirmation.querySelector('p')!.textContent='今のワールド全体と持ち物を復旧用記録へ保護し、次の航路へ進みます。地形・持ち物・依頼は初期状態に戻り、機関室の必要重量・灯の数・出発時刻が変化します。発見した記録と装飾の解放、前周の競走最高記録は残ります。共有ワールドには影響しません。';confirmation.hidden=false;},{signal});
 newWorld.querySelector('#new-world-cancel')!.addEventListener('click',()=>{confirmation.hidden=true;nextCycle=false;},{signal});
 document.querySelector('#system-close')!.addEventListener('click',()=>{confirmation.hidden=true;nextCycle=false;},{signal});
 newWorld.querySelector('#new-world-confirmed')!.addEventListener('click',()=>{if(shared?.active()||busy)return;const cycleRequested=nextCycle;confirmation.hidden=true;void perform(async()=>{await writes;const current=await freshSave();if(shared?.active())throw Error('共有ワールドから退出してから個人ワールドを作ってください');await saveWorld(current);if(cycleRequested)return importWorld(prepareNextAdventureCycle(current));await startNewWorld();return null;});},{signal});
 signal.addEventListener('abort',()=>newWorld.remove(),{once:true});
 const timer=window.setInterval(()=>{if(!document.hidden&&!pending&&!busy)send({type:'save'});},5000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!pending&&!busy&&!shared?.active()){if(last)write(last);send({type:'save'});}},{signal});
 signal.addEventListener('abort',()=>{clearInterval(timer);if(last&&!pending&&!shared?.active())write(last);resolvePending?.(null);recovery.remove();},{once:true});
 return {
  async load():Promise<WorldSave|null>{if(pending)return pending;const result=await loadWorldState().catch(error=>({status:'blocked' as const,message:error instanceof Error?error.message:'保存領域にアクセスできません'}));
   if(result.status==='empty'){localStatus('新しい個人ワールド · 未保存');return null;}if(result.status==='loaded'){last=result.save;localStatus('個人ワールドを読込済み');return result.save;}
   localStatus('保存データを保護中 · 復旧操作を選んでください');recovery.querySelector('#recovery-message')!.textContent=result.message;(recovery.querySelector('#recover-previous')as HTMLButtonElement).hidden=result.status!=='recoverable';recovery.hidden=false;pending=new Promise(resolve=>resolvePending=resolve);return pending;
  },
  receive(save:WorldSave){if(capture){capture(save);return;}if(busy||pending)return;write(save);if(exportNext){exportNext=false;download(save);}},
  exportSave(save:WorldSave){download(save);},
  sharedRevision(revision?:string){if(revision!==undefined&&!isSavedRevision(revision))return;if(shared?.active())showRevision('room',revision,revision?'共有ワールド保存済み':'共有ワールド · サーバーの保存確認待ち');},
 };
}
