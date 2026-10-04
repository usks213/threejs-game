import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTerrain } from '../../src/rendering/voxel/terrain';
import { TerrainUploads } from '../../src/rendering/voxel/terrain-uploads';
import { rayBoxEntry, TerrainRaycasts } from '../../src/rendering/voxel/terrain-raycast';
import { disposeSurfaceMaps } from '../../src/rendering/materials/pbr';
import type { MeshData } from '../../src/world/types';

function rendererStub() {
  let target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(12, 6), face = 2, mip = 1;
  const originalTarget = target;
  const renderer = {
    autoClear: true, shadowMap: { enabled: true, needsUpdate: true }, xr: { enabled: true }, info: { autoReset: true },
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null, nextFace = 0, nextMip = 0) => { target = next; face = nextFace; mip = nextMip; }),
    render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera) => {}),
  };
  return { renderer, asRenderer: renderer as unknown as THREE.WebGLRenderer, originalTarget };
}
function data(id = '0,0,0'): MeshData {
  const origin = id.split(',').map(value => Number(value) * 8 + 4);
  return { id, origin: { x: origin[0], y: origin[1], z: origin[2] }, bounds: { center: { x: 0, y: 0, z: 0 }, radius: 6 }, grass: new Float32Array(), positions: new Float32Array([-3, 0, -3, 0, 0, 3, 3, 0, -3]), normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), colors: new Float32Array(9).fill(.5), indices: new Uint32Array([0, 1, 2]), milliseconds: 0 };
}
function geometry() {
  const mesh = data(), result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  result.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  result.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return result;
}
afterEach(disposeSurfaceMaps);

describe('terrain buffer submission', () => {
  it('submits all fine/coarse attributes and indices with zero triangles, then restores renderer state and draw ranges', () => {
    const uploads = new TerrainUploads(), { renderer, asRenderer, originalTarget } = rendererStub();
    const fine = geometry(), coarse = geometry(); fine.setDrawRange(1, 2);
    const finePosition = fine.attributes.position, coarseIndex = coarse.index;
    renderer.render.mockImplementation(scene => {
      expect(renderer.getRenderTarget()?.width).toBe(1); expect(renderer.getRenderTarget()?.height).toBe(1);
      expect(renderer.autoClear).toBe(false); expect(renderer.shadowMap.enabled).toBe(false); expect(renderer.xr.enabled).toBe(false);
      expect(scene.children).toHaveLength(2);
      for (const child of scene.children) {
        const proxy = child as THREE.Mesh;
        expect(proxy.frustumCulled).toBe(false); expect(proxy.castShadow).toBe(false);
        expect(proxy.geometry.drawRange).toEqual({ start: 0, count: 0 });
        expect(Object.keys(proxy.geometry.attributes)).toEqual(['position', 'normal', 'color']);
        expect(proxy.geometry.index?.count).toBe(3);
      }
      expect((scene.children[0] as THREE.Mesh).geometry.attributes.position).toBe(finePosition);
      expect((scene.children[1] as THREE.Mesh).geometry.index).toBe(coarseIndex);
    });
    uploads.submit(asRenderer, [fine, coarse]);
    expect(uploads.stats).toMatchObject({ count: 2, bytes: 240, warmed: true });
    expect(uploads.stats.uploadSubmissionMs).toBeGreaterThanOrEqual(0);
    expect(fine.drawRange).toEqual({ start: 1, count: 2 }); expect(coarse.drawRange.count).toBe(Infinity);
    expect(renderer.getRenderTarget()).toBe(originalTarget); expect(renderer.getActiveCubeFace()).toBe(2); expect(renderer.getActiveMipmapLevel()).toBe(1);
    expect(renderer.autoClear).toBe(true); expect(renderer.shadowMap.enabled).toBe(true); expect(renderer.shadowMap.needsUpdate).toBe(true); expect(renderer.xr.enabled).toBe(true); expect(renderer.info.autoReset).toBe(true);
    uploads.beginFrame(); expect(uploads.stats).toMatchObject({ count: 0, bytes: 0, uploadSubmissionMs: 0, warmed: true });
    const disposeFine = vi.spyOn(fine, 'dispose'); uploads.dispose(); expect(disposeFine).not.toHaveBeenCalled();
    fine.dispose(); coarse.dispose(); originalTarget.dispose();
  });
  it('warms once, and restores geometry/render state even if submission fails', () => {
    const uploads = new TerrainUploads(), { renderer, asRenderer, originalTarget } = rendererStub(), mesh = geometry();
    uploads.warm(asRenderer); uploads.warm(asRenderer); expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(uploads.stats.count).toBe(0);
    renderer.render.mockImplementation(() => { throw new Error('context lost'); });
    expect(() => uploads.submit(asRenderer, [mesh])).toThrow('context lost');
    expect(mesh.drawRange.count).toBe(Infinity); expect(renderer.getRenderTarget()).toBe(originalTarget); expect(renderer.shadowMap.enabled).toBe(true);
    expect(uploads.stats.count).toBe(0); uploads.dispose(); mesh.dispose(); originalTarget.dispose();
  });
  it('uploads both LODs before publishing, keeps inactive halo out of rendering/raycast, and disposes replacements', () => {
    const scene = new THREE.Scene(), terrain = createTerrain(scene), { renderer, asRenderer, originalTarget } = rendererStub();
    const chunk = data(); chunk.coarse = data();
    renderer.render.mockImplementation(uploadScene => {
      expect(uploadScene.children).toHaveLength(2);
      expect(terrain.has(chunk.id)).toBe(false);
    });
    terrain.setActive([]); terrain.update(chunk, asRenderer);
    const lod = scene.children.find(child => child instanceof THREE.LOD) as THREE.LOD;
    expect(lod.visible).toBe(false); expect(lod.levels).toHaveLength(2);
    const ray = new THREE.Raycaster(new THREE.Vector3(4, 10, 4), new THREE.Vector3(0, -1, 0));
    expect(terrain.raycast(ray)).toBeUndefined();
    terrain.setActive([chunk.id]); expect(lod.visible).toBe(true); expect(terrain.raycast(ray)?.distance).toBeCloseTo(6);
    const oldFine = (lod.levels[0].object as THREE.Mesh).geometry, oldCoarse = (lod.levels[1].object as THREE.Mesh).geometry;
    const fineDisposed = vi.spyOn(oldFine, 'dispose'), coarseDisposed = vi.spyOn(oldCoarse, 'dispose');
    renderer.render.mockImplementation(() => {}); terrain.beginUploadFrame(); terrain.update(chunk, asRenderer);
    expect(fineDisposed).toHaveBeenCalledTimes(1); expect(coarseDisposed).toHaveBeenCalledTimes(1);
    expect(terrain.stats.count).toBe(2); expect(terrain.ids()).toEqual([chunk.id]);
    terrain.dispose(); expect(scene.children).toHaveLength(0); originalTarget.dispose();
  });
});

