import { describe, expect, it } from 'vitest';
import { CharacterMotor, CHARACTER_RADIUS, CHARACTER_HEIGHT } from '../../src/physics/character';
import { SdfWorld } from '../../src/world/density';
import { GameSimulation } from '../../src/simulation/game-simulation';
import type { Vec3 } from '../../src/world/types';

const idle = { x: 0, z: 0, jump: false };
function field(density: (p: Vec3) => number) { const world = new SdfWorld(); world.density = density; return world; }
const body = () => ({ x: 0, y: 0, z: 0, vy: 0, grounded: true });

describe('sampled capsule terrain contacts', () => {
  it('lands from a fast fall without sinking below the floor', () => {
    const motor = new CharacterMotor(field(p => p.y)), player = { ...body(), y: 12, grounded: false };
    for (let i = 0; i < 120; i++) { motor.step(player, 0, 0, false, 1 / 30); expect(player.y).toBeGreaterThanOrEqual(-0.004); }
    expect(player.grounded).toBe(true); expect(player.y).toBeCloseTo(0, 3);
  });
  it('keeps capsule clearance while walking up and down an incline', () => {
    const motor = new CharacterMotor(field(p => p.y - p.x * 0.4)), player = body();
    for (let i = 0; i < 60; i++) motor.step(player, 0.05, 0, false, 1 / 30);
    const rise = player.y; expect(rise).toBeGreaterThan(1); expect(player.grounded).toBe(true);
    const clearance = (player.y + CHARACTER_RADIUS - player.x * 0.4) / Math.hypot(1, 0.4);
    expect(clearance).toBeCloseTo(CHARACTER_RADIUS, 2);
    for (let i = 0; i < 60; i++) motor.step(player, -0.05, 0, false, 1 / 30);
    expect(player.y).toBeLessThan(rise - 0.8); expect(player.grounded).toBe(true);
  });
  it('blocks walls using body radius and allows movement along them', () => {
    const motor = new CharacterMotor(field(p => Math.min(p.y, 1 - p.x))), player = body();
    for (let i = 0; i < 80; i++) motor.step(player, 0.05, 0.03, false, 1 / 30);
    expect(player.x).toBeLessThanOrEqual(1 - CHARACTER_RADIUS + 0.004);
    expect(player.z).toBeGreaterThan(2); expect(player.y).toBeCloseTo(0, 2);
  });
  it('stands still on a walkable incline without gravity creating sideways drift', () => {
    const motor = new CharacterMotor(field(p => p.y - p.x * 0.4)), player = body();
    for (let i = 0; i < 30; i++) motor.step(player, 0.05, 0, false, 1 / 30);
    const stoppedX = player.x, stoppedZ = player.z;
    for (let i = 0; i < 180; i++) motor.step(player, 0, 0, false, 1 / 30);
    expect(player.x).toBe(stoppedX); expect(player.z).toBe(stoppedZ); expect(player.grounded).toBe(true);
  });
  it('stops a jump at the ceiling instead of passing the head through it', () => {
    const ceiling = 1.9, motor = new CharacterMotor(field(p => Math.min(p.y, ceiling - p.y))), player = body();
    let highest = 0;
    for (let i = 0; i < 80; i++) { motor.step(player, 0, 0, i === 0, 1 / 30); highest = Math.max(highest, player.y); }
    expect(highest).toBeGreaterThan(0.1); expect(highest + CHARACTER_HEIGHT).toBeLessThanOrEqual(ceiling + 0.004);
    expect(player.grounded).toBe(true);
  });
  it('steps over a small ledge and refuses to climb a steep wall', () => {
    const motor = new CharacterMotor(field(p => Math.min(p.y, Math.max(1 - p.x, p.y - 0.2)))), player = body();
    for (let i = 0; i < 60; i++) motor.step(player, 0.05, 0, false, 1 / 30);
    expect(player.x).toBeGreaterThan(2); expect(player.y).toBeCloseTo(0.2, 2); expect(player.grounded).toBe(true);
    const steep = new CharacterMotor(field(p => p.y - 2 * p.x)), climber = body();
    for (let i = 0; i < 60; i++) { steep.step(climber, 0.05, 0, false, 1 / 30); expect(climber.y).toBeLessThan(0.05); }
  });
  it('falls when the ground under the feet is dug out', () => {
    const sim = new GameSimulation(); for (let i = 0; i < 30; i++) sim.step(idle);
    const before = sim.player.y;
    sim.act('dig', { x: sim.player.x, y: before, z: sim.player.z });
    for (let i = 0; i < 10; i++) sim.step(idle);
    expect(sim.player.grounded).toBe(false); expect(sim.player.y).toBeLessThan(before - 0.3);
  });
  it('moves out of terrain raised underneath the player', () => {
    const sim = new GameSimulation(); for (let i = 0; i < 30; i++) sim.step(idle);
    const before = sim.player.y;
    sim.act('add', { x: sim.player.x, y: before, z: sim.player.z });
    for (let i = 0; i < 5; i++) sim.step(idle);
    expect(sim.player.y).toBeGreaterThan(before + 1);
    expect(sim.world.density({ x: sim.player.x, y: sim.player.y + CHARACTER_RADIUS, z: sim.player.z })).toBeGreaterThan(0.25);
  });
});
