import { describe, expect, it, vi } from 'vitest';
import { legacySimulation } from '../helpers/legacy';
import { WEAPONS } from '../../src/content/catalog';
import { ATTACK_ORIGIN_HEIGHT } from '../../src/game/combat/direction';
import { attackProfile, meleeBody, meleeContact } from '../../src/game/combat/attack';
import { clearMeleeContact } from '../../src/game/combat/occlusion';
import { buildingVoxels, treeVoxels } from '../../src/game/voxel/model';
import { movementSpeed } from '../../src/game/meadows/movement';
import { newMeadows } from '../../src/game/meadows/state';
import { meleePose } from '../../src/rendering/game/attack-pose';
import type { EnemyState } from '../../src/game/types';

const forward = { x: 0, y: 0, z: -1 };
function setup(equipment = 'hands') {
 const sim = legacySimulation(), game = sim.adventure;
 game.state.resources = []; game.state.buildings = []; game.state.enemies = []; game.state.equipment = equipment;if(equipment!=='hands')game.state.inventory[equipment]=1;
 Object.assign(sim.player, { x: 0, y: 10, z: 0, heading: Math.PI, grounded: true });
 sim.world.density = () => 1;
 vi.spyOn(sim, 'groundAt').mockReturnValue(10);
 const enemy = (x: number, z: number, y = 10, definition = 'slime'): EnemyState => {
  const target: EnemyState = { id: sim.allocateEntityId(), definition, tier: 1, x, y, z,
   homeX: x, homeZ: z, health: 100, cooldown: 10, windup: 0, slow: 0, boss: false, alerted: 10 };
  game.state.enemies.push(target); return target;
 };
 return { sim, game, enemy };
}

