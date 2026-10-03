export interface PeerPacket { type: string; [key: string]: unknown }
interface Peer { connection: RTCPeerConnection; control?: RTCDataChannel; realtime?: RTCDataChannel; ice: RTCIceCandidateInit[]; joined: boolean; relay: boolean; queue: string[]; queuedBytes: number; timer?: ReturnType<typeof setTimeout> }
export class WebRTCSession {
 readonly id = sessionStorage.getItem('three-game-peer') ?? crypto.randomUUID(); readonly peers = new Map<string, Peer>();
 private socket: WebSocket | null = null;
 private stopped = false;
 private chunks = new Map<string, { parts: string[]; count: number; total: number; created: number }>();
 private sent = 0; private received = 0;
 constructor(readonly host: boolean, readonly token: string, readonly message: (peer: string, packet: PeerPacket) => void, readonly join: (peer: string) => void, readonly leave: (peer: string) => void, readonly notice: (message: string) => void, readonly endpoint = import.meta.env.VITE_SIGNALING_URL ?? 'wss://threejs-game-signaling.usks213.workers.dev') {}
 async connect(): Promise<void> {
  sessionStorage.setItem('three-game-peer', this.id);
  if (!/^[a-f0-9]{48}$/.test(this.token)) throw new Error('招待コードが不正です');
  const socket = this.socket = new WebSocket(`${this.endpoint}/${this.token}?peer=${this.id}&host=${this.host ? 1 : 0}`);
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = () => reject(new Error('協力プレイの接続サービスに届きません')); });
  socket.onmessage = event => { void this.signal(JSON.parse(String(event.data))).catch(e => this.notice(String(e))); };
  socket.onclose = () => { if (!this.stopped) this.notice('招待サービスとの接続が切れました。接続済みの相手とは通信を継続します'); };
 }
 private sendSignal(to: string, type: string, data: unknown): void { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ to, type, data })); }
 private peer(id: string): Peer {
  let peer = this.peers.get(id); if (peer) return peer;
  // TURN configuration is supplied by the deployment when a relay is available.
  const config = globalThis as typeof globalThis & { THREE_GAME_ICE_SERVERS?: RTCIceServer[] };
  const connection = new RTCPeerConnection({ iceServers: config.THREE_GAME_ICE_SERVERS ?? [{ urls: 'stun:stun.cloudflare.com:3478' }] });
  peer = { connection, ice: [], joined: false, relay: false, queue: [], queuedBytes: 0 }; this.peers.set(id, peer);
  peer.timer = setTimeout(() => this.relay(id, true), 8000);
  connection.onicecandidate = event => { if (event.candidate) this.sendSignal(id, 'ice', event.candidate.toJSON()); };
  connection.onconnectionstatechange = () => { if (connection.connectionState === 'failed') this.relay(id, true); };
  connection.ondatachannel = event => this.channel(id, event.channel);
  return peer;
 }
 private channel(id: string, channel: RTCDataChannel): void {
  const peer = this.peers.get(id)!; if (channel.label === 'control') peer.control = channel; else peer.realtime = channel;
  channel.onmessage = event => { this.received += String(event.data).length; try { this.receive(id, JSON.parse(String(event.data)) as PeerPacket); } catch { this.notice('通信データを読み取れません'); } };
  if (channel.label === 'control') {
   channel.bufferedAmountLowThreshold = 128 * 1024; channel.onbufferedamountlow = () => this.flush(id);
   channel.onopen = () => { if (peer.timer) clearTimeout(peer.timer); if (!peer.joined) { peer.joined = true; this.join(id); } this.flush(id); };
  }
 }
 private relay(id: string, notify: boolean): void {
  const peer = this.peers.get(id); if(!peer || peer.relay || this.stopped || this.socket?.readyState !== WebSocket.OPEN)return;
  peer.relay=true; if(peer.timer)clearTimeout(peer.timer); if(notify)this.sendSignal(id,'relay',{});
  if(!peer.joined){peer.joined=true;this.join(id);} this.flush(id);
  this.notice('中継接続で協力プレイを開始しました');
 }
 private async signal(packet: { type: string; peer?: string; host?: boolean; from?: string; data?: RTCSessionDescriptionInit & RTCIceCandidateInit }): Promise<void> {
  if (packet.type === 'leave' && packet.peer) { const peer=this.peers.get(packet.peer); if(peer?.timer)clearTimeout(peer.timer); peer?.connection.close(); this.peers.delete(packet.peer); this.leave(packet.peer); return; }
  if(packet.type==='relay' && packet.from){this.peer(packet.from);this.relay(packet.from,false);return;}
  if(packet.type==='data' && packet.from && packet.data){this.received+=JSON.stringify(packet.data).length;this.receive(packet.from,packet.data as unknown as PeerPacket);return;}
  if (packet.type === 'join' && this.host && packet.peer) {
   const peer = this.peer(packet.peer); this.channel(packet.peer, peer.connection.createDataChannel('control', { ordered: true })); this.channel(packet.peer, peer.connection.createDataChannel('realtime', { ordered: false, maxRetransmits: 0 }));
   await peer.connection.setLocalDescription(await peer.connection.createOffer()); this.sendSignal(packet.peer, 'offer', peer.connection.localDescription); return;
  }
  if (!packet.from || !packet.data) return;
  const peer = this.peer(packet.from);
  if (packet.type === 'offer') { await peer.connection.setRemoteDescription(packet.data); await peer.connection.setLocalDescription(await peer.connection.createAnswer()); this.sendSignal(packet.from, 'answer', peer.connection.localDescription); }
  else if (packet.type === 'answer') await peer.connection.setRemoteDescription(packet.data);
  else if (packet.type === 'ice') { if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(packet.data); else peer.ice.push(packet.data); }
  if (peer.connection.remoteDescription) for (const ice of peer.ice.splice(0)) await peer.connection.addIceCandidate(ice);
 }
 private receive(peer: string, packet: PeerPacket): void {
  if (packet.type !== '_chunk') { this.message(peer, packet); return; }
  const { id, index, total, data } = packet;
  if (typeof id !== 'string' || typeof data !== 'string' || data.length > 16000 || typeof index !== 'number' || typeof total !== 'number' || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total || total < 1 || total > 1024) return;
  for (const [key, value] of this.chunks) if (Date.now() - value.created > 60000) this.chunks.delete(key);
  const key = peer + id; if (!this.chunks.has(key) && this.chunks.size >= 8) return;
  const pending = this.chunks.get(key) ?? { parts: [], count: 0, total, created: Date.now() };
  if (pending.total !== total) return;
  if (pending.parts[index] === undefined) { pending.parts[index] = data; pending.count++; } this.chunks.set(key, pending);
  if (pending.count === total) { this.chunks.delete(key); this.message(peer, JSON.parse(pending.parts.join('')) as PeerPacket); }
 }
 private flush(id: string): void {
  const peer=this.peers.get(id);if(!peer)return;
  while(peer.queue.length){
   if(peer.relay){if(this.socket?.readyState!==WebSocket.OPEN || this.socket.bufferedAmount>512*1024)break;}
   else if(peer.control?.readyState!=='open' || peer.control.bufferedAmount>512*1024)break;
   const encoded=peer.queue.shift()!;peer.queuedBytes-=encoded.length;
   if(peer.relay)this.sendSignal(id,'data',JSON.parse(encoded)); else peer.control!.send(encoded);
   this.sent+=encoded.length;
  }
  if(peer.queue.length && !this.stopped)setTimeout(()=>this.flush(id),20);
 }
 send(id: string, packet: PeerPacket, realtime = false): void {
  const peer=this.peers.get(id);if(!peer || !peer.joined)return;
  const encoded=JSON.stringify(packet);
  if(encoded.length>16000 && !realtime && packet.type !== '_chunk'){
   const total=Math.ceil(encoded.length/16000),key=crypto.randomUUID();
   if(total>1024){this.notice('ワールド同期の容量を超えています');return;}
   for(let index=0;index<total;index++)this.send(id,{type:'_chunk',id:key,index,total,data:encoded.slice(index*16000,(index+1)*16000)});
   return;
  }
  if(encoded.length>60000)return;
  if(realtime){
   if(peer.relay){if(this.socket?.readyState===WebSocket.OPEN && this.socket.bufferedAmount<512*1024){this.sendSignal(id,'data',packet);this.sent+=encoded.length;}}
   else if(peer.realtime?.readyState==='open' && peer.realtime.bufferedAmount<128*1024){peer.realtime.send(encoded);this.sent+=encoded.length;}
   return;
  }
  if(peer.queuedBytes+encoded.length>20*1024*1024){this.notice('通信が混雑しています。接続を確認してください');return;}
  peer.queue.push(encoded);peer.queuedBytes+=encoded.length;this.flush(id);
 }
 broadcast(packet: PeerPacket, realtime = false): void { for (const id of this.peers.keys()) this.send(id, packet, realtime); }
 stats() { return { peers: this.peers.size, sentBytes: this.sent, receivedBytes: this.received }; }
 disconnect(): void { this.stopped = true; this.socket?.close(); for (const peer of this.peers.values()) { if(peer.timer)clearTimeout(peer.timer); peer.connection.close(); } this.peers.clear(); }
}
