import { DurableObject } from 'cloudflare:workers';
import { AuthorityRoom, type RoomCheckpoint } from '../../../src/networking/authority-room';
import { validateSave } from '../../../src/save/format';
interface Env { COOP_ROOMS: DurableObjectNamespace<CoopRoom>; ASSETS: Fetcher }
export class CoopRoom extends DurableObject<Env> {
 private room: AuthorityRoom | null = null;
 private loading: Promise<AuthorityRoom> | null = null;
 private timer: ReturnType<typeof setInterval> | undefined;
 private writes = Promise.resolve();
 private lastSave = 0;
 private async load(): Promise<AuthorityRoom> {
  if (this.room) return this.room;
  const count = await this.ctx.storage.get<number>('segments');
  let checkpoint: RoomCheckpoint | null = null;
  if (count !== undefined) {
   if (!Number.isInteger(count) || count < 1 || count > 1024) throw new Error('Invalid saved room');
   const parts = await this.ctx.storage.get<string>(Array.from({ length: count }, (_, i) => `world:${i}`));
   checkpoint = JSON.parse(Array.from({ length: count }, (_, i) => { const part = parts.get(`world:${i}`); if (part === undefined) throw new Error('Saved room is incomplete'); return part; }).join('')) as RoomCheckpoint;
   if (checkpoint.version !== 1) throw new Error('Unsupported saved room'); checkpoint.world = validateSave(checkpoint.world);
  }
  return this.room = new AuthorityRoom(checkpoint, crypto.randomUUID());
 }
 async fetch(request: Request): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
  let room: AuthorityRoom;
  try { room = await (this.loading ??= this.load().catch(error => { this.loading = null; throw error; })); } catch { return new Response('Room save could not be loaded; it has not been reset.', { status: 503 }); }
  const [client, server] = Object.values(new WebSocketPair()), id = crypto.randomUUID();
  server.accept();
  room.connect(id, { send: packet => { try { server.send(JSON.stringify(packet)); } catch { room.disconnect(id); } }, close: (code, reason) => server.close(code, reason) });
  server.addEventListener('message', event => {
   if (typeof event.data !== 'string') { server.close(1003, 'Text only'); return; }
   const result = room.receive(id, event.data);
   if (result.changed) this.ctx.waitUntil(this.persist().then(() => result.acknowledgment?.()).catch(() => room.notice('共有保存に失敗しました。接続を保ち、しばらくして再試行してください')));
  });
  const leave = () => { room.disconnect(id); if (!room.size) { if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; } this.ctx.waitUntil(this.persist().catch(() => {})); };
  server.addEventListener('close', leave); server.addEventListener('error', leave);
  if (!this.timer) this.timer = setInterval(() => {
   try { room.step(); if (Date.now() - this.lastSave > 30000) { this.lastSave = Date.now(); this.ctx.waitUntil(this.persist().catch(() => room.notice('共有保存の再試行が必要です'))); } }
   catch { room.notice('共有シミュレーションを停止しました。再接続してください'); if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined; }
  }, 1000 / 30);
  return new Response(null, { status: 101, webSocket: client });
 }
 private persist(): Promise<void> {
  if (!this.room) return Promise.resolve();
  const text = JSON.stringify(this.room.checkpoint()), pieces: Record<string, unknown> = {};
  const count = Math.ceil(text.length / 32000); if (count > 1024) return Promise.reject(new Error('World checkpoint is too large'));
  for (let i = 0; i < count; i++) pieces[`world:${i}`] = text.slice(i * 32000, (i + 1) * 32000);
  pieces.segments = count;
  const operation = this.writes.then(() => this.ctx.storage.transaction(async tx => { const old = await tx.get<number>('segments') ?? 0; await tx.put(pieces); for (let i = count; i < old; i++) await tx.delete(`world:${i}`); }));
  this.writes = operation.catch(() => {}); return operation;
 }
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
 const url = new URL(request.url);
 if (url.pathname === '/coop/health') return Response.json({ service: 'voxel-coop-authority', protocol: 1, maxPlayers: 4, persistence: 'sqlite', tickRate: 30 });
 const match = url.pathname.match(/^\/coop\/([a-f0-9]{48})$/);
 if (match) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return new Response('Origin denied', { status: 403 });
  return env.COOP_ROOMS.get(env.COOP_ROOMS.idFromName(match[1])).fetch(request);
 }
 if (url.pathname.startsWith('/coop/')) return new Response('Not found', { status: 404 });
 return env.ASSETS.fetch(request);
} } satisfies ExportedHandler<Env>;
