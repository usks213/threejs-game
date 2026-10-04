import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_FOCUS_HEIGHT, CAMERA_RADIUS, CAMERA_SHOULDER_OFFSET, createCameraBoom, orbitPose } from '../../src/rendering/camera/follow';
import { aimFromReticle, reticleObjectDistance, RETICLE_DISTANCE } from '../../src/rendering/camera/aim';
import { applyCameraLook, DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_PITCH } from '../../src/input/touch/look';
import { ATTACK_ORIGIN_HEIGHT } from '../../src/game/combat/direction';
import { rayBox } from '../../src/game/interaction/target';
import { objectOcclusion } from '../../src/game/voxel/occlusion';
import { buildingVoxels, carveVoxels } from '../../src/game/voxel/model';
import { GameSimulation } from '../../src/simulation/game-simulation';

function cameraAt(yaw = 0, pitch = DEFAULT_CAMERA_PITCH, distance = DEFAULT_CAMERA_DISTANCE) {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, .1, 110), player = new THREE.Vector3(0, 10, 0);
  const focus = new THREE.Vector3(), backward = new THREE.Vector3();
  orbitPose(player, yaw, pitch, focus, backward, camera.up);
  camera.position.copy(focus).addScaledVector(backward, distance); camera.lookAt(focus); camera.updateMatrixWorld();
  return { camera, player, focus, backward };
}
function emptyAdventure() {
  const state = new GameSimulation().adventure.snapshot();
  state.resources = []; state.buildings = []; state.enemies = [];
  return state;
}

