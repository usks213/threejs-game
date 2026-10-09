import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import type { EnemyState } from '../../src/game/types';
import { bossPartDefinitions, bossPartPosition, ensureBossParts, damageBossPart, bossPartMovementScale, bossPartAttack, bossMeleeContact, validateBossParts } from '../../src/game/combat/boss-parts';
import { sweptEnemyContact } from '../../src/game/combat/enemy-contact';
import { bossAttack } from '../../src/game/bosses';
import { applySkyEffects } from '../../src/game/skybound-effects';
import { validateSave } from '../../src/save/format';
import { participantSave } from '../../src/save/participant';
import { createBossParts } from '../../src/rendering/game/boss-parts';
import { reticleObjectDistance } from '../../src/rendering/camera/aim';
import { assistRangedAim } from '../../src/game/combat/aim-assist';
const idle = { x: 0, z: 0, jump: false };
function fixture(definition = 'stormcore') {
 const room = new SessionAuthority(), sim = room.sim, game = sim.adventure;
 sim.world.density = p => p.y < 0 ? -1 : 1; sim.fluid.restore([]); sim.bodies.length = 0; sim.skybound.state.parts = [];
 game.state.resources = []; game.state.buildings = []; game.state.enemies = [];
 game.state.exploration = { version: 1, tiles: ['surface:0,0'], pending: [], generated: 0, exhausted: false, waterJobs: [] };
 Object.assign(sim.player, { x: 20, y: 0, z: 14, grounded: true, heading: Math.PI });
 const enemy: EnemyState = { id: 900001, definition, tier: 1, x: 20, y: 0, z: 20, health: 260, boss: true, homeX: 20, homeZ: 20, cooldown: 5, windup: 0, slow: 0, heading: 0 };
 game.state.enemies.push(enemy);
 return { room, sim, game, enemy };
}
const point = (enemy: EnemyState, id = 'leftDrive') => bossPartPosition(enemy, bossPartDefinitions(enemy).find(p => p.id === id)!);

