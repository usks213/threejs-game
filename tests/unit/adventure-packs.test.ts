import { expect, it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { stepAdventureEnemy, adventureSees, encounterMetrics } from '../../src/game/adventure-enemies';
import { makeAdventureEnemy } from '../../src/game/adventure-exploration';
function fixture(kind = 'walker') {
 const sim = new GameSimulation(); sim.world.density = p => p.y < 0 ? -1 : 1; sim.fluid.restore([]); sim.bodies.length = 0;
 sim.skybound.state.parts = []; sim.adventure.state.resources = []; sim.adventure.state.buildings = []; sim.adventure.state.enemies = [];
 Object.assign(sim.player, { x: 20, y: 0, z: 8, grounded: true });
 const enemy = makeAdventureEnemy(sim, kind, { x: 24, y: 0, z: 8 }); enemy.cooldown = 0; sim.adventure.state.enemies.push(enemy);
 return { sim, enemy };
}
function brain(sim: GameSimulation, frames = 1) { for (let i = 0; i < frames; i++) { sim.tick++; sim.adventure.state.seconds += 1 / 30; for (const e of sim.adventure.state.enemies) stepAdventureEnemy(sim.adventure, e, 1 / 30); } }
it('coordinates a close pack into no more than two simultaneous windups and gives waiting members a turn', () => {
 const { sim } = fixture(); sim.adventure.state.enemies = Array.from({ length: 5 }, (_, i) => { const e = makeAdventureEnemy(sim, 'reedspitter', { x: 26 + i * .25, y: 0, z: 8 }); e.cooldown = 0; return e; });
 const attacking = new Set<number>();
 for (let i = 0; i < 160; i++) { brain(sim); const active = sim.adventure.state.enemies.filter(e => e.windup > 0); expect(active.length).toBeLessThanOrEqual(2); active.forEach(e => attacking.add(e.id)); }
 expect(attacking.size).toBe(5); expect(encounterMetrics(sim).processed).toBe(5);
});
it('shares a visible last-seen position through an ally rather than tracking a player behind a wall', () => {
 const { sim, enemy: scout } = fixture(); Object.assign(scout, { x: 23, z: 11, homeX: 23, homeZ: 11 });
 const hidden = makeAdventureEnemy(sim, 'walker', { x: 24, y: 0, z: 8 }); sim.adventure.state.enemies.push(hidden);
 sim.world.density = p => p.y < 0 || p.x > 21.5 && p.x < 22 && p.z > 7.2 && p.z < 8.8 && p.y < 3 ? -1 : 1;
 expect(adventureSees(sim.adventure, scout, sim.player)).toBe(true); expect(adventureSees(sim.adventure, hidden, sim.player)).toBe(false);
 brain(sim); expect(hidden.attackKind).toBe('pursue'); expect(hidden.alerted).toBeGreaterThan(3);
 sim.player.x = 55; const oldX = hidden.x; brain(sim, 20); expect(hidden.x).toBeLessThan(oldX + .1);
 brain(sim, 170); expect(hidden.alerted).toBe(0); expect(hidden.attackKind).toBe('idle');
});
it('does not share a call through a wall between allies', () => {
 const { sim, enemy } = fixture(); const separated = makeAdventureEnemy(sim, 'walker', { x: 24, y: 0, z: 12 }); sim.adventure.state.enemies.push(separated);
 sim.world.density = p => p.y < 0 || p.z > 9 && p.z < 10 && p.y < 3 ? -1 : 1;
 expect(adventureSees(sim.adventure, enemy, sim.player)).toBe(true); expect(adventureSees(sim.adventure, separated, sim.player)).toBe(false);
 brain(sim); expect(separated.attackKind).toBe('idle'); expect(separated.alerted ?? 0).toBe(0);
});
it('uses water to extinguish burning enemies and interrupt a cinder dash while keeping close combat', () => {
 const { sim, enemy } = fixture('cinderunner'); brain(sim); expect(enemy.attackKind).toBe('charge'); expect(enemy.windup).toBeGreaterThan(0);
 const health = enemy.health; enemy.burn = 2; sim.fluid.immersion = () => .7; brain(sim);
 expect(enemy.burn).toBe(0); expect(enemy.health).toBe(health); expect(enemy.attackKind).toBe('quenched'); expect(enemy.windup).toBe(0); expect(enemy.attackReady!.dashUntil).toBe(0);
 const from = enemy.x; brain(sim, 35); expect(enemy.x).toBeLessThan(from); expect(enemy.attackKind).not.toBe('charge');
 Object.assign(enemy, { x: 21, z: 8, cooldown: 0 }); enemy.attackReady!.recoverUntil = 0; brain(sim); expect(enemy.attackKind).toBe('melee');
});
it('makes reed spitters abandon a shot and flee a visible lit fire without fleeing an extinguished one', () => {
 const { sim, enemy } = fixture('reedspitter'); sim.adventure.state.buildings.push({ id: 777, definition: 'fire', x: 25.8, y: 0, z: 8, rotation: 0, support: 4, contents: {}, fuel: 20 });
 enemy.windup = .4; const x = enemy.x; brain(sim, 10); expect(enemy.windup).toBe(0); expect(enemy.attackKind).toBe('flee'); expect(enemy.x).toBeLessThan(x); expect(sim.adventure.projectiles).toHaveLength(0);
 sim.adventure.state.buildings[0].fuel = 0; brain(sim); expect(enemy.attackKind).not.toBe('flee');
});
