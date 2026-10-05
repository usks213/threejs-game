import {campaignHudText} from './campaign-hud';
import './campaign-ui.css';
import {campaignMapData,createCampaignMap,mapPointReferences,mapCoordinates,type CampaignMapData,type MapPosition} from './campaign-map';
import type {CheckpointArchiveMetadata} from '../save/checkpoint';

export type CampaignTab='inventory'|'crafting'|'equipment'|'journal'|'map'|'settings'|'homestead'|'cooperation';
export interface CampaignCrafting {
 maxCount:number;
 output:{label:string;perCraft:number;owned:number;stackLimit:number};
 costs:{label:string;perCraft:number;owned:number}[];
 statuses:{ok:boolean;message:string}[];
}
/** The presenter supplies core-validated choices; the view only scales display totals. */
export function craftingSelection(craft:CampaignCrafting,draft:string){
 const value=Number(draft),count=draft.trim()!==''&&Number.isSafeInteger(value)&&value>=1&&value<=20?value:null;
 return {count,ok:count!==null&&craft.statuses[count-1]?.ok===true,
  message:count===null?'制作回数は1〜20の整数を入力してください':craft.statuses[count-1]?.message??'この制作数は利用できません',
  outputCount:count===null?null:craft.output.perCraft*count,
  costs:craft.costs.map(cost=>({...cost,total:count===null?null:cost.perCraft*count}))};
}
export interface CampaignRow {mapIcon?:string;craft?:CampaignCrafting;id:string;label:string;detail?:string;count?:number;available?:boolean;reason?:string;action?:'craft'|'equip'|'consume'|'learn'|'travel'|'remove-pin'|'homestead'|'gear';position?:{x:number;z:number};completed?:boolean}
export interface CooperationSnapshot {guestPreview?:boolean;enabled:boolean;status:string;role:null|'host'|'guest';invite:string|null;guestBuild:boolean;muted:boolean;players:number;messages:{from:string;text:string}[];canJoin:boolean}
export type CooperationAction='create'|'join'|'leave'|'allow-build'|'deny-build'|'mute'|'unmute'|'copy-invite'|'chat';
export function cooperationChatText(value:string){return value.trim().slice(0,240);}
export function cooperationControls(state:CooperationSnapshot){return {create:state.enabled&&!state.role&&!state.guestPreview,join:state.enabled&&!state.role&&state.canJoin,leave:!!state.role||!!state.guestPreview,invite:state.enabled&&!!state.invite,permissions:state.enabled&&state.role==='host',chat:state.enabled&&!!state.role&&!state.muted,participants:state.enabled&&state.role?`参加者 ${Math.max(1,Math.floor(state.players)||1)}人`:'未接続'};}
export interface CampaignUISnapshot {
 map?:CampaignMapData;
 materials:CampaignRow[];items:CampaignRow[];recipes:CampaignRow[];quests:CampaignRow[];points:CampaignRow[];skills:CampaignRow[];equipment:CampaignRow[];
 stats:{burning?:number;wet?:number;shock?:number;level:number;xp:number;skillPoints:number;region:string;objective:string;shroud?:number;food?:number;rest?:number;oxygen?:number;cold?:number;focus?:number;weather?:string};
 settings:{reducedMotion?:boolean;textScale?:number;cameraMode?:'first'|'third';cameraDistance?:number;audioMix?:{music:number;effects:number;ambience:number};volume:number;sensitivity:number;graphics:'balanced'|'performance'|'high'};
 save:{canImport?:boolean;canExport?:boolean;fileBusy?:boolean;importInfo?:{name:string;savedAt:number;sizeBytes:number};switchBlocked?:boolean;canExpand?:boolean;expanded?:boolean;expansionBlocked?:boolean;available:boolean;label:string;status:string;archives?:CheckpointArchiveMetadata[];archiveError?:string;archiveScope?:string;disabledForGuest?:boolean};
 bindings?:{action:string;label:string;key:string}[];
 homestead?:CampaignRow[];
 cooperation?:CooperationSnapshot;
}
export function campaignSaveControls(save:CampaignUISnapshot['save']){const editable=!save.disabledForGuest;return {save:editable,continue:editable&&save.available,newGame:editable&&!save.archiveError&&!save.switchBlocked,restore:editable&&!save.archiveError&&!save.switchBlocked};}
export type CampaignCommand={type:'prepare-import';file:File}|{type:'export-file';id?:string}|{type:'cancel-import'|'confirm-import'}|{type:'restore-archive';id:string}|{type:'coop';id:CooperationAction;text?:string}|{type:'craft';id:string;count?:number}|{type:'equip'|'consume'|'learn'|'travel'|'remove-pin'|'homestead'|'gear';id:string}|{type:'setting';key:'volume'|'sensitivity'|'graphics'|'music'|'effects'|'ambience'|'cameraMode'|'cameraDistance'|'reducedMotion'|'textScale';value:number|string}|{type:'binding';action:string;key:string}|{type:'pin';x:number;z:number}|{type:'save'|'continue'|'new-game'|'expand-world'|'cancel-expansion'|'resume'|'open'|'close'|'reset-bindings'};
const tabs:Record<CampaignTab,string>={inventory:'所持品',crafting:'制作',equipment:'装備・成長',journal:'クエスト',map:'地図',settings:'設定・保存',homestead:'拠点生活',cooperation:'協力プレイ'};
const actionNames={craft:'制作する',equip:'装備する',consume:'使う',learn:'習得する',travel:'移動する','remove-pin':'ピンを削除',homestead:'実行',gear:'実行'};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}

