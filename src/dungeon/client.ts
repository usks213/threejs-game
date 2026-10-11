import {validSupplyStock} from './economy';
import {validInventory} from './inventory';
import {validQuestJournal} from './quests';
import {BASTION_SKILLS,validBastionTraining,validBastionSkillState} from './training';
import {RAVAGER_SKILLS,validRavagerTraining,validRavagerSkillState} from './ravager-training';
import {DUNGEON_PROTOCOL, type Action, type ClientPacket, type Input, type Snapshot} from './types';

export const ROOM_PATTERN=/^[a-f0-9]{64}$/;
const REFUSAL_MESSAGES:Record<string,string>={
 '送信が多すぎます':'操作の受信頻度が上限に達したため接続を停止しました。少し待って再接続してください。',
 '操作が多すぎます':'短時間の操作が多すぎるため接続を停止しました。少し待って再接続してください。',
 '不正な操作です':'操作の通信形式を確認できませんでした。ページを更新して入り直してください。',
 '参加確認が時間切れです':'参加確認が時間切れになりました。再接続してください。',
};
const STORAGE_PREFIX='ashen-dungeon:v1:identity:';
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface RandomSource {getRandomValues<T extends ArrayBufferView>(array:T):T}
export interface DungeonIdentity {key:string;name:string;persistent:boolean}
export const boundedName=(name:string)=>name.replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'探索者';
export function randomToken(source:RandomSource):string {return Array.from(source.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
export function roomFromText(text:string):string|null {
 const trimmed=text.trim().toLowerCase();if(ROOM_PATTERN.test(trimmed))return trimmed;
 try {const hash=new URL(text, 'https://example.invalid').hash;const room=new URLSearchParams(hash.slice(1)).get('dungeon');return room&&ROOM_PATTERN.test(room)?room:null;}catch{return null;}
}
/** A room ID grants admission, never another person's avatar. Private identity stays in browser storage. */
export function roomIdentity(room:string,name:string,storage:StorageLike|null,source:RandomSource):DungeonIdentity {
 if(!ROOM_PATTERN.test(room))throw new Error('招待の部屋番号が正しくありません');
 let saved:string|null=null;try {saved=storage?.getItem(STORAGE_PREFIX+room)??null;}catch {/* Private browsing can deny storage. */}
 if(saved!==null&&!ROOM_PATTERN.test(saved))throw new Error('この部屋の保存済み参加情報が壊れています。倉庫へのアクセスを守るため、新しい参加情報には置き換えていません。保存データを削除せず、正常だったブラウザやバックアップからの復元を確認してください。');
 const key=saved??randomToken(source);let persistent=false;try {storage?.setItem(STORAGE_PREFIX+room,key);persistent=storage?.getItem(STORAGE_PREFIX+room)===key;}catch {/* The caller explains that refresh cannot restore this session. */}
 return {key,name:boundedName(name),persistent};
}
export function inviteURL(base:string,room:string):string {if(!ROOM_PATTERN.test(room))throw new Error('部屋番号が正しくありません');const url=new URL(base);url.search='?mode=dungeon';url.hash='dungeon='+room;return url.href;}
export function socketURL(base:string,room:string):string {if(!ROOM_PATTERN.test(room))throw new Error('部屋番号が正しくありません');const url=new URL(base);if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('HTTP または HTTPS で開いてください');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/dungeon-room/'+room;url.search='';url.hash='';return url.href;}
export interface DungeonSocket {
 readyState:number;onopen:((event:Event)=>void)|null;onmessage:((event:MessageEvent)=>void)|null;onclose:((event:CloseEvent)=>void)|null;onerror:((event:Event)=>void)|null;
 send(data:string):void;close():void;
}
export interface ClientCallbacks {snapshot(snapshot:Snapshot):void;state(state:string):void;notice(message:string):void}
export interface ClientOptions {base:string;room:string;identity:DungeonIdentity;callbacks:ClientCallbacks;socket?:(url:string)=>DungeonSocket}
/** Transport only. There are no local HP, hit, item, or movement-state writes. */
export class DungeonClient {
 private socket:DungeonSocket|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 private stopped=false;private ready=false;private generation=0;private retries=0;private actionSequence=0;private inputSequence=0;
 private sentActionSequence=0;
 private readonly options:ClientOptions;
 constructor(options:ClientOptions){this.options=options;}
 connect(){
  if(this.stopped)return;this.clearTimer();this.detachSocket();this.ready=false;const generation=++this.generation;
  this.options.callbacks.state(this.retries?'再接続中':'接続中');
  try {
   const ws=(this.options.socket??(url=>new WebSocket(url)))(socketURL(this.options.base,this.options.room));this.socket=ws;
   ws.onopen=()=>{if(generation!==this.generation||this.stopped)return;this.send({type:'hello',protocol:DUNGEON_PROTOCOL,key:this.options.identity.key,name:this.options.identity.name});};
   ws.onmessage=event=>{if(generation!==this.generation||this.stopped)return;this.receive(event.data);};
   ws.onerror=()=>{/* close provides the retry signal; do not send private keys to logs. */};
   ws.onclose=event=>{if(generation!==this.generation||this.stopped)return;this.ready=false;this.socket=null;if(event.code===1002){this.options.callbacks.state('更新が必要です');this.options.callbacks.notice('通信形式が一致しません。ページを更新してください。');return;}if(event.code===1008){this.options.callbacks.state('接続を拒否されました');this.options.callbacks.notice(Object.hasOwn(REFUSAL_MESSAGES,event.reason)?REFUSAL_MESSAGES[event.reason]:'この部屋には入れません。部屋の招待とブラウザの保存状態を確認してください。');return;}if(event.code===4001){this.options.callbacks.state('別のタブに接続しました');this.options.callbacks.notice('同じ探索者の別タブが接続しました。このタブでは操作できません。');return;}this.retry();};
  }catch {this.retry();}
 }
 private receive(data:unknown){
  if(typeof data!=='string'||data.length>1_000_000)return;
  try {const packet:unknown=JSON.parse(data);if(!packet||typeof packet!=='object')return;
   if('type'in packet&&packet.type==='notice'&&'message'in packet&&typeof packet.message==='string'){this.options.callbacks.notice(packet.message.slice(0,240));return;}
   if(!('type'in packet)||packet.type!=='snapshot'||!('snapshot'in packet))return;
   const candidate=packet.snapshot;
   if(!isSnapshot(candidate)){this.options.callbacks.notice('通信形式が一致しません。ページを更新してください。');return;}
   this.actionSequence=Math.max(this.actionSequence,candidate.lastAction);this.inputSequence=Math.max(this.inputSequence,candidate.lastInput);
   if(!this.ready){this.ready=true;this.retries=0;this.options.callbacks.state('接続済み');}
   this.options.callbacks.snapshot(candidate);
  }catch {/* Invalid packets never reach rendering or become game actions. */}
 }
 private send(packet:ClientPacket){if(!this.socket||this.socket.readyState!==1)return false;try {this.socket.send(JSON.stringify(packet));return true;}catch{return false;}}
 input(input:Input){if(!this.ready||this.stopped)return false;return this.send({type:'input',sequence:++this.inputSequence,input});}
 action(action:Action){if(!this.ready||this.stopped)return false;const sequence=++this.actionSequence,sent=this.send({type:'action',sequence,action});if(sent)this.sentActionSequence=sequence;return sent;}
 reconnect(){if(this.stopped)return;this.retries=0;this.connect();}
 private retry(){if(this.stopped)return;this.retries++;const delay=Math.min(15000,750*2**Math.min(this.retries-1,5));this.options.callbacks.state('切断中・再接続します');this.clearTimer();this.timer=setTimeout(()=>this.connect(),delay);}
 private clearTimer(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
 private detachSocket(){if(!this.socket)return;const old=this.socket;this.socket=null;old.onopen=old.onmessage=old.onclose=old.onerror=null;try{old.close();}catch{/* Already closed. */}}
 dispose(){if(this.stopped)return;this.stopped=true;this.ready=false;this.generation++;this.clearTimer();this.detachSocket();}
 get lastSentActionSequence(){return this.sentActionSequence;}
 get connected(){return this.ready&&!this.stopped;}
}
// A return batch is one bounded bag, never an arbitrary item queue.
function validPendingReturn(value:unknown):boolean {
 try {return validInventory(value)&&value.every(item=>item.found);}catch {return false;}
}
function validActorTraining(value:unknown,elapsed:number):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const actor=value as Record<string,unknown>;
 if(Object.hasOwn(actor,'training')&&!validBastionTraining(actor.training))return false;
 if(Object.hasOwn(actor,'ravagerTraining')&&!validRavagerTraining(actor.ravagerTraining))return false;
 if(Object.hasOwn(actor,'skillState')){
  if(!validBastionSkillState(actor.skillState)||actor.classId!=='bastion'||!validBastionTraining(actor.training)||actor.training.skill!==actor.skillState.skill||actor.skillState.readyAt-BASTION_SKILLS[actor.skillState.skill].cooldown>elapsed+1e-7)return false;
 }
 if(Object.hasOwn(actor,'ravagerSkillState')){
  if(!validRavagerSkillState(actor.ravagerSkillState)||actor.classId!=='ravager'||!validRavagerTraining(actor.ravagerTraining)||actor.ravagerTraining.skill!==actor.ravagerSkillState.skill||actor.ravagerSkillState.readyAt-RAVAGER_SKILLS[actor.ravagerSkillState.skill].cooldown>elapsed+1e-7)return false;
 }
 return true;
}
export function isSnapshot(value:unknown):value is Snapshot {
 if(!value||typeof value!=='object')return false;
 const v=value as Partial<Snapshot>;return (!Object.hasOwn(v,'quests')||validQuestJournal(v.quests))&&(!Object.hasOwn(v,'pendingReturn')||validPendingReturn(v.pendingReturn))&&v.protocol===DUNGEON_PROTOCOL&&typeof v.you==='string'&&typeof v.seed==='number'&&Number.isFinite(v.seed)&&Number.isSafeInteger(v.raid)&&v.raid!>=0&&Number.isSafeInteger(v.tick)&&v.tick!>=0&&typeof v.elapsed==='number'&&Number.isFinite(v.elapsed)&&v.elapsed>=0&&v.elapsed<=1e6&&['lobby','raid','finished'].includes(v.phase??'')&&Number.isSafeInteger(v.lastAction)&&v.lastAction!>=0&&Number.isSafeInteger(v.lastInput)&&v.lastInput!>=0&&Array.isArray(v.actors)&&v.actors.every(actor=>validActorTraining(actor,v.elapsed!))&&Array.isArray(v.enemies)&&v.enemies.every(actor=>validActorTraining(actor,v.elapsed!))&&Array.isArray(v.containers)&&Array.isArray(v.doors)&&Array.isArray(v.exits)&&Array.isArray(v.shots)&&Array.isArray(v.stash)&&Array.isArray(v.events)&&typeof v.result==='string'&&Number.isSafeInteger(v.gold)&&v.gold!>=0&&v.gold!<=1e9&&validSupplyStock(v.shop)&&Array.isArray(v.trades)&&v.trades.length<=6&&v.trades.every(entry=>typeof entry==='string'&&entry.length<=96);
}
