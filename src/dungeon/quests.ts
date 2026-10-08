import type {Item,Profile,QuestId,QuestProgress,RaidState} from './types';
export type {QuestId,QuestProgress} from './types';

export interface QuestDefinition {name:string;objective:string;goal:number;reward:number;prerequisite:QuestId|null}
/** Two finite supplier tutorials. No repeatable rewards or client-written progress. */
export const QUESTS:Readonly<Record<QuestId,QuestDefinition>>={
 'first-return':{name:'初めての生還',objective:'受注後の遠征で生きて帰還する',goal:1,reward:20,prerequisite:null},
 'ore-delivery':{name:'補給所の鉱石',objective:'倉庫にある帰還済みの鉱石を2個納品する',goal:2,reward:30,prerequisite:'first-return'},
};
export const QUEST_IDS:readonly QuestId[]=['first-return','ore-delivery'];
export const isQuestId=(value:unknown):value is QuestId=>typeof value==='string'&&Object.hasOwn(QUESTS,value);
export function questPrerequisiteMet(journal:readonly QuestProgress[]|undefined,id:QuestId):boolean{
 const required=QUESTS[id].prerequisite;
 return required===null||!!journal?.some(entry=>entry.id===required&&entry.claimed);
}
/** Missing journals are handled by callers for legacy saves; malformed new data fails closed. */
export function validQuestJournal(value:unknown):value is QuestProgress[]{
 if(!Array.isArray(value)||value.length>QUEST_IDS.length)return false;
 const seen=new Set<QuestId>();
 for(const raw of value){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const entry=raw as Record<string,unknown>;
  if(Object.keys(entry).length!==3||!Object.hasOwn(entry,'id')||!Object.hasOwn(entry,'progress')||!Object.hasOwn(entry,'claimed')||!isQuestId(entry.id))return false;
  const {id,progress,claimed}=entry;
  if(seen.has(id)||typeof progress!=='number'||!Number.isInteger(progress)||progress<0||progress>QUESTS[id].goal||typeof claimed!=='boolean'||claimed&&progress!==QUESTS[id].goal)return false;
  seen.add(id);
 }
 const journal=value as QuestProgress[];
 return journal.every(entry=>questPrerequisiteMet(journal,entry.id));
}
/** UI preview only; server additionally checks owner, stash membership and lobby state. */
export function questDeliveryCount(entry:QuestProgress|undefined,item:Item):number{
 return entry?.id==='ore-delivery'&&!entry.claimed&&item.kind==='ore'&&item.found?Math.max(0,Math.min(QUESTS['ore-delivery'].goal-entry.progress,item.count)):0;
}
const allowed=(state:RaidState,profile:Profile)=>state.phase!=='raid'&&profile.actor.status==='lobby'&&!profile.actor.ready;
const lobbyIssue='補給所へ戻り、準備を解除してから依頼を操作してください';
export function acceptQuest(state:RaidState,profile:Profile,id:QuestId):string{
 if(!allowed(state,profile))return lobbyIssue;
 if(profile.quests?.some(entry=>entry.id===id))return 'この依頼は受注済みです';
 if(!questPrerequisiteMet(profile.quests,id))return '先の依頼の報酬を受け取ってから受注してください';
 profile.quests=[...(profile.quests??[]),{id,progress:0,claimed:false}];
 return `「${QUESTS[id].name}」を受注しました`;
}
export function deliverQuest(state:RaidState,profile:Profile,id:QuestId,itemId:string):string{
 if(!allowed(state,profile))return lobbyIssue;
 const entry=profile.quests?.find(value=>value.id===id);
 if(!entry)return '先に依頼を受注してください';
 if(entry.claimed||entry.progress>=QUESTS[id].goal)return 'この依頼への納品は完了しています';
 if(id!=='ore-delivery')return 'この依頼は帰還で進みます。納品は不要です';
 const index=profile.stash.findIndex(item=>item.id===itemId),item=profile.stash[index];
 const count=item?questDeliveryCount(entry,item):0;
 if(!count)return '自分の倉庫にある帰還済みの鉱石を選んでください';
 // Checks complete: consume exactly the remaining objective from this identified stack.
 if(item.count===count)profile.stash.splice(index,1);else item.count-=count;
 entry.progress+=count;
 return `鉱石を${count}個納品しました（${entry.progress}/${QUESTS[id].goal}）。報酬は別途受け取ってください`;
}
export function claimQuest(state:RaidState,profile:Profile,id:QuestId):string{
 if(!allowed(state,profile))return lobbyIssue;
 const entry=profile.quests?.find(value=>value.id===id),definition=QUESTS[id];
 if(!entry)return '先に依頼を受注してください';
 if(entry.claimed)return 'この依頼の報酬は受取済みです';
 if(entry.progress!==definition.goal)return '依頼の目標がまだ達成されていません';
 if(profile.gold+definition.reward>1e9)return '金貨の保管上限を超えるため報酬を受け取れません';
 profile.gold+=definition.reward;entry.claimed=true;
 profile.receipt.push(`遠征${state.raid}・取引${profile.lastAction} 依頼「${definition.name}」報酬 +${definition.reward}金貨（残高${profile.gold}）`);
 if(profile.receipt.length>128)profile.receipt.splice(0,profile.receipt.length-128);
 return `「${definition.name}」の報酬を受け取りました（+${definition.reward}金貨）`;
}
/** Called only by the authoritative successful extraction path, never on return/reconnect. */
export function recordQuestExtraction(profile:Profile):void{
 const entry=profile.quests?.find(value=>value.id==='first-return');
 if(entry&&!entry.claimed)entry.progress=QUESTS['first-return'].goal;
}
