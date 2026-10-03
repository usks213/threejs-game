import { it, expect } from 'vitest';
import { Client } from '@colyseus/sdk';
import { startDedicated } from '../../apps/dedicated/server';
import type { Snapshot } from '../../src/simulation/protocol';
it('runs the Node authority with eight actual Colyseus clients and confirms authoritative edits', async () => {
 const port = 29000 + Math.floor(Math.random() * 1000), server = await startDedicated(port);
 const clients: Awaited<ReturnType<Client['joinOrCreate']>>[] = [];
 try {
  for (let i = 0; i < 8; i++) clients.push(await new Client('http://127.0.0.1:' + port).joinOrCreate('survival'));
  const positions = new Map<string, number>(), edits = new Set<string>();
  for (const room of clients) { room.onMessage('welcome', () => {}); room.onMessage('notice', () => {}); room.onMessage('edits', (log: unknown[]) => { if (log.length > 0) edits.add(room.sessionId); }); room.onMessage('snapshot', (state: Snapshot) => { positions.set(room.sessionId, state.player.x); }); }
  await new Promise(resolve => setTimeout(resolve, 500));
  const initial = new Map(positions);
  for (let sequence = 1; sequence <= 20; sequence++) { for (const room of clients) room.send('input', { input: { x: 1, z: 0, jump: false }, sequence }); await new Promise(resolve => setTimeout(resolve, 35)); }
  expect(positions.size).toBe(8); for (const room of clients) expect(positions.get(room.sessionId)!).toBeGreaterThan(initial.get(room.sessionId)! + 1);
  clients[0].send('action', { type: 'action', tool: 'dig', target: { x: 1, y: 1, z: 5 } });
  await new Promise(resolve => setTimeout(resolve, 400)); expect(edits.size).toBe(8);
 } finally { await Promise.all(clients.map(room => room.leave())); await server.gracefullyShutdown(false); }
}, 15000);
