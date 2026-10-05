import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { Prediction } from '../../src/networking/prediction';
import { sessionFrame } from '../../src/networking/frame';
import { legacySimulation } from '../helpers/legacy';
import { newMeadows } from '../../src/game/meadows/state';
function setup() {
 const save = legacySimulation().save(); save.adventure!.meadows = newMeadows(); save.adventure!.enemies = []; save.adventure!.resources = [];
 const authority = new SessionAuthority(save), guest = authority.join('guest'), replica = new GameSimulation(authority.sim.save()), prediction = new Prediction(replica);
 return {authority,guest,replica,prediction};
}
it('replaces guest collision graphs when authority parts move or disappear without simulating authority powers', () => {
 const {authority,replica,prediction} = setup();
 authority.sim.skybound.state.parts.push({id: 1,kind: 'block',material: 'wood',mass: 6,rotation: 0,position: {x: 2,y: 3,z: 8},velocity: {x: 0,y: 0,z: 0},links: [],epoch: 0});
 prediction.reconcile(sessionFrame(authority,'guest')); expect(replica.skybound.state.parts[0].position.x).toBe(2);
 authority.sim.skybound.state.parts[0].position.x = 3; prediction.reconcile(sessionFrame(authority,'guest')); expect(replica.skybound.state.parts[0].position.x).toBe(3);
 replica.skybound.state.parts[0].position.x = 99; expect(authority.sim.skybound.state.parts[0].position.x).toBe(3);
 authority.sim.skybound.state.parts = []; prediction.reconcile(sessionFrame(authority,'guest')); expect(replica.skybound.state.parts).toEqual([]);
});
it('predicts gliding speed and stamina, then replays from the fresh authoritative stamina without double spending', () => {
 const {authority,guest,replica,prediction} = setup();
 guest.adventure.gear.craft('glider',1,{...guest.adventure.state.inventory});
 Object.assign(guest.player,{x: 0,y: 15,z: 8,vy: -9,grounded: false}); guest.adventure.state.stamina = 50; guest.adventure.traversal.gliding = true;
 const frame = sessionFrame(authority,'guest'); prediction.reconcile(frame); const x = replica.player.x;
 prediction.input(1,{x: 1,z: 0,jump: false});
 expect(replica.player.x - x).toBeCloseTo(3.4 * 1.5 / 30,5); expect(replica.player.vy).toBeGreaterThan(-3);
 expect(replica.adventure.state.stamina).toBeCloseTo(50 - 5 / 30,6); expect(guest.adventure.state.stamina).toBe(50);
 prediction.reconcile(frame); expect(replica.adventure.state.stamina).toBeCloseTo(50 - 5 / 30,6);
 expect(frame.adventure.stamina).toBe(50);
});
it('predicts climbing against the same wall and releases on authoritative exhaustion', () => {
 const {authority,guest,replica,prediction} = setup();
 Object.assign(guest.player,{x: 0,y: 3,z: 8,heading: Math.PI,grounded: false}); guest.adventure.traversal.climbing = true;
 replica.world.density = p => p.z < 7.5 ? -1 : 1;
 prediction.reconcile(sessionFrame(authority,'guest')); const y = replica.player.y, stamina = replica.adventure.state.stamina;
 prediction.input(1,{x: 0,z: -1,jump: false}); expect(replica.player.y).toBeCloseTo(y + 1.6 / 30,6); expect(replica.adventure.state.stamina).toBeCloseTo(stamina - 14 / 30,6);
 const climbedY=replica.player.y;prediction.input(2,{x:0,z:0,jump:false});expect(replica.player.y).toBeCloseTo(climbedY,6);expect(replica.adventure.state.stamina).toBeCloseTo(stamina-(14+4)/30,6);expect(replica.adventure.traversal.snapshot().hanging).toBe(true);
 guest.adventure.state.stamina = 0; guest.sequence = 2; prediction.reconcile(sessionFrame(authority,'guest')); prediction.input(3,{x: 0,z: 0,jump: false}); expect(replica.adventure.traversal.climbing).toBe(false);
});
it('keeps seated passengers at authority poses while pending walking inputs accumulate', () => {
 const {authority,replica,prediction} = setup(), frame = sessionFrame(authority,'guest');
 frame.adventure.skybound!.riding = {seat: 1,driver: false}; prediction.reconcile(frame); const position = {...replica.player};
 prediction.input(1,{x: 1,z: 1,jump: true}); expect(replica.player).toEqual(position);
 frame.player.x += 3; prediction.reconcile(frame); expect(replica.player.x).toBe(position.x + 3);
 frame.ack = 1; frame.adventure.skybound!.riding = undefined; prediction.reconcile(frame); prediction.input(2,{x: 1,z: 0,jump: false}); expect(replica.player.x).toBeGreaterThan(position.x + 3);
});
