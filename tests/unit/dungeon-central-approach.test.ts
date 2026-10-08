import {expect, it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {blocked, distance} from '../../src/dungeon/world';
import {CENTRAL_APPROACH} from '../e2e/helpers/dungeon-central-approach';

function staged() {
  const sim = new DungeonSimulation();
  const players = ['a', 'b'].map(key => sim.join(key.repeat(64), key)!);
  for (const player of players) {
    sim.command(player.actor.id, 1, {kind: 'class', classId: 'keeper'});
    sim.command(player.actor.id, 2, {kind: 'ready'});
  }
  sim.command(players[0].actor.id, 3, {kind: 'start'});
  players.forEach((player, i) => {player.actor.position = {...CENTRAL_APPROACH[i].point, y: 0};});
  // Isolate the central targeting rule; the browser separately requires all
  // four original enemies and both outer encounters through ordinary input.
  sim.state.enemies.filter(enemy => ['e2', 'e3'].includes(enemy.id)).forEach(enemy => {enemy.status = 'dead'; enemy.hp = 0;});
  return {sim, players};
}
it('keeps both actual door controls reachable and guard assignments distinct despite settling error', () => {
  const {sim, players} = staged();
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    [a, b].forEach((angle, index) => {
      const point = CENTRAL_APPROACH[index].point;
      players[index].actor.position = {x: point.x + .24 * Math.cos(angle * Math.PI / 8), y: 0, z: point.z + .24 * Math.sin(angle * Math.PI / 8)};
    });
    CENTRAL_APPROACH.forEach((approach, index) => {
      const actor = players[index].actor, guard = sim.state.enemies.find(enemy => enemy.id === approach.enemy)!;
      const door = sim.state.doors.find(door => door.id === approach.door)!;
      expect(blocked(actor.position, sim.state.seed, sim.state.doors)).toBe(false);
      expect(distance(actor.position, door.position)).toBeLessThan(2.2);
      expect(distance(players[1 - index].actor.position, guard.position) - distance(actor.position, guard.position)).toBeGreaterThan(.35);
    });
  }
});
it.each([0, 1])('preserves split enemy targeting even when door %i opens a second earlier', first => {
  const {sim, players} = staged();
  const open = (index: number) => sim.command(players[index].actor.id, 4, {kind: 'interact', target: CENTRAL_APPROACH[index].door});
  expect(open(first)).toBe('扉を開きました');
  for (let tick = 0; tick < 20; tick++) sim.step();
  const assigned = sim.state.enemies.find(enemy => enemy.id === CENTRAL_APPROACH[first].enemy)!;
  const waiting = sim.state.enemies.find(enemy => enemy.id === CENTRAL_APPROACH[1 - first].enemy)!;
  expect(Math.sign(assigned.position.z)).toBe(first === 0 ? 1 : -1);
  expect(waiting.position.z).toBe(0);
  expect(open(1 - first)).toBe('扉を開きました');
  for (let tick = 0; tick < 20; tick++) sim.step();
  expect(sim.state.enemies.find(enemy => enemy.id === 'e0')!.position.z).toBeGreaterThan(0);
  expect(sim.state.enemies.find(enemy => enemy.id === 'e1')!.position.z).toBeLessThan(0);
  expect(players.every(player => player.actor.hp === 110)).toBe(true);
});
