import {DungeonClient,inviteURL,randomToken,roomFromText,roomIdentity} from './client';
import {createDungeonInput,type DungeonControl} from './input';
import {createDungeonUI} from './ui';
import {createDungeonView} from './view';
import {distance,wallRay} from './world';
import type {Action,Input,Snapshot} from './types';
import './style.css';

declare global {interface Window {__dungeonProbe?:()=>Snapshot|null}}

/** Highest-priority reachable focus, derived only from public snapshot targets. */
export function dungeonTarget(snapshot:Snapshot,input:Pick<Input,'yaw'|'pitch'>):string|null {
 const own=snapshot.actors.find(a=>a.id===snapshot.you);if(!own||own.status!=='alive')return null;
 const eye={...own.position,y:own.position.y+1.3};
 const targets=[...snapshot.doors,...snapshot.containers,...snapshot.exits].filter(target=>{
  if(distance(own.position,target.position)>2.6)return false;
  const doors=snapshot.doors.filter(d=>d.id!==target.id);return !wallRay(eye,{...target.position,y:target.position.y+1.3},snapshot.seed,doors);
 });
 let best:string|null=null,score=-Infinity;for(const target of targets){const dx=target.position.x-own.position.x,dz=target.position.z-own.position.z,d=Math.max(.001,Math.hypot(dx,dz)),dot=(-Math.sin(input.yaw)*dx-Math.cos(input.yaw)*dz)/d,rank=dot*3-d*.25;if(dot<-.15)continue;if(rank>score){best=target.id;score=rank;}}return best;
}