describe('weapon contact and timing', () => {
 it('keeps quick knives, slower clubs and heavy anticipation inside one complete cycle', () => {
  const knife = attackProfile('flintKnife', .3, false), club = attackProfile('club', .65, false), heavy = attackProfile('club', .65, true);
  expect(knife.windup).toBeLessThan(club.windup); expect(club.windup).toBeLessThan(heavy.windup);
  for (const [id, weapon] of Object.entries(WEAPONS)) for (const heavy of [false, true]) {
   const p = attackProfile(id, weapon.cooldown, heavy);
   expect(p.windup).toBeGreaterThan(0); expect(p.active).toBeGreaterThan(0);
   expect(p.windup + p.active).toBeLessThan(p.duration);
  }
 });

 it('has an active contact window, not one single hit frame or recovery damage', () => {
  const { game, enemy } = setup(), late = enemy(5, -1), recovery = enemy(5, -1);
  game.action('attack'); game.stepPersonal(.18); expect(late.health).toBe(100);
  late.x = 0; game.stepPersonal(.025); expect(late.health).toBe(93);
  game.stepPersonal(.08); recovery.x = 0; game.stepPersonal(.03);
  expect(late.health).toBe(93); expect(recovery.health).toBe(100);
 });

 it('crosses the same contact window once with small or large simulation steps', () => {
  const run = (steps: number[]) => { const { game, enemy } = setup('club'), target = enemy(0, -1); game.action('attack'); for (const dt of steps) game.stepPersonal(dt); return target.health; };
  expect(run([.65])).toBe(88); expect(run(Array.from({ length: 65 }, () => .01))).toBe(88);
 });

 it('measures reach to the creature body while rejecting out-of-reach, side and rear centers', () => {
  const { game, enemy } = setup(), touching = enemy(0, -2.55, 10, 'boar'), beyond = enemy(0, -2.9, 10, 'boar'), side = enemy(.1, 0), back = enemy(0, .1);
  game.action('attack'); game.stepPersonal(.18);
  expect(touching.health).toBeLessThan(100); expect(beyond.health).toBe(100);
  expect(side.health).toBe(100); expect(back.health).toBe(100);
 });

 it('makes a spear a narrow thrust and a club a wider front arc', () => {
  const health = (weapon: string) => { const { game, enemy } = setup(weapon), target = enemy(1.25, -2); game.action('attack'); game.stepPersonal(.24); return target.health; };
  expect(health('flintSpear')).toBe(100); expect(health('club')).toBeLessThan(100);
 });

 it('follows pitched aim uphill and downhill without the old three-meter vertical hit cylinder', () => {
  const p = { x: 0, y: 10, z: 0 }, profile = attackProfile('flintSpear', .5, false), body = meleeBody('slime', false);
  const high = { x: 0, y: 11.4, z: -1.8 }, low = { x: 0, y: 8.5, z: -2 };
  expect(meleeContact(p, high, forward, 3, profile, body)).toBeNull();
  expect(meleeContact(p, high, { x: 0, y: .6, z: -.8 }, 3, profile, body)).not.toBeNull();
  expect(meleeContact(p, low, forward, 3, profile, body)).toBeNull();
  expect(meleeContact(p, low, { x: 0, y: -.65, z: -.76 }, 3, profile, body)).not.toBeNull();
  expect(meleeContact(p, { x: 0, y: 12.8, z: -.8 }, forward, 3, profile, body)).toBeNull();
 });

 it('retains the committed heading when the camera aims straight up or down', () => {
  const { game, enemy } = setup(), front = enemy(0, -.4), back = enemy(0, .4);
  game.action('attack', '', undefined, { x: 0, y: -1, z: 0 }); game.stepPersonal(.18);
  expect(front.health).toBe(93); expect(back.health).toBe(100);
 });

 it('does not damage through a wall even after that swing makes a hole', () => {
  const { game, enemy } = setup('axe'), target = enemy(0, -1.5);
  game.state.buildings.push({ id: 100, definition: 'wall', x: 0, y: 10, z: -.7, rotation: 0, support: 4, contents: {} });
  game.action('attack'); game.stepPersonal(.18);
  expect(game.state.buildings[0].removed?.length).toBeGreaterThan(0);
  game.stepPersonal(.07); expect(target.health).toBe(100);
 });

 it('respects a pre-existing wall hole and surviving tree voxels at the struck height', () => {
  const { game } = setup(), origin = { x: 0, y: 10 + ATTACK_ORIGIN_HEIGHT, z: 0 }, contact = { ...origin, z: -2 };
  const wall = { id: 100, definition: 'wall', x: 0, y: 10, z: -.7, rotation: 0, support: 4, contents: {}, removed: [] as string[] };
  game.state.buildings = [wall];
  expect(clearMeleeContact(game.state, origin, contact, () => 1)).toBe(false);
  wall.removed = [...buildingVoxels('wall').cells.values()].filter(c => Math.abs(c.x * .125) < .4 && c.y * .125 > .5 && c.y * .125 < 1.2).map(c => c.key);
  expect(clearMeleeContact(game.state, origin, contact, () => 1)).toBe(true);
  const tree = { id: 101, kind: 'beech', x: 0, y: 10, z: -1, ready: 0, amount: 1, removed: [] as string[] };
  game.state.resources = [tree]; expect(clearMeleeContact(game.state, origin, contact, () => 1)).toBe(false);
  tree.removed = [...treeVoxels('beech', 101).cells.keys()];
  expect(clearMeleeContact(game.state, origin, contact, () => 1)).toBe(true);
 });

 it('does not spend run stamina while a melee action slows the player', () => {
  const { game } = setup(); game.state.meadows = newMeadows(); game.state.stamina = 50; game.state.meadows.sprinting = true;
  game.action('attack'); const stamina = game.state.stamina, anticipation = movementSpeed(game, true, 0, .1);
  game.stepPersonal(.18); const contact = movementSpeed(game, true, 0, .1);
  expect(game.state.stamina).toBe(stamina); expect(contact).toBeLessThan(anticipation);
  game.stepPersonal(.16); expect(movementSpeed(game, true, 0, .1)).toBeGreaterThan(contact);
 });
});

