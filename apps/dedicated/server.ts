import { Server, Room, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SessionAuthority } from '../../src/simulation/session';
import { sessionFrame } from '../../src/networking/frame';
import type { ClientMessage, PlayerInput } from '../../src/simulation/protocol';
import { validateSave } from '../../src/save/format';
export class SurvivalRoom extends Room {
 maxClients = 8;
 authority = new SessionAuthority(null, true);
 private timer: ReturnType<typeof setInterval> | undefined;
 private writes = Promise.resolve();
 async onCreate(options: { saveFile?: string } = {}) {
  if (options.saveFile) throw new Error('Clients cannot choose server storage');
  if (process.env.GAME_SAVE_DIRECTORY) { try { this.authority = new SessionAuthority(validateSave(JSON.parse(await readFile(process.env.GAME_SAVE_DIRECTORY + '/world.json', 'utf8'))), true); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  this.setPatchRate(null);
  this.onMessage('input', (client: Client, packet: { input: PlayerInput; sequence: number }) => this.authority.input(client.sessionId, packet.input, packet.sequence));
  this.onMessage('action', (client: Client, packet: ClientMessage) => {
   try { const result = this.authority.action(client.sessionId, packet); this.broadcast('edits', this.authority.sim.world.edits); client.send('notice', result.message); }
   catch (error) { client.send('notice', String(error)); }
  });
  this.timer = setInterval(() => {
   this.authority.step();
   if (this.authority.sim.tick % 3 === 0) for (const client of this.clients) client.send('snapshot', sessionFrame(this.authority, client.sessionId));
   if (this.authority.sim.tick % 150 === 0) void this.persist();
  }, 1000 / 30);
 }
 onJoin(client: Client) { this.authority.join(client.sessionId); client.send('welcome', { save: this.authority.sim.save(), state: sessionFrame(this.authority, client.sessionId) }); }
 onLeave(client: Client) { this.authority.leave(client.sessionId); }
 private persist(): Promise<void> {
  const directory = process.env.GAME_SAVE_DIRECTORY; if (!directory) return Promise.resolve();
  const json = JSON.stringify(this.authority.save());
  this.writes = this.writes.then(async () => { await mkdir(directory, { recursive: true }); await writeFile(directory + '/world.json', json); }); return this.writes;
 }
 async onDispose() { clearInterval(this.timer); await this.persist(); }
}
export async function startDedicated(port = 2567) {
 const http = createServer((req, res) => { if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: 'threejs-game-dedicated', players: 8 })); } });
 const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
 server.define('survival', SurvivalRoom);
 await server.listen(port, '127.0.0.1'); return server;
}
