import { legacySimulation } from '../helpers/legacy';
import { it, expect } from 'vitest';
import { Client } from '@colyseus/sdk';
import { startDedicated } from '../../apps/dedicated/server';
import type { Snapshot } from '../../src/simulation/protocol';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playerIdentity } from '../../apps/dedicated/identity';
import { SessionAuthority } from '../../src/simulation/session';
import { validateSave } from '../../src/save/format';
it('runs the Node authority with eight actual Colyseus clients and confirms authoritative edits', async () => {
 const port = 29000 + Math.floor(Math.random() * 1000), server = await startDedicated(port);
 const clients: Awaited<ReturnType<Client['joinOrCreate']>>[] = [];
 try {
  for (let i = 0; i < 8; i++) clients.push(await new Client('http://127.0.0.1:' + port).joinOrCreate('survival'));
  const positions = new Map<string, number>(), edits = new Set<string>();
  for (const room of clients) { room.onMessage('welcome', () => {}); room.onMessage('notice', () => {}); room.onMessage('edits', (log: unknown[]) => { if (log.length > 0) edits.add(room.sessionId); }); room.onMessage('snapshot', (state: Snapshot) => { positions.set(room.sessionId, state.player.x); }); }
  // A fixed sleep can finish before all eight first snapshots on a busy runner.
  const until=async(predicate:()=>boolean)=>{const deadline=Date.now()+6000;while(!predicate()){if(Date.now()>deadline)throw Error('Eight-client authority state did not converge');await new Promise(resolve=>setTimeout(resolve,30));}};
  await until(()=>positions.size===8&&[...positions.values()].every(Number.isFinite));
  const initial = new Map(positions);
  for (let sequence = 1; sequence <= 20; sequence++) { for (const room of clients) room.send('input', { input: { x: 1, z: 0, jump: false }, sequence }); await new Promise(resolve => setTimeout(resolve, 35)); }
  await until(()=>clients.every(room=>(positions.get(room.sessionId)??-Infinity)>initial.get(room.sessionId)!+1));
  expect(positions.size).toBe(8); for (const room of clients) expect(positions.get(room.sessionId)!).toBeGreaterThan(initial.get(room.sessionId)! + 1);
  clients[0].send('action', { type: 'action', tool: 'dig', target: { x: 4, y: 1, z: 8 } });
  await until(()=>edits.size===8);expect(edits.size).toBe(8);
 } finally { await Promise.all(clients.map(room => room.leave())); await server.gracefullyShutdown(false); }
}, 15000);

