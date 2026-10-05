import {FixedStepClock} from '../../../src/networking/fixed-step-clock';
import {COOP_BUILD_ID} from '../../../src/networking/coop-handshake';
import {COOP_PROTOCOL} from '../../../src/networking/coop-protocol';
import { authenticateCoopPacket } from '../../../src/networking/coop-identity';
import { CheckpointQueue } from '../../../src/networking/checkpoint-queue';
import { DurableObject } from 'cloudflare:workers';
import { AuthorityRoom } from '../../../src/networking/authority-room';
import {readRoom,writeRoom,type RoomStorage} from '../../../src/save/room-storage';
interface Env { COOP_ROOMS: DurableObjectNamespace<CoopRoom>; ASSETS: Fetcher }
export class CoopRoom extends DurableObject<Env> {
 private room: AuthorityRoom | null = null;
 private loading: Promise<AuthorityRoom> | null = null;
 private timer: FixedStepClock | undefined;
 private readonly saves = new CheckpointQueue(() => this.writeCheckpoint());
 private lastSave = 0;
 private recoveryNotice=false;
 private async load(roomId:string): Promise<AuthorityRoom> {
  if (this.room) return this.room;
  const {checkpoint,recovered,revision}=await readRoom(this.ctx.storage as unknown as RoomStorage);
  this.recoveryNotice=recovered;
  const room=new AuthorityRoom(checkpoint, crypto.randomUUID(),roomId);if(revision)room.recordPersistedRevision(revision);return this.room=room;
 }
 async fetch(request: Request): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
  let room: AuthorityRoom;
  try { room = await (this.loading ??= this.load(new URL(request.url).pathname.split('/').at(-1)!).catch(error => { this.loading = null; throw error; })); } catch { return new Response('Room save could not be loaded; it has not been reset.', { status: 503 }); }
  const [client, server] = Object.values(new WebSocketPair()), id = crypto.randomUUID();
  server.accept();
  room.connect(id, { send: (packet,serialized) => { try { server.send(serialized??JSON.stringify(packet)); } catch { room.disconnect(id); } }, close: (code, reason) => server.close(code, reason) });
  server.addEventListener('message', event => {
   this.ctx.waitUntil((async()=>{
   if (typeof event.data !== 'string') { server.close(1003, 'Text only'); return; }
   const verified=await authenticateCoopPacket(event.data),result = room.receive(id,verified.text,verified.playerId);
   if(this.recoveryNotice&&JSON.parse(event.data).type==='hello')room.notice('直前の正常な共有保存へ復旧しました。壊れた最新保存は保護されています');
   if (result.changed) this.ctx.waitUntil(this.persist().then(() => result.acknowledgment?.()).catch(() => this.persistenceFailed(room)));else result.acknowledgment?.();
   })().catch(()=>server.close(1008,'Invalid handshake')));
  });
  const leave = () => { room.disconnect(id); if (!room.size&&this.room===room) { this.timer?.stop(); this.timer = undefined; } if(this.room===room&&!room.readOnly)this.ctx.waitUntil(this.persist().catch(() => this.persistenceFailed(room))); };
  server.addEventListener('close', leave); server.addEventListener('error', leave);
  if (!this.timer) {this.timer = new FixedStepClock(() => {
   try { room.step(); if (Date.now() - this.lastSave > 30000) { this.lastSave = Date.now(); this.ctx.waitUntil(this.persist().catch(() => this.persistenceFailed(room))); } }
   catch { room.notice('共有シミュレーションを停止しました。再接続してください'); this.timer?.stop(); this.timer = undefined; }
  }, {onOverload:event=>console.warn(JSON.stringify({event:'coop-scheduler-overload',...event}))});this.timer.start();}
  return new Response(null, { status: 101, webSocket: client });
 }
 private persistenceFailed(room:AuthorityRoom):void{room.failPersistence();if(this.room===room){this.timer?.stop();this.timer=undefined;this.room=null;this.loading=null;}}
 private persist(): Promise<void> { return this.saves.request(); }
 private async writeCheckpoint(): Promise<void> {
  const room=this.room;if(!room||room.readOnly)return;const revision=await writeRoom(this.ctx.storage as unknown as RoomStorage,room.checkpoint());room.recordPersistedRevision(revision);
 }
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
 const url = new URL(request.url);
 if (url.pathname === '/coop/health') return Response.json({ service: 'voxel-coop-authority', protocol: COOP_PROTOCOL,buildId:COOP_BUILD_ID, maxPlayers: 4, persistence: 'sqlite', tickRate: 30 });
 const match = url.pathname.match(/^\/coop\/([a-f0-9]{48})$/);
 if (match) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Origin denied', { status: 403 });
  return env.COOP_ROOMS.get(env.COOP_ROOMS.idFromName(match[1])).fetch(request);
 }
 if (url.pathname.startsWith('/coop/')) return new Response('Not found', { status: 404 });
 return env.ASSETS.fetch(request);
} } satisfies ExportedHandler<Env>;
