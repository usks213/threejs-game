import {CampaignCoopClient} from './coop-client';
import {CAMPAIGN_PROTOCOL,randomRoomCode,roomFromFragment,inviteFragment,type GuestCommand,type RoomRole} from './protocol';
import {captureGameFrame,applyGameFrame,validGameFrame,captureActor,type GameFrame,type ActorFrame} from './game-frame';
import {captureSharedCampaign,applySharedCampaign} from '../campaign-network-state';
import {executeGameCommand,isGameCommand,type GameCommand} from '../campaign-commands';
import type {CampaignSettings} from '../campaign-session';
import type {CoreSimulation,Action,Controls} from '../core/simulation';
import type {CooperationSnapshot,CooperationAction} from '../campaign-ui';
import {record} from '../../save/validation';
import {readHostResumeIdentity,readRoomResumeKey,roomResumeStorageKey,soloCampaignURL} from './room-invitation';
export interface RoomSessionHooks {settings():CampaignSettings;save():boolean;mode(role:RoomRole|null):void;notice(message:string):void;guestPreview?:boolean}
const actions:readonly Action[]=['attack','heavy','dodge','jump','interact','heal','tool','sword','chisel','element-next','cast','recipe-next','build','special','dismantle'];
const editingActions=new Set<Action>(['build','dismantle','cast']);
const wrapAngle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
const healthRequestTimeout=5000,healthRetryMinimum=1000,healthRetryMaximum=15000;
/** Explicit two-person shared expedition. Host owns all simulation and save writes. */
export class CampaignRoomSession {
 private client:CampaignCoopClient|null=null;private room:string|null=null;private available=false;private roleValue:RoomRole|null=null;private message='協力サービスを確認中';private ready=false;private guestBuild=false;private muted=false;private players=0;private chat:{from:string;text:string}[]=[];private publishAt=0;private pendingPublish:Promise<boolean>|null=null;private commands=Promise.resolve();private disposed=false;private lastFrameAt=0;private hostFrameAt=0;private generation=0;private connectionGeneration=0;private latestFrame:GameFrame|null=null;
 private pendingProbe:Promise<void>|null=null;private probeController:AbortController|null=null;private probeRetry:ReturnType<typeof setTimeout>|null=null;private probeRetryDelay=healthRetryMinimum;
 private receivedFrames=0;private sentInputs=0;private snapshotApplyMs=0;private maxSnapshotApplyMs=0;
 remoteActor:ActorFrame|null=null;
 constructor(private readonly sim:CoreSimulation,private readonly hooks:RoomSessionHooks,private readonly endpoint=location.origin){}
 get role(){return this.roleValue;}
 get online(){return !!this.client?.online&&(this.roleValue!=='guest'||this.ready&&Date.now()-this.lastFrameAt<3000);}
 diagnostics(){return {role:this.role,online:this.online,frameAgeMs:this.lastFrameAt?Math.max(0,Date.now()-this.lastFrameAt):null,receivedFrames:this.receivedFrames,sentInputs:this.sentInputs,snapshotApplyMs:this.snapshotApplyMs,maxSnapshotApplyMs:this.maxSnapshotApplyMs};}
 get hostRunning(){return this.roleValue==='host'&&!!this.client?.online;}
 probe():Promise<void>{
  if(this.disposed||this.client)return Promise.resolve();
  if(this.pendingProbe)return this.pendingProbe;
  if(this.probeRetry!==null){clearTimeout(this.probeRetry);this.probeRetry=null;}
  const controller=new AbortController();this.probeController=controller;
  const pending=this.probeHealth(controller).then(retry=>{
   if(this.disposed||this.probeController!==controller)return;
   this.pendingProbe=null;this.probeController=null;
   if(retry&&!this.client){const delay=this.probeRetryDelay;this.probeRetryDelay=Math.min(delay*2,healthRetryMaximum);this.probeRetry=setTimeout(()=>{this.probeRetry=null;void this.probe();},delay);}
   else this.probeRetryDelay=healthRetryMinimum;
  });this.pendingProbe=pending;return pending;
 }
 private async probeHealth(controller:AbortController):Promise<boolean>{
  // Startup work or a transient outage must not disable invitations forever.
  // The probe only reads public health; joining and save access stay explicit.
  const timeout=setTimeout(()=>controller.abort(),healthRequestTimeout);
  try{
   const r=await fetch(new URL('/campaign-room/health',this.endpoint),{cache:'no-store',signal:controller.signal});const health:unknown=await r.json();
   if(this.disposed||this.probeController!==controller||this.client)return false;
   if(controller.signal.aborted||!r.ok)throw new Error('Room health unavailable');
   this.available=record(health)&&health.service==='pr4-campaign-room'&&health.protocol===CAMPAIGN_PROTOCOL&&health.enabled===true;
   this.message=this.available?'未接続。招待した相手と二人で同じ旅を進めます':record(health)&&health.enabled===true&&health.protocol!==CAMPAIGN_PROTOCOL?'協力プレイの版が変わりました。両方のページを再読み込みしてください':'この公開版では協力プレイの準備中です';
   return false;
  }catch{
   if(this.disposed||this.probeController!==controller||this.client)return false;
   this.available=false;this.message='協力サービスへの接続を確認中です。自動で再試行します';return true;
  }finally{clearTimeout(timeout);}
 }
 private inviteURL(){if(!this.room)return null;const url=new URL(inviteFragment(this.room),this.endpoint);if(this.sim.streamedWorld)url.searchParams.set('streaming','1');if(this.sim.westernContent)url.searchParams.set('expedition','west');return url.href;}
 snapshot():CooperationSnapshot{return {enabled:this.available&&this.sim.worldReady,status:this.sim.worldReady?this.message:'地域を展開中。完了すると協力を選べます',role:this.roleValue,invite:this.inviteURL(),guestBuild:this.guestBuild,muted:this.muted,players:this.players,messages:this.chat.map(v=>({...v})),canJoin:!!roomFromFragment(location.hash),guestPreview:!!this.hooks.guestPreview};}
 async command(id:CooperationAction,text=''){
  if(id==='leave'){this.leave();return;}
  if(id==='mute'||id==='unmute'){this.muted=id==='mute';this.client?.setMuted(this.muted);if(this.muted)this.chat=[];return;}
  if(id==='copy-invite'){const invite=this.snapshot().invite;if(invite)try{await navigator.clipboard.writeText(invite);this.hooks.notice('招待URLをコピーしました');}catch{this.hooks.notice('招待欄のURLを選択してコピーしてください');}return;}
  if(id==='allow-build'||id==='deny-build'){if(this.roleValue==='host'&&this.client?.setGuestBuildAllowed(id==='allow-build')){this.guestBuild=id==='allow-build';this.sim.companionCanEdit=this.guestBuild;}return;}
  if(id==='chat'){if(this.muted)return;const clean=text.trim().slice(0,240);if(clean&&!this.client?.sendChat(clean))this.hooks.notice('接続後にメッセージを送れます');return;}
  if(id==='create'&&this.hooks.guestPreview){this.hooks.notice('招待の確認中は新しい部屋を作れません。自分の旅へ戻ってから作成してください');return;}
  if(!this.available||!this.sim.worldReady||this.client)return;
  const room=id==='create'?randomRoomCode():roomFromFragment(location.hash);if(!room){this.hooks.notice('招待URLを開いてから参加してください');return;}
  if(id!=='create'&&id!=='join')return;
  const hostIdentity=id==='join'&&!this.hooks.guestPreview?readHostResumeIdentity(location.hash,()=>sessionStorage):null;
  const resumingHost=!!hostIdentity;
  // Preview startup never touched solo; saving its temporary world would be wrong.
  if(!this.hooks.guestPreview&&!this.hooks.save()){this.hooks.notice('先に自分の旅を保存してください。保存できるまで接続しません');return;}
  const generation=++this.generation;this.commands=Promise.resolve();this.room=room;this.roleValue=id==='create'||resumingHost?'host':'guest';this.ready=false;this.hooks.mode(this.roleValue);
  const expectedRole=this.roleValue,key=roomResumeStorageKey(room,expectedRole);
  const resumeKey=hostIdentity?.resumeKey??readRoomResumeKey(room,expectedRole,()=>sessionStorage)??randomRoomCode();
  try{sessionStorage.setItem(key,resumeKey);}catch{/* This connection can proceed without reload recovery. */}
  this.client=new CampaignCoopClient({room,resumeKey,mode:this.roleValue==='host'?'create':'join',endpoint:this.endpoint},{
   onRole:role=>{if(generation!==this.generation||this.disposed)return;if(role!==expectedRole||this.hooks.guestPreview&&role==='host'){this.client?.disconnect();this.message='共有ルームの役割を検証できません。自分の保存を保護して接続を停止しました';this.hooks.notice(this.message);throw new Error(this.message);}this.roleValue=role;if(role==='host'){this.sim.enableCompanion();this.sim.setCompanionConnected(false);}},
   onStatus:(status,message)=>{this.message=message;if(status==='reconnecting'||status==='closed')this.connectionGeneration++;if(this.roleValue==='host'&&['paused','reconnecting','closed','connecting'].includes(status)){this.sim.setCompanionConnected(false);this.remoteActor=null;}if(status==='online'&&this.roleValue==='host')void this.publish();if(this.roleValue==='guest'&&['paused','reconnecting','closed','connecting'].includes(status)){this.ready=false;this.remoteActor=null;this.latestFrame=null;}},
   onInput:input=>{if(this.roleValue==='host')this.sim.setCompanionInput(input);},
   onFrame:frame=>{if(this.roleValue!=='guest'||!this.ready)return;if(!validGameFrame(frame,this.sim.enemies.length)||this.latestFrame&&frame.seconds<this.latestFrame.seconds)return;const host=applyGameFrame(this.sim,frame,true);this.latestFrame=frame;if(!host)throw new Error('共有プレイヤー状態が不正です');this.remoteActor=host;this.lastFrameAt=Date.now();this.receivedFrames++;},
   onSnapshot:text=>{if(this.roleValue!=='guest')return;const value:unknown=JSON.parse(text);if(!record(value)||value.version!==1||!validGameFrame(value.frame,this.sim.enemies.length)||!value.frame.guest)throw new Error('共有ワールドの形式が不正です');const applyStarted=performance.now(),result=applySharedCampaign(this.sim,value.world);this.snapshotApplyMs=performance.now()-applyStarted;this.maxSnapshotApplyMs=Math.max(this.maxSnapshotApplyMs,this.snapshotApplyMs);if(!result.ok)throw new Error('共有ワールドを検証できません');const current=this.latestFrame&&this.latestFrame.seconds>value.frame.seconds?this.latestFrame:value.frame;const host=applyGameFrame(this.sim,current,this.ready);this.latestFrame=current;if(!host)throw new Error('共有プレイヤーを検証できません');this.remoteActor=host;this.ready=true;this.lastFrameAt=Date.now();},
   onCommand:(command,id)=>{const client=this.client,connection=this.connectionGeneration;this.commands=this.commands.then(()=>{if(generation!==this.generation||connection!==this.connectionGeneration||client!==this.client)return;return this.executeGuest(command,id,generation,connection);}).catch(()=>{if(generation===this.generation&&connection===this.connectionGeneration&&client===this.client)client?.hostAck(id,false,'操作の処理に失敗しました');});},
   onPlayers:players=>{this.players=players.filter(p=>p.connected).length;if(this.roleValue==='host'){const connected=players.some(p=>p.id==='guest'&&p.connected);this.sim.setCompanionConnected(connected);if(!connected)this.remoteActor=null;}},
   onPermission:allowed=>{this.guestBuild=allowed;if(this.roleValue==='host')this.sim.companionCanEdit=allowed;},
   onSnapshotRequested:()=>{if(this.roleValue==='host')void this.publish();},
   onAck:(_id,accepted,message)=>{if(accepted!==true||message)this.hooks.notice(message);},
   onChat:(from,text)=>{if(this.muted)return;this.chat.push({from:from==='host'?'ホスト':'同行者',text});if(this.chat.length>40)this.chat.shift();},
  });if(this.roleValue==='host')history.replaceState(null,'',inviteFragment(room));this.client.connect();
 }
 action(action:Action){if(this.roleValue!=='guest')return false;if(!this.online){this.hooks.notice('同期が完了するまで操作を待っています');return true;}if(!this.guestBuild&&(editingActions.has(action)||['attack','heavy'].includes(action)&&this.sim.player.tool||action==='special'&&this.sim.buildMode)){this.hooks.notice('この操作は周辺世界を変えるため、ホストの許可が必要です');return true;}const type=action==='dismantle'?'remove-build':action==='build'?'build':['attack','heavy','jump','dodge','heal','cast'].includes(action)?action:'interact';this.client!.guestRequest({action:type,payload:{kind:'action',action}});return true;}
 gameCommand(command:GameCommand){if(this.roleValue!=='guest')return false;if(!this.online){this.hooks.notice('同期が完了するまで操作を待っています');return true;}if(command.type==='homestead'&&!this.guestBuild){this.hooks.notice('拠点の変更にはホストの許可が必要です');return true;}this.client!.guestRequest({action:command.type==='homestead'?'storage':command.type==='gear'?'repair':command.type,payload:{kind:'menu',command}});return true;}
 respawn(){if(this.roleValue!=='guest')return false;if(this.online)this.client!.guestRequest({action:'rest',payload:{kind:'respawn'}});return true;}
 tick(_dt:number,input:Controls,active:boolean){if(!this.client)return;if(this.roleValue==='guest'){if(this.online){const p=this.sim.player;if(this.client.sendInput({x:active?input.x:0,z:active?input.z:0,yaw:wrapAngle(p.yaw),pitch:p.pitch,block:active&&input.block,sprint:active&&input.sprint}))this.sentInputs++;}return;}if(this.client.online){if(Date.now()-this.hostFrameAt>=100){this.hostFrameAt=Date.now();this.client.hostFrame(captureGameFrame(this.sim) as unknown as Record<string,unknown>);}if(!this.pendingPublish&&Date.now()-this.publishAt>2000)void this.publish();this.remoteActor=this.players>1&&this.sim.companion?captureActor(this.sim.companion):null;}}
 private async executeGuest(command:GuestCommand,id:string,generation=this.generation,connection=this.connectionGeneration){if(generation!==this.generation||connection!==this.connectionGeneration||this.roleValue!=='host'||!this.sim.companion||this.sim.companionSuspended||!this.client?.online)return;const p=command.payload;let accepted=false,message='共有操作の形式が不正です';
  if(p.kind==='action'&&typeof p.action==='string'&&actions.includes(p.action as Action)){const action=p.action as Action;const needsEdit=editingActions.has(action)||['attack','heavy'].includes(action)&&this.sim.companion.tool||action==='special'&&this.sim.companionSnapshot()?.aux.buildMode;if(needsEdit&&!this.guestBuild)message='ホストが建築・採掘・元素の変更を許可していません';else{accepted=this.sim.companionAction(action);message=accepted?'操作を受け付けました':'今は操作できません';}}
  if(p.kind==='menu'&&isGameCommand(p.command)){if(p.command.type==='gear'&&p.command.id.split(':')[0]==='rescue'&&this.sim.companion.hp>0)message='同行者の帰還は死亡時の復活から行います';else if(p.command.type==='homestead'&&!this.guestBuild)message='ホストが拠点変更を許可していません';else{const r=this.sim.withCompanion(()=>executeGameCommand(this.sim,p.command as GameCommand));accepted=!!r?.ok;message=r?.message??'同行者がいません';}}
  if(p.kind==='respawn'&&this.sim.companion.hp<=0){accepted=this.sim.companionRespawn();message='共有拠点で復活しました';}
  if(accepted){if(!this.hooks.save()){this.client.disconnect();this.message='共有操作の保存に失敗しました。再実行せず、ホストで保存を確認してください';this.hooks.notice(this.message);return;}const sent=await this.publish();if(generation!==this.generation||connection!==this.connectionGeneration)return;if(!sent){this.client?.hostAck(id,false,'世界は変更されましたが再同期が必要です。自動再実行しないでください');return;}}
  if(generation===this.generation&&connection===this.connectionGeneration)this.client?.hostAck(id,accepted,message);
 }
 private publish():Promise<boolean>{
  const client=this.client,generation=this.generation,connection=this.connectionGeneration;if(this.roleValue!=='host'||!client?.online||!this.sim.worldReady||this.disposed)return Promise.resolve(false);
  const previous=this.pendingPublish??Promise.resolve(true);
  const publishing=previous.catch(()=>false).then(async()=>{
   if(this.disposed||generation!==this.generation||connection!==this.connectionGeneration||client!==this.client||!client.online)return false;
   this.publishAt=Date.now();try{return await client.hostPublish(JSON.stringify({version:1,world:captureSharedCampaign(this.sim,this.hooks.settings()),frame:captureGameFrame(this.sim)}));}catch{if(generation===this.generation){this.message='共有状態を送信できません。ホストの保存を保護して停止します';this.hooks.notice(this.message);}return false;}
  });this.pendingPublish=publishing;
  void publishing.finally(()=>{if(this.pendingPublish===publishing)this.pendingPublish=null;});return publishing;
 }
 leave(){this.generation++;this.commands=Promise.resolve();this.pendingPublish=null;const guest=this.roleValue==='guest'||!!this.hooks.guestPreview;this.client?.disconnect();this.client=null;this.roleValue=null;this.room=null;this.ready=false;this.latestFrame=null;this.remoteActor=null;this.players=0;this.guestBuild=false;this.sim.disableCompanion();this.hooks.mode(null);this.message='共有ルームから退出しました';if(guest){history.replaceState(null,'',soloCampaignURL(location.href));location.reload();}else this.hooks.save();}
 dispose(){this.generation++;this.commands=Promise.resolve();this.disposed=true;if(this.probeRetry!==null)clearTimeout(this.probeRetry);this.probeRetry=null;this.probeController?.abort();this.probeController=null;this.pendingProbe=null;this.client?.disconnect();this.client=null;this.remoteActor=null;}
}
