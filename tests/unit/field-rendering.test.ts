import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFieldTerrain } from '../../src/rendering/voxel/field-terrain';
import { fieldNormal, fieldRayInterval, intersectFieldRay, sampleField } from '../../src/rendering/voxel/field-raycast';
import type { FieldData } from '../../src/world/field-data';

function brick(fn = (_x: number, y: number, _z: number) => y - 4, id = '0,0,0'): FieldData {
  const size = 17, density = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) density[x + size * (y + size * z)] = fn(x * .5, y * .5, z * .5);
  return { id, origin: { x: 0, y: 0, z: 0 }, size, step: .5, density };
}
const downward = () => new THREE.Ray(new THREE.Vector3(4, 10, 4), new THREE.Vector3(0, -1, 0));

describe('direct density field intersections', () => {
  it('reconstructs x-fastest trilinear samples and clamps border lookups', () => {
    const data = brick((x, y, z) => x + 2 * y + 3 * z);
    expect(sampleField(data, 1.2, 2.3, 3.4)).toBeCloseTo(16);
    expect(sampleField(data, -1, 0, 0)).toBe(0);
    expect(sampleField(data, 9, 8, 8)).toBe(48);
  });
  it('intersects surface density, not the proxy box and not a density-sized sphere step', () => {
    const data = brick((_x, y) => 1000 * (y - 3.87)), ray = downward();
    const interval = fieldRayInterval(ray, data, 0, 32)!;
    expect(interval).toEqual([2, 10]);
    expect(intersectFieldRay(ray, data, interval)).toBeCloseTo(6.13, 4);
    expect(fieldNormal(data, new THREE.Vector3(4, 3.87, 4)).toArray()).toEqual([0, 1, 0]);
  });
  it('finds a crossing when starting inside the box or inside solid density', () => {
    const data = brick(), ray = new THREE.Ray(new THREE.Vector3(4, 2, 4), new THREE.Vector3(0, 1, 0));
    expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 32)!)).toBeCloseTo(2);
    ray.origin.y = 6; ray.direction.y = -1;
    expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 32)!)).toBeCloseTo(2);
  });
  it('keeps planar normals continuous at a brick face with one-sided gradients', () => {
    const data = brick((x, y) => x + y - 4);
    const edge = fieldNormal(data, new THREE.Vector3(0, 4, 4));
    const inside = fieldNormal(data, new THREE.Vector3(2, 2, 4));
    expect(edge.distanceTo(inside)).toBeLessThan(1e-8);
    expect(edge.x).toBeCloseTo(Math.SQRT1_2);
  });
  it('does not cap solid bricks at boundaries and respects the finite segment', () => {
    const ray = downward();
    for (const value of [-2, 2]) { const data = brick(() => value); expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 32)!)).toBeNull(); }
    const data = brick();
    expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 5)!)).toBeNull();
    expect(fieldRayInterval(ray, data, 0, 1)).toBeNull();
    expect(fieldRayInterval(ray, data, 7, 6)).toBeNull();
    expect(fieldRayInterval(ray, data, NaN, 32)).toBeNull();
  });
  it('handles axis-parallel face rays, exact zero samples, and invalid rays', () => {
    const data = brick(), ray = downward(); ray.origin.x = 8;
    expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 32)!)).toBe(6);
    ray.origin.x = 8.01; expect(fieldRayInterval(ray, data, 0, 32)).toBeNull();
    ray.origin.x = 4; ray.origin.y = 4;
    expect(intersectFieldRay(ray, data, fieldRayInterval(ray, data, 0, 32)!)).toBe(0);
    ray.direction.set(0, 0, 0); expect(fieldRayInterval(ray, data, 0, 32)).toBeNull();
    ray.direction.y = NaN; expect(fieldRayInterval(ray, data, 0, 32)).toBeNull();
  });
});

