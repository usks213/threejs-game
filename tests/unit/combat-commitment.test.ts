import { describe, expect, it, vi } from 'vitest';
import { legacySimulation } from '../helpers/legacy';
import { combatAim, horizontalAim } from '../../src/game/combat/direction';
import { newMeadows } from '../../src/game/meadows/state';
import type { EnemyState } from '../../src/game/types';

function setup() {
 const sim = legacySimulation(), game = sim.adventure;
 game.state.resources = []; game.state.buildings = []; game.state.enemies = [];
 Object.assign(sim.player, { x: 0, y: 10, z: 0, heading: Math.PI, grounded: true });
 sim.world.density = () => 1;
 const enemy = (x: number, z: number): EnemyState => {
  const target: EnemyState = { id: sim.allocateEntityId(), definition: 'slime', tier: 1, x, y: 10, z,
   homeX: x, homeZ: z, health: 100, cooldown: 10, windup: 0, slow: 0, boss: false, alerted: 10 };
  game.state.enemies.push(target); return target;
 };
 return { sim, game, enemy };
}

describe('committed player combat', () => {
 it('never hits behind or sideways at point-blank range, even with a pitched aim', () => {
  const { game, enemy } = setup(), front = enemy(0, -.6), back = enemy(0, .6), side = enemy(.6, 0);
  game.action('attack', '', undefined, { x: 0, y: -.98, z: -.2 });
  game.stepPersonal(.15);
  expect(front.health).toBe(100);
  game.stepPersonal(.02);
  expect(front.health).toBe(93);
  expect(back.health).toBe(100); expect(side.health).toBe(100);
  game.stepPersonal(.3);
  expect(front.health).toBe(93);
 });

 it('keeps heavy attacks directional and waits for their longer windup', () => {
  const { game, enemy } = setup(), front = enemy(.7, -.7), back = enemy(0, .5);
  game.action('heavy'); game.stepPersonal(.3);
  expect(front.health).toBe(100);
  game.stepPersonal(.03);
  expect(front.health).toBeCloseTo(100 - 7 * 1.7);
  expect(back.health).toBe(100);
 });

 it('still respects weapon reach and terrain occlusion', () => {
  const { sim, game, enemy } = setup(), distant = enemy(0, -2.3), hidden = enemy(0, -1);
  sim.world.density = p => p.z < -.1 && p.z > -.4 ? -1 : 1;
  game.action('attack'); game.stepPersonal(.2);
  expect(distant.health).toBe(100); expect(hidden.health).toBe(100);
 });

 it('does not let dodge or guard cancel either windup or recovery', () => {
  const { game, enemy } = setup(), target = enemy(0, -1);
  game.action('attack');
  const stamina = game.state.stamina;
  expect(() => game.action('dodge')).toThrow('回復');
  game.action('guard', 'on'); expect(game.guarding).toBe(false);
  game.stepPersonal(.2);
  expect(target.health).toBe(93);
  expect(() => game.action('dodge')).toThrow('回復');
  expect(game.guarding).toBe(false);
  expect(game.state.stamina).toBe(stamina);
  game.stepPersonal(.16);
  expect(game.guarding).toBe(true);
  expect(() => game.action('dodge')).not.toThrow();
  expect(game.guarding).toBe(false);
 });

 it.each([.1, .2])('clears held guard released at %s seconds before attack recovery ends', elapsed => {
  const { game } = setup(); game.action('attack'); game.stepPersonal(elapsed);
  game.action('guard', 'on'); expect(game.guarding).toBe(false);
  game.action('guard', 'off'); game.stepPersonal(.4);
  expect(game.guarding).toBe(false);
 });

 it.each([['attack', .4], ['dodge', .5]] as const)('restores a guard still held after %s finishes', (action, elapsed) => {
  const { sim, game } = setup(); vi.spyOn(sim, 'movePlayer').mockImplementation(() => {});
  game.action('guard', 'on'); game.action(action);
  expect(game.guarding).toBe(false);
  game.stepPersonal(elapsed); expect(game.guarding).toBe(true);
  game.action('guard', 'off'); expect(game.guarding).toBe(false);
 });

 it('starts the parry window when a queued guard actually rises', () => {
  const { sim, game, enemy } = setup(), source = enemy(0, -1);
  game.state.inventory.shield = 1; game.action('heavy'); game.action('guard', 'on');
  game.stepPersonal(.5); expect(game.guarding).toBe(false);
  game.stepPersonal(.14); expect(game.guarding).toBe(true);
  game.hurtPlayer(10, 'physical', sim.player, source);
  expect(game.state.health).toBe(99); expect(source.stagger).toBe(2);
 });

 it('buffers one late attack without turning the active attack early', () => {
  const { sim, game, enemy } = setup(), front = enemy(0, -1), right = enemy(1, 0);
  game.action('attack');
  expect(() => game.action('heavy', '', undefined, { x: 1, y: 0, z: 0 })).toThrow('回復');
  expect(sim.player.heading).toBeCloseTo(Math.PI);
  game.stepPersonal(.18);
  game.action('attack', '', undefined, { x: 1, y: 0, z: 0 });
  expect(sim.player.heading).toBeCloseTo(Math.PI);
  expect(game.state.stamina).toBe(92);
  game.stepPersonal(.18);
  expect(sim.player.heading).toBeCloseTo(Math.PI / 2);
  expect(game.state.stamina).toBe(84);
  expect(right.health).toBe(100);
  game.stepPersonal(.2);
  expect(front.health).toBe(93); expect(right.health).toBe(93);
  game.stepPersonal(.5);
  expect(right.health).toBe(93);
 });

 it('holds stamina regeneration through attack recovery and its short cooldown', () => {
  const { game } = setup();
  game.action('attack');
  game.stepPersonal(.34); expect(game.state.stamina).toBe(92);
  game.stepPersonal(.35); expect(game.state.stamina).toBe(92);
  game.stepPersonal(.11); expect(game.state.stamina).toBeCloseTo(93.2);
 });

 it('keeps heavy weapon recovery committed without gaining stamina mid-swing', () => {
  const { game } = setup(); game.state.inventory.greatsword=1;game.state.equipment = 'greatsword';
  game.action('heavy'); game.stepPersonal(1.43);
  expect(game.state.stamina).toBe(64);
  expect(() => game.action('dodge')).toThrow('回復');
  game.stepPersonal(.02);
  expect(game.state.stamina).toBe(64);
  game.stepPersonal(.44);
  expect(game.state.stamina).toBeCloseTo(65.2);
 });

 it('does not allow weapon swaps or implicit equipment changes during commitment', () => {
  const { game } = setup();
  game.state.inventory.sword = 1; game.action('attack');
  for (const [action, id] of [['equip', 'sword'], ['craft', 'sword'], ['landscape', 'raise'], ['fish', '']] as const) {
   expect(() => game.action(action, id)).toThrow('回復');
  }
  expect(game.state.equipment).toBe('hands');
  game.stepPersonal(.4); game.action('equip', 'sword');
  expect(game.state.equipment).toBe('sword');
  game.action('dodge');
  expect(() => game.action('equip', 'sword')).toThrow('回復');
  expect(() => game.action('drop', 'sword:1')).toThrow('回復');
 });

 it('normalizes a pitched dodge and accounts for the final partial movement tick', () => {
  const { sim, game } = setup(), move = vi.spyOn(sim, 'movePlayer').mockImplementation(() => {});
  game.action('dodge', '', undefined, { x: 3, y: 9, z: 4 });
  game.stepPersonal(.5);
  expect(move).toHaveBeenCalledOnce();
  expect(move.mock.calls[0][0]).toBeCloseTo(.6 * 8 * .48);
  expect(move.mock.calls[0][1]).toBeCloseTo(.8 * 8 * .48);
  expect(game.dodge).toBe(0); expect(game.state.stamina).toBe(78);
  game.stepPersonal(.32); expect(game.state.stamina).toBe(78);
  game.stepPersonal(.11); expect(game.state.stamina).toBeCloseTo(79.2);
 });

 it.each([[0, false], [.03, true], [.33, false]] as const)('only has dodge invulnerability inside its window at %s seconds', (elapsed, invulnerable) => {
  const { sim, game } = setup(); vi.spyOn(sim, 'movePlayer').mockImplementation(() => {});
  game.action('dodge'); if (elapsed) game.stepPersonal(elapsed);
  game.hurtPlayer(10, 'physical');
  expect(game.state.health).toBe(invulnerable ? 100 : 90);
 });

 it('drops guard for bow shots and follows aim without snapping to a nearby enemy', () => {
  const { game, enemy } = setup(); enemy(2, -4);
  game.state.inventory.bow=1;game.state.equipment = 'bow'; game.state.inventory.shield = 1;
  game.action('guard', 'on'); game.action('attack', '', undefined, { x: 0, y: 0, z: -8 });
  expect(game.guarding).toBe(false);
  expect(game.projectiles[0].vx).toBe(0); expect(game.projectiles[0].vy).toBe(0);
  expect(game.projectiles[0].vz).toBe(-12);
  game.action('guard', 'on'); expect(game.guarding).toBe(false);
  game.stepPersonal(.61); expect(game.guarding).toBe(true);
 });

 it('drops guard for a thrown spear as well as a melee attack', () => {
  const { game } = setup(); game.state.meadows = newMeadows();
  game.state.equipment = 'flintSpear'; game.state.inventory.flintSpear = 1;
  game.action('guard', 'on'); game.action('heavy');
  expect(game.guarding).toBe(false); expect(game.state.equipment).toBe('hands');
  expect(game.projectiles[0].recover).toBe('flintSpear');
 });

 it('delays stamina recovery after blocking and retains slow guarded regeneration', () => {
  const { game, sim } = setup(); game.state.inventory.shield = 1;
  game.action('guard', 'on');
  game.hurtPlayer(10, 'physical', sim.player, { x: 0, y: 10, z: -1 });
  expect(game.state.stamina).toBe(96);
  game.stepPersonal(.5); expect(game.state.stamina).toBe(96);
  game.stepPersonal(.25); expect(game.state.stamina).toBeCloseTo(96.3);
 });

 it('cannot change committed facing with a spell and releases guard after a successful cast', () => {
  const { sim, game } = setup(); game.state.inventory.staff = 1;
  game.action('attack');
  expect(() => game.action('spell', 'ember', undefined, { x: 1, y: 0, z: 0 })).toThrow('回復');
  expect(sim.player.heading).toBeCloseTo(Math.PI);
  game.stepPersonal(.4); game.action('guard', 'on'); game.action('spell', 'ember');
  expect(game.guarding).toBe(false);
 });

 it('clears unfinished attacks and buffered inputs on death before respawning', () => {
  const { game, enemy } = setup(), target = enemy(0, -1);
  game.action('attack'); game.stepPersonal(.2); game.action('attack'); game.action('guard', 'on');
  game.hurtPlayer(1000, 'physical'); game.stepPersonal(3.1);
  expect(game.state.health).toBe(70); expect(game.attack).toBe(0); expect(game.guarding).toBe(false);
  game.stepPersonal(.4); expect(target.health).toBe(93);
 });

 it('keeps aim normalization finite and preserves pitch for voxel strikes', () => {
  expect(horizontalAim({ x: 0, y: 1, z: 0 }, 0)).toEqual({ x: 0, y: 0, z: 1 });
  expect(combatAim({ x: NaN, y: 0, z: 0 }, 0)).toEqual({ x: 0, y: 0, z: 1 });
  expect(combatAim({ x: 0, y: 3, z: -4 }, 0)).toEqual({ x: 0, y: .6, z: -.8 });
 });
});