/** Explicit separate mode: no campaign state, save keys or prototype lifecycle are touched. */
export function startDungeon(){
 const root=document.querySelector<HTMLElement>('#app');if(!root)throw new Error('ゲーム領域が見つかりません');
 const probeEnabled=new URLSearchParams(location.search).get('test')==='1';
 const previousTitle=document.title;document.title='灰の回廊 · ASHEN VAULT';const lifecycle=new AbortController();
 let client:DungeonClient|null=null,snapshot:Snapshot|null=null,view:ReturnType<typeof createDungeonView>|null=null,input:ReturnType<typeof createDungeonInput>|null=null;
 if(probeEnabled)window.__dungeonProbe=()=>snapshot?structuredClone(snapshot):null;
 let inventory=false,disposed=false,raf=0,last=performance.now(),networkAccumulator=0,lastInputSent=-Infinity,room='',invite='',initializedLook=false,raid=-1,actorStatus='',lostReported=false;
 const ui=createDungeonUI(root,{
  create:name=>{try{join(randomToken(crypto),name);}catch{ui.notice('部屋を作れません。HTTPS で開き直してください。');}},
  join:(text,name)=>{const id=roomFromText(text);if(!id){ui.notice('招待 URL または 64 桁の部屋番号を入力してください。');return;}join(id,name);},
  action:action=>sendAction(action),reconnect:()=>{input?.reset();client?.reconnect();},
  inventory:open=>{inventory=open;syncActive();},leave:()=>{client?.dispose();client=null;snapshot=null;initializedLook=false;room='';invite='';ui.setRoom('');ui.setInvite('');ui.setConnection('未接続');ui.update(null);ui.setInventory(false);inventory=false;syncActive();},
  copyInvite:()=>{if(!invite)return;if(navigator.clipboard?.writeText)navigator.clipboard.writeText(invite).then(()=>ui.notice('招待 URL をコピーしました。別の人はこの URL から参加できます。')).catch(()=>ui.notice('コピーできません。表示された招待 URL を選択してコピーしてください。'));else ui.notice('表示された招待 URL を選択してコピーしてください。');},
 });
 function syncActive(){const own=snapshot?.actors.find(a=>a.id===snapshot!.you);input?.setActive(!!view&&!view.lost&&!!client?.connected&&!inventory&&snapshot?.phase==='raid'&&own?.status==='alive');}
 function sendAction(action:Action){
  if(action.kind==='start'&&!view){ui.notice('このブラウザでは 3D 描画を開始できないため、遠征を開始できません。WebGL 対応のブラウザで開いてください。');return;}
  if(!client?.action(action))ui.notice('接続が完了してから操作してください。');
 }
 function control(kind:DungeonControl){
  if(kind==='inventory'){if(!snapshot)return;inventory=!inventory;ui.setInventory(inventory);syncActive();return;}
  if(!snapshot)return;if(kind==='interact'){const target=dungeonTarget(snapshot,input?.sample()??{yaw:0,pitch:0});if(target)sendAction({kind:'interact',target});else ui.notice('対象に近づき、そちらを向いてください。');}
  else if(kind==='heavy')sendAction({kind:'attack',heavy:true});else sendAction({kind});
 }
 function sendInput(sample:Input){const now=performance.now();if(now-lastInputSent<1000/25)return;if(client?.input(sample))lastInputSent=now;}
 input=createDungeonInput(ui,{action:control,changed:()=>{if(input&&client?.connected)sendInput(input.sample());}});
 try{view=createDungeonView(ui.canvas);view.resize();ui.canvas.dataset.ready='true';}catch{ui.canvas.dataset.ready='false';ui.setGraphicsError('3D 描画を開始できません。WebGL 対応のブラウザで開いてください。部屋と倉庫の確認は続けられます。');}
 function join(nextRoom:string,name:string){
  client?.dispose();client=null;initializedLook=false;snapshot=null;actorStatus='';inventory=false;ui.setInventory(false);input?.reset();
  let storage:Storage|null=null;try{storage=window.localStorage;}catch{/* Storage denial is surfaced below. */}
  let identity:ReturnType<typeof roomIdentity>;try{identity=roomIdentity(nextRoom,name,storage,crypto);}catch(error){ui.notice(error instanceof Error&&error.message?error.message:'安全な参加情報を作れません。HTTPS で開き直してください。');return;}
  room=nextRoom;invite=inviteURL(location.href,room);ui.setInvite(invite);ui.setRoom(room);const pageURL=new URL(invite);if(probeEnabled)pageURL.searchParams.set('test','1');history.replaceState(null,'',pageURL.href);
  if(!identity.persistent)ui.notice('ブラウザ保存が使えません。このページを閉じると探索者と倉庫へ戻れなくなります。');
  client=new DungeonClient({base:location.href,room,identity,callbacks:{
   state:state=>{ui.setConnection(state);syncActive();},notice:message=>ui.notice(message),
   snapshot:next=>{if(disposed)return;snapshot=next;const own=next.actors.find(a=>a.id===next.you);if(own&&(!initializedLook||raid!==next.raid)){input?.setLook(own.yaw,own.pitch);initializedLook=true;raid=next.raid;}
    if(actorStatus==='alive'&&own?.status!=='alive'&&inventory){inventory=false;ui.setInventory(false);}actorStatus=own?.status??'';ui.update(next);view?.setSnapshot(next);syncActive();},
  }});client.connect();syncActive();
 }
 function resize(){input?.reset();view?.resize();}window.addEventListener('resize',resize,{signal:lifecycle.signal});
 function frame(now:number){if(disposed)return;const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  const sample=input!.sample(dt);networkAccumulator+=dt;
  if(networkAccumulator>=.05){networkAccumulator%=.05;if(!document.hidden&&client?.connected&&snapshot?.phase==='raid')sendInput(sample);}
  if(view&&!document.hidden){view.render(dt,sample);if(view.lost&&!lostReported){lostReported=true;ui.canvas.dataset.ready='false';ui.setGraphicsError('3D 描画の接続が失われました。ページを更新すると、この部屋へ再接続できます。');syncActive();}}
  raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);
 const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);lifecycle.abort();input?.dispose();client?.dispose();view?.dispose();ui.dispose();if(probeEnabled)delete window.__dungeonProbe;document.title=previousTitle;};
 window.addEventListener('pagehide',dispose,{signal:lifecycle.signal,once:true});
 return dispose;
}