describe('bounded attack input and visible phases', () => {
 it('keeps exactly one late input without replacing its direction or charging stamina early', () => {
  const { game, sim, enemy } = setup(), right = enemy(1, 0), behind = enemy(0, 1);
  game.action('attack'); game.stepPersonal(.18);
  game.action('attack', '', undefined, { x: 1, y: 0, z: 0 });
  for (let i = 0; i < 20; i++) game.action('attack', '', undefined, { x: 0, y: 0, z: 1 });
  expect(game.state.stamina).toBe(92); expect(sim.player.heading).toBeCloseTo(Math.PI);
  game.stepPersonal(.18); expect(game.state.stamina).toBe(84); expect(game.attackMotion?.combo).toBe(2);
  game.stepPersonal(.2); expect(right.health).toBe(93); expect(behind.health).toBe(100);
  game.stepPersonal(1); expect(game.attackMotion).toBeUndefined(); expect(right.health).toBe(93);
 });

 it('offers a three-hit rhythm then restarts, and expires that rhythm after pausing', () => {
  const { game, enemy } = setup('club'), target = enemy(0, -1);
  const stages: number[] = [];
  for (let i = 0; i < 4; i++) { game.state.stamina = 100; game.action('attack'); stages.push(game.attackMotion!.combo); game.stepPersonal(.66); }
  expect(stages).toEqual([1, 2, 3, 1]); expect(target.health).toBeCloseTo(100 - 12 * 4.4);
  game.stepPersonal(.3); game.action('attack'); expect(game.attackMotion?.combo).toBe(1);
 });

 it('keeps attack facing committed while the player strafes or turns a held guard', () => {
  const { game, sim } = setup(); game.action('attack');
  sim.step({ x: 1, z: 0, jump: false });
  expect(sim.player.heading).toBeCloseTo(Math.PI);
  game.action('guard', 'on', undefined, { x: 1, y: 0, z: 0 });
  expect(sim.player.heading).toBeCloseTo(Math.PI);
  game.stepPersonal(.4); expect(game.guarding).toBe(true); expect(sim.player.heading).toBeCloseTo(Math.PI / 2);
 });

 it('turns a raised guard without renewing its parry window', () => {
  const { game, sim, enemy } = setup(), source = enemy(1, 0);
  game.state.inventory.shield = 1; game.action('guard', 'on'); game.stepPersonal(.21);
  game.action('guard', 'on', undefined, { x: 1, y: 0, z: 0 });
  expect(sim.player.heading).toBeCloseTo(Math.PI / 2);
  game.hurtPlayer(10, 'physical', sim.player, source);
  expect(game.state.health).toBe(96); expect(source.stagger).toBeUndefined();
 });

 it('shares animation phase and contact timing without adding attack state to saves', () => {
  const { game } = setup('club'); game.action('attack');
  const motion = game.attackMotion!, ready = meleePose({ ...motion, elapsed: motion.windup }), impact = meleePose({ ...motion, elapsed: motion.windup + motion.active });
  expect(ready.armY).toBeLessThan(0); expect(impact.armY).toBeGreaterThan(0);
  expect(meleePose({ ...motion, elapsed: motion.duration }).armX).toBeCloseTo(0);
  expect(game.snapshot().attackMotion?.duration).toBe(.65);
  expect(game.save()).not.toHaveProperty('attackMotion');
  game.stepPersonal(.66); expect(game.snapshot().attackMotion).toBeUndefined();
 });

 it('gives thrusts and heavy attacks distinct poses and fully resets them on death', () => {
  const thrust = attackProfile('flintSpear', .5, false), overhead = attackProfile('club', .65, true);
  expect(meleePose({ ...thrust, elapsed: thrust.windup + thrust.active }).handZ).toBeGreaterThan(.2);
  expect(meleePose({ ...overhead, elapsed: overhead.windup }).armX).toBeLessThan(-2);
  const { game } = setup(); game.action('attack'); game.hurtPlayer(999, 'physical');
  expect(game.attackMotion).toBeUndefined(); expect(game.attack).toBe(0);
 });
});
