import { expect, it } from 'vitest';
import { SessionAuthority, INPUT_TIMEOUT_TICKS } from '../../src/simulation/session';
import { newMeadows } from '../../src/game/meadows/state';
import { dropItem } from '../../src/game/interaction/drops';
import { legacySimulation } from '../helpers/legacy';
import type { ClientMessage } from '../../src/simulation/protocol';

function session() {
 const save = legacySimulation().save(); save.adventure!.meadows = newMeadows();
 save.adventure!.resources = []; save.adventure!.enemies = [];
 return new SessionAuthority(save);
}
const aim = { x: 0, y: 0, z: 1 };
it('commits a guest pickup exactly once to the world and every snapshot, including after restart', () => {
 const authority = session(), a = authority.join('a'), b = authority.join('b');
 Object.assign(a.player, authority.sim.player); Object.assign(b.player, authority.sim.player);
 dropItem(authority.sim.adventure, 'wood', 2, a.player);
 const id = authority.sim.adventure.state.resources[0].id;
 authority.action('a', { type: 'game-action', action: 'gather', id: String(id), aim });
 expect(a.adventure.state.inventory.wood).toBe(2);
 expect(authority.sim.adventure.state.resources.some(n => n.id === id)).toBe(false);
 expect(b.adventure.state.resources.some(n => n.id === id)).toBe(false);
 expect(() => authority.action('b', { type: 'game-action', action: 'gather', id: String(id), aim })).toThrow();
 expect(b.adventure.state.inventory.wood ?? 0).toBe(0);
 const restored = new SessionAuthority(authority.save());
 expect(restored.join('a').adventure.state.inventory.wood).toBe(2);
 expect(restored.sim.adventure.state.resources.some(n => n.id === id)).toBe(false);
});
it('steps drop physics once per world tick regardless of guest count', () => {
 const solo = session(), coop = session();
 for (const authority of [solo, coop]) dropItem(authority.sim.adventure, 'wood', 1, { ...authority.sim.player, y: authority.sim.player.y + 5 });
 for (let i = 0; i < 3; i++) coop.join('guest' + i);
 solo.step(); coop.step();
 const a = solo.sim.adventure.state.resources.find(n => n.drop)!, b = coop.sim.adventure.state.resources.find(n => n.drop)!;
 expect(b.y).toBeCloseTo(a.y, 12); expect(b.velocity).toEqual(a.velocity);
});
it('keeps host and guest locations distinct in guest views', () => {
 const authority = session(), a = authority.join('a'); a.player.x = 10;
 const view = authority.view('a');
 expect(view.player.x).toBe(10); expect(view.peers.find(p => p.id === 'host')!.player.x).toBe(0);
 expect(authority.sim.player.x).toBe(0);
});
it('shares entity replacement and raid state without leaking personal food or host grave/status', () => {
 const authority = session(), state = authority.sim.adventure.state;
 state.grave = { wood: 20 }; state.poison = 3; state.chill = 4; state.meadows!.foods = [{ id: 'berry', remaining: 100 }];
 const a = authority.join('a');
 expect(a.adventure.state.grave).toEqual({}); expect(a.adventure.state.poison).toBe(0); expect(a.adventure.state.chill).toBe(0);
 expect(a.adventure.state.meadows!.foods).toEqual([]);
 state.resources = []; state.meadows!.raid = 60;
 expect(a.adventure.state.resources).toBe(state.resources); expect(a.adventure.state.meadows!.raid).toBe(60);
 a.adventure.state.resources = [{ id: 3333333, kind: 'wood', amount: 1, ready: 0, ...authority.sim.player }];
 expect(state.resources).toBe(a.adventure.state.resources);
});
it('expires stale movement by simulation tick and does not let duplicate packets renew it', () => {
 const authority = session(), a = authority.join('a');
 authority.input('a', { x: 1, z: 0, jump: false }, 1);
 for (let i = 0; i < INPUT_TIMEOUT_TICKS; i++) authority.step();
 authority.input('a', { x: 1, z: 0, jump: false }, 1);
 authority.step(); expect(a.input).toEqual({ x: 0, z: 0, jump: false });
 authority.input('a', { x: -1, z: 0, jump: false }, 2);
 authority.step(); expect(a.input.x).toBe(-1);
 authority.leave('a'); expect(authority.join('a').input.x).toBe(0);
});
it('rejects malformed commands before cooldown or persistent state changes', () => {
 const authority = session(), a = authority.join('a'), before = authority.save();
 const base = { type: 'game-action', action: 'gather', aim };
 for (const message of [null, {}, { ...base, id: 3 }, { ...base, aim: null }, { ...base, aim: { x: NaN, y: 0, z: 0 } }, { ...base, target: { x: NaN, y: 0, z: 0 } }, { ...base, action: '__proto__' }]) {
  expect(() => authority.action('a', message as unknown as ClientMessage)).toThrow();
 }
 expect(a.lastAction).toBe(-100); expect(authority.save()).toEqual(before);
 expect(() => authority.join('host')).toThrow('Invalid peer');
});
