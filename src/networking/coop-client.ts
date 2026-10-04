import { COOP_PROTOCOL, type CoopAction, type CoopServerPacket } from './coop-protocol';
import type { PlayerInput } from '../simulation/protocol';
export type ConnectionState = 'connecting' | 'syncing' | 'online' | 'reconnecting' | 'closed';
export class CoopClient {
 private socket: WebSocket | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private heartbeat: ReturnType<typeof setInterval> | undefined;
 private stopped = false;
 private attempt = 0;
 private generation = 0;
 private lastReceive = 0;
 private epoch = '';
 private online = false;
 private sequence = 0;
 private readonly pending = new Map<string, CoopAction>();
 readonly playerId: string;
 constructor(readonly room: string, private readonly packet: (packet: CoopServerPacket) => void, private readonly state: (state: ConnectionState) => void, private readonly notice: (text: string) => void, private readonly endpoint = location.origin) {
  if (!/^[a-f0-9]{48}$/.test(room)) throw new Error('招待コードが不正です');
  const key = `voxel-coop-player:${room}`; this.playerId = sessionStorage.getItem(key) ?? crypto.randomUUID(); sessionStorage.setItem(key, this.playerId);
 }
 connect(): void {
  if (this.stopped) return;
  const generation = ++this.generation;
  const url = new URL(`/coop/${this.room}`, this.endpoint); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  this.state(this.attempt ? 'reconnecting' : 'connecting');
  const socket = this.socket = new WebSocket(url);
  const current = () => !this.stopped && generation === this.generation;
  socket.onopen = () => {
   if (!current()) { socket.close(); return; }
   clearTimeout(this.timer); this.lastReceive = Date.now(); this.state('syncing');
   socket.send(JSON.stringify({ type: 'hello', protocol: COOP_PROTOCOL, playerId: this.playerId }));
   this.heartbeat = setInterval(() => { if (Date.now() - this.lastReceive > 12000) socket.close(); else if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}'); }, 3000);
  };
  socket.onmessage = event => {
   if (!current()) return;
   try {
    const message = JSON.parse(String(event.data)) as CoopServerPacket; this.lastReceive = Date.now();
    if (message.type === 'welcome') {
     if (message.protocol !== COOP_PROTOCOL || message.playerId !== this.playerId) throw new Error('接続先のゲームの版が違います');
     this.epoch = message.epoch; this.sequence = message.state.ack ?? 0; this.online = true; this.attempt = 0;
     this.packet(message); this.state('online');
     for (const [commandId, action] of this.pending) this.send({ type: 'action', commandId, message: action });
    } else if (message.type === 'frame') { if (this.online && message.epoch === this.epoch) this.packet(message); }
    else if (message.type === 'ack') { this.pending.delete(message.commandId); this.packet(message); this.notice(message.message); }
    else if (message.type === 'notice') this.notice(message.message);
   } catch (error) { this.notice(error instanceof Error ? error.message : '同期データを読み取れません'); socket.close(); }
  };
  socket.onerror = () => { if (current()) this.notice('共有ワールドへ接続できません。再接続します'); };
  socket.onclose = event => {
   if (!current()) return; clearInterval(this.heartbeat); this.heartbeat = undefined; this.online = false;
   if (event.code === 4001) { this.disconnect(); this.notice('別の接続で同じプレイヤーが参加しています'); return; }
   this.state('reconnecting');
   this.timer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** Math.min(this.attempt++, 4)));
  };
  // A connection attempt that never opens must not leave the UI stuck forever.
  this.timer = setTimeout(() => { if (current() && socket.readyState === WebSocket.CONNECTING) socket.close(); }, 10000);
 }
 private send(packet: unknown): boolean { if (this.socket?.readyState !== WebSocket.OPEN) return false; this.socket.send(JSON.stringify(packet)); return true; }
 input(input: PlayerInput): number | null {
  if (!this.online) return null; const sequence = ++this.sequence; this.send({ type: 'input', input, sequence }); return sequence;
 }
 action(message: CoopAction): void {
  if (!this.online) { this.notice('再接続してから操作してください'); return; }
  if (this.pending.size >= 64) { this.notice('操作を同期しています。少し待ってください'); return; }
  const commandId = crypto.randomUUID(); this.pending.set(commandId, message); this.send({ type: 'action', commandId, message });
 }
 resync(): void { this.online = false; this.state('syncing'); this.send({ type: 'resync' }); }
 disconnect(): void {
  this.stopped = true; this.generation++; this.online = false; clearTimeout(this.timer); clearInterval(this.heartbeat); this.pending.clear(); this.socket?.close(); this.socket = null; this.state('closed');
 }
}
