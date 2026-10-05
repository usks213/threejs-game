import {COOP_BUILD_ID,validateSessionInfo,type CoopSessionInfo} from './coop-handshake';
import {CoopFrameDecoder} from './coop-frame-decoder';
import type {RoomAccessView,RoomAdminOperation,RoomAdminCommand} from './room-access';
import { COOP_PROTOCOL, type CoopAction, type CoopServerPacket,type CoopWireServerPacket } from './coop-protocol';
import type { PlayerInput } from '../simulation/protocol';
export type ConnectionState = 'connecting' | 'syncing' | 'online' | 'reconnecting' | 'closed';
export class CoopClient {
 private readonly frames=new CoopFrameDecoder(token=>this.send({type:'delivery',token}));
 private socket: WebSocket | null = null;
 private timer: ReturnType<typeof setTimeout> | undefined;
 private heartbeat: ReturnType<typeof setInterval> | undefined;
 private stopped = false;
 private attempt = 0;
 private generation = 0;
 private lastReceive = 0;
 private lastWorld = 0;
 private epoch = '';
 private online = false;
 private exportRequest:string|null=null;
 private sequence = 0;private actionSequence=0;private sequencedActions=false;
 private tickAnchor=0;private ackAnchor=0;
 sessionInfo:CoopSessionInfo|null=null;
 private get clientTick(){return this.tickAnchor+Math.max(0,this.sequence-this.ackAnchor);}
 private openedAt=0;
 private readonly offline=()=>this.retry();
 private readonly connected=()=>{if(!this.stopped&&!this.online){clearTimeout(this.timer);if(!this.socket)this.connect();}};
 private readonly pending = new Map<string, CoopAction>();
 private readonly pendingAdmin=new Map<string,RoomAdminCommand>();
 private access:RoomAccessView|null=null;
 get roomAccess():RoomAccessView|null{return this.access;}
 get adminPending():boolean{return this.pendingAdmin.size>0||!!this.access?.pending;}
 playerId = '';
 private readonly resumeKey: string;
 constructor(readonly room: string, private readonly packet: (packet: CoopServerPacket) => void, private readonly state: (state: ConnectionState) => void, private readonly notice: (text: string) => void, private readonly endpoint = location.origin) {
  if (!/^[a-f0-9]{48}$/.test(room)) throw new Error('招待コードが不正です');
  const key = `voxel-coop-resume:${room}`; this.resumeKey = sessionStorage.getItem(key) ?? Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''); sessionStorage.setItem(key, this.resumeKey);
  if(typeof window!=='undefined'){window.addEventListener('offline',this.offline);window.addEventListener('online',this.connected);}
 }
 connect(): void {
  if (this.stopped) return;
  if(typeof navigator!=='undefined'&&navigator.onLine===false){this.state('reconnecting');return;}
  const generation = ++this.generation;
  const url = new URL(`/coop/${this.room}`, this.endpoint); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  this.state(this.attempt ? 'reconnecting' : 'connecting');
  const socket = this.socket = new WebSocket(url);
  const current = () => !this.stopped && generation === this.generation;
  socket.onopen = () => {
   if (!current()) { socket.close(); return; }
   clearTimeout(this.timer); this.lastWorld = this.lastReceive = this.openedAt = Date.now(); this.state('syncing');
   socket.send(JSON.stringify({ type: 'hello', protocol: COOP_PROTOCOL, resumeKey: this.resumeKey,buildId:COOP_BUILD_ID,roomId:this.room,clientTick:this.clientTick }));
   this.heartbeat = setInterval(() => { if (Date.now() - this.lastReceive > 12000||this.online&&Date.now()-this.lastWorld>12000||!this.online&&Date.now()-this.openedAt>15000) this.retry(socket); else if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}'); }, 3000);
  };
  socket.onmessage = event => {
   if (!current()) return;
   try {
    const raw = JSON.parse(String(event.data)) as CoopWireServerPacket; this.lastReceive = Date.now();
    if(raw.type==='delta'&&(!this.online||raw.epoch!==this.epoch))return;
    let message:CoopServerPacket;try{message=this.frames.accept(raw);}catch{this.notice('共有状態の差分が連続していないため、再同期します');this.resync();return;}
    if(message.type==='persisted-revision'||message.type==='welcome'&&message.persistedRevision!==undefined){const revision=message.type==='persisted-revision'?message.revision:message.persistedRevision;if(typeof revision!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(revision))throw Error('保存世代が不正です');}
    if (message.type === 'welcome') {this.lastWorld=Date.now();
     if (message.protocol !== COOP_PROTOCOL || (this.playerId && message.playerId !== this.playerId)) throw new Error('接続先のゲームの版が違います');
     this.sessionInfo=message.session?validateSessionInfo(message.session,this.room,message.save,message.state):null;this.tickAnchor=message.state.tick??0;this.ackAnchor=message.state.ack??0;
     if(message.actionSequence!==undefined){if(!Number.isSafeInteger(message.actionSequence)||message.actionSequence<0)throw Error('操作連番が不正です');this.actionSequence=Math.max(this.actionSequence,message.actionSequence);this.sequencedActions=true;}
     // An unsolicited full baseline can lag inputs already in flight. Reusing
     // their numbers makes the authority discard fresh controls until catch-up.
     const sameSession=this.playerId===message.playerId&&this.epoch===message.epoch;
     this.sequence=sameSession?Math.max(this.sequence,message.state.ack??0):message.state.ack??0;
     this.playerId = message.playerId; this.epoch = message.epoch; this.online = true; this.attempt = 0;
     this.packet(message); this.state('online');
     for (const [commandId, action] of this.pending) this.send({ type: 'action', commandId, message: action,clientTick:this.clientTick });for(const command of this.pendingAdmin.values())this.send({type:'room-admin',...command});
    } else if (message.type === 'frame') { if (this.online && message.epoch === this.epoch){this.lastWorld=Date.now();this.tickAnchor=message.state.tick;this.ackAnchor=message.state.ack??0;this.packet(message);} }
    else if(message.type==='persisted-revision')this.packet(message);
    else if(message.type==='room-access'){this.access=message.access;this.packet(message);}
    else if (message.type === 'ack') { if(message.kind==='room-admin')this.pendingAdmin.delete(message.commandId);else this.pending.delete(message.commandId); this.packet(message); this.notice(message.message); }
    else if(message.type==='export'){if(message.requestId===this.exportRequest){this.exportRequest=null;this.packet(message);}}
    else if (message.type === 'notice') this.notice(message.message);
   } catch (error) { this.notice(error instanceof Error ? error.message : '同期データを読み取れません'); socket.close(); }
  };
  socket.onerror = () => { if (current()) this.notice('共有ワールドへ接続できません。再接続します'); };
  socket.onclose = event => {
   if (!current()) return; clearInterval(this.heartbeat); this.heartbeat = undefined; this.online = false;this.exportRequest=null;
   if([4001,4003,4004,4005,1008,1009].includes(event.code)){this.disconnect();this.notice(event.code===4001?'別の接続で同じプレイヤーが参加しています':event.code===4003?'管理者により再参加が拒否されています。保存データは保持されています':event.code===4004?'この部屋は新規参加をロックしています':event.code===4005?'管理者により退出しました。必要なら手動で再参加できます':event.code===1009?'共有データが転送の上限を超えています。サーバーの保存は保持されています':'接続情報またはゲームの版を確認し、退出してページを更新してください');return;}
   this.retry(socket);
  };
  // A connection attempt that never opens must not leave the UI stuck forever.
  this.timer = setTimeout(() => { if (current() && socket.readyState === WebSocket.CONNECTING) this.retry(socket); }, 10000);
 }
 private retry(socket:WebSocket|null=this.socket):void{
  if(this.stopped||socket!==this.socket)return;
  this.generation++;this.online=false;this.exportRequest=null;clearTimeout(this.timer);clearInterval(this.heartbeat);this.heartbeat=undefined;this.socket=null;this.state('reconnecting');
  try{socket?.close();}catch{/* The network may never deliver a close event. */}
  if(typeof navigator==='undefined'||navigator.onLine!==false)this.timer=setTimeout(()=>this.connect(),Math.min(8000,500*2**Math.min(this.attempt++,4)));
 }
 private send(packet: unknown): boolean { if (this.socket?.readyState !== WebSocket.OPEN) return false; this.socket.send(JSON.stringify(packet)); return true; }
 input(input: PlayerInput): number | null {
  if (!this.online||this.pendingAdmin.size>0||this.access?.pending||this.access?.readOnly) return null; const sequence = ++this.sequence; if(!this.send({ type: 'input', input, sequence,clientTick:this.clientTick })){this.retry();return null;}return sequence;
 }
 action(message: CoopAction): void {
  if (!this.online) { this.notice('再接続してから操作してください'); return; }
  if(this.pendingAdmin.size>0||this.access?.pending||this.access?.readOnly){this.notice('部屋管理の保存・復旧が終わってから操作してください');return;}
  if (this.pending.size >= 64) { this.notice('操作を同期しています。少し待ってください'); return; }
  const commandId = this.sequencedActions?'seq_'+(++this.actionSequence)+'_'+crypto.randomUUID():crypto.randomUUID(); this.pending.set(commandId, message); this.send({ type: 'action', commandId, message,clientTick:this.clientTick });
 }
 admin(operation:RoomAdminOperation,targetId?:string):boolean{
  if(!this.online||!this.access?.canManage||this.access.pending||this.access.readOnly||this.pendingAdmin.size){this.notice('オンラインの管理者だけが、保存完了後に操作できます');return false;}
  const command:RoomAdminCommand={commandId:crypto.randomUUID(),expectedRevision:this.access.revision,operation,...(targetId?{targetId}:{})};this.pendingAdmin.set(command.commandId,command);if(!this.send({type:'room-admin',...command}))this.retry();return true;
 }
 exportWorld():void{if(!this.online){this.notice('再接続してから書き出してください');return;}if(this.exportRequest)return;this.exportRequest=crypto.randomUUID();this.send({type:'export',requestId:this.exportRequest});}
 resync(): void { this.online = false; this.state('syncing'); this.send({ type: 'resync' }); }
 disconnect(): void {
  this.stopped = true; this.generation++; this.online = false; clearTimeout(this.timer); clearInterval(this.heartbeat); this.pending.clear();this.pendingAdmin.clear();this.access=null;if(typeof window!=='undefined'){window.removeEventListener('offline',this.offline);window.removeEventListener('online',this.connected);} this.socket?.close(); this.socket = null; this.state('closed');
 }
}
