import {blocked, distance} from '../../../src/dungeon/world';
import type {Snapshot} from '../../../src/dungeon/types';

export type RetreatKey = 'KeyS' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyA+KeyS' | 'KeyD+KeyS' | 'KeyA+KeyW' | 'KeyD+KeyW';
const direction = (yaw: number, key: RetreatKey) => {
  const right = Number(key.includes('KeyD')) - Number(key.includes('KeyA'));
  const forward = Number(key.includes('KeyW')) - Number(key.includes('KeyS'));
  const length = Math.max(1, Math.hypot(right, forward));
  return {x: (Math.cos(yaw) * right - Math.sin(yaw) * forward) / length,
    z: (-Math.sin(yaw) * right - Math.cos(yaw) * forward) / length};
};

/** Read-only route planning; every movement still uses the ordinary keyboard. */
export function retreatLaneClearance(snapshot: Snapshot, key: RetreatKey): number {
  const actor = snapshot.actors.find(value => value.id === snapshot.you)!;
  const vector = direction(actor.yaw, key);
  const bodies = [...snapshot.actors, ...snapshot.enemies].filter(value => value.id !== actor.id && value.status === 'alive');
  let clear = 0;
  for (let length = .25; length <= 12; length += .25) {
    const point = {...actor.position, x: actor.position.x + vector.x * length, z: actor.position.z + vector.z * length};
    if (blocked(point, snapshot.seed, snapshot.doors) || bodies.some(value => distance(point, value.position) < .7)) break;
    clear = length;
  }
  return clear;
}

export function retreatThreatClearance(snapshot: Snapshot, key: RetreatKey, length: number): number {
  const actor = snapshot.actors.find(value => value.id === snapshot.you)!;
  const vector = direction(actor.yaw, key);
  const enemies = snapshot.enemies.filter(value => value.status === 'alive');
  let nearest = Infinity;
  for (let step = .25; step <= length; step += .25) {
    const point = {...actor.position, x: actor.position.x + vector.x * step, z: actor.position.z + vector.z * step};
    for (const enemy of enemies) nearest = Math.min(nearest, distance(point, enemy.position));
  }
  return nearest;
}

export function chooseRaidRetreatLane(snapshot: Snapshot): RetreatKey {
  const actor = snapshot.actors.find(value => value.id === snapshot.you)!;
  const candidates = (['KeyS', 'KeyA', 'KeyD', 'KeyW', 'KeyA+KeyS', 'KeyD+KeyS', 'KeyA+KeyW', 'KeyD+KeyW'] as const).map(key => {
    const clearance = retreatLaneClearance(snapshot, key);
    const vector = direction(actor.yaw, key);
    const end = {...actor.position, x: actor.position.x + vector.x * clearance, z: actor.position.z + vector.z * clearance};
    const enemies = snapshot.enemies.filter(value => value.status === 'alive');
    const separation = enemies.length ? Math.min(...enemies.map(value => distance(end, value.position))) : clearance;
    const initial = enemies.length ? Math.min(...enemies.map(value => distance(actor.position, value.position))) : Infinity;
    const closest = retreatThreatClearance(snapshot, key, clearance);
    // A distant endpoint cannot justify running through a pursuer's blade.
    const unsafePass = closest < Math.min(2.1, initial) - .1;
    return {key, clearance, unsafePass, score: clearance + separation * .25 + Math.min(closest, 3) * 2 - (unsafePass ? 100 : 0)};
  });
  // Retain the proven backward escape when it has room for the real heal.
  // Near a wall, a sideways lane avoids repeatedly running into the boundary.
  if (candidates[0].clearance >= 8 && !candidates[0].unsafePass) return 'KeyS';
  // A wall-blocked lane has no sampled threat distances; its Infinity is not
  // evidence of safety. Prefer a traversable lane even when every exit is risky.
  const traversable = candidates.filter(candidate => candidate.clearance > 0);
  const available = traversable.length ? traversable : candidates;
  available.sort((a, b) => b.score - a.score);
  return available[0].key;
}
