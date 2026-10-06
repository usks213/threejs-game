import {CoopTimingSource} from '../../../src/networking/coop-timing';
import {FixedStepClock} from '../../../src/networking/fixed-step-clock';
import {createWorkerSchedule} from './worker-schedule';
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
 private pendingJoins=0;
 private pendingSaves=0;
 private timer: FixedStepClock | undefined;
 private timing:CoopTimingSource|undefined;private timingRun=0;
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
  // A join owns the current generation before awaiting even a fulfilled load.
  // Final-save completion cannot discard the room while this fetch resumes.
  this.pendingJoins++;
  try {
  let room: AuthorityRoom;
  const loading=this.loading??=this.load(new URL(request.url).pathname.split('/').at(-1)!);
  try { room=await loading; } catch { if(this.loading===loading)this.loading=null;return new Response('Room save could not be loaded; it has not been reset.', { status: 503 }); }
  if(this.room!==room||room.readOnly)return new Response('Room save is settling; reconnect to reload it.',{status:503});
  const [client, server] = Object.values(new WebSocketPair()), id = crypto.randomUUID();
  let left=false;
  const leave=()=>{
   if(left)return;left=true;room.disconnect(id);
   if(this.room!==room)return;
   if(!room.size){this.timer?.stop();this.timer=undefined;}
   if(!room.readOnly)this.ctx.waitUntil(this.persist(room).catch(()=>{}));else this.releaseIdleRoom(room);
  };
  server.accept();
  server.addEventListener('close',leave);server.addEventListener('error',leave);
  room.connect(id, { send: (packet,serialized) => { try { const timing=packet.type==='pong'&&this.room===room&&this.timer?this.timing?.sample(this.timer,room.authority.sim.tick):undefined;server.send(timing?JSON.stringify({...packet,timing}):serialized??JSON.stringify(packet)); } catch { leave(); } }, close: (code, reason) => server.close(code, reason) });
  server.addEventListener('message', event => {
   if(this.room===room&&this.timer)this.timing?.messageEntered(room.authority.sim.tick);
   this.ctx.waitUntil((async()=>{
   if (typeof event.data !== 'string') { server.close(1003, 'Text only'); return; }
   const verified=await authenticateCoopPacket(event.data),result = room.receive(id,verified.text,verified.playerId);
   if(this.recoveryNotice&&JSON.parse(event.data).type==='hello')room.notice('直前の正常な共有保存へ復旧しました。壊れた最新保存は保護されています');
   if (result.changed) this.ctx.waitUntil(this.persist(room).then(() => result.acknowledgment?.()).catch(() => {}));else result.acknowledgment?.();
   })().catch(()=>server.close(1008,'Invalid handshake')));
  });
  if (!this.timer&&room.size&&!room.readOnly) {const timing=this.timing=new CoopTimingSource(++this.timingRun);let timer:FixedStepClock;const stop=()=>this.stopSimulation(room,timer);timer = new FixedStepClock(() => {
   try { timing.stepEntered(room.authority.sim.tick);room.step();timing.stepCompleted(); if (Date.now() - this.lastSave > 30000) { this.lastSave = Date.now(); this.ctx.waitUntil(this.persist(room).catch(() => {})); } }
   catch { stop(); }
  // Keep each turn to one fixed step. Native scheduler.wait returns after the
  // internal timeout callback; a JS setTimeout callback retains its clock clamp.
  }, {maxCatchUpSteps:1,schedule:createWorkerSchedule((delay,options)=>scheduler.wait(delay,options),stop),onOverload:event=>console.warn(JSON.stringify({event:'coop-scheduler-overload',...event}))});this.timer=timer;timer.start();}
  return new Response(null, { status: 101, webSocket: client });
  }finally{this.pendingJoins--;this.releaseIdleRoom(this.room);}
 }
 private stopSimulation(room:AuthorityRoom,timer:FixedStepClock|undefined):void{try{timer?.stop();}finally{if(this.room===room&&this.timer===timer){this.timer=undefined;room.notice('共有シミュレーションを停止しました。再接続してください');}}}
 private persistenceFailed(room:AuthorityRoom):void{room.failPersistence();if(this.room===room){this.timer?.stop();this.timer=undefined;}}
 private releaseIdleRoom(room:AuthorityRoom|null):void{
  if(!room||this.room!==room||this.pendingJoins||this.pendingSaves||room.size&&!room.readOnly)return;
  this.timer?.stop();this.timer=undefined;this.timing=undefined;
  this.room=null;this.loading=null;this.recoveryNotice=false;
 }
 private persist(room:AuthorityRoom): Promise<void> {
  if(this.room!==room||room.readOnly)return Promise.reject(new Error('Room reload required'));
  this.pendingSaves++;
  return this.saves.request().catch(error=>{this.persistenceFailed(room);throw error;}).finally(()=>{
   // A successful earlier batch is not the final checkpoint if another request
   // arrived during its write. Failure also drains before allowing a cold load.
   this.pendingSaves--;this.releaseIdleRoom(room);
  });
 }
 private async writeCheckpoint(): Promise<void> {
  const room=this.room;if(!room||room.readOnly)throw Error('Room reload required');const revision=await writeRoom(this.ctx.storage as unknown as RoomStorage,room.checkpoint());room.recordPersistedRevision(revision);
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