describe('shoulder camera and reticle convergence', () => {
  it('frames the avatar left of the reticle at every horizontal heading without an ahead-of-player pivot', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, 5.8]) {
      const { camera, player, focus } = cameraAt(yaw);
      const head = player.clone().add(new THREE.Vector3(0, 1.65, 0)).project(camera);
      expect(head.x).toBeLessThan(-.1); expect(head.x).toBeGreaterThan(-.2);
      expect(head.y).toBeGreaterThan(.05); expect(head.y).toBeLessThan(.15);
      expect(focus.y - player.y).toBeCloseTo(CAMERA_FOCUS_HEIGHT);
      expect(Math.hypot(focus.x - player.x, focus.z - player.z)).toBeCloseTo(CAMERA_SHOULDER_OFFSET);
    }
  });

  it('converges the player-origin attack on the center ray across nearby targets, zoom and vertical pitch', () => {
    for (const yaw of [0, 1.2, 3.4]) for (const pitch of [-Math.PI / 2, -.2, .4, Math.PI / 2]) for (const zoom of [2.5, 5, 8]) {
      const { camera, player } = cameraAt(yaw, pitch, zoom), direction = camera.getWorldDirection(new THREE.Vector3());
      const target = camera.position.clone().addScaledVector(direction, zoom + 3);
      const aim = new THREE.Vector3().copy(aimFromReticle(player, camera.position, direction, zoom + 3));
      const attackOrigin = player.clone(); attackOrigin.y += ATTACK_ORIGIN_HEIGHT;
      const attack = new THREE.Ray(attackOrigin, aim);
      expect(attack.distanceToPoint(target)).toBeLessThan(1e-7);
      expect(target.clone().project(camera).x).toBeCloseTo(0, 8);
      expect(target.clone().project(camera).y).toBeCloseTo(0, 8);
      expect(aim.length()).toBeCloseTo(1);
    }
  });

  it('uses a distant point for open sky and never fires backwards at camera-side obstructions', () => {
    const { camera, player } = cameraAt(), direction = camera.getWorldDirection(new THREE.Vector3());
    const far = aimFromReticle(player, camera.position, direction);
    const origin = player.clone(); origin.y += ATTACK_ORIGIN_HEIGHT;
    expect(new THREE.Ray(origin, new THREE.Vector3().copy(far)).distanceToPoint(camera.position.clone().addScaledVector(direction, RETICLE_DISTANCE))).toBeLessThan(1e-7);
    expect(new THREE.Vector3().copy(aimFromReticle(player, camera.position, direction, 1)).dot(direction)).toBeGreaterThan(.99);
  });

  it('hits only enemy volumes crossed by the reticle, with terrain and occupied voxels taking priority', () => {
    const state = emptyAdventure(), origin = new THREE.Vector3(.6, 10.6, 5), direction = new THREE.Vector3(0, 0, -1);
    state.enemies = [{ id: 1, definition: 'boar', x: .6, y: 10, z: -2, health: 50, cooldown: 0, windup: 0, slow: 0, boss: false, homeX: .6, homeZ: -2, tier: 1 }];
    expect(reticleObjectDistance(state, origin, direction, 32)).toBeCloseTo(6.3);
    state.enemies[0].x = 2;
    expect(reticleObjectDistance(state, origin, direction, 32)).toBe(32);
    state.enemies[0].x = .6;
    expect(reticleObjectDistance(state, origin, direction, 4)).toBe(4);
    state.buildings = [{ id: 2, definition: 'wall', x: .6, y: 10, z: 0, rotation: 0, support: 4, contents: {} }];
    expect(reticleObjectDistance(state, origin, direction, 32)).toBeCloseTo(4.875);
    state.buildings[0].removed = []; carveVoxels(buildingVoxels('wall'), { x: 0, y: .6, z: 0 }, .75, state.buildings[0].removed);
    expect(reticleObjectDistance(state, origin, direction, 32)).toBeCloseTo(6.3);
  });

  it('retracts before a wall, including the near-plane radius, and eases recovery', () => {
    let wall = true;
    const resolve = createCameraBoom((origin, direction, limit) => wall ? rayBox(origin, direction, { x: -5, y: 0, z: 2 }, { x: 5, y: 20, z: 2.2 }) ?? limit : limit);
    const { camera, player, focus, backward } = cameraAt(), position = new THREE.Vector3();
    const blocked = resolve(player, focus, backward, camera.up, 5, 1 / 60, position);
    expect(position.z).toBeLessThan(2); expect(blocked).toBeLessThan(2);
    wall = false; orbitPose(player, 0, DEFAULT_CAMERA_PITCH, focus, backward, camera.up);
    const recovering = resolve(player, focus, backward, camera.up, 5, 1 / 60, position);
    expect(recovering).toBeGreaterThan(blocked); expect(recovering).toBeLessThan(5);
    for (let i = 0; i < 90; i++) { orbitPose(player, 0, DEFAULT_CAMERA_PITCH, focus, backward, camera.up); resolve(player, focus, backward, camera.up, 5, 1 / 60, position); }
    expect(position.distanceTo(camera.position)).toBeLessThan(.001);
  });

  it('sweeps the shoulder path and surrounding volume instead of letting a side wall clip the camera', () => {
    const { camera, player, focus, backward } = cameraAt(0, 0), position = new THREE.Vector3();
    const resolve = createCameraBoom((origin, direction, limit) => rayBox(origin, direction, { x: .7, y: 0, z: -5 }, { x: 1, y: 20, z: 10 }) ?? limit);
    resolve(player, focus, backward, camera.up, 5, .1, position);
    expect(position.x + CAMERA_RADIUS).toBeLessThan(.71);
    expect(position.z).toBeLessThan(camera.position.z);
  });

  it('uses occupied wall cells for camera clearance and preserves a clear large carved opening', () => {
    const state = emptyAdventure(); state.buildings = [{ id: 2, definition: 'wall', x: .3, y: 10, z: 2, rotation: 0, support: 4, contents: {} }];
    const { camera, player, focus, backward } = cameraAt(0, 0), position = new THREE.Vector3();
    const blocked = createCameraBoom((origin, direction, limit) => objectOcclusion(state, origin, direction, limit));
    expect(blocked(player, focus, backward, camera.up, 5, .1, position)).toBeLessThan(2);
    state.buildings[0].removed = []; carveVoxels(buildingVoxels('wall'), { x: 0, y: CAMERA_FOCUS_HEIGHT, z: 0 }, .8, state.buildings[0].removed);
    orbitPose(player, 0, 0, focus, backward, camera.up);
    const clear = createCameraBoom((origin, direction, limit) => objectOcclusion(state, origin, direction, limit));
    expect(clear(player, focus, backward, camera.up, 5, .1, position)).toBeCloseTo(5);
  });

  it('keeps touch and mouse turn signs consistent and can recover from both pitch extremes', () => {
    const touch = { yaw: 0, pitch: 0, distance: 5, sensitivity: 1 }, mouse = { ...touch };
    applyCameraLook(touch, 25, 15, .006); applyCameraLook(mouse, 50, 30, .003);
    expect(touch).toEqual(mouse); expect(touch.yaw).toBeLessThan(0); expect(touch.pitch).toBeGreaterThan(0);
    applyCameraLook(touch, 0, 10000, .006); expect(touch.pitch).toBe(Math.PI / 2);
    applyCameraLook(touch, 0, -10, .006); expect(touch.pitch).toBeLessThan(Math.PI / 2);
    applyCameraLook(touch, 0, -10000, .006); expect(touch.pitch).toBe(-Math.PI / 2);
    applyCameraLook(touch, 0, 10, .006); expect(touch.pitch).toBeGreaterThan(-Math.PI / 2);
  });
});
