import type { ClientMessage, Snapshot, WorkerMessage } from '../simulation/protocol';
import type { WorldSave } from '../save/format';
import type { EditOperation } from '../world/types';
import { CoopClient, type ConnectionState } from '../networking/coop-client';
import { dedicatedIdentity } from '../networking/identity';
export function networkUI(signal: AbortSignal, post: (message: ClientMessage) => void, notice: (message: string) => void) {
 const panel = document.querySelector<HTMLElement>('#session-panel')!, status = document.querySelector<HTMLElement>('#session-status')!, token = document.querySelector<HTMLInputElement>('#session-code')!;
 let session: CoopClient | null = null, guest = false, sequence = 0, edits: EditOperation[] = [], generation = 0, lastTick = -1;
 let dedicated: { send(type: string, value: unknown): void; leave(): Promise<unknown> } | null = null;
 const labels: Record<ConnectionState,string> = { connecting:'共有ワールドへ接続中…', syncing:'ワールドを同期中…', online:'協力プレイに参加中', reconnecting:'切断されました · 再接続中…', closed:'Single Player' };
 const show = (state: ConnectionState) => { status.textContent = labels[state]; status.dataset.connection = state; };
 const receiveState = (state: Snapshot, incoming: EditOperation[], base?: number) => {
  if (state.tick < lastTick) return;
  if (base === undefined) edits = incoming;
  else if (base > edits.length || base < 0) { session?.resync(); return; }
  else edits = [...edits.slice(0,base),...incoming];
  if (edits.length !== state.edits) { session?.resync(); return; }
  lastTick = state.tick; post({ type:'replica-state', state, edits });
  status.dataset.players = String((state.peers?.length ?? 0) + 1); status.dataset.peers = JSON.stringify(state.peers?.map(p=>({id:p.id,...p.player}))??[]); status.dataset.tick = String(state.tick);
 };
 const welcome = (save: WorldSave, state: Snapshot) => { edits = save.edits; lastTick = -1; post({type:'replica-init',save}); receiveState(state,edits); show('online'); };
 const close = (restore = true) => {
  const oldGuest = guest, operation = ++generation; session?.disconnect(); session = null;
  if (dedicated) void dedicated.leave(); dedicated = null; guest = false; lastTick = -1; edits = [];
  show('closed'); delete status.dataset.player; delete status.dataset.players;
  if (oldGuest && restore) void import('../save/storage').then(async storage => { const save = await storage.loadWorld(); if (operation === generation && !guest && !signal.aborted) post({type:'init',save}); }).catch(error=>notice(String(error)));
 };
 document.querySelector('#session-menu')!.addEventListener('click', () => { panel.hidden = !panel.hidden; }, { signal });
 document.querySelector('#session-close')!.addEventListener('click', () => { panel.hidden = true; }, { signal });
 document.querySelector('#session-leave')!.addEventListener('click', () => close(), { signal });
 const connect = (create: boolean) => {
  close(false); const operation = generation;
  if (create) { const bytes = crypto.getRandomValues(new Uint8Array(24)); token.value = [...bytes].map(n => n.toString(16).padStart(2,'0')).join(''); }
  try {
   guest = true;
   session = new CoopClient(token.value.trim(), packet => {
    if (operation !== generation) return;
    if (packet.type === 'welcome') { status.dataset.player = packet.playerId; welcome(packet.save,packet.state); }
    else if (packet.type === 'frame') receiveState(packet.state,packet.edits,packet.editBase);else if(packet.type==='ack')status.dataset.lastAck=JSON.stringify(packet);
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
   close(false); const operation=generation; guest=true; show('connecting');
   const { Client }=await import('@colyseus/sdk'); const room=await new Client(endpoint).joinOrCreate('survival',{playerToken:dedicatedIdentity(endpoint)});
   if(operation!==generation || signal.aborted){void room.leave();return;} dedicated=room;
   room.onMessage('welcome',(packet:{save:WorldSave;state:Snapshot})=>welcome(packet.save,packet.state));
   room.onMessage('edits',(incoming:EditOperation[])=>{edits=incoming;}); room.onMessage('snapshot',(state:Snapshot)=>receiveState(state,edits)); room.onMessage('notice',(text:string)=>notice(text));
  }catch(error){notice(String(error));close();}
 })(); }, { signal });
 const invited=location.hash.match(/^#join=([a-f0-9]{48})$/);if(invited){token.value=invited[1];panel.hidden=false;}
 signal.addEventListener('abort',()=>close(false),{once:true});
 return {
  get guest(){return guest;},
  forward(message:ClientMessage):boolean{
   if(!guest)return false;
   if(message.type==='input'){
    if(dedicated){const seq=++sequence;dedicated.send('input',{input:message.input,sequence:seq});post({type:'replica-input',input:message.input,sequence:seq});}
    else {const seq=session?.input(message.input);if(seq!==undefined&&seq!==null)post({type:'replica-input',input:message.input,sequence:seq});}
   } else if(message.type==='action'||message.type==='game-action'){status.dataset.lastCommand=JSON.stringify(message);if(dedicated)dedicated.send('action',message);else session?.action(message);}
   else if(message.type==='save'||message.type==='reset-player'||message.type==='init')notice('共有ワールドはサーバーに保存されます');
   return true;
  },
  receive(_message:WorkerMessage):boolean{return false;},
 };
}
