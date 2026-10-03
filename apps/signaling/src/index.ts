import { DurableObject } from 'cloudflare:workers';
interface Env { ROOMS: DurableObjectNamespace<SignalRoom> }
interface Attachment { id: string; host: boolean; count: number; window: number; bytes?: number }
export class SignalRoom extends DurableObject<Env> {
 async fetch(request: Request): Promise<Response> {
  const url = new URL(request.url), host = url.searchParams.get('host') === '1', id = url.searchParams.get('peer') ?? '';
  if (request.headers.get('Upgrade') !== 'websocket' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return new Response('Invalid connection', { status: 400 });
  const sockets = this.ctx.getWebSockets(), currentHost = sockets.find(s => (s.deserializeAttachment() as Attachment).host);
  if ((host && currentHost) || (!host && !currentHost) || sockets.length >= 8 || sockets.some(s => (s.deserializeAttachment() as Attachment).id === id)) return new Response('Room unavailable', { status: 409 });
  const pair = new WebSocketPair(), [client, server] = Object.values(pair);
  this.ctx.acceptWebSocket(server); server.serializeAttachment({ id, host, count: 0, window: Date.now() } satisfies Attachment);
  server.send(JSON.stringify({ type: 'welcome', peers: sockets.map(s => s.deserializeAttachment()) .map((a: Attachment) => ({ id: a.id, host: a.host })) }));
  for (const socket of sockets) socket.send(JSON.stringify({ type: 'join', peer: id, host }));
  return new Response(null, { status: 101, webSocket: client });
 }
 webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
  if (typeof message !== 'string' || message.length > 65536) { socket.close(1009, 'Too large'); return; }
  const sender = socket.deserializeAttachment() as Attachment;
  if (Date.now() - sender.window > 10000) { sender.window = Date.now(); sender.count = 0; sender.bytes = 0; }
  sender.bytes = (sender.bytes ?? 0) + message.length;
  if (++sender.count > 6000 || sender.bytes > 5 * 1024 * 1024) { socket.close(1008, 'Rate limit'); return; } socket.serializeAttachment(sender);
  try {
   const packet = JSON.parse(message) as { to?: string; type?: string; data?: unknown };
   if (!['offer', 'answer', 'ice', 'relay', 'data'].includes(packet.type ?? '')) return;
   for (const receiver of this.ctx.getWebSockets()) {
    const target = receiver.deserializeAttachment() as Attachment;
    if (target.id === packet.to && target.host !== sender.host) receiver.send(JSON.stringify({ ...packet, from: sender.id }));
   }
  } catch { socket.close(1008, 'Invalid message'); }
 }
 webSocketClose(socket: WebSocket): void {
  const sender = socket.deserializeAttachment() as Attachment;
  for (const receiver of this.ctx.getWebSockets()) if (receiver !== socket) {
   receiver.send(JSON.stringify({ type: 'leave', peer: sender.id, host: sender.host }));
   if (sender.host) receiver.close(1001, 'Host left');
  }
 }
 webSocketError(socket: WebSocket): void { this.webSocketClose(socket); }
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
 const url = new URL(request.url);
 if (url.pathname === '/health') return Response.json({ service: 'threejs-game-signaling', protocol: 2, relay: 'websocket', authority: 'browser-host' });
 const room = url.pathname.slice(1);
 if (!/^[a-f0-9]{48}$/.test(room)) return new Response('Not found', { status: 404 });
 const origin = request.headers.get('Origin') ?? '';
 if (!/^https:\/\/([a-z0-9-]+-)?threejs-game\.usks213\.workers\.dev$/.test(origin) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return new Response('Origin denied', { status: 403 });
 return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
} } satisfies ExportedHandler<Env>;
