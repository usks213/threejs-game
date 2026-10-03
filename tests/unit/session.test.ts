import { describe, expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
const input = { x: 1, z: 0, jump: false };
describe('shared authoritative session', () => {
 it('moves four players once per fixed tick and rejects repeated sequences and invalid axes', () => {
  const session = new SessionAuthority(); for (const id of ['a', 'b', 'c']) session.join(id);
  const before = session.actors.get('a')!.player.x;
  for (let sequence = 1; sequence <= 30; sequence++) { for (const id of ['host', 'a', 'b', 'c']) session.input(id, input, sequence); session.step(); }
  expect(session.sim.tick).toBe(30); expect(session.actors.get('a')!.player.x).toBeGreaterThan(before + 2);
  session.input('a', { ...input, x: 100 }, 100); expect(session.actors.get('a')!.sequence).toBe(30);
  expect(session.view('b').peers).toHaveLength(3);
 });
 it('shares terrain, crafting and buildings while keeping inventories separate', () => {
  const session = new SessionAuthority(); const guest = session.join('a');
  guest.adventure.state.inventory.wood = 10; guest.adventure.state.inventory.stone = 10;
  session.action('a', { type: 'game-action', action: 'craft', id: 'sword', aim: { x: 0, y: 0, z: -1 } });
  expect(guest.adventure.state.inventory.sword).toBe(1); expect(session.sim.adventure.state.inventory.sword).toBeUndefined();
  session.sim.tick += 8;
  session.action('a', { type: 'action', tool: 'dig', target: { x: 0, y: session.sim.player.y, z: 5 } });
  expect(session.sim.world.edits).toHaveLength(1); expect(session.view('host').adventure.resources).toEqual(session.view('a').adventure.resources);
 });
 it('supports eight dedicated clients and has no phantom host in player snapshots', () => {
  const session = new SessionAuthority(null, true); for (let i = 0; i < 8; i++) session.join('client' + i);
  expect(session.view('client0').peers).toHaveLength(7); expect(() => session.join('ninth')).toThrow();
 });
});

it('preserves guest inventory through reconnect and an authority save/load', () => {
 const session = new SessionAuthority(); session.join('returning').adventure.state.inventory.wood = 17;
 session.leave('returning'); expect(session.join('returning').adventure.state.inventory.wood).toBe(17);
 const restored = new SessionAuthority(session.save()); expect(restored.join('returning').adventure.state.inventory.wood).toBe(17);
});

it('allocates distinct buildings and allows simultaneous terrain edits by different players', () => {
 const session = new SessionAuthority(null, true);
 for (let i = 0; i < 8; i++) {
  const id = 'builder' + i, actor = session.join(id), x = i * 5 - 18;
  Object.assign(actor.player, { x, z: 8, y: session.sim.groundAt(x, 8) });
  actor.adventure.state.inventory.stone = 20;
  session.action(id, { type: 'game-action', action: 'build', id: 'foundation', target: { x, y: session.sim.groundAt(x, 11), z: 11 }, aim: { x: 0, y: 0, z: 1 } });
 }
 const buildings = session.sim.adventure.state.buildings;
 expect(buildings).toHaveLength(8); expect(new Set(buildings.map(b => b.id)).size).toBe(8);
 session.sim.tick += 8;
 for (let i = 0; i < 8; i++) {
  const actor = session.actors.get('builder' + i)!;
  session.action(actor.id, { type: 'action', tool: 'dig', target: { x: actor.player.x, y: actor.player.y, z: 5 } });
 }
 expect(session.sim.world.edits.length).toBeGreaterThanOrEqual(8);
});

it('targets real dedicated players and advances physics away from the unused host origin', () => {
 const session = new SessionAuthority(null, true), actor = session.join('explorer'), sim = session.sim;
 Object.assign(actor.player, { x: 130, z: 10, y: sim.groundAt(130, 10) });
 sim.bodies.push({ id: 200, radius: 0.55, sleeping: false, position: { x: 130, y: actor.player.y + 5, z: 12 }, velocity: { x: 0, y: 0, z: 0 } });
 const enemy = sim.adventure.state.enemies[0]; Object.assign(enemy, { x: 122, z: 10, y: sim.groundAt(122, 10) });
 const previousY = sim.bodies[0].position.y, previousX = enemy.x;
 for (let i = 0; i < 5; i++) session.step();
 expect(sim.bodies[0].position.y).toBeLessThan(previousY);
 expect(enemy.x).toBeGreaterThan(previousX);
});

it('lets a guest pour repeatedly during another action cooldown', () => {
 const session=new SessionAuthority();session.join('water-player');
 session.action('water-player',{type:'game-action',action:'gather',aim:{x:0,y:0,z:-1}});
 for(let i=0;i<3;i++)session.action('water-player',{type:'action',tool:'water',target:{x:10000,y:10000,z:10000}});
 expect([...session.sim.fluid.cells.values()].reduce((n,c)=>n+c.volume,0)).toBeCloseTo(36);
});
