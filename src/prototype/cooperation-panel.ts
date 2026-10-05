import type {CooperationAction,CooperationSnapshot,cooperationControls} from './campaign-ui';
type Controls=ReturnType<typeof cooperationControls>;
export const unavailableCooperation:CooperationSnapshot={enabled:false,status:'協力プレイはこの環境では利用できません。',role:null,invite:null,guestBuild:false,muted:false,players:0,messages:[],canJoin:false};
/** A stable interactive subtree: simulation ticks and incoming chat never detach
 * the input or action buttons between pointer-down and pointer-up. */
export function createCooperationPanel(onAction:(id:CooperationAction,text?:string)=>void,controlsFor:(state:CooperationSnapshot)=>Controls,cleanText:(text:string)=>string,signal:AbortSignal){
 const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 const setText=(el:HTMLElement,text:string)=>{if(el.textContent!==text)el.textContent=text;};
 let state=unavailableCooperation,controls=controlsFor(state),draft='',lastMessages='';
 const root=node('div');root.dataset.cooperationPanel='';
 const button=(label:string,id:CooperationAction,action:()=>void=()=>onAction(id))=>{const b=node('button',label);b.type='button';b.dataset.coop=id;b.addEventListener('click',()=>{if(!b.disabled)action();},{signal});return b;};
 root.append(node('p','共有の炎や帯電した地形は術者と同行者の両方を傷つけます。直接プレイヤーを狙う属性術はありません。','campaign-help'),node('p','同じワールド・所持素材・進行を共有します。保存はホストが管理し、ゲストのソロ保存は上書きしません。招待を開くだけでは接続しません。作成または参加を選ぶと接続します。','campaign-coop-notice'));
 const status=node('div',undefined,'campaign-coop-status'),role=node('strong'),participants=node('span'),statusText=node('p');status.setAttribute('role','status');status.append(role,participants,statusText);root.append(status);
 const actions=node('div',undefined,'campaign-coop-actions'),create=button('部屋を作成','create'),join=button('招待から参加','join'),leave=button('退出する','leave');actions.append(create,join,leave);root.append(actions);
 const unavailable=node('p','現在は接続操作を利用できません。準備状況は上の表示を確認してください。','campaign-reason');root.append(unavailable);
 const inviteWrap=node('div'),inviteLabel=node('label',undefined,'campaign-coop-invite'),inviteCaption=node('span'),invite=node('input'),copy=button('招待リンクをコピー','copy-invite');invite.type='text';invite.id='cooperation-invite';invite.readOnly=true;invite.setAttribute('aria-label','協力プレイの招待リンク');invite.addEventListener('focus',()=>invite.select(),{signal});inviteLabel.append(inviteCaption,invite);inviteWrap.append(inviteLabel,copy);root.append(inviteWrap);
 const permissionWrap=node('div'),permissionTitle=node('h3','ゲストの操作権限','campaign-section-title'),permissionText=node('p'),permission=button('ゲストの編集を許可','allow-build',()=>onAction(state.guestBuild?'deny-build':'allow-build'));permissionWrap.append(permissionTitle,permissionText,permission);root.append(permissionWrap);
 root.append(node('h3','ルームチャット','campaign-section-title'));const mute=button('チャットをミュート','mute',()=>onAction(state.muted?'unmute':'mute'));root.append(mute);
 const log=node('div',undefined,'campaign-coop-chat');log.setAttribute('role','log');log.setAttribute('aria-label','ルームチャット');log.setAttribute('aria-live','polite');root.append(log);
 const compose=node('div',undefined,'campaign-coop-compose'),label=node('label','メッセージ（最大240文字）'),input=node('input');input.type='text';input.id='cooperation-chat';input.maxLength=240;input.setAttribute('aria-label','ルームチャットのメッセージ');
 const refreshSend=()=>{send.disabled=!controls.chat||!cleanText(draft);};
 const submit=()=>{const text=cleanText(draft);if(!text||!controls.chat)return;draft='';input.value='';refreshSend();onAction('chat',text);};
 const send=button('送信','chat',submit);input.addEventListener('input',()=>{draft=input.value;refreshSend();},{signal});input.addEventListener('keydown',event=>{if(event.code==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();submit();}},{signal});label.append(input);compose.append(label,send);root.append(compose);
 function update(next:CooperationSnapshot){
  state=next;controls=controlsFor(state);
  setText(role,!state.enabled?'未接続':state.role==='host'?'ホストとして接続中':state.role==='guest'?'ゲストとして接続中':'未接続');setText(participants,controls.participants);setText(statusText,state.status);
  create.disabled=!controls.create;join.disabled=!controls.join;leave.disabled=!controls.leave;setText(leave,state.guestPreview&&!state.role?'自分の旅へ戻る':'退出する');unavailable.hidden=state.enabled;
  inviteWrap.hidden=!state.invite;setText(inviteCaption,state.role==='host'?'共有する招待リンク':state.role==='guest'?'参加中の招待リンク':'招待リンク · 参加操作まで未接続');if(invite.value!==(state.invite??''))invite.value=state.invite??'';copy.disabled=!controls.invite;
  permissionWrap.hidden=!state.role;permissionTitle.hidden=state.role!=='host';permission.hidden=state.role!=='host';permission.disabled=!controls.permissions;permission.dataset.coop=state.guestBuild?'deny-build':'allow-build';setText(permission,state.guestBuild?'ゲストの編集を禁止':'ゲストの編集を許可');setText(permissionText,state.role==='host'?(state.guestBuild?'ゲストの建築・編集を許可しています。':'ゲストの建築・編集を禁止しています。'):(state.guestBuild?'ホストが建築・編集を許可しています。':'建築・編集はホストが許可するまで利用できません。'));
  mute.disabled=!state.enabled||!state.role;mute.dataset.coop=state.muted?'unmute':'mute';setText(mute,state.muted?'チャットのミュートを解除':'チャットをミュート');input.disabled=!controls.chat;input.placeholder=state.muted?'ミュートを解除してください':'ルームの参加者へ';refreshSend();
  const messages=state.messages.slice(-100),key=JSON.stringify([state.enabled,state.role,state.muted,messages]);if(key===lastMessages)return;lastMessages=key;const follow=log.scrollTop+log.clientHeight>=log.scrollHeight-8,scroll=log.scrollTop;log.replaceChildren();
  if(state.muted)log.append(node('p','チャットはミュート中です。'));else if(!state.enabled||!state.role)log.append(node('p','部屋に参加するとチャットを利用できます。'));else if(!messages.length)log.append(node('p','まだメッセージはありません。'));else for(const message of messages){const entry=node('p');entry.append(node('strong',message.from.slice(0,80)+'： '),document.createTextNode(message.text.slice(0,240)));log.append(entry);}log.scrollTop=follow?log.scrollHeight:scroll;
 }
 update(state);return {root,update};
}