describe('bounded terrain raycasts', () => {
  it('handles finite segments, origin-inside, boundary-parallel and invalid rays', () => {
    const box = new THREE.Box3(new THREE.Vector3(-4, -4, -4), new THREE.Vector3(4, 4, 4));
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
    expect(rayBoxEntry(ray, box, 0, 1)).toBe(0);
    ray.origin.set(-10, 4, 0); expect(rayBoxEntry(ray, box, 0, 5)).toBeNull(); expect(rayBoxEntry(ray, box, 0, 6)).toBe(6);
    ray.origin.y = 4.1; expect(rayBoxEntry(ray, box, 0, 20)).toBeNull();
    ray.origin.y = NaN; expect(rayBoxEntry(ray, box, 0, 20)).toBeNull();
  });
  it('skips off-ray/far bricks before triangle tests and preserves the caller far bound', () => {
    const rays = new TerrainRaycasts(), ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const entries = [2, 12, 100].map(z => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.position.z = z; mesh.updateMatrixWorld(true);
      return { mesh, bounds: new THREE.Box3(new THREE.Vector3(-1, -1, z - .01), new THREE.Vector3(1, 1, z + .01)) };
    });
    const spies = entries.map(entry => vi.spyOn(entry.mesh, 'raycast'));
    expect(rays.nearest(ray, entries)?.distance).toBe(2);
    expect(spies[0]).toHaveBeenCalledTimes(1); expect(spies[1]).not.toHaveBeenCalled(); expect(spies[2]).not.toHaveBeenCalled();
    expect(ray.far).toBe(Infinity); expect(rays.stats.candidates).toBe(1);
    entries[0].bounds.translate(new THREE.Vector3(100, 0, 0)); expect(rays.nearest(ray, [entries[0], entries[2]])).toBeUndefined();
    entries.forEach(entry => { entry.mesh.geometry.dispose(); (entry.mesh.material as THREE.Material).dispose(); });
  });
});
