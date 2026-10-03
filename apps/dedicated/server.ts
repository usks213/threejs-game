import { Server, Room, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { playerIdentity } from './identity';
import { SessionAuthority } from '../../src/simulation/session';
import { sessionFrame } from '../../src/networking/frame';
import type { ClientMessage, PlayerInput } from '../../src/simulation/protocol';
import { validateSave } from '../../src/save/format';
const persistentWorlds = new Set<string>();
export class SurvivalRoom extends Room {
 maxClients = 8;
 authority = new SessionAuthority(null, true);
 private timer: ReturnType<typeof setInterval> | undefined;
 private writes = Promise.resolve();
 private directory: string | undefined;
 private actorId(client: Client): string { return (client.auth as { actorId: string }).actorId; }
 onAuth(client: Client, options: { playerToken?: unknown }) {
  const actorId = playerIdentity(options.playerToken, client.sessionId);
  if (this.authority.actors.has(actorId)) throw new Error('This player is already connected');
  return { actorId };
 }
 async onCreate(options: { saveFile?: string } = {}) {
  if (options.saveFile) throw new Error('Clients cannot choose server storage');
  if (process.env.GAME_SAVE_DIRECTORY) {
   const directory = resolve(process.env.GAME_SAVE_DIRECTORY);
   if (persistentWorlds.has(directory)) throw new Error('The persistent world is full');
   persistentWorlds.add(directory); this.directory = directory;
   try { this.authority = new SessionAuthority(validateSave(JSON.parse(await readFile(directory + '/world.json', 'utf8'))), true); }
   catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { persistentWorlds.delete(directory); this.directory = undefined; throw error; } }
  }
  this.setPatchRate(null);
  this.onMessage('input', (client: Client, packet: { input: PlayerInput; sequence: number }) => { if (packet) this.authority.input(this.actorId(client), packet.input, packet.sequence); });
  this.onMessage('action', (client: Client, packet: ClientMessage) => {
   try { const result = this.authority.action(this.actorId(client), packet); this.broadcast('edits', this.authority.sim.world.edits); client.send('notice', result.message); }
   catch (error) { client.send('notice', String(error)); }
  });
  this.timer = setInterval(() => {
   this.authority.step();
   if (this.authority.sim.tick % 3 === 0) for (const client of this.clients) client.send('snapshot', sessionFrame(this.authority, this.actorId(client)));
   if (this.authority.sim.tick % 150 === 0) void this.persist().catch(() => this.broadcast('notice', 'サーバーへの保存に失敗しました。管理者に連絡してください'));
  }, 1000 / 30);
 }
 onJoin(client: Client) { const id = this.actorId(client); if (this.authority.actors.has(id)) throw new Error('This player is already connected'); this.authority.join(id); client.send('welcome', { save: this.authority.sim.save(), state: sessionFrame(this.authority, id) }); }
 onLeave(client: Client) { if (!this.clients.some(other => other !== client && this.actorId(other) === this.actorId(client))) this.authority.leave(this.actorId(client)); }
 private persist(): Promise<void> {
  const directory = this.directory; if (!directory) return Promise.resolve();
  const json = JSON.stringify(this.authority.save());
  const write = this.writes.then(async () => { await mkdir(directory, { recursive: true }); await writeFile(directory + '/world.json.tmp', json); await rename(directory + '/world.json.tmp', directory + '/world.json'); });
  this.writes = write.catch(() => {}); return write;
 }
 async onDispose() { clearInterval(this.timer); try { await this.persist(); } finally { if (this.directory) persistentWorlds.delete(this.directory); } }
}
export async function startDedicated(port = 2567) {
 const http = createServer((req, res) => { if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: 'threejs-game-dedicated', players: 8 })); } });
 const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
 server.define('survival', SurvivalRoom);
 await server.listen(port, '127.0.0.1'); return server;
}
