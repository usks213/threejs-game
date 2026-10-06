import {roomManagementUI} from '../ui/room-management';
import {canContinueReplica,replicaIdentity,type ReplicaIdentity} from './replica-continuation';
import type { ClientMessage, Snapshot, WorkerMessage } from '../simulation/protocol';
import type { WorldSave } from '../save/format';
import type { EditOperation } from '../world/types';
import { CoopClient, type ConnectionState, type CoopActionResult } from '../networking/coop-client';
import { dedicatedIdentity } from '../networking/identity';
import type {CoopAction} from '../networking/coop-protocol';
export function networkUI(signal: AbortSignal, post: (message: ClientMessage) => void, notice: (message: string) => void,options?:{savedRevision?:(revision:string|undefined)=>void;loadPersonal?:()=>Promise<WorldSave|null>;exported?:(save:WorldSave)=>void;continueReplica?:(state:Snapshot,edits:EditOperation[])=>void}) {
 const panel = document.querySelector<HTMLElement>('#session-panel')!, status = document.querySelector<HTMLElement>('#session-status')!, token = document.querySelector<HTMLInputElement>('#session-code')!;
 let session: CoopClient | null = null, guest = false, sequence = 0, edits: EditOperation[] = [], generation = 0, lastTick = -1;
 let identity:ReplicaIdentity|null=null;
 let dedicated: { send(type: string, value: unknown): void; leave(): Promise<unknown> } | null = null;
 const management=roomManagementUI(panel,signal,(operation,targetId)=>{if(!session?.admin(operation,targetId))management.acknowledged();});
 const updateManagement=()=>{const access=session?.roomAccess??null;management.update(access?{...access,pending:access.pending||!!session?.adminPending}:null,(status.dataset.connection??'closed') as ConnectionState,status.dataset.player);status.dataset.roomLocked=String(access?.locked??false);status.dataset.adminPending=String(access?.pending||session?.adminPending||false);status.dataset.readOnly=String(access?.readOnly??false);};
 const labels: Record<ConnectionState,string> = { connecting:'共有ワールドへ接続中…', syncing:'ワールドを同期中…', online:'協力プレイに参加中', reconnecting:'切断されました · 再接続中…', closed:'未接続' };
 const show = (state: ConnectionState) => { status.textContent = labels[state]; status.dataset.connection = state;updateManagement(); };
 const receiveState = (state: Snapshot, incoming: EditOperation[], base?: number,continued=false) => {
  if (state.tick < lastTick) return;
  if (base!==undefined&&(base>edits.length||base<0)) { session?.resync(); return; }
  const next=base===undefined?incoming:[...edits.slice(0,base),...incoming];
  if (next.length !== state.edits) { session?.resync(); return; }
  edits=next;lastTick = state.tick;if(continued&&options?.continueReplica)options.continueReplica(state,edits);else post({ type:'replica-state', state, edits });
  status.dataset.players = String((state.peers?.length ?? 0) + 1); status.dataset.peers = JSON.stringify(state.peers?.map(p=>({id:p.id,...p.player}))??[]); status.dataset.tick = String(state.tick);
 };
 const welcome = (save: WorldSave, state: Snapshot,next:ReplicaIdentity|null=null) => {
  const continued=!!options?.continueReplica&&!!next&&canContinueReplica(identity,next,lastTick,edits,save,state);
  identity=next;status.dataset.welcomeMode=continued?'continued':'reinitialized';status.dataset.welcomeCount=String(Number(status.dataset.welcomeCount??0)+1);
  if(!continued){lastTick=-1;post({type:'replica-init',save});}
  receiveState(state,save.edits,undefined,continued);show('online');
 };
 const close = (restore = true) => {
  const oldGuest = guest, operation = ++generation; session?.disconnect(); session = null;
  if (dedicated) void dedicated.leave(); dedicated = null; guest = false; lastTick = -1; edits = [];identity=null;
  show('closed');status.textContent='Single Player'; delete status.dataset.player; delete status.dataset.players;
  if (oldGuest && restore) void (options?.loadPersonal?options.loadPersonal():import('../save/storage').then(storage=>storage.loadWorld())).then(async save => { if (operation === generation && !guest && !signal.aborted) post({type:'init',save}); }).catch(error=>notice(String(error)));
 };
 document.querySelector('#session-menu')!.addEventListener('click', () => { panel.hidden = !panel.hidden; }, { signal });
 window.addEventListener('keydown',event=>{if(event.code==='Escape'&&!panel.hidden){if(!management.cancelConfirmation())panel.hidden=true;event.preventDefault();event.stopImmediatePropagation();}}, {signal,capture:true});
 document.querySelector('#session-close')!.addEventListener('click', () => { panel.hidden = true; }, { signal });
 document.querySelector('#session-leave')!.addEventListener('click', () => close(), { signal });
 const connect = (create: boolean) => {
  close(false);options?.savedRevision?.(undefined); const operation = generation;
  if (create) { const bytes = crypto.getRandomValues(new Uint8Array(24)); token.value = [...bytes].map(n => n.toString(16).padStart(2,'0')).join(''); }
  try {
   guest = true;sessionStorage.setItem('voxel-coop-last-room',token.value.trim());
   session = new CoopClient(token.value.trim(), packet => {
    if (operation !== generation) return;
    if (packet.type === 'welcome') { options?.savedRevision?.(packet.persistedRevision);status.dataset.player = packet.playerId;if(packet.session){status.dataset.serverBuild=packet.session.buildId;status.dataset.worldVersion=String(packet.session.worldVersion);status.dataset.worldSeed=String(packet.session.worldSeed);} welcome(packet.save,packet.state,replicaIdentity(packet.epoch,packet.playerId,packet.save)); }
    else if(packet.type==='persisted-revision'){status.dataset.savedRevision=packet.revision;options?.savedRevision?.(packet.revision);}
    else if(packet.type==='room-access')updateManagement();else if (packet.type === 'frame') receiveState(packet.state,packet.edits,packet.editBase);else if(packet.type==='ack'){status.dataset.lastAck=JSON.stringify(packet);if(packet.kind==='room-admin'){management.acknowledged();updateManagement();}}else if(packet.type==='export')options?.exported?.(packet.save);
   }, state => { if(operation===generation)show(state); }, notice);
   session.connect();
  } catch(error) { notice(String(error)); close(); }
 };
 document.querySelector('#session-host')!.addEventListener('click', () => connect(true), { signal });
 document.querySelector('#session-join')!.addEventListener('click', () => connect(false), { signal });
 document.querySelector('#session-copy')!.addEventListener('click', () => { if(!/^[a-f0-9]{48}$/.test(token.value))return; void navigator.clipboard.writeText(location.origin + '/#join=' + token.value).then(()=>notice('招待リンクをコピーしました')).catch(()=>notice('招待コードを選択してコピーしてください')); }, { signal });
 document.querySelector('#session-dedicated')!.addEventListener('click', () => { void (async () => {
  try {
   const endpoint = document.querySelector<HTMLInputElement>('#dedicated-url')!.value, url = new URL(endpoint);
   if(url.protocol!=='https:' && url.hostname!=='127.0.0.1')throw new Error('HTTPSのサーバーURLを指定してください');
   close(false);options?.savedRevision?.(undefined); const operation=generation; guest=true; show('connecting');
   const { Client }=await import('@colyseus/sdk'); const room=await new Client(endpoint).joinOrCreate('survival',{playerToken:dedicatedIdentity(endpoint)});
   if(operation!==generation || signal.aborted){void room.leave();return;} dedicated=room;
   room.onMessage('welcome',(packet:{save:WorldSave;state:Snapshot})=>welcome(packet.save,packet.state));
   room.onMessage('edits',(incoming:EditOperation[])=>{edits=incoming;}); room.onMessage('snapshot',(state:Snapshot)=>receiveState(state,edits)); room.onMessage('notice',(text:string)=>notice(text));
  }catch(error){notice(String(error));close();}
 })(); }, { signal });
 const invited=location.hash.match(/^#join=([a-f0-9]{48})$/);const previous=sessionStorage.getItem('voxel-coop-last-room');if(invited){token.value=invited[1];panel.hidden=false;}else if(previous&&/^[a-f0-9]{48}$/.test(previous))token.value=previous;
 signal.addEventListener('abort',()=>close(false),{once:true});
 const submitAction=(message:CoopAction)=>{
  status.dataset.lastCommand=JSON.stringify(message);
  if(dedicated){dedicated.send('action',message);status.dataset.lastCommandResult=JSON.stringify({status:'sent',transport:'dedicated'});return;}
  const result:CoopActionResult=session?.action(message)??{status:'refused',reason:'offline'};
  status.dataset.lastCommandResult=JSON.stringify(result);
  // Expose submission separately from the server ACK. Diagnostic observers can
  // distinguish an unsent click from a command awaiting transport or replay.
  status.dispatchEvent(new CustomEvent('coop-action-submission',{bubbles:true,detail:{message,result}}));
 };
 return {
  get guest(){return guest;},
  exportWorld(){if(session)session.exportWorld();else notice('この接続では共有書出を使えません。管理者側の保存を利用してください');},
  forward(message:ClientMessage):boolean{
   if(!guest)return false;
   if(message.type==='input'){
    if(dedicated){const seq=++sequence;dedicated.send('input',{input:message.input,sequence:seq});post({type:'replica-input',input:message.input,sequence:seq});}
    else {const seq=session?.input(message.input);if(seq!==undefined&&seq!==null)post({type:'replica-input',input:message.input,sequence:seq});}
   } else if(message.type==='action'||message.type==='game-action')submitAction(message);
   else if(message.type==='reset-player')submitAction({type:'game-action',action:'return',aim:{x:0,y:0,z:-1}});
   else if(message.type==='init')notice('共有ワールドの保存はサーバーが管理しています。個人セーブは退出してから読み込んでください');
   return true;
  },
  receive(_message:WorkerMessage):boolean{return false;},
 };
}