/** Display-only controller. The app supplies validated state and executes every transaction. */
export function createCampaignUI(onCommand:(command:CampaignCommand)=>void){
 const abort=new AbortController(),signal=abort.signal,craftDrafts=new Map<string,string>();
 const mapSelection:{position?:MapPosition}={};
 let snapshot:CampaignUISnapshot|undefined,tab:CampaignTab='inventory',opened=false,lastFocus:HTMLElement|null=null,query='',confirmExpansion=false,confirmNew=false,confirmArchive='',confirmSalvage='',lastRender='',chatDraft='';
 const root=node('section',undefined,'campaign-overlay');root.id='campaign-panel';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','campaign-heading');
 const card=node('div',undefined,'campaign-card'),header=node('header',undefined,'campaign-header'),heading=node('h2','旅の記録');heading.id='campaign-heading';
 const close=button('閉じる ×',()=>closePanel());close.setAttribute('aria-label','旅の記録を閉じる');header.append(heading,close);
 const summary=node('p',undefined,'campaign-summary'),nav=node('nav',undefined,'campaign-tabs');nav.setAttribute('aria-label','旅の記録の項目');
 const tabButtons=new Map<CampaignTab,HTMLButtonElement>();
 for(const [key,label] of Object.entries(tabs)){const name=key as CampaignTab,b=button(label,()=>{if(snapshot?.save.importInfo||snapshot?.save.fileBusy)onCommand({type:'cancel-import'});tab=name;query='';confirmExpansion=false;confirmNew=false;confirmArchive='';confirmSalvage='';render(true);});b.dataset.tab=name;tabButtons.set(name,b);nav.append(b);}
 const body=node('div',undefined,'campaign-body');body.id='campaign-body';const feedback=node('div',undefined,'campaign-feedback');feedback.setAttribute('role','status');
 const footer=node('footer',undefined,'campaign-footer');footer.append(feedback,button('探索に戻る',()=>onCommand({type:'resume'})));
 card.append(header,summary,nav,body,footer);root.append(card);document.querySelector('#app')!.append(root);
 const openButton=button('旅の記録',()=>open('inventory'));openButton.id='campaign-toggle';openButton.setAttribute('aria-label','所持品・制作・クエスト・地図を開く');document.querySelector('.hud')!.append(openButton);
 const hud=node('div',undefined,'campaign-hud'),hudHeadline=node('span',undefined,'campaign-hud-line'),hudDetail=node('span',undefined,'campaign-hud-line');hud.append(hudHeadline,hudDetail);hud.id='campaign-status';document.querySelector('#app')!.append(hud);
 function button(text:string,click:()=>void){const b=node('button',text);b.type='button';b.addEventListener('click',click,{signal});return b;}
 function closePanel(){if(!opened)return;opened=false;root.hidden=true;confirmExpansion=false;confirmNew=false;confirmArchive='';confirmSalvage='';onCommand({type:'close'});lastFocus?.focus();}
 function open(next:CampaignTab='inventory'){if(!opened){lastFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;opened=true;onCommand({type:'open'});}tab=next;confirmExpansion=false;confirmNew=false;confirmArchive='';confirmSalvage='';query='';root.hidden=false;render(true);close.focus();}
 function craftingControls(row:CampaignRow){
  const craft=row.craft!,wrap=node('div',undefined,'campaign-crafting'),controls=node('div',undefined,'campaign-craft-quantity');
  const label=node('label','制作回数（1〜20）'),input=node('input');input.type='number';input.min='1';input.max='20';input.step='1';input.inputMode='numeric';input.id='craft-quantity-'+row.id;input.dataset.craftQuantity=row.id;input.value=craftDrafts.get(row.id)??'1';input.setAttribute('aria-label',row.label+'の制作回数');label.append(input);
  const cost=node('p',undefined,'campaign-craft-cost'),output=node('p',undefined,'campaign-craft-output'),reason=node('p',undefined,'campaign-reason');
  cost.id='craft-cost-'+row.id;output.id='craft-output-'+row.id;reason.id='craft-reason-'+row.id;input.setAttribute('aria-describedby',cost.id+' '+output.id+' '+reason.id);
  const submit=button('制作する',()=>{const selected=craftingSelection(craft,craftDrafts.get(row.id)??'1');if(selected.ok&&selected.count!==null)onCommand({type:'craft',id:row.id,count:selected.count});});submit.dataset.command='craft';
  const refresh=()=>{const selected=craftingSelection(craft,input.value);input.setAttribute('aria-invalid',String(selected.count===null));submit.disabled=!selected.ok;
   cost.textContent='必要素材合計：'+selected.costs.map(c=>`${c.label} ×${c.total??'—'}（所持 ${c.owned}）`).join(' / ');
   output.textContent=`完成品合計：${craft.output.label} ×${selected.outputCount??'—'}（所持 ${craft.output.owned} / 上限 ${craft.output.stackLimit}）`;
   reason.textContent=selected.message;};
  const select=(count:number)=>{input.value=String(count);craftDrafts.set(row.id,input.value);refresh();};
  const one=button('1回',()=>select(1)),maximum=button('最大 '+craft.maxCount+'回',()=>{if(craft.maxCount>0)select(craft.maxCount);});one.dataset.craftSelect='one';maximum.dataset.craftSelect='max';maximum.disabled=craft.maxCount===0;
  one.setAttribute('aria-label',row.label+'を1回分にする');maximum.setAttribute('aria-label',row.label+'を最大'+craft.maxCount+'回分にする');
  input.addEventListener('input',()=>{craftDrafts.set(row.id,input.value);refresh();},{signal});
  controls.append(one,maximum,label);wrap.append(controls,cost,output,reason,submit);refresh();return wrap;
 }
 function rows(list:CampaignRow[],empty:string){
  const grid=node('div',undefined,'campaign-grid');if(!list.length)grid.append(node('p',empty,'campaign-empty'));
  for(const row of list){
   const item=node('article',undefined,'campaign-item');item.dataset.item=row.id;item.append(node('h3',`${row.completed?'✓ ':''}${row.label}${row.count!==undefined?' ×'+row.count:''}`));if(row.detail)item.append(node('p',row.detail));
   if(row.action==='craft'&&row.craft)item.append(craftingControls(row));
   else {
    if(row.reason)item.append(node('p',row.reason,'campaign-reason'));
    if(row.action){const action=row.action,b=button(actionNames[action],()=>{if(action==='gear'&&row.id.startsWith('salvage:')){confirmSalvage=row.id;render(true);}else onCommand({type:action,id:row.id});});b.disabled=row.available===false;b.dataset.command=action;item.append(b);
     if(action==='gear'&&row.id===confirmSalvage){const warning=node('div',undefined,'campaign-warning');warning.setAttribute('role','group');warning.setAttribute('aria-label','装備分解の確認');warning.append(node('p','この装備を分解しますか？ この操作は元に戻せません。'),node('p',row.detail??'装備を失い、素材を受け取ります。'));const confirm=button('分解する',()=>{confirmSalvage='';onCommand({type:'gear',id:row.id});render(true);});confirm.disabled=row.available===false;warning.append(confirm,button('やめる',()=>{confirmSalvage='';render(true);}));item.append(warning);}
    }
   }
   grid.append(item);
  }
  return grid;
 }
 function title(text:string){body.append(node('h3',text,'campaign-section-title'));}
 function renderSaveControls(){
  if(!snapshot)return;const state=snapshot.save,controls=campaignSaveControls(state);
  const date=(value:number)=>{const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'日時不明':parsed.toLocaleString('ja-JP');};
  const details=(entry:CheckpointArchiveMetadata)=>`保存先：${state.archiveScope??entry.scope} · 保存日時：${date(entry.savedAt)} · 保管日時：${date(entry.archivedAt)} · ${(entry.sizeBytes/1024).toFixed(1)} KiB（UTF-8）`;
  title('セーブ');body.append(node('p',state.status),node('p',state.label));
  if(state.disabledForGuest)body.append(node('p','ゲスト参加・参加プレビュー中は保存・新規開始・復元を利用できません。退出して自分のワールドへ戻ると利用できます。','campaign-reason'));
  if(state.switchBlocked&&!state.disabledForGuest)body.append(node('p','共有中の世界は新規開始・履歴復元できません。協力プレイから退出してから切り替えてください。','campaign-reason'));
  const actions=node('div',undefined,'campaign-save-actions');
  const save=button('今すぐ保存',()=>{if(snapshot&&campaignSaveControls(snapshot.save).save)onCommand({type:'save'});}),resume=button('保存から続ける',()=>{if(snapshot&&campaignSaveControls(snapshot.save).continue)onCommand({type:'continue'});}),fresh=button('新しく始める',()=>{if(!snapshot||!campaignSaveControls(snapshot.save).newGame)return;confirmNew=true;confirmExpansion=false;confirmArchive='';render(true);});
  save.disabled=!controls.save;resume.disabled=!controls.continue;fresh.disabled=!controls.newGame;actions.append(save,resume,fresh);body.append(actions);
  if(confirmNew){const warning=node('div',undefined,'campaign-warning');warning.setAttribute('role','group');warning.setAttribute('aria-label','新しい旅の確認');
   warning.append(node('p','新しい旅を始めますか？ 現在の有効な保存を「旅の履歴」に保管してから切り替えます。履歴は自動保存で上書き・自動削除されません。未保存の変更は保管されません。'),node('p',`保存先：${state.archiveScope??'このブラウザの現在のキャンペーン'}。容量不足や履歴の検証失敗時は中止します。`));
   const confirm=button('バックアップして新しい旅へ',()=>{if(!confirmNew||!snapshot||!campaignSaveControls(snapshot.save).newGame)return;confirmNew=false;render(true);onCommand({type:'new-game'});});confirm.disabled=!controls.newGame;warning.append(confirm,button('やめる',()=>{confirmNew=false;render(true);}));body.append(warning);
  }
  title('保存ファイル');
  body.append(node('p','JSONファイルで端末へ保存できます。ネットワーク送信は行いません。書き出すのは最後に成功した保存です。未保存の変更は先に「今すぐ保存」で保存してください。取り込みは現在と同じ世界形式の12 MB以内のファイルだけ利用できます。','campaign-help'));
  const exportCurrent=button('最後の保存を端末へ書き出す',()=>onCommand({type:'export-file'}));exportCurrent.disabled=!state.canExport||!!state.fileBusy;body.append(exportCurrent);
  const fileLabel=node('label','保存ファイルを選ぶ','campaign-file-picker'),file=node('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','取り込む保存ファイル');file.disabled=!state.canImport||!!state.fileBusy;file.addEventListener('change',()=>{const selected=file.files?.[0];if(selected)onCommand({type:'prepare-import',file:selected});},{signal});fileLabel.append(file);body.append(fileLabel);
  if(state.fileBusy){const busy=node('p','保存ファイルを検証中…','campaign-help');busy.setAttribute('role','status');body.append(busy);}
  if(state.importInfo){const info=state.importInfo,warning=node('div',undefined,'campaign-warning');warning.setAttribute('role','group');warning.setAttribute('aria-label','保存ファイル取込の確認');warning.append(node('p',info.name+' · 保存日時 '+date(info.savedAt)+' · '+(info.sizeBytes/1024).toFixed(1)+' KiB（UTF-8）'),node('p','このファイルの旅へ切り替えますか？ 現在の有効な保存とバックアップを旅の履歴に保管し、選んだファイルを取り込みます。未保存の変更は引き継がれません。容量不足・破損・互換性の問題があれば中止します。'));const confirm=button('現在の保存を保管して取り込む',()=>onCommand({type:'confirm-import'}));confirm.disabled=!state.canImport||!!state.fileBusy;warning.append(confirm,button('やめる',()=>onCommand({type:'cancel-import'})));body.append(warning);}
  title('西方遠征');
  body.append(node('p',state.expanded?'この旅には西方の集落・二口坑道・救出できる専門職が含まれています。尾根を越え、灯穂の野から琥珀枝の森へ進むと道が開きます。':'今の旅を保ったまま西方の集落・二口坑道・専門職の救出を追加できます。到達には尾根突破と森の解放が必要です。','campaign-help'));
  if(!state.expanded){const expand=button('西方遠征を追加する',()=>{if(!snapshot?.save.canExpand)return;confirmExpansion=true;confirmNew=false;confirmArchive='';render(true);});expand.disabled=!state.canExpand;body.append(expand);}
  if(state.expansionBlocked)body.append(button('追加指定を外して再読み込み',()=>onCommand({type:'cancel-expansion'})));
  if(confirmExpansion){const warning=node('div',undefined,'campaign-warning');warning.setAttribute('role','group');warning.setAttribute('aria-label','西方遠征追加の確認');warning.append(node('p','現在の旅を保存し、旧形式の原本と専用バックアップを残して、西方を含む別の保存形式へ移行します。既存の地形編集や建築と追加内容が衝突する場合、容量不足や検証失敗の場合は中止します。移行後の進行は旧形式へ逆移行できません。協力ルームから退出して操作してください。'));const confirm=button('保存して西方遠征を追加',()=>{if(!confirmExpansion||!snapshot?.save.canExpand)return;confirmExpansion=false;render(true);onCommand({type:'expand-world'});});confirm.disabled=!state.canExpand;warning.append(confirm,button('やめる',()=>{confirmExpansion=false;render(true);}));body.append(warning);}
  title('旅の履歴');body.append(node('p','新規開始・履歴復元の前に保管した旅です。元の世界は、その後の自動保存でも残ります。最大32件で自動削除しません。ブラウザのデータ消去や端末変更には引き継がれません。','campaign-help'));
  if(state.archiveError){const error=node('p',state.archiveError,'campaign-reason');error.setAttribute('role','alert');body.append(error);}
  const history=node('div',undefined,'campaign-archive-list');history.setAttribute('aria-label','保管した旅の一覧');
  if(!state.archives?.length&&!state.archiveError)history.append(node('p','保管した旅はまだありません。','campaign-empty'));
  for(const entry of state.archives??[]){const item=node('article',undefined,'campaign-archive');item.dataset.archiveId=entry.id;
   item.append(node('h4',entry.reason==='new-game'?'新しい旅の前の保存':entry.reason==='import'?'ファイル取込前の保存':'復元する前の保存'),node('p',details(entry),'campaign-archive-details'));
   const restore=button('この旅を復元',()=>{if(!snapshot||!campaignSaveControls(snapshot.save).restore)return;confirmArchive=entry.id;confirmExpansion=false;confirmNew=false;render(true);});restore.disabled=!controls.restore;restore.dataset.archiveAction='select';const exportArchive=button('この履歴を端末へ書き出す',()=>onCommand({type:'export-file',id:entry.id}));exportArchive.disabled=!state.canExport||!!state.fileBusy;item.append(restore,exportArchive);
   if(confirmArchive===entry.id){const warning=node('div',undefined,'campaign-warning');warning.setAttribute('role','group');warning.setAttribute('aria-label','旅の復元の確認');warning.append(node('p','この旅へ切り替えますか？ 現在の有効な保存を履歴へ保管してから、選んだ保存を復元し、画面を読み込み直します。未保存の変更は引き継がれません。'),node('p',details(entry)));
    const confirm=button('現在の旅を保管して復元',()=>{if(confirmArchive!==entry.id||!snapshot||!campaignSaveControls(snapshot.save).restore||!snapshot.save.archives?.some(value=>value.id===entry.id))return;confirmArchive='';render(true);onCommand({type:'restore-archive',id:entry.id});});confirm.disabled=!controls.restore;confirm.dataset.archiveAction='confirm';warning.append(confirm,button('やめる',()=>{confirmArchive='';render(true);}));item.append(warning);
   }
   history.append(item);
  }
  body.append(history);
 }
 function render(force=false){if(!snapshot||!opened)return;const signature=JSON.stringify([snapshot.materials,snapshot.items,snapshot.recipes,snapshot.quests,snapshot.points,snapshot.map,snapshot.skills,snapshot.equipment,snapshot.stats.level,snapshot.stats.xp,snapshot.stats.skillPoints,snapshot.stats.region,snapshot.settings,snapshot.save,snapshot.bindings,snapshot.homestead,snapshot.cooperation,tab,query,confirmExpansion,confirmNew,confirmArchive,confirmSalvage]);if(!force&&signature===lastRender)return;
  // Keep focused sliders/search stable while real-time state updates arrive.
  if(!force&&tab!=='cooperation'&&body.contains(document.activeElement)&&(document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLSelectElement)&&!document.activeElement.hasAttribute('data-craft-quantity'))return;
  lastRender=signature;
  heading.textContent=tabs[tab];summary.textContent=`Lv.${snapshot.stats.level} · XP ${snapshot.stats.xp} · 技能ポイント ${snapshot.stats.skillPoints} · ${snapshot.stats.region}`;
  for(const [name,b] of tabButtons){b.setAttribute('aria-pressed',String(name===tab));b.classList.toggle('selected',name===tab);}
  const focused=document.activeElement instanceof HTMLElement&&body.contains(document.activeElement)?document.activeElement:null;const focusedRow=focused?.closest<HTMLElement>('[data-item]')?.dataset.item;const focusedArchive=focused?.closest<HTMLElement>('[data-archive-id]')?.dataset.archiveId;const focusedText=focused?.textContent;const focusedCraftControl=focused?.dataset.craftSelect??(focused?.dataset.command==='craft'?'submit':null);const focusedField=focused instanceof HTMLInputElement?{id:focused.id,start:focused.selectionStart,end:focused.selectionEnd}:null;
  body.replaceChildren();
  if(tab==='inventory'){body.append(node('p',campaignHudText(snapshot.stats).full,'campaign-help'));title('素材');body.append(rows(snapshot.materials,'素材は木や岩を削り、近づいて集めます。'));title('道具・食料');body.append(rows(snapshot.items,'まだ道具や食料を持っていません。'));}
  if(tab==='crafting'){const label=node('label','レシピを探す','campaign-search'),search=node('input');search.type='search';search.value=query;search.placeholder='名前・必要素材';search.setAttribute('aria-label','レシピを検索');label.append(search);body.append(label);const results=node('div');const refresh=()=>{const q=query.toLocaleLowerCase();results.replaceChildren(rows(snapshot!.recipes.filter(r=>`${r.label} ${r.detail??''} ${r.reason??''} ${r.craft?.costs.map(c=>c.label).join(' ')??''}`.toLocaleLowerCase().includes(q)),'一致するレシピはありません。'));};search.addEventListener('input',()=>{query=search.value;refresh();},{signal});refresh();body.append(results);}
  if(tab==='equipment'){title('装備');body.append(rows(snapshot.equipment,'装備品は制作して入手します。'));title('技能');body.append(rows(snapshot.skills,'技能は探索と戦闘で解放します。'));}
  if(tab==='journal')body.append(rows(snapshot.quests,'現在のクエストはありません。'));
  if(tab==='homestead')body.append(rows(snapshot.homestead??[],'拠点の炉を灯すと生活設備を利用できます。'));
  if(tab==='map'){
   const data=snapshot.map??campaignMapData([],[],false,null),refs=mapPointReferences(snapshot.points);
   body.append(createCampaignMap(data,snapshot.points,p=>onCommand({type:'pin',...p}),signal,mapSelection));
   title('地点の詳細・移動');
   body.append(rows(snapshot.points.map(point=>{const ref=refs.get(point.id);return {...point,label:ref?`${ref.icon}${ref.number} · ${point.label}`:point.label,detail:point.position?[mapCoordinates(point.position),point.detail].filter(Boolean).join(' / '):point.detail};}),'探索すると地点が記録されます。'));
  }
  if(tab==='cooperation'){body.append(node('p','共有の炎や帯電した地形は術者と同行者の両方を傷つけます。直接プレイヤーを狙う属性術はありません。','campaign-help'));
   const state=snapshot.cooperation??{enabled:false,status:'協力プレイはこの環境では利用できません。',role:null,invite:null,guestBuild:false,muted:false,players:0,messages:[],canJoin:false},controls=cooperationControls(state);
   const warning=node('p','同じワールド・所持素材・進行を共有します。保存はホストが管理し、ゲストのソロ保存は上書きしません。招待を開くだけでは接続しません。作成または参加を選ぶと接続します。','campaign-coop-notice');
   const status=node('div',undefined,'campaign-coop-status');status.setAttribute('role','status');status.append(node('strong',!state.enabled?'未接続':state.role==='host'?'ホストとして接続中':state.role==='guest'?'ゲストとして接続中':'未接続'),node('span',controls.participants),node('p',state.status));body.append(warning,status);
   const actions=node('div',undefined,'campaign-coop-actions');
   const coopButton=(label:string,id:CooperationAction,allowed:boolean)=>{const b=button(label,()=>onCommand({type:'coop',id}));b.disabled=!allowed;b.dataset.coop=id;return b;};
   actions.append(coopButton('部屋を作成','create',controls.create),coopButton('招待から参加','join',controls.join),coopButton(state.guestPreview&&!state.role?'自分の旅へ戻る':'退出する','leave',controls.leave));body.append(actions);
   if(!state.enabled)body.append(node('p','現在は接続操作を利用できません。準備状況は上の表示を確認してください。','campaign-reason'));
   if(state.invite){const label=node('label',state.role==='host'?'共有する招待リンク':state.role==='guest'?'参加中の招待リンク':'招待リンク · 参加操作まで未接続','campaign-coop-invite'),input=node('input');input.type='text';input.id='cooperation-invite';input.value=state.invite;input.readOnly=true;input.setAttribute('aria-label','協力プレイの招待リンク');input.addEventListener('focus',()=>input.select(),{signal});label.append(input);body.append(label,coopButton('招待リンクをコピー','copy-invite',controls.invite));}
   if(state.role==='host'){title('ゲストの操作権限');body.append(node('p',state.guestBuild?'ゲストの建築・編集を許可しています。':'ゲストの建築・編集を禁止しています。'),coopButton(state.guestBuild?'ゲストの編集を禁止':'ゲストの編集を許可',state.guestBuild?'deny-build':'allow-build',controls.permissions));}
   else if(state.role==='guest')body.append(node('p',state.guestBuild?'ホストが建築・編集を許可しています。':'建築・編集はホストが許可するまで利用できません。'));
   title('ルームチャット');body.append(coopButton(state.muted?'チャットのミュートを解除':'チャットをミュート',state.muted?'unmute':'mute',state.enabled&&!!state.role));
   const log=node('div',undefined,'campaign-coop-chat');log.setAttribute('role','log');log.setAttribute('aria-label','ルームチャット');log.setAttribute('aria-live','polite');
   if(state.muted)log.append(node('p','チャットはミュート中です。'));
   else if(!state.enabled||!state.role)log.append(node('p','部屋に参加するとチャットを利用できます。'));
   else if(!state.messages.length)log.append(node('p','まだメッセージはありません。'));
   else for(const message of state.messages.slice(-100)){const entry=node('p');entry.append(node('strong',message.from.slice(0,80)+'： '),document.createTextNode(message.text.slice(0,240)));log.append(entry);}
   body.append(log);const chat=node('div',undefined,'campaign-coop-compose'),label=node('label','メッセージ（最大240文字）'),input=node('input');input.type='text';input.id='cooperation-chat';input.maxLength=240;input.value=chatDraft;input.disabled=!controls.chat;input.placeholder=state.muted?'ミュートを解除してください':'ルームの参加者へ';input.setAttribute('aria-label','ルームチャットのメッセージ');
   const send=()=>{const text=cooperationChatText(chatDraft);if(!text||!controls.chat)return;chatDraft='';onCommand({type:'coop',id:'chat',text});render(true);};
   const sendButton=button('送信',send);sendButton.dataset.coop='chat';sendButton.disabled=!controls.chat||!cooperationChatText(chatDraft);input.addEventListener('input',()=>{chatDraft=input.value;sendButton.disabled=!controls.chat||!cooperationChatText(chatDraft);},{signal});input.addEventListener('keydown',event=>{if(event.code==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();send();}},{signal});label.append(input);chat.append(label,sendButton);body.append(chat);
  }
  if(tab==='settings'){const settings=node('div',undefined,'campaign-settings');for(const [key,label,min,max,step] of [['volume','音量',0,1,.05],['sensitivity','視点感度',.5,2,.1]] as const){const wrap=node('label',label),input=node('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(snapshot.settings[key]);input.setAttribute('aria-label',label);const value=node('output',input.value);input.addEventListener('input',()=>{value.textContent=input.value;onCommand({type:'setting',key,value:Number(input.value)});},{signal});wrap.append(input,value);settings.append(wrap);}for(const [key,label,fallback] of [['music','音楽',.55],['effects','効果音',1],['ambience','環境音',.65]] as const){const wrap=node('label',label),input=node('input');input.type='range';input.min='0';input.max='1';input.step='.05';input.value=String(snapshot.settings.audioMix?.[key]??fallback);input.setAttribute('aria-label',label);const value=node('output',input.value);input.addEventListener('input',()=>{value.textContent=input.value;onCommand({type:'setting',key,value:Number(input.value)});},{signal});wrap.append(input,value);settings.append(wrap);}const quality=node('label','描画品質'),select=node('select');select.setAttribute('aria-label','描画品質');for(const [value,label] of [['balanced','標準 · 軽量'],['performance','省電力 · 低解像度 / 影なし'],['high','高品質 · HDR']]){const option=node('option',label);option.value=value;select.append(option);}select.value=snapshot.settings.graphics;select.addEventListener('change',()=>onCommand({type:'setting',key:'graphics',value:select.value}),{signal});quality.append(select);settings.append(quality);const cameraLabel=node('label','視点'),cameraSelect=node('select');cameraSelect.setAttribute('aria-label','視点');for(const [value,label] of [['first','一人称'],['third','三人称・探索']]){const option=node('option',label);option.value=value;option.selected=value===(snapshot.settings.cameraMode??'first');cameraSelect.append(option);}cameraSelect.addEventListener('change',()=>onCommand({type:'setting',key:'cameraMode',value:cameraSelect.value}),{signal});cameraLabel.append(cameraSelect);settings.append(cameraLabel);const zoomLabel=node('label','三人称の距離'),zoom=node('input');zoom.type='range';zoom.min='1.4';zoom.max='4';zoom.step='.1';zoom.value=String(snapshot.settings.cameraDistance??3);zoom.setAttribute('aria-label','三人称の距離');zoom.addEventListener('input',()=>onCommand({type:'setting',key:'cameraDistance',value:Number(zoom.value)}),{signal});zoomLabel.append(zoom);settings.append(zoomLabel);const readLabel=node('label','説明文の大きさ'),readSize=node('select');readSize.setAttribute('aria-label','説明文の大きさ');for(const [value,label] of [[1,'標準'],[1.15,'115%'],[1.25,'125%']] as const){const option=node('option',label);option.value=String(value);option.selected=value===(snapshot.settings.textScale??1);readSize.append(option);}readSize.addEventListener('change',()=>onCommand({type:'setting',key:'textScale',value:Number(readSize.value)}),{signal});readLabel.append(readSize);settings.append(readLabel);const motionLabel=node('label','画面の揺れ・被弾の明滅'),motion=node('select');motion.setAttribute('aria-label','画面の揺れ・被弾の明滅');for(const [value,label] of [['0','通常'],['1','軽減']]){const option=node('option',label);option.value=value;option.selected=(value==='1')===!!snapshot.settings.reducedMotion;motion.append(option);}motion.addEventListener('change',()=>onCommand({type:'setting',key:'reducedMotion',value:Number(motion.value)}),{signal});motionLabel.append(motion);settings.append(motionLabel);body.append(settings,node('p','三人称も照準と攻撃の正本は同じです。壁際でカメラが近づきます。釣り中は一人称に切り替わります。','campaign-help'));if(snapshot.bindings?.length){title('キー割り当て');const bindings=node('div',undefined,'campaign-binding-grid');for(const binding of snapshot.bindings){const label=node('label',binding.label),input=node('input');input.type='text';input.readOnly=true;input.value=binding.key;input.setAttribute('aria-label',binding.label+'のキー割り当て');input.setAttribute('aria-description','選んでからキーを押してください。Escで変更を中止します。');input.addEventListener('keydown',event=>{if(event.code==='Tab')return;event.preventDefault();event.stopPropagation();if(event.code==='Escape'){input.blur();return;}if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||!event.code)return;const conflict=snapshot?.bindings?.find(other=>other.action!==binding.action&&other.key===event.code);if(conflict){input.setAttribute('aria-invalid','true');feedback.textContent=`${event.code} は「${conflict.label}」に使われています。`;return;}input.removeAttribute('aria-invalid');input.value=event.code;feedback.textContent=`${binding.label}: ${event.code}`;onCommand({type:'binding',action:binding.action,key:event.code});},{signal});label.append(input);bindings.append(label);}body.append(bindings,button('キー割り当てを初期化',()=>onCommand({type:'reset-bindings'})));}renderSaveControls();body.append(node('p','操作：I 所持品 · J クエスト · M 地図 · Tab 旅の記録 · Esc 閉じる。保存はこのブラウザ内のみ。','campaign-help'));}
  if(focusedField?.id){const replacement=document.getElementById(focusedField.id);if(replacement instanceof HTMLInputElement&&!replacement.disabled){replacement.focus({preventScroll:true});if(focusedField.start!==null&&focusedField.end!==null)replacement.setSelectionRange(focusedField.start,focusedField.end);}}
  else if(focused?.id==='campaign-map-surface')document.getElementById('campaign-map-surface')?.focus({preventScroll:true});
  else if(focusedArchive){const item=[...body.querySelectorAll<HTMLElement>('[data-archive-id]')].find(el=>el.dataset.archiveId===focusedArchive);const buttons=[...item?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]];(buttons.find(el=>el.textContent===focusedText)??buttons[0])?.focus({preventScroll:true});}
  else if(focused){const replacement=focusedRow?[...body.querySelectorAll<HTMLElement>('[data-item]')].find(el=>el.dataset.item===focusedRow)?.querySelector<HTMLButtonElement>(focusedCraftControl==='submit'?'[data-command=craft]:not(:disabled)':focusedCraftControl?`[data-craft-select=${focusedCraftControl}]:not(:disabled)`:'button:not(:disabled)'):[...body.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].find(el=>el.textContent===focusedText);replacement?.focus({preventScroll:true});}
 }
 root.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();closePanel();}if(e.code==='Tab'){const focusable=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>!el.hidden),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}},{signal});
 return {open,close:closePanel,get isOpen(){return opened;},get currentTab(){return tab;},update(value:CampaignUISnapshot){snapshot=value;if(!value.save.canExpand)confirmExpansion=false;if(value.save.disabledForGuest||value.save.archiveError){confirmNew=false;confirmArchive='';}const model=campaignHudText(value.stats);if(hudHeadline.textContent!==model.headline)hudHeadline.textContent=model.headline;if(hudDetail.textContent!==model.detail)hudDetail.textContent=model.detail;hud.setAttribute('aria-label',model.full);hud.classList.toggle('danger',model.danger);render();},notify(message:string){feedback.textContent=message;},dispose(){abort.abort();root.remove();openButton.remove();hud.remove();}};
}
