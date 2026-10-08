import {expect, it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {blocked, distance} from '../../src/dungeon/world';
import {chooseRaidRetreatLane, retreatLaneClearance, retreatThreatClearance} from '../e2e/helpers/dungeon-retreat-lane';

function fixture(x: number, z: number, yaw = 0) {
  const sim = new DungeonSimulation();
  const player = sim.join('a'.repeat(64), 'Explorer')!;
  sim.command(player.actor.id, 1, {kind: 'ready'});
  sim.command(player.actor.id, 2, {kind: 'start'});
  sim.state.doors.forEach(door => {door.open = true;});
  player.actor.position = {x, y: 0, z}; player.actor.yaw = yaw;
  sim.state.enemies = [];
  return sim.snapshot(player.actor.id);
}

it('uses ordinary backward movement where the central doorway has real runway', () => {
  const snapshot = fixture(0, 3.7);
  expect(retreatLaneClearance(snapshot, 'KeyS')).toBeGreaterThanOrEqual(8);
  expect(chooseRaidRetreatLane(snapshot)).toBe('KeyS');
});

it('takes the clear west strafe instead of backing into the recorded south wall', () => {
  for (const yaw of [0, -.12, .12]) {
    const snapshot = fixture(2.21, 12.52, yaw);
    expect(retreatLaneClearance(snapshot, 'KeyS')).toBeLessThan(3);
    expect(retreatLaneClearance(snapshot, 'KeyD')).toBeLessThan(3);
    expect(retreatLaneClearance(snapshot, 'KeyA')).toBeGreaterThanOrEqual(10);
    expect(chooseRaidRetreatLane(snapshot)).toBe('KeyA');
  }
});

it('respects closed doors and real occupied-body clearance', () => {
  const snapshot = fixture(0, 3.7);
  snapshot.doors.find(door => door.id === 'door-south')!.open = false;
  expect(retreatLaneClearance(snapshot, 'KeyS')).toBeLessThan(1.5);
  snapshot.actors.push({...snapshot.actors[0], id: 'other', position: {x: -1, y: 0, z: 3.7}});
  expect(retreatLaneClearance(snapshot, 'KeyA')).toBeLessThan(1);
  expect(chooseRaidRetreatLane(snapshot)).toBe('KeyD');
});

it('takes a safe forward lane then rounds a corner when a pursuer blocks sideways reversal', () => {
  const snapshot = fixture(-14.6, 14.5, .329);
  snapshot.enemies.push({...snapshot.actors[0], id: 'pursuer', team: -1,
    position: {x: -12.5, y: 0, z: 13.8}, home: {x: -12.5, y: 0, z: 13.8}, alert: 4, lootClaimed: false});
  expect(retreatLaneClearance(snapshot, 'KeyA')).toBeLessThan(2);
  expect(retreatLaneClearance(snapshot, 'KeyD')).toBeLessThan(2);
  let lane = chooseRaidRetreatLane(snapshot);
  expect(lane).toContain('KeyW');
  const actor = snapshot.actors[0], enemy = snapshot.enemies[0];
  for (let step = 0; step < 50 && distance(actor.position, enemy.position) < 4; step++) {
    if (retreatLaneClearance(snapshot, lane) < 2) lane = chooseRaidRetreatLane(snapshot);
    const right = Number(lane.includes('KeyD')) - Number(lane.includes('KeyA'));
    const forward = Number(lane.includes('KeyW')) - Number(lane.includes('KeyS'));
    const scale = .15 / Math.max(1, Math.hypot(right, forward));
    actor.position.x += (Math.cos(actor.yaw) * right - Math.sin(actor.yaw) * forward) * scale;
    actor.position.z += (-Math.sin(actor.yaw) * right - Math.cos(actor.yaw) * forward) * scale;
    expect(blocked(actor.position, snapshot.seed, snapshot.doors)).toBe(false);
    expect(distance(actor.position, enemy.position)).toBeGreaterThan(1.9);
  }
  expect(distance(actor.position, enemy.position)).toBeGreaterThanOrEqual(4);
});

it('rejects a long endpoint whose path passes inside the recorded pursuer melee range', () => {
  const snapshot = fixture(-12.4006, 7.614, -1.70066);
  snapshot.enemies.push({...snapshot.actors[0], id: 'pursuer', team: -1,
    position: {x: -12.0026, y: 0, z: 10.3667}, home: {x: -12.0026, y: 0, z: 10.3667}, alert: 4, lootClaimed: false});
  expect(retreatThreatClearance(snapshot, 'KeyD', retreatLaneClearance(snapshot, 'KeyD'))).toBeLessThan(1);
  const lane = chooseRaidRetreatLane(snapshot);
  expect(lane).not.toBe('KeyD');
  expect(retreatThreatClearance(snapshot, lane, retreatLaneClearance(snapshot, lane))).toBeGreaterThan(2);
});

it('never treats an unsampled wall-blocked lane as a safe escape from a corner', () => {
  const snapshot = fixture(-15.1, 15.1);
  snapshot.enemies.push({...snapshot.actors[0], id: 'pursuer', team: -1,
    position: {x: -14.1, y: 0, z: 14.1}, home: {x: -14.1, y: 0, z: 14.1}, alert: 4, lootClaimed: false});
  expect(retreatLaneClearance(snapshot, 'KeyS')).toBe(0);
  expect(retreatLaneClearance(snapshot, 'KeyD')).toBeGreaterThan(8);
  const lane = chooseRaidRetreatLane(snapshot);
  expect(retreatLaneClearance(snapshot, lane)).toBeGreaterThan(0);
});