describe('independent original boss parts', () => {
 it('supports all four encounters and keeps old campaign bosses untouched', () => {
  for (const id of ['stormcore', 'loadwarden', 'echowarden', 'sailwarden']) {
   const { enemy } = fixture(id), parts = ensureBossParts(enemy)!;
   expect(Object.keys(parts.health)).toHaveLength(3); damageBossPart(enemy, 28, 'physical', 4, point(enemy));
   expect(parts.health.leftDrive).toBe(0); expect(parts.health.rightDrive).toBe(28); expect(parts.health.focus).toBe(36);
   expect(parts.exposedUntil).toBe(10); expect(enemy.windup).toBe(0); expect(enemy.stagger).toBe(1.2);
   const until = parts.exposedUntil; damageBossPart(enemy, 28, 'physical', 9, point(enemy)); expect(parts.exposedUntil).toBe(until);
  }
  const { enemy } = fixture('stormstag'); expect(ensureBossParts(enemy)).toBeUndefined();
 });
 it('weakens movement and shot fans without deleting any boss attack patterns', () => {
  const { enemy } = fixture(), parts = ensureBossParts(enemy)!;
  expect(bossPartMovementScale(enemy)).toBe(1); parts.health.leftDrive = 0; expect(bossPartMovementScale(enemy)).toBe(.7);
  parts.health.rightDrive = 0; expect(bossPartMovementScale(enemy)).toBe(.45); parts.health.focus = 0;
  for (const kind of ['pulse', 'prism', 'rush']) { const base = bossAttack('stormcore', false, kind), changed = bossPartAttack(enemy, base); expect(changed.charge).toBe(base.charge); expect(changed.radius).toBe(base.radius); expect(changed.cooldown).toBeGreaterThan(base.cooldown); if (base.shots) expect(changed.shots).toBeGreaterThan(0); }
  expect(bossPartAttack(enemy, bossAttack('stormcore', false, 'prism')).shots).toBe(2);
 });
 it('offers elevated focus strikes and device impact as alternative part solutions', () => {
  const { enemy } = fixture(), crown = point(enemy, 'focus');
  expect(damageBossPart(enemy, 10, 'physical', 0, crown, { ...enemy, y: enemy.y + 2 })).toBe(1.6);
  expect(enemy.bossParts!.health.focus).toBe(18);
  damageBossPart(enemy, 10, 'shock', 0, point(enemy)); expect(enemy.bossParts!.health.leftDrive).toBe(13);
 });
 it('uses the same independent volumes for pitched melee, swept arrows, reticle and optional aim assist', () => {
  const { enemy, game } = fixture(), target = point(enemy), origin = { ...target, z: target.z - 3 }, direction = { x: 0, y: 0, z: 1 };
  const melee = bossMeleeContact(enemy, { ...origin, y: origin.y - .85 }, direction, 3, 0); expect(melee).toBeDefined();
  const swept = sweptEnemyContact([enemy], origin, { ...origin, z: origin.z + 6 }, .05); expect(swept?.enemy).toBe(enemy); expect(swept!.point.x).toBeCloseTo(target.x);
  expect(reticleObjectDistance(game.snapshot(), origin, direction, 10)).toBeLessThan(3);
  expect(assistRangedAim(origin, { x: .01, y: 0, z: 1 }, [enemy], () => false).x).toBeCloseTo(0);
  ensureBossParts(enemy)!.health.leftDrive = 0;
  expect(sweptEnemyContact([enemy], origin, { ...origin, z: origin.z + 6 }, .05)).toBeUndefined();
 });
 it('applies actual melee contacts once and cannot break armor through a wall', () => {
  const { sim, game, enemy } = fixture(), target = point(enemy);
  Object.assign(sim.player, { x: target.x, y: target.y - .85, z: target.z - 1.5, heading: 0 });
  game.action('attack', '', undefined, { x: 0, y: 0, z: 1 }); game.stepPersonal(.3);
  expect(enemy.bossParts!.health.leftDrive).toBeLessThan(28); const health = enemy.bossParts!.health.leftDrive;
  game.stepPersonal(1); sim.world.density = p => p.z > target.z - 1 && p.z < target.z - .8 ? -1 : 1;
  game.action('attack', '', undefined, { x: 0, y: 0, z: 1 }); game.stepPersonal(.3); expect(enemy.bossParts!.health.leftDrive).toBe(health);
 });
 it('lets a real fast projectile hit a part between ticks and stops it at a thin wall', () => {
  const run = (blocked: boolean, behind = false) => {
   const { sim, game, enemy } = fixture(), target = point(enemy, 'focus');
   enemy.stagger = .01; enemy.cooldown = 100;
   if (blocked) sim.world.density = p => p.y < 0 || p.z > 18.8 && p.z < 19.2 ? -1 : 1;
   if (behind) sim.world.density = p => p.y < 0 || p.z > 21.5 && p.z < 22 ? -1 : 1;
   game.projectiles.push({ id: 555, owner: 'host', ...target, z: target.z - 3, vx: 0, vy: 0, vz: 180, life: 2, radius: .1, damage: 20, element: 'physical' });
   sim.step(idle); return ensureBossParts(enemy)!.health.focus;
  };
  expect(run(false)).toBe(16); expect(run(true)).toBe(36); expect(run(false, true)).toBe(16);
 });
 it('shares part damage, tell timing, and immutable snapshots across guest/rejoin and both save routes', () => {
  const { room, enemy } = fixture(), guest = room.join('guest');
  guest.adventure.hit(enemy, 28, 'physical', true, guest.player, point(enemy));
  const hostView = room.view('host').adventure.enemies.find(e => e.id === enemy.id)!;
  const guestView = room.view('guest').adventure.enemies.find(e => e.id === enemy.id)!;
  expect(hostView.bossParts).toEqual(guestView.bossParts); expect(hostView.windup).toBe(guestView.windup);
  hostView.bossParts!.health.rightDrive = 0; expect(enemy.bossParts!.health.rightDrive).toBe(28);
  room.leave('guest'); expect(room.join('guest').adventure.state.enemies[0].bossParts!.health.leftDrive).toBe(0);
  for (const save of [room.save(), participantSave(room, 'guest')]) { const restored = new GameSimulation(validateSave(save)); expect(restored.adventure.state.enemies[0].bossParts!.health).toEqual(enemy.bossParts!.health); }
 });
 it('uses the actual guest elevation rather than host or projectile altitude', () => {
  const { room, game, enemy } = fixture('sailwarden'), guest = room.join('guest');
  guest.player.y = 2; game.state.seconds = guest.adventure.state.seconds = 10;
  guest.adventure.hit(enemy, 10, 'physical', true, { ...point(enemy, 'focus'), y: 10 }, point(enemy, 'focus'));
  expect(enemy.bossParts!.health.focus).toBe(18);
  const { room: second, enemy: lower } = fixture('sailwarden'), lowGuest = second.join('low'); lowGuest.player.y = 0;
  lowGuest.adventure.hit(lower, 10, 'physical', true, { ...point(lower, 'focus'), y: 10 }, point(lower, 'focus'));
  expect(lower.bossParts!.health.focus).toBe(26);
 });
 it('lets directed devices and radial explosions break reachable parts but respects walls', () => {
  const { sim, enemy } = fixture(), target = point(enemy);
  const effect = { id: 'device', tick: 1, sourcePart: 1, owner: 'host', element: 'shock' as const, origin: { ...target, z: target.z - 3 }, direction: { x: 0, y: 0, z: 1 }, range: 5, radius: .2, damage: 20, targets: 'enemies' as const };
  sim.world.density = p => p.z > 18 && p.z < 18.5 ? -1 : 1; applySkyEffects(sim, [effect]); expect(enemy.bossParts).toBeUndefined();
  sim.world.density = () => 1; applySkyEffects(sim, [effect]); expect(enemy.bossParts!.health.leftDrive).toBe(0);
  const right = point(enemy, 'rightDrive'); applySkyEffects(sim, [{ ...effect, origin: right, direction: { x: 0, y: 0, z: 0 }, range: 0, radius: 1 }]); expect(enemy.bossParts!.health.rightDrive).toBe(0);
 });
 it('migrates missing state and rejects malformed, excessive or non-boss part saves', () => {
  const { room, enemy } = fixture(); const old = validateSave(room.save()); expect(old.adventure!.enemies[0].bossParts).toBeUndefined();
  ensureBossParts(enemy); const clean = room.save(); expect(() => validateSave(clean)).not.toThrow();
  for (const value of [-1, 1000, NaN]) { const changed = structuredClone(clean); changed.adventure!.enemies[0].bossParts!.health.focus = value; expect(() => validateSave(changed)).toThrow('ボス部位'); }
  const changed = structuredClone(clean); changed.adventure!.enemies[0].boss = false; expect(() => validateSave(changed)).toThrow('ボス部位');
  const extra = { ...enemy, bossParts: { ...enemy.bossParts!, hidden: 'invalid' } }; expect(() => validateBossParts(extra)).toThrow();
 });
 it('removes broken geometry, shares impact flash and exposes the core with disposable PBR resources', () => {
  const { game, enemy } = fixture(), scene = new THREE.Scene(), renderer = createBossParts(scene); renderer.update(game.snapshot()); expect(scene.children).toHaveLength(3);
  damageBossPart(enemy, 28, 'physical', game.state.seconds, point(enemy)); renderer.update(game.snapshot()); expect(scene.children).toHaveLength(4);
  game.state.seconds += .3; renderer.update(game.snapshot()); expect(scene.children.some(o => o.name.endsWith(':leftDrive'))).toBe(false); expect(scene.children.some(o => o.name.endsWith(':core'))).toBe(true);
  renderer.faceCamera(new THREE.PerspectiveCamera()); renderer.dispose(); expect(scene.children).toHaveLength(0);
 });
});