describe('direct density texture lifecycle', () => {
  it('uses only a shared twelve-triangle proxy and 17³ R16F density values', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene), data = brick();
    terrain.update(data);
    const proxy = scene.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
    expect(proxy.geometry.index?.count).toBe(36);
    expect(proxy.material.side).toBe(THREE.BackSide);
    expect(proxy.material.fragmentShader).toContain('gl_FragDepth = depth');
    expect(proxy.material.fragmentShader).toContain('tonemapping_fragment');
    expect(proxy.material.uniforms.fieldDensity.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(proxy.material.uniforms.fieldDensity.value.type).toBe(THREE.HalfFloatType);
    expect(proxy.material.uniforms.fieldDensity.value.image.data.byteLength).toBe(17 ** 3 * 2);
    terrain.update(brick(undefined, 'second'));
    expect((scene.children[1] as THREE.Mesh).geometry).toBe(proxy.geometry);
    expect(terrain.stats).toMatchObject({ residentBricks: 2, surfaceBricks: 2, surfaceTriangles: 0 });
    terrain.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('publishes only after texture upload, preserves old data on failure and disposes replacements', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene);
    const upload = vi.fn(), renderer = { initTexture: upload } as unknown as THREE.WebGLRenderer;
    terrain.update(brick(), renderer);
    const old = scene.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
    const disposeTexture = vi.spyOn(old.material.uniforms.fieldDensity.value as THREE.Texture, 'dispose');
    const disposeMaterial = vi.spyOn(old.material, 'dispose');
    upload.mockImplementation(() => { expect(scene.children[0]).toBe(old); throw new Error('upload failed'); });
    expect(() => terrain.update(brick(), renderer)).toThrow('upload failed');
    expect(scene.children[0]).toBe(old); expect(disposeTexture).not.toHaveBeenCalled();
    upload.mockImplementation(() => {}); terrain.beginUploadFrame(); terrain.update(brick(), renderer);
    expect(disposeTexture).toHaveBeenCalledTimes(1); expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(terrain.stats).toMatchObject({ count: 1, bytes: 17 ** 3 * 2, residentBricks: 1, residentBytes: 17 ** 3 * 2 });
    const geometryDispose = vi.spyOn(old.geometry, 'dispose'); terrain.dispose(); terrain.dispose(); expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
  it('retains empty/solid IDs without rendering geometry, and releases a removed surface texture', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene);
    terrain.update(brick()); terrain.update(brick(() => -5)); terrain.update(brick(() => 5, 'air'));
    expect(terrain.ids()).toEqual(['0,0,0', 'air']); expect(terrain.has('air')).toBe(true);
    expect(scene.children).toHaveLength(0); expect(terrain.stats.residentBytes).toBe(0);
    terrain.remove(['air']); expect(terrain.ids()).toEqual(['0,0,0']); terrain.dispose();
  });
  it('raycasts active density only, preserves the caller bounds and uses an outward normal', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene), data = brick();
    terrain.setActive([]); terrain.update(data);
    const ray = new THREE.Raycaster(downward().origin, downward().direction);
    expect(terrain.raycast(ray)).toBeUndefined();
    terrain.setActive([data.id]); const hit = terrain.raycast(ray)!;
    expect(hit.distance).toBe(6); expect(hit.point.toArray()).toEqual([4, 4, 4]); expect(hit.normal?.y).toBe(1);
    expect(ray.far).toBe(Infinity); expect(terrain.raycastStats.candidates).toBe(1);
    ray.far = 5; expect(terrain.raycast(ray)).toBeUndefined(); expect(ray.far).toBe(5);
    terrain.dispose();
  });
  it('rejects malformed/nonfinite fields before replacing the current brick', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene); terrain.update(brick());
    const old = scene.children[0], bad = brick(); bad.density[0] = NaN;
    expect(() => terrain.update(bad)).toThrow('finite half-float');
    expect(() => terrain.update({ ...brick(), step: 0 })).toThrow('layout');
    expect(() => terrain.update({ ...brick(), density: new Float32Array(1) })).toThrow('layout');
    expect(scene.children[0]).toBe(old); terrain.dispose();
  });
});
