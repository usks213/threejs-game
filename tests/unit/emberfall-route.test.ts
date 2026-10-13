import { describe, expect, it } from 'vitest';
import { random } from '../../src/emberfall/generation';
import { Run, idleInput } from '../../src/emberfall/simulation';

/** Acceptance driver: reads game state, but moves/flies/fires/interacts only via input. */
function routeNodes(seed: number, level: number) {
  const rng = random(seed + level * 1879);
  const nodes = [];
  for (let i = 1; i <= 7; i++) nodes.push({ x: i % 2 ? 185 + Math.floor(rng() * 20) : 48 + Math.floor(rng() * 28), y: 20 + i * 46 });
  nodes.push({ x: 213, y: 355 });
  return nodes;
}

function travel(seed: number, allLayers = false) {
  const run = new Run(seed);
  let node = 0;
  const checkpoints: object[] = [];
  let route = routeNodes(seed, run.level);
  for (let frame = 0; frame < 60 * 180; frame++) {
    if (run.phase === 'refuge' && allLayers) {
      checkpoints.push({ refuge: run.level, hp: run.player.hp, gold: run.gold, offers: [...run.perkOffers], time: Math.round(run.time) });
      const preferred = (['heat', 'heart', 'reservoir', 'ascent', 'magnet', 'workshop'] as const).find(p => run.perkOffers.includes(p));
      if (!preferred || !run.choosePerk(preferred)) break;
      const available = () => [...run.spells, ...run.wands[0].spells];
      if (!available().includes('lance')) run.buySpell('lance', 35);
      if (!available().includes('force')) run.buySpell('force', 25);
      if (available().includes('lance')) expect(run.editRunWand(0, available().includes('force') ? ['force', 'lance'] : ['lance'])).toBe(true);
      if (!run.descend()) break;
      node = 0; route = routeNodes(seed, run.level);
    }
    if (run.phase !== 'playing') break;
    const target = route[node];
    const p = run.player;
    if (Math.abs(p.x - target.x) < 9 && p.y >= target.y - 3 && node < route.length - 1) {
      checkpoints.push({ node, x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), gold: run.gold, time: Math.round(run.time) });
      node++;
    }
    const next = route[node];
    const nearest = run.enemies.filter(e => run.lineOfSight(p.x, p.y - 1, e.x, e.y)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const aim = nearest ?? next;
    const dx = next.x - p.x;
    const input = { ...idleInput(), move: Math.abs(dx) > 2 ? Math.sign(dx) : 0, fly: p.y > next.y + 6, fire: !!nearest, aimX: aim.x - p.x, aimY: aim.y - (p.y - 1), interact: node === route.length - 1 };
    run.step(1 / 60, input);
  }
  return { run, node, checkpoints };
}

describe('real-input cave route', () => {
  it.each([3397, 1, 7, 42, 2026])('seed %i reaches the first refuge with normal health, combat, and collectible loot', (seed) => {
    const { run, node, checkpoints } = travel(seed);
    if (process.env.EMBERFALL_ROUTE_TRACE === '1') console.log(JSON.stringify({ phase: run.phase, node, player: run.player, time: run.time, gold: run.gold, kills: run.kills, checkpoints }));
    expect(run.phase, JSON.stringify({ seed, node, x: run.player.x, y: run.player.y, hp: run.player.hp, checkpoints })).toBe('refuge');
    expect(run.kills).toBeGreaterThan(0);
    expect(run.gold).toBeGreaterThan(0);
  }, 60000);

  it('crosses all three biomes and defeats the final warden through normal controls', () => {
    const { run, node, checkpoints } = travel(3397, true);
    if (process.env.EMBERFALL_ROUTE_TRACE === '1') console.log(JSON.stringify({ phase: run.phase, level: run.level, node, player: run.player, time: run.time, gold: run.gold, kills: run.kills, perks: run.perks, enemies: run.enemies, checkpoints }));
    expect(run.phase, JSON.stringify({ level: run.level, node, x: run.player.x, y: run.player.y, hp: run.player.hp, checkpoints })).toBe('won');
    expect(run.level).toBe(2);
    expect(run.kills).toBeGreaterThanOrEqual(8);
    expect(run.perks).toHaveLength(2);
  }, 60000);
});