it('supports eight clients building, fighting and editing amid water and 128 bodies, then restores a returning player', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'survival-load-')), previousDirectory = process.env.GAME_SAVE_DIRECTORY;
 const seed = new SessionAuthority(legacySimulation().save(), true), sim = seed.sim;
 const tokens = Array.from({ length: 8 }, (_, i) => (i + 1).toString(16).padStart(64, '0'));
 sim.adventure.state.resources = []; sim.adventure.state.enemies = [];
 for (let i = 0; i < 8; i++) {
  const actor = seed.join(playerIdentity(tokens[i], 'unused')), x = (i % 4) * 6 - 9, z = 5 + Math.floor(i / 4) * 6;
  Object.assign(actor.player, { x, z, y: sim.groundAt(x, z) });
  actor.adventure.state.inventory = { wood: 50, stone: 50, berry: 3 };
  sim.adventure.state.enemies.push({ id: 1000 + i, definition: 'boar', tier: 1, health: 80, x, z: z - 1.5, y: sim.groundAt(x, z - 1.5), homeX: x, homeZ: z - 1.5, cooldown: 1, windup: 0, slow: 0, boss: false });
 }
 for (let i = 0; i < 128; i++) {
  const x = i % 16 * 1.3 - 10, z = Math.floor(i / 16) * 1.3 + 16;
  sim.bodies.push({ id: i + 1, radius: 0.55, kind: i % 2 ? 'wood' : 'rock', sleeping: false, position: { x, y: sim.groundAt(x, z) + 2.5, z }, velocity: { x: 0, y: 0, z: 0 } });
 }
 for (let x = -4; x <= 4; x++) for (let z = 18; z <= 22; z++) sim.fluid.add({ x, y: sim.groundAt(x, z) + 2, z }, 1);
 await writeFile(join(directory, 'world.json'), JSON.stringify(seed.save()));
 process.env.GAME_SAVE_DIRECTORY = directory;
 const port = 30000 + Math.floor(Math.random() * 1000), server = await startDedicated(port);
 const clients: Awaited<ReturnType<Client['joinOrCreate']>>[] = [], states = new Map<number, Snapshot>(), notices: string[] = [], ticks: number[] = [], receivedEdits = new Map<number, number>();
 let completed = false;
 const connect = async (index: number) => {
  const room = await new Client('http://127.0.0.1:' + port).joinOrCreate('survival', { playerToken: tokens[index] });
  room.onMessage('welcome', () => {}); room.onMessage('notice', (message: string) => notices.push(message));
  room.onMessage('edits', (edits: unknown[]) => receivedEdits.set(index, edits.length));
  room.onMessage('snapshot', (state: Snapshot) => { states.set(index, state); if (index === 0) ticks.push(state.metrics.tickMs); });
  return room;
 };
 const until = async (predicate: () => boolean) => {
  const limit = performance.now() + 6000;
  while (!predicate()) { if (performance.now() > limit) throw new Error('Multiplayer state did not converge: ' + notices.join(' / ')); await new Promise(resolve => setTimeout(resolve, 40)); }
 };
 try {
  for (let i = 0; i < 8; i++) clients.push(await connect(i));
  await until(() => states.size === 8);
  for (const state of states.values()) { expect(state.peers).toHaveLength(7); expect(state.bodies).toHaveLength(128); expect(state.fluids.length).toBeGreaterThan(0); }
  for (const client of clients) client.send('action', { type: 'game-action', action: 'craft', id: 'sword', aim: { x: 0, y: 0, z: -1 } });
  await until(() => [...states.values()].every(s => s.adventure.inventory.sword === 1));
  await new Promise(resolve => setTimeout(resolve, 180));
  for (const client of clients) client.send('action', { type: 'game-action', action: 'attack', aim: { x: 0, y: 0, z: -1 } });
  await until(() => states.get(0)!.adventure.enemies.filter(e => e.id >= 1000 && e.id < 1008 && e.health < 80).length === 8);
  await new Promise(resolve => setTimeout(resolve, 180));
  for (let i = 0; i < 8; i++) {
   const p = states.get(i)!.player, x = Math.round(p.x - 2), z = Math.round(p.z + 2);
   clients[i].send('action', { type: 'game-action', action: 'build', id: 'foundation', target: { x, y: sim.groundAt(x, z), z }, aim: { x: 0, y: 0, z: -1 } });
  }
  await until(() => [...states.values()].every(s => s.adventure.buildings.length === 8));
  expect(new Set(states.get(0)!.adventure.buildings.map(b => b.id)).size).toBe(8);
  await new Promise(resolve => setTimeout(resolve, 180));
  for (let i = 0; i < 8; i++) { const p = states.get(i)!.player; clients[i].send('action', { type: 'action', tool: i % 2 ? 'water' : 'dig', target: { x: p.x + 2, y: sim.groundAt(p.x + 2, p.z + 3), z: p.z + 3 } }); }
  await until(() => receivedEdits.size === 8 && [...receivedEdits.values()].every(n => n >= 4));
  for (let sequence = 1; sequence <= 30; sequence++) { for (const client of clients) client.send('input', { sequence, input: { x: 0, z: -0.5, jump: sequence % 15 === 1 } }); await new Promise(resolve => setTimeout(resolve, 35)); }
  await until(() => [...states.values()].every(s => s.ack === 30));
  const wood = states.get(0)!.adventure.inventory.wood;
  await clients[0].leave(); states.delete(0); clients[0] = await connect(0);
  await until(() => states.has(0));
  expect(states.get(0)!.adventure.inventory.wood).toBe(wood); expect(states.get(0)!.adventure.inventory.sword).toBe(1);
  ticks.sort((a, b) => a - b); const p95 = ticks[Math.floor(ticks.length * 0.95)];
  const report = { workload: '8 real clients / combat / 8 buildings / water / 128 bodies / terrain / reconnect', tickSamples: ticks.length, simulationTickP95Ms: Number(p95.toFixed(2)), targetTickMs: 1000 / 30, targetMet: p95 <= 1000 / 30, excludes: 'browser GPU and network serialization' };
  if (process.env.CI) { await mkdir('test-results', { recursive: true }); await writeFile('test-results/dedicated-load.json', JSON.stringify(report, null, 2)); }
  completed = true;
  expect(p95).toBeLessThan(100); // Detect severe regressions; report against the 33.3 ms target separately.
 } finally {
  await Promise.all(clients.map(room => room.leave())); await server.gracefullyShutdown(false);
  if (previousDirectory === undefined) delete process.env.GAME_SAVE_DIRECTORY; else process.env.GAME_SAVE_DIRECTORY = previousDirectory;
  try { const saved = validateSave(JSON.parse(await readFile(join(directory, 'world.json'), 'utf8'))); if (completed) { expect(saved.members).toHaveLength(8); expect(saved.adventure!.buildings).toHaveLength(8); } }
  finally { await rm(directory, { recursive: true, force: true }); }
 }
}, 30000);
