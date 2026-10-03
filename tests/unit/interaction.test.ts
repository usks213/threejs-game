import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { orbitPose } from '../../src/rendering/camera/follow';
import { CharacterMotor } from '../../src/physics/character';
import { collidePlayerRocks, collideRocks } from '../../src/physics/contacts';
import type { SphereBody } from '../../src/physics/sphere';
import { FluidGrid } from '../../src/fluid/fluid';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../src/fluid/surface';
import { SdfWorld } from '../../src/world/density';
import type { Vec3 } from '../../src/world/types';
const field = (density: (p: Vec3) => number) => { const world = new SdfWorld(); world.density = density; return world; };
const rock = (id: number, x: number): SphereBody => ({ id, position: { x, y: 0.55, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, radius: 0.55, sleeping: true });
describe('review interactions', () => {
  it('looks exactly up and down with a stable orthogonal basis throughout a full orbit', () => {
    const camera = new THREE.PerspectiveCamera(), player = new THREE.Vector3(), focus = new THREE.Vector3(), offset = new THREE.Vector3(), direction = new THREE.Vector3();
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 2, 13]) for (const pitch of [-Math.PI / 2, 0, Math.PI / 2]) {
      orbitPose(player, yaw, pitch, focus, offset, camera.up);
      expect(camera.up.dot(offset)).toBeCloseTo(0, 10); expect(camera.up.length()).toBeCloseTo(1);
      camera.position.copy(focus).addScaledVector(offset, 9); camera.lookAt(focus); camera.getWorldDirection(direction);
      expect(direction.dot(offset)).toBeCloseTo(-1, 10);
      if (pitch !== 0) expect(direction.y).toBeCloseTo(-Math.sign(pitch), 10);
    }
  });
  it('jumps while moving and shortly after leaving a ledge without allowing repeated air jumps', () => {
    const motor = new CharacterMotor(field(p => p.y)), player = { x: 0, y: 0, z: 0, vy: 0, grounded: true };
    motor.step(player, 0.1, 0, false, 1 / 30); player.grounded = false;
    expect(motor.step(player, 0.1, 0, true, 1 / 30)).toBe(true);
    expect(player.x).toBeCloseTo(0.2); expect(player.y).toBeGreaterThan(0.1);
    expect(motor.step(player, 0.1, 0, true, 1 / 30)).toBe(false);
  });
  it('buffers a jump pressed just before landing', () => {
    const motor = new CharacterMotor(field(p => p.y)), player = { x: 0, y: 0.05, z: 0, vy: -2, grounded: false };
    expect(motor.step(player, 0.1, 0, true, 1 / 30)).toBe(false);
    expect(player.grounded).toBe(true);
    expect(motor.step(player, 0.1, 0, false, 1 / 30)).toBe(true);
  });
  it('separates overlapping rocks and passes impact to the other rock', () => {
    const a = rock(1, 0), b = rock(2, 0.9); a.sleeping = false; a.velocity.x = 2;
    collideRocks([a, b]); expect(b.position.x - a.position.x).toBeGreaterThanOrEqual(1.099);
    expect(b.velocity.x).toBeGreaterThan(1); expect(b.sleeping).toBe(false);
  });
  it('pushes rocks by walking into them and supports landing on top', () => {
    const b = rock(1, 0), player = { x: -0.7, y: 0, z: 0, vy: 0, grounded: true, heading: 0 };
    collidePlayerRocks(player, [b], 0.1, 0, 1 / 30);
    expect(b.position.x).toBeGreaterThan(0); expect(b.velocity.x).toBeGreaterThan(0); expect(b.sleeping).toBe(false);
    player.x = b.position.x; player.y = 1; player.vy = -2; player.grounded = false;
    collidePlayerRocks(player, [b], 0, 0, 1 / 30);
    expect(player.y).toBeCloseTo(1.1); expect(player.grounded).toBe(true); expect(player.vy).toBe(0);
  });
  it('retains water in a basin and drains it when an outlet is dug', () => {
    const world = field(p => Math.min(p.y, Math.max(Math.min(1.5 - Math.abs(p.x - 0.5), 1.5 - Math.abs(p.z - 0.5)), p.y - 2)));
    const water = new FluidGrid(world); const initial = water.add({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) water.step();
    const volume = () => water.snapshot().reduce((sum, c) => sum + c.volume, 0);
    expect(initial).toBeGreaterThan(0.9); expect(volume()).toBeCloseTo(initial, 8); expect(water.snapshot().every(c => c.x >= -1 && c.x <= 1)).toBe(true);
    world.apply({ id: 1, kind: 'dig', position: { x: 2, y: 0.7, z: 0.5 }, radius: 1.7, material: 'stone', tick: 1 });
    // Apply the same edit to the analytic test field to open the channel.
    const closed = world.density.bind(world); world.density = p => Math.max(closed(p), 1.7 - Math.hypot(p.x - 2, p.y - 0.7, p.z - 0.5));
    water.add({ x: 0, y: 0, z: 0 }, 1);
    for (let i = 0; i < 60; i++) water.step();
    expect(water.snapshot().some(c => c.x >= 2)).toBe(true); expect(volume()).toBeGreaterThan(1);
  });
  it('renders no internal faces between adjacent water cells and respects partial terrain floors', () => {
    const positions = new Float32Array(WATER_VERTEX_CAPACITY * 3), normals = new Float32Array(positions.length);
    const count = waterSurface([{ x: 0, y: 0, z: 0, volume: 1 }, { x: 1, y: 0, z: 0, volume: 1 }], positions, normals);
    expect(count).toBe(60);
    const world = field(p => p.y - 0.4), water = new FluidGrid(world);
    const accepted = water.add({ x: 0, y: 0, z: 0 }); expect(accepted).toBeGreaterThan(0.5); expect(accepted).toBeLessThan(0.6);
    const cells = water.snapshot(); expect(cells[0].bottom).toBeGreaterThan(0.4);
    const partial = waterSurface(cells, positions, normals);
    for (let i = 1; i < partial * 3; i += 3) expect(positions[i]).toBeGreaterThan(0.4);
  });
});
