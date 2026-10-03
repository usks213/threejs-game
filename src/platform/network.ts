import type { ClientMessage, Snapshot, WorkerMessage } from '../simulation/protocol';
import type { WorldSave } from '../save/format';
import type { EditOperation } from '../world/types';
import { WebRTCSession, type PeerPacket } from '../networking/webrtc/session';
export function networkUI(signal: AbortSignal, post: (message: ClientMessage) => void, notice: (message: string) => void) {
 const panel = document.querySelector<HTMLElement>('#session-panel')!, status = document.querySelector<HTMLElement>('#session-status')!, token = document.querySelector<HTMLInputElement>('#session-code')!;
 let session: WebRTCSession | null = null, guest = false, sequence = 0, lastState: Snapshot | null = null, edits: EditOperation[] = [], dedicated: { send(type: string, value: unknown): void; leave(): Promise<unknown> } | null = null;
 const receive = (_peer: string, packet: PeerPacket) => {
  if (!guest) {
   if (packet.type === 'input') post({ type: 'peer-input', peer: _peer, input: packet.input as import('../simulation/protocol').PlayerInput, sequence: packet.sequence as number });
   if (packet.type === 'action') post({ type: 'peer-action', peer: _peer, message: packet.message as ClientMessage });
  } else if (packet.type === 'welcome') {
   const save = packet.save as WorldSave; lastState = packet.state as Snapshot; edits = save.edits; post({ type: 'replica-init', save }); post({ type: 'replica-state', state: lastState, edits }); status.textContent = '協力プレイに参加中';
  } else if (packet.type === 'frame') { lastState = packet.state as Snapshot; edits = packet.edits as EditOperation[]; post({ type: 'replica-state', state: lastState, edits }); }
 };
 const close = () => { session?.disconnect(); session = null; if (dedicated) void dedicated.leave(); dedicated = null; if (guest) { guest = false; void import('../save/storage').then(async s => post({ type: 'init', save: await s.loadWorld() })); } status.textContent = 'Single Player'; };
 document.querySelector('#session-menu')!.addEventListener('click', () => { panel.hidden = !panel.hidden; }, { signal });
 document.querySelector('#session-close')!.addEventListener('click', () => { panel.hidden = true; }, { signal });
 document.querySelector('#session-leave')!.addEventListener('click', close, { signal });
 const connect = async (host: boolean) => {
  close();
  if (host) { const bytes = crypto.getRandomValues(new Uint8Array(24)); token.value = [...bytes].map(n => n.toString(16).padStart(2, '0')).join(''); }
  guest = !host; status.textContent = '接続中…';
  session = new WebRTCSession(host, token.value.trim(), receive, peer => { if (host) post({ type: 'peer-join', peer }); status.textContent = host ? `Host Game · ${session!.stats().peers + 1}人` : 'ワールドを受信中…'; }, peer => { if (host) post({ type: 'peer-leave', peer }); else { notice('ホストとの接続が終了しました'); close(); } }, notice);
  try { await session.connect(); status.textContent = host ? 'Host Game · 招待コードを共有してください' : 'ホストと接続しています'; }
  catch (error) { notice(String(error)); close(); }
 };
 document.querySelector('#session-host')!.addEventListener('click', () => { void connect(true); }, { signal });
 document.querySelector('#session-join')!.addEventListener('click', () => { void connect(false); }, { signal });
 document.querySelector('#session-copy')!.addEventListener('click', () => { void navigator.clipboard.writeText(location.origin + '/#join=' + token.value).then(() => notice('招待リンクをコピーしました')).catch(() => notice('招待コードを選択してコピーしてください')); }, { signal });
 document.querySelector('#session-dedicated')!.addEventListener('click', () => { void (async () => {
  const endpoint = document.querySelector<HTMLInputElement>('#dedicated-url')!.value;
  try {
   const url = new URL(endpoint); if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1') throw new Error('HTTPSのサーバーURLを指定してください');
   close(); const { Client } = await import('@colyseus/sdk'); const room = await new Client(endpoint).joinOrCreate('survival'); dedicated = room; guest = true;
   room.onMessage('welcome', (packet: { save: WorldSave; state: Snapshot }) => receive('server', { type: 'welcome', ...packet }));
   room.onMessage('edits', (worldEdits: EditOperation[]) => { edits = worldEdits; });
   room.onMessage('snapshot', (state: Snapshot) => receive('server', { type: 'frame', state, edits }));
   room.onMessage('notice', (message: string) => notice(message)); status.textContent = 'Dedicated Serverへ接続中';
  } catch (error) { notice(String(error)); close(); }
 })(); }, { signal });
 const invited = location.hash.match(/^#join=([a-f0-9]{48})$/); if (invited) { token.value = invited[1]; panel.hidden = false; }
 signal.addEventListener('abort', close, { once: true });
 return {
  get guest() { return guest; },
  forward(message: ClientMessage): boolean {
   if (!guest) return false;
   if (message.type === 'input') { const packet = { type: 'input', input: message.input, sequence: ++sequence }; if (dedicated) dedicated.send('input', packet); else session?.broadcast(packet, true); }
   else if (message.type === 'action' || message.type === 'game-action') { if (dedicated) dedicated.send('action', message); else session?.broadcast({ type: 'action', message }); }
   else if (message.type === 'save' || message.type === 'reset-player' || message.type === 'init') notice('ワールドの保存・読込はホストが管理します');
   return true;
  },
  receive(message: WorkerMessage): boolean {
   if (message.type === 'peer-welcome') { session?.send(message.peer, { type: 'welcome', save: message.save, state: message.state }); return true; }
   if (message.type === 'peer-frame') { session?.send(message.peer, { type: 'frame', state: message.state, edits: message.edits }, false); return true; }
   return false;
  },
 };
}
