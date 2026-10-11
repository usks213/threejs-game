import type {Snapshot} from '../../../src/dungeon/types';
import {blocked, solidWalls, wallRay} from '../../../src/dungeon/world';

type Point = {x: number; z: number};
type Bounds = {min: Point; max: Point; core?: Bounds};
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const inside = (p: Point, b: Bounds) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z;
function crosses(a: Point, b: Point, bounds: Bounds) {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'z'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] <= bounds.min[axis] || a[axis] >= bounds.max[axis]) return false;
    } else {
      const entry = (bounds.min[axis] - a[axis]) / delta, exit = (bounds.max[axis] - a[axis]) / delta;
      lo = Math.max(lo, Math.min(entry, exit)); hi = Math.min(hi, Math.max(entry, exit));
    }
  }
  return lo < hi;
}
function obstacles(snapshot: Snapshot): Bounds[] {
  return [
    ...solidWalls(snapshot.seed, snapshot.doors).map(w => ({
      min: {x: w.min.x - .65, z: w.min.z - .65}, max: {x: w.max.x + .65, z: w.max.z + .65},
      core: {min: {x: w.min.x - .3, z: w.min.z - .3}, max: {x: w.max.x + .3, z: w.max.z + .3}},
    })),
    ...snapshot.actors.filter(a => a.id !== snapshot.you && a.status === 'alive').map(a => ({
      min: {x: a.position.x - .75, z: a.position.z - .75}, max: {x: a.position.x + .75, z: a.position.z + .75},
      core: {min: {x: a.position.x - .62, z: a.position.z - .62}, max: {x: a.position.x + .62, z: a.position.z + .62}},
    })),
  ];
}

/** Read-only geometry planning after combat. Returned waypoints are walked using real keys. */
export function raidSafeRoute(snapshot: Snapshot, target: Point): Point[] {
  if (snapshot.enemies.some(enemy => enemy.status === 'alive')) throw new Error('Safe loot routing requires the four ordinary AI defeats first');
  const start = snapshot.actors.find(a => a.id === snapshot.you)!.position;
  const bounds = obstacles(snapshot);
  if (bounds.some(b => inside(target, b))) throw new Error(`Loot route target is obstructed: ${JSON.stringify(target)}`);
  // Corners have .35m extra margin beyond the clearance rectangle, keeping
  // normal steering/waypoint settling away from the actual .3m collision hull.
  const egress = bounds.filter(b => inside(start, b)).flatMap(b => [
    {x: start.x, z: b.min.z - .35}, {x: start.x, z: b.max.z + .35},
    {x: b.min.x - .35, z: start.z}, {x: b.max.x + .35, z: start.z},
  ]);
  const nodes: Point[] = [start, target, ...[...egress, ...bounds.flatMap(b => [
    {x: b.min.x - .35, z: b.min.z - .35}, {x: b.min.x - .35, z: b.max.z + .35},
    {x: b.max.x + .35, z: b.min.z - .35}, {x: b.max.x + .35, z: b.max.z + .35},
  ])].filter(p => !bounds.some(b => inside(p, b)))];
  const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  distances[0] = 0;
  while (true) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) throw new Error('No clear ordinary route to loot/extraction');
    if (current === 1) break;
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || bounds.some(b => {
        // A real settled body can be closer to a wall than the planning margin.
        // Permit only a short first step outward that clears its true hull;
        // subsequent segments retain the full margin. Never allow a shortcut
        // through the obstacle or a segment that remains inside its margin.
        if (current === 0 && inside(start, b)) return inside(nodes[next], b) || length(start, nodes[next]) > 1.6 || crosses(start, nodes[next], b.core!);
        return crosses(nodes[current], nodes[next], b);
      })) continue;
      const candidate = distances[current] + length(nodes[current], nodes[next]);
      if (candidate < distances[next]) { distances[next] = candidate; previous[next] = current; }
    }
  }
  const route: Point[] = [];
  for (let index = 1; index !== 0; index = previous[index]) route.unshift(nodes[index]);
  return route;
}

/** Keep both looters visible/reachable even when combat displaced a corpse beside a pillar. */
export function raidCorpseApproaches(snapshot: Snapshot, corpse: Point) {
  // A legal corpse may sit only .3m from a wall. Move the shared staging
  // center inward instead of requiring both looters to straddle that wall.
  for (const offset of [0, .45, .8, 1.1]) for (let centerAngle = 0; centerAngle < (offset ? 16 : 1); centerAngle++) {
    const center = {x: corpse.x + offset * Math.cos(centerAngle * Math.PI / 8), z: corpse.z + offset * Math.sin(centerAngle * Math.PI / 8)};
    for (let i = 0; i < 16; i++) {
      const yaw = i * Math.PI / 16, direction = {x: Math.cos(yaw), z: Math.sin(yaw)};
      const point = (sign: number, radius: number) => ({x: center.x + sign * radius * direction.x, z: center.z + sign * radius * direction.z});
      const loot = [point(1, .8), point(-1, .8)], duel = [point(1, .65), point(-1, .65)];
      if ([...loot, ...duel].some(p => blocked({...p, y: 0}, snapshot.seed, snapshot.doors, .7) || wallRay({...p, y: 1.3}, {...corpse, y: 1.3}, snapshot.seed, snapshot.doors))) continue;
      return {loot, duel};
    }
  }
  throw new Error(`No clear opposing loot/duel positions at ${JSON.stringify(corpse)}`);
}
