import {DungeonClient,inviteURL,randomToken,roomFromText,roomIdentity} from './client';
import {createDungeonInput,type DungeonControl} from './input';
import {startDungeonInputPump} from './input-pump';
import {createDungeonInputSender} from './input-sender';
import {createDungeonUI} from './ui';
import {createDungeonView} from './view';
import {createDungeonAudio} from './audio';
import {dungeonTarget} from './interaction';
export {dungeonTarget} from './interaction';
import type {Action,Input,Snapshot} from './types';
import type {DungeonWorldCoverage} from './world-loader';
import './style.css';

declare global {interface Window {__dungeonProbe?:()=>Snapshot|null;__dungeonRenderProbe?:()=>DungeonWorldCoverage|null}}

/** Explicit separate mode: no campaign state, save keys or prototype lifecycle are touched. */
export function startDungeon(){
 const root=document.querySelector<HTMLElement>('#app');if(!root)throw new Error('ゲーム領域が見つかりません');
 const probeEnabled=new URLSearchParams(location.search).get('test')==='1';
 const audio=createDungeonAudio();
 const previousTitle=document.title;document.title='灰の回廊 · ASHEN VAULT';const lifecycle=new AbortController();
 let client:DungeonClient|null=null,snapshot:Snapshot|null=null,view:ReturnType<typeof createDungeonView>|null=null,input:ReturnType<typeof createDungeonInput>|null=null;
 if(probeEnabled){window.__dungeonProbe=()=>snapshot?structuredClone(snapshot):null;window.__dungeonRenderProbe=()=>view?structuredClone(view.worldCoverage):null;}
 let inventory=false,disposed=false,raf=0,last=performance.now(),room='',invite='',initializedLook=false,raid=-1,actorStatus='',lostReported=false,awaitingFreshSnapshot=false;
 const ui=createDungeonUI(root,{
  create:name=>{try{join(randomToken(crypto),name);}catch{ui.notice('部屋を作れません。HTTPS で開き直してください。');}},
  join:(text,name)=>{const id=roomFromText(text);if(!id){ui.notice('招待 URL または 64 桁の部屋番号を入力してください。');return;}join(id,name);},
  action:action=>sendAction(action),actionSequence:()=>client?.lastSentActionSequence,reconnect:()=>{awaitingFreshSnapshot=true;input?.reset();inputSender.reset();if(!view?.worldReady)view?.resetWorld();client?.reconnect();},
  inventory:open=>{inventory=open;syncActive();},leave:()=>{inputSender.reset();client?.dispose();client=null;snapshot=null;view?.resetWorld();initializedLook=false;room='';invite='';ui.setRoom('');ui.setInvite('');ui.setConnection('未接続');ui.update(null);ui.setInventory(false);inventory=false;syncWorldState();},
  copyInvite:()=>{if(!invite)return;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(invite).then(()=>ui.notice('招待 URL をコピーしました。別の人はこの URL から参加できます。')).catch(()=>ui.notice('コピーできません。表示された招待 URL を選択してコピーしてください。'));else ui.notice('表示された招待 URL を選択してコピーしてください。');},
 });
 // Sound is optional, gesture-unlocked, and never determines combat authority.
 const soundButton=document.createElement('button');soundButton.type='button';soundButton.className='dungeon-button dungeon-button-small';soundButton.dataset.testid='dungeon-audio-toggle';
 let muted=false;
 const soundLabel=()=>{soundButton.textContent=muted?'音 OFF':'音 ON';soundButton.setAttribute('aria-label',muted?'効果音をオン':'効果音をオフ');soundButton.setAttribute('aria-pressed',String(!muted));};soundLabel();
 root.querySelector('.dungeon-header-actions')?.prepend(soundButton);
 soundButton.addEventListener('click',()=>{muted=!muted;audio.setMuted(muted);if(!muted)audio.unlock();soundLabel();},{signal:lifecycle.signal});
 const unlockAudio=()=>audio.unlock();
 window.addEventListener('pointerdown',unlockAudio,{signal:lifecycle.signal});window.addEventListener('keydown',unlockAudio,{signal:lifecycle.signal});
 function syncActive(){const own=snapshot?.actors.find(a=>a.id===snapshot!.you);input?.setActive(!!view&&!view.lost&&view.worldReady&&!awaitingFreshSnapshot&&!document.hidden&&!!client?.connected&&!inventory&&snapshot?.phase==='raid'&&own?.status==='alive');}
 function syncWorldState(){const own=snapshot?.actors.find(a=>a.id===snapshot!.you);ui.setWorldLoading(!!view&&!view.lost&&!view.worldReady&&snapshot?.phase==='raid'&&own?.status==='alive',view?.worldStage==='failed');syncActive();}
 function sendAction(action:Action){
  if(action.kind==='start'&&(!view||view.lost)){ui.notice('このブラウザでは 3D 描画を開始できないため、遠征を開始できません。WebGL 対応のブラウザで開き直してください。');return false;}
  if(view?.lost&&['attack','shoot','cast','heal','skill','interact','loot'].includes(action.kind)){ui.notice('3D 描画が停止しています。ページを更新してください。再接続だけでは復旧できません。');return false;}
  if((!view?.worldReady||awaitingFreshSnapshot)&&['attack','shoot','cast','heal','skill','interact','loot'].includes(action.kind)){ui.notice('回廊の描画・接続を確認中です。遠征の時間は進んでいます。');return false;}
  const sent=client?.action(action)??false;
  if(!sent)ui.notice('接続が完了してから操作してください。');
  return sent;
 }
 function control(kind:DungeonControl){
  if(kind==='inventory'){if(!snapshot)return;inventory=!inventory;ui.setInventory(inventory);syncActive();return;}
  if(!snapshot)return;if(kind==='skill'){ui.activateSkill();return;}if(kind==='interact'){const target=dungeonTarget(snapshot,input?.sample()??{yaw:0,pitch:0});if(target){const box=snapshot.containers.find(value=>value.id===target);if(box?.opened)ui.openLoot(target);else sendAction({kind:'interact',target});}else ui.notice('対象に近づき、そちらを向いてください。');}
  else if(kind==='heavy')sendAction({kind:'attack',heavy:true});else sendAction({kind});
 }
 const inputSender=createDungeonInputSender({send:sample=>!disposed&&(client?.input(sample)??false)});
 function sendInput(sample:Input){inputSender.submit(sample);}
 input=createDungeonInput(ui,{action:control,changed:release=>{if(input&&client?.connected)inputSender.submit(input.sample(),release);}});
 try{view=createDungeonView(ui.canvas,{worldChanged:syncWorldState});view.resize();ui.canvas.dataset.ready='true';}catch{ui.canvas.dataset.ready='false';ui.setGraphicsError('3D 描画を開始できません。WebGL 対応のブラウザで開いてください。部屋と倉庫の確認は続けられます。');}
 function join(nextRoom:string,name:string){
  awaitingFreshSnapshot=true;inputSender.reset();client?.dispose();client=null;initializedLook=false;snapshot=null;view?.resetWorld();actorStatus='';inventory=false;ui.setInventory(false);input?.reset();
  let storage:Storage|null=null;try{storage=window.localStorage;}catch{/* Storage denial is surfaced below. */}
  let identity:ReturnType<typeof roomIdentity>;try{identity=roomIdentity(nextRoom,name,storage,crypto);}catch(error){ui.notice(error instanceof Error&&error.message?error.message:'安全な参加情報を作れません。HTTPS で開き直してください。');return;}
  room=nextRoom;invite=inviteURL(location.href,room);ui.setInvite(invite);ui.setRoom(room);const pageURL=new URL(invite);if(probeEnabled)pageURL.searchParams.set('test','1');history.replaceState(null,'',pageURL.href);
  if(!identity.persistent)ui.notice('ブラウザ保存が使えません。このページを閉じると探索者と倉庫へ戻れなくなります。');
  client=new DungeonClient({base:location.href,room,identity,callbacks:{
   state:state=>{if(!client?.connected){awaitingFreshSnapshot=true;inputSender.reset();}ui.setConnection(state);syncActive();},notice:message=>ui.notice(message),
   snapshot:next=>{if(disposed)return;audio.update(snapshot,next);snapshot=next;const own=next.actors.find(a=>a.id===next.you);if(own&&(!initializedLook||raid!==next.raid)){input?.setLook(own.yaw,own.pitch);initializedLook=true;raid=next.raid;}
    if(actorStatus==='alive'&&own?.status!=='alive'&&inventory){inventory=false;ui.setInventory(false);}actorStatus=own?.status??'';ui.update(next);view?.setSnapshot(next);awaitingFreshSnapshot=false;syncWorldState();},
  }});client.connect();syncActive();
 }
 function resize(){input?.reset();view?.resize();}window.addEventListener('resize',resize,{signal:lifecycle.signal});
 document.addEventListener('visibilitychange',syncActive,{signal:lifecycle.signal});
 function frame(now:number){if(disposed)return;const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  const sample=input!.sample();ui.renderFeedback(dt,sample);
  if(view&&!document.hidden){view.render(dt,sample);if(view.lost&&!lostReported){lostReported=true;ui.canvas.dataset.ready='false';ui.setGraphicsError('3D 描画が停止しています。ページを更新してください。再接続だけでは復旧できません。遠征の時間は進んでいます。');syncWorldState();}}
  raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);
 const stopInputPump=startDungeonInputPump({sample:()=>input!.sample(),send:sendInput,enabled:()=>!disposed&&!document.hidden&&!!client?.connected&&snapshot?.phase==='raid'});
 const dispose=()=>{if(disposed)return;disposed=true;stopInputPump();audio.dispose();cancelAnimationFrame(raf);lifecycle.abort();input?.dispose();inputSender.dispose();client?.dispose();view?.dispose();ui.dispose();if(probeEnabled){delete window.__dungeonProbe;delete window.__dungeonRenderProbe;}document.title=previousTitle;};
 window.addEventListener('pagehide',dispose,{signal:lifecycle.signal,once:true});
 return dispose;
}
