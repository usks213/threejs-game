import {expect, it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {blocked, distance} from '../../src/dungeon/world';
import {raidCorpseApproaches, raidSafeRoute} from '../e2e/helpers/dungeon-safe-route';

function fixture(seed = 7919) {
  const sim = new DungeonSimulation();
  const player = sim.join('a'.repeat(64), 'Explorer')!;
  sim.command(player.actor.id, 1, {kind: 'ready'}); sim.command(player.actor.id, 2, {kind: 'start'});
  sim.state.seed = seed; sim.state.doors.forEach(door => {door.open = true;});
  sim.state.enemies.forEach(enemy => {enemy.status = 'dead'; enemy.hp = 0;});
  player.actor.position = {x: .05, y: 0, z: .077};
  return sim.snapshot(player.actor.id);
}
function clearSegments(snapshot: ReturnType<typeof fixture>, route: {x: number; z: number}[], clearance = .4) {
  let from = snapshot.actors[0].position;
  for (const waypoint of route) {
    const steps = Math.ceil(Math.hypot(waypoint.x - from.x, waypoint.z - from.z) / .025);
    for (let i = 0; i <= steps; i++) {
      const p = {x: from.x + (waypoint.x - from.x) * i / steps, y: 0, z: from.z + (waypoint.z - from.z) * i / steps};
      expect(blocked(p, snapshot.seed, snapshot.doors, clearance)).toBe(false);
      for (const other of snapshot.actors.filter(a => a.id !== snapshot.you && a.status === 'alive')) expect(distance(p, other.position)).toBeGreaterThan(.62);
    }
    from = {...waypoint, y: 0};
  }
}
it('routes the recorded displaced corpse through the open south doorway, not its solid wall', () => {
  const snapshot = fixture(), target = {x: -8.36374180460485, z: 10.44716910519834};
  // Original hard-coded +1m endpoint is itself too close to the pillar.
  expect(() => raidSafeRoute(snapshot, target)).toThrow('obstructed');
  const safe = raidCorpseApproaches(snapshot, {x: -9.36374180460485, z: 10.44716910519834}).loot[0];
  const route = raidSafeRoute(snapshot, safe);
  expect(route.length).toBeGreaterThan(1); expect(route.at(-1)).toEqual(safe);
  clearSegments(snapshot, route);
});
it.each([7919, 7920])('avoids both seed layouts and nearby living explorers for corpse and extraction routes (%i)', seed => {
  for (const corpse of [{x: -9.36, z: 10.45}, {x: -9, z: 7}, {x: 9, z: 7}, {x: 0, z: 2}, {x: 12, z: -11}, {x: -9.36, z: 7.5}, {x: -10.5, z: 9}, {x: -7.5, z: 9}, {x: -14.95, z: 11}]) {
    const snapshot = fixture(seed), approach = raidCorpseApproaches(snapshot, corpse);
    snapshot.actors.push({...snapshot.actors[0], id: 'other', position: {x: 0, y: 0, z: -2}});
    clearSegments(snapshot, raidSafeRoute(snapshot, approach.loot[0]));
    snapshot.actors[0].position = {...approach.loot[0], y: 0};
    clearSegments(snapshot, raidSafeRoute(snapshot, {x: -12, z: 12}));
    for (const p of [...approach.loot, ...approach.duel]) { expect(blocked({...p, y: 0}, seed, snapshot.doors, .65)).toBe(false); expect(Math.hypot(p.x - corpse.x, p.z - corpse.z)).toBeLessThan(2.2); }
    expect(Math.hypot(approach.duel[0].x - approach.duel[1].x, approach.duel[0].z - approach.duel[1].z)).toBeCloseTo(1.3);
  }
});
it('routes around another living explorer and refuses closed-door shortcuts or live-combat planning', () => {
  const snapshot = fixture();
  snapshot.actors.push({...snapshot.actors[0], id: 'other', position: {x: 0, y: 0, z: 3}});
  clearSegments(snapshot, raidSafeRoute(snapshot, {x: 0, z: 7}));
  snapshot.doors.find(door => door.id === 'door-south')!.open = false;
  expect(() => raidSafeRoute(snapshot, {x: 0, z: 7})).toThrow('No clear ordinary route');
  snapshot.enemies[0].status = 'alive';
  expect(() => raidSafeRoute(snapshot, {x: 0, z: 7})).toThrow('four ordinary AI defeats');
});

it('takes a short legal egress when ordinary settling starts inside the planning margin', () => {
  const snapshot = fixture();
  snapshot.actors[0].position = {x: -9, y: 0, z: 10.42};
  expect(blocked(snapshot.actors[0].position, snapshot.seed, snapshot.doors, .65)).toBe(true);
  expect(blocked(snapshot.actors[0].position, snapshot.seed, snapshot.doors, .3)).toBe(false);
  const route = raidSafeRoute(snapshot, {x: -12, z: 12});
  expect(Math.hypot(route[0].x + 9, route[0].z - 10.42)).toBeLessThanOrEqual(1.6);
  clearSegments(snapshot, route, .3);
});
