import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { validateSave } from '../../src/save/format';
import { legacySimulation } from '../helpers/legacy';
const aim = {x: 0, y: 0, z: 1};
it('routes powers through authoritative actor inventories, shares parts and releases leases on leave/restart', () => {
 const authority = new SessionAuthority(legacySimulation().save()), a = authority.join('a'), b = authority.join('b');
 a.adventure.state.inventory.wood = 10;
 const target = {x: a.player.x + 2, y: a.player.y + 2, z: a.player.z};
 authority.action('a', {type: 'game-action', action: 'sky-part', id: 'block:wood', target, aim});
 const part = authority.sim.skybound.state.parts[0];
 expect(a.adventure.state.inventory.wood).toBe(7); expect(b.adventure.state.inventory.wood).toBeUndefined();
 expect(authority.view('b').adventure.skybound!.parts[0].id).toBe(part.id);
 authority.sim.tick += 4; authority.action('a', {type: 'game-action', action: 'sky-grab', id: String(part.id), aim});
 expect(() => authority.action('b', {type: 'game-action', action: 'sky-grab', id: String(part.id), aim})).toThrow('別の冒険者');
 authority.leave('a'); expect(authority.sim.skybound.leases.size).toBe(0);
 authority.sim.tick += 4; authority.action('b', {type: 'game-action', action: 'sky-grab', id: String(part.id), aim});
 const save = validateSave(authority.save()), restored = new SessionAuthority(save);
 expect(restored.sim.skybound.leases.size).toBe(0); expect(restored.sim.skybound.state.parts).toHaveLength(1);
 expect(restored.join('a').adventure.state.inventory.wood).toBe(7);
});
it('keeps the actual host location in collision queries during a guest action', () => {
 const authority = new SessionAuthority(legacySimulation().save()), a = authority.join('a'); a.player.x = 5;
 a.adventure.state.inventory.wood = 10;
 // Placing at the real host body must fail even though withActor temporarily swaps sim.player.
 expect(() => authority.action('a', {type: 'game-action', action: 'sky-part', id: 'block:wood', target: {...authority.sim.player, y: authority.sim.player.y + .8}, aim})).toThrow('重なって');
 expect(a.adventure.state.inventory.wood).toBe(10);
});
it('applies and wears fused weapon damage through the existing combat action', () => {
 const authority = new SessionAuthority(legacySimulation().save()), a = authority.join('a');
 a.adventure.gear.craft('sword',1,a.adventure.state.inventory); a.adventure.state.inventory.resin = 1; a.adventure.state.equipment = 'sword';
 authority.action('a', {type: 'game-action', action: 'sky-fuse', id: 'sword:resin', aim}); authority.sim.tick += 4;
 authority.action('a', {type: 'game-action', action: 'attack', aim});
 expect(authority.sim.skybound.fusion('a', 'sword')?.durability).toBe(19);
 expect(authority.sim.skybound.fusion('host', 'sword')).toBeUndefined();
});
