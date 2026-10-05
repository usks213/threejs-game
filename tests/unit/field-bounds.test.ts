import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fieldSurfaceBounds } from '../../src/rendering/voxel/field-bounds';
import { createFieldTerrain } from '../../src/rendering/voxel/field-terrain';
import { FIELD_MAX_STEPS, fieldNormal, fieldRayInterval, intersectFieldRay } from '../../src/rendering/voxel/field-raycast';
import { SdfWorld } from '../../src/world/density';
import { sampleFieldBrick, type FieldData } from '../../src/world/field-data';
import type { Vec3 } from '../../src/world/types';

function field(fn: (x: number, y: number, z: number) => number, origin: Vec3 = { x: 0, y: 0, z: 0 }, step = .5): FieldData {
  const size = 8 / step + 1, density = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    density[x + size * (y + size * z)] = fn(origin.x + x * step, origin.y + y * step, origin.z + z * step);
  }
  return { id: 'fixture', origin, size, step, density };
}

/** Independent property check against the actual half-float texture's cells. */
function expectEverySurfaceCellEnclosed(data: FieldData) {
  const bounds = fieldSurfaceBounds(data), n = data.size, d = Array.from(data.density, value => THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(value)));
  let crossing = 0, outside = 0;
  for (let z = 0; z < n - 1; z++) for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const corners: number[] = [];
    for (const dz of [0, 1]) for (const dy of [0, 1]) for (const dx of [0, 1]) corners.push(d[x + dx + n * (y + dy + n * (z + dz))]);
    if (Math.min(...corners) > 1e-6 || Math.max(...corners) < -1e-6) continue;
    crossing++;
    for (const [axis, coordinate] of [['x', x], ['y', y], ['z', z]] as const) {
      const low = data.origin[axis] + coordinate * data.step, high = low + data.step;
      if (!bounds || low < bounds.min[axis] || high > bounds.max[axis]) outside++;
    }
  }
  expect(crossing).toBeGreaterThan(0); expect(outside).toBe(0);
  return bounds!;
}

describe('conservative density surface bounds', () => {
  it('excludes uniform air and solid while keeping a plane in its complete interpolation cell', () => {
    expect(fieldSurfaceBounds(field(() => 2))).toBeNull();
    expect(fieldSurfaceBounds(field(() => -2))).toBeNull();
    const data = field((_x, y) => y - 3.87), bounds = expectEverySurfaceCellEnclosed(data);
    expect(bounds).toEqual({ min: { x: 0, y: 3.5, z: 0 }, max: { x: 8, y: 4, z: 8 } });
    // A vertical ray now traverses 2 half-cell steps instead of 32, with the
    // same underlying texture and 96-step ceiling, not fewer samples per metre.
    expect((bounds.max.y - bounds.min.y) / (data.step * .5)).toBe(2);
    expect(FIELD_MAX_STEPS).toBe(96);
  });

  it('retains both sides of boundary-aligned planes and zero-tolerance half-float samples', () => {
    for (const plane of [0, 4, 8]) {
      const data = field((_x, y) => y - plane), bounds = expectEverySurfaceCellEnclosed(data);
      expect(bounds.min.y).toBe(Math.max(0, plane - .5)); expect(bounds.max.y).toBe(Math.min(8, plane + .5));
    }
    expectEverySurfaceCellEnclosed(field((x, y) => x < 4 ? y - 4 : 1.02e-6));
    expect(fieldSurfaceBounds(field(() => 0))).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 8, z: 8 } });
  });

  it('contains cave ceilings, interior surfaces and separated overhangs in translated negative bricks', () => {
    const origin = { x: -16, y: -8, z: -24 };
    for (const step of [.5, 1, 2]) {
      const cavity = field((x, y, z) => 1.7 - Math.hypot(x + 12, y + 4, z + 20), origin, step);
      const bounds = expectEverySurfaceCellEnclosed(cavity);
      expect(bounds.min.y).toBeLessThan(-4); expect(bounds.max.y).toBeGreaterThan(-4);
      expectEverySurfaceCellEnclosed(field((x, y, z) => Math.min(Math.hypot(x + 14, y + 6, z + 22) - 1, Math.hypot(x + 10, y + 2, z + 18) - 1), origin, step));
    }
  });

  it('keeps all reconstructed surfaces after real dig/add edits and mixed-LOD boundary correction', () => {
    const world = new SdfWorld(undefined, 3), origin = { x: -8, y: -8, z: 0 };
    world.apply({ id: 1, tick: 1, kind: 'dig', material: 'stone', position: { x: -4, y: -4, z: 4 }, radius: 2 });
    world.apply({ id: 2, tick: 2, kind: 'add', material: 'stone', position: { x: -4, y: 3, z: 4 }, radius: 1.5 });
    const before = JSON.stringify(world.edits);
    for (const y of [-8, 0]) {
      const data = sampleFieldBrick(world, { id: 'edited', origin: { ...origin, y }, step: .5, fieldLod: { faces: [2, 2, 2, 2, 2, 2], edges: Array(12).fill(2) } }).field!;
      expectEverySurfaceCellEnclosed(data);
    }
    expect(JSON.stringify(world.edits)).toBe(before);
  });

  it('binds proxy and shader bounds separately from texture coordinates and preserves sloped reticle normals', () => {
    const scene = new THREE.Scene(), terrain = createFieldTerrain(scene), data = field((x, y) => y + x * .1 - 3.87);
    terrain.update(data);
    const proxy = scene.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>, bounds = fieldSurfaceBounds(data)!;
    expect(proxy.scale.y).toBeLessThan(proxy.scale.x);
    expect(proxy.material.uniforms.fieldBoundsMin.value.toArray()).toEqual([bounds.min.x, bounds.min.y, bounds.min.z]);
    expect(proxy.material.uniforms.fieldBoundsMax.value.toArray()).toEqual([bounds.max.x, bounds.max.y, bounds.max.z]);
    expect(proxy.material.uniforms.fieldOrigin.value.toArray()).toEqual([0, 0, 0]);
    expect(proxy.material.uniforms.fieldSize.value).toBe(17);
    expect(proxy.material.fragmentShader).toContain('(fieldBoundsMin[axis] - origin[axis])');
    expect(proxy.material.fragmentShader).toContain('gl_FragDepth = depth');
    const ray = new THREE.Raycaster(new THREE.Vector3(4, 10, 4), new THREE.Vector3(0, -1, 0)), hit = terrain.raycast(ray)!;
    expect(hit.distance).toBeCloseTo(intersectFieldRay(ray.ray, data, fieldRayInterval(ray.ray, data, 0, 32)!)!);
    const expected = fieldNormal(data, hit.point);
    expect(hit.normal!.distanceTo(expected)).toBeLessThan(1e-8);
    expect(hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).distanceTo(expected)).toBeLessThan(1e-8);
    const oldTexture = proxy.material.uniforms.fieldDensity.value;
    terrain.update(field((_x, y) => y - 7));
    const replacement = scene.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
    expect(replacement.material.uniforms.fieldBoundsMax.value.y).toBe(7.5);
    expect(replacement.material.uniforms.fieldDensity.value).not.toBe(oldTexture);
    terrain.dispose();
  });
});
