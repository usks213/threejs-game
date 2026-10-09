import type {ConnectionState} from '../networking/coop-client';
import type {RoomAccessView as ManagementView,RoomAdminOperation as ManagedOperation} from '../networking/room-access';
export type {RoomAccessView as ManagementView,RoomAdminOperation as ManagedOperation} from '../networking/room-access';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function managementQuestion(operation:ManagedOperation,target?:string):string{
 if(operation==='lock')return '新しい参加者の入室を止めます。すでに参加した仲間は再接続できます。実行しますか？';
 if(operation==='unlock')return '招待コードを持つ新しい参加者が再び入室できるようにします。実行しますか？';
 if(operation==='kick')return `プレイヤー ${target??''} を今の接続から退出させます。再参加はできます。持ち物と建築は残ります。実行しますか？`;
 if(operation==='ban')return `プレイヤー ${target??''} を退出させ、このプレイヤーIDでの再参加を拒否します。持ち物と建築は消しません。別の新規IDを防ぐには参加ロックも使ってください。実行しますか？`;
 return `プレイヤー ${target??''} の再参加拒否を解除します。保存されている持ち物と建築の所有権はそのままです。実行しますか？`;
}
export function canManageOperation(view:ManagementView|null,connection:ConnectionState,ownId:string|undefined,operation:ManagedOperation,target?:string):boolean{
 if(connection!=='online'||!view?.canManage||view.pending||view.readOnly)return false;
 if(operation==='lock'||operation==='unlock')return !target&&(operation==='lock'?!view.locked:view.locked);
 const member=view.members?.find(m=>m.id===target);return !!member&&target!==ownId&&(operation==='kick'?member.online&&!member.banned:operation==='ban'?!member.banned:member.banned);
}
export function roomManagementUI(panel:HTMLElement,signal:AbortSignal,send:(operation:ManagedOperation,target?:string)=>void){
 const root=document.createElement('section');root.id='room-management';root.hidden=true;panel.append(root);
 let view:ManagementView|null=null,connection:ConnectionState='closed',ownId:string|undefined,selection:{operation:ManagedOperation;target?:string}|undefined,sending=false,lastMarkup='';
 const ready=(operation:ManagedOperation,target?:string)=>!sending&&canManageOperation(view,connection,ownId,operation,target);
 const button=(label:string,operation:ManagedOperation,target?:string)=>`<button type="button" data-admin="${operation}" ${target?`data-member="${escape(target)}"`:''} ${!ready(operation,target)?'disabled':''}>${label}</button>`;
 function render(){root.hidden=connection==='closed'||!view;if(root.hidden){root.replaceChildren();lastMarkup='';return;}
  const message=view!.readOnly?'保存を確認できないため、この部屋の操作を停止しています。再接続して状態を確認してください。':view!.pending||sending?'管理操作をサーバーへ保存中です。成功の確認まで操作を待ってください。':view!.locked?'新規参加は停止中です。既知の仲間は再接続できます。':'招待コードを持つ人が参加できます。';
  const markup='<h3>部屋の管理</h3><p role="status">'+message+'</p>'+(view!.canManage?'<p>管理者の操作はサーバーへ保存されます。退出/拒否で相手のセーブや建築は削除されません。</p>'+button(view!.locked?'新規参加を再開':'新規参加を止める',view!.locked?'unlock':'lock')+(selection?`<div class="admin-confirm"><p>${escape(managementQuestion(selection.operation,selection.target))}</p><button type="button" data-admin-confirm ${!ready(selection.operation,selection.target)?'disabled':''}>内容を確認して実行</button><button type="button" data-admin-cancel data-modal-cancel>戻る</button></div>`:'')+'<details><summary>参加記録（'+(view!.members?.length??0)+'人）</summary>'+ (view!.members??[]).map(m=>`<article class="admin-member"><strong>${m.id===ownId?'あなた':m.online?'接続中':m.banned?'再参加拒否中':'退出中'}</strong><code>${escape(m.id)}</code>${m.id===ownId?'':m.banned?button('再参加拒否を解除','unban',m.id):button('退出させる','kick',m.id)+button('退出＋再参加拒否','ban',m.id)}</article>`).join('')+'</details>':'<p>参加設定は部屋の管理者が変更できます。旧版の部屋で管理者記録がない場合は、この操作を利用できません。</p>');
  if(markup!==lastMarkup){const open=root.querySelector('details')?.open;root.innerHTML=markup;if(open)root.querySelector('details')!.open=true;lastMarkup=markup;}
 }
 root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-admin-cancel')){selection=undefined;render();root.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();return;}
  if(button.hasAttribute('data-admin-confirm')){if(!selection||!ready(selection.operation,selection.target))return;const command=selection;selection=undefined;sending=true;render();send(command.operation,command.target);return;}
  const operation=button.dataset.admin as ManagedOperation;if(!['lock','unlock','kick','ban','unban'].includes(operation)||!ready(operation,button.dataset.member))return;selection={operation,target:button.dataset.member};render();root.querySelector<HTMLButtonElement>('[data-admin-cancel]')?.focus();
 },{signal});
 signal.addEventListener('abort',()=>root.remove(),{once:true});
 return {update(next:ManagementView|null,state:ConnectionState,id?:string){view=next;connection=state;ownId=id;if(state!=='online'){selection=undefined;sending=false;}if(selection&&!canManageOperation(view,state,id,selection.operation,selection.target))selection=undefined;render();},acknowledged(){sending=false;render();},cancelConfirmation(){if(!selection)return false;selection=undefined;render();root.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();return true;}};
}
