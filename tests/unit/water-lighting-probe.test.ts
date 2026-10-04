import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { probeWaterLighting } from '../../src/rendering/water/lighting-probe';

function fixture() {
  const scene = new THREE.Scene(); scene.environment = new THREE.Texture();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, -.5, -.5, 0, .5, .5, 0, -.5], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const water = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial()); scene.add(water, new THREE.LightProbe());
  const original = new THREE.WebGLRenderTarget(1, 1), energies = new Map<THREE.WebGLRenderTarget, number>();
  let target: THREE.WebGLRenderTarget | null = original;
  const renderer = {
    autoClear: false, xr: { enabled: true }, shadowMap: { enabled: true },
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getClearColor: (color: THREE.Color) => color.set('red'), getClearAlpha: () => .5,
    getViewport: (v: THREE.Vector4) => v.set(1, 2, 3, 4), getScissor: (v: THREE.Vector4) => v.set(5, 6, 7, 8), getScissorTest: () => true,
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => { target = value; }),
    setClearColor: vi.fn(), setViewport: vi.fn(), setScissor: vi.fn(), setScissorTest: vi.fn(),
    render: vi.fn((sample: THREE.Scene) => {
      expect((sample.children[0] as THREE.Mesh).geometry).toBe(geometry);
      expect((sample.children[0] as THREE.Mesh).material).toBe(water.material);
      energies.set(target!, sample.environment ? .3 : .01);
    }),
    readRenderTargetPixelsAsync: vi.fn(async (t: THREE.WebGLRenderTarget, _x: number, _y: number, _w: number, _h: number, data: Uint16Array) => {
      for (let i = 0; i < data.length; i += 4) { data.fill(THREE.DataUtils.toHalfFloat(energies.get(t)!), i, i + 3); data[i + 3] = THREE.DataUtils.toHalfFloat(.86); }
    }),
  };
  return { scene, water, renderer, original, asRenderer: renderer as unknown as THREE.WebGLRenderer };
}

describe('opt-in live water lighting probe', () => {
  it('compares the same live water with sky lighting removed, restoring render state before asynchronous reads finish', async () => {
    const { scene, water, renderer, original, asRenderer } = fixture();
    const materialDispose = vi.spyOn(water.material, 'dispose');
    const result = probeWaterLighting(asRenderer, scene, water);
    expect(renderer.getRenderTarget()).toBe(original);
    expect(renderer.autoClear).toBe(false); expect(renderer.xr.enabled).toBe(true); expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.setViewport).toHaveBeenCalledWith(new THREE.Vector4(1, 2, 3, 4));
    expect(renderer.setScissor).toHaveBeenCalledWith(new THREE.Vector4(5, 6, 7, 8));
    const reading = await result;
    expect(reading).toMatchObject({ waterPixels: 256, invalidPixels: 0 }); expect(reading.environmentGain).toBeGreaterThan(.28);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(2);
    expect(water.parent).toBe(scene); expect(scene.environment).not.toBeNull(); expect(materialDispose).not.toHaveBeenCalled();
  });

  it('restores renderer state and rejects a failed diagnostic without changing the actual water', async () => {
    const { scene, water, renderer, original, asRenderer } = fixture();
    renderer.render.mockImplementation(() => { throw new Error('context lost'); });
    await expect(probeWaterLighting(asRenderer, scene, water)).rejects.toThrow('context lost');
    expect(renderer.getRenderTarget()).toBe(original); expect(renderer.shadowMap.enabled).toBe(true); expect(water.parent).toBe(scene);
  });
});
