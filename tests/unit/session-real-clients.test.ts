import { expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDedicated } from '../../apps/dedicated/server';
import { playerIdentity } from '../../apps/dedicated/identity';
import { SessionAuthority } from '../../src/simulation/session';
import { newMeadows } from '../../src/game/meadows/state';
import { dropItem } from '../../src/game/interaction/drops';
import { validateSave } from '../../src/save/format';
import { legacySimulation } from '../helpers/legacy';
import type { Snapshot } from '../../src/simulation/protocol';

it('converges two real clients after pickup conflict, edit, reconnect and server restart', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'coop-integrity-')), previous = process.env.GAME_SAVE_DIRECTORY;
 const save = legacySimulation().save(); save.adventure!.meadows = newMeadows(); save.adventure!.resources = []; save.adventure!.enemies = [];
 const authority = new SessionAuthority(save, true), tokens = ['a'.repeat(64), 'b'.repeat(64)];
 for (const token of tokens) { const actor = authority.join(playerIdentity(token, '')); Object.assign(actor.player, authority.sim.player); }
 dropItem(authority.sim.adventure, 'wood', 2, authority.sim.player);
 const dropId = authority.sim.adventure.state.resources[0].id;
 await writeFile(join(directory, 'world.json'), JSON.stringify(authority.save()));
 process.env.GAME_SAVE_DIRECTORY = directory;
 const port = 31000 + Math.floor(Math.random() * 1000);
 let server = await startDedicated(port);
 const clients: Awaited<ReturnType<Client['joinOrCreate']>>[] = [], states = new Map<number, Snapshot>(), edits = new Map<number, number>(), notices: string[] = [];
 const until = async (check: () => boolean) => { const deadline = performance.now() + 5000; while (!check()) { if (performance.now() > deadline) throw new Error('No convergence: ' + notices.join(' / ')); await new Promise(resolve => setTimeout(resolve, 30)); } };
 const connect = async (index: number) => {
  const room = await new Client('http://127.0.0.1:' + port).joinOrCreate('survival', { playerToken: tokens[index] });
  room.onMessage('welcome', (packet: {state: Snapshot}) => states.set(index, packet.state));
  room.onMessage('snapshot', (state: Snapshot) => states.set(index, state));
  room.onMessage('edits', (log: unknown[]) => edits.set(index, log.length));
  room.onMessage('notice', (message: string) => notices.push(message));
  return room;
 };
 try {
  clients.push(await connect(0), await connect(1)); await until(() => states.size === 2);
  for (const client of clients) client.send('input', { input: { x: .2, z: 0, jump: false }, sequence: 1 });
  await until(() => [...states.values()].every(s => s.ack === 1));
  const initialX = states.get(0)!.player.x; await until(() => states.get(0)!.player.x > initialX + .05);
  const target = states.get(0)!.adventure.resources.find(r => r.id === dropId)!;
  for (const client of clients) client.send('action', { type: 'game-action', action: 'interact', id: 'r:' + dropId, target, aim: { x: 0, y: 0, z: 1 } });
  await until(() => [...states.values()].every(s => !s.adventure.resources.some(r => r.id === dropId)));
  expect([...states.values()].reduce((n, s) => n + (s.adventure.inventory.wood ?? 0), 0)).toBe(2);
  const winner = (states.get(0)!.adventure.inventory.wood ?? 0) === 2 ? 0 : 1;
  await new Promise(resolve => setTimeout(resolve, 180));
  const p = states.get(0)!.player;
  clients[0].send('action', { type: 'action', tool: 'dig', target: { x: p.x + 1, y: p.y, z: p.z + 1 } });
  await until(() => edits.size === 2 && [...edits.values()].every(n => n > 0));
  await clients[winner].leave(); states.delete(winner); clients[winner] = await connect(winner);
  await until(() => states.has(winner)); expect(states.get(winner)!.adventure.inventory.wood).toBe(2);
  await Promise.all(clients.map(client => client.leave())); clients.length = 0;
  await server.gracefullyShutdown(false);
  const persisted = validateSave(JSON.parse(await readFile(join(directory, 'world.json'), 'utf8')));
  expect(persisted.adventure!.resources.some(n => n.id === dropId)).toBe(false); expect(persisted.edits.length).toBeGreaterThan(0);
  states.clear(); server = await startDedicated(port);
  clients.push(await connect(0), await connect(1)); await until(() => states.size === 2);
  expect(states.get(winner)!.adventure.inventory.wood).toBe(2);
  expect([...states.values()].reduce((n, s) => n + (s.adventure.inventory.wood ?? 0), 0)).toBe(2);
  expect([...states.values()].every(s => !s.adventure.resources.some(n => n.id === dropId))).toBe(true);
 } finally {
  await Promise.all(clients.map(client => client.leave())); await server.gracefullyShutdown(false);
  if (previous === undefined) delete process.env.GAME_SAVE_DIRECTORY; else process.env.GAME_SAVE_DIRECTORY = previous;
  await rm(directory, { recursive: true, force: true });
 }
}, 20000);
