import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createAtmosphere } from '../../src/rendering/environment/atmosphere';
import { directSkyIntensity } from '../../src/rendering/environment/direct-environment';
import { captureProbe } from '../../src/rendering/environment/probe';
import type { AdventureSnapshot } from '../../src/game/types';

vi.mock('../../src/rendering/environment/probe', () => ({ captureProbe: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function state(hour: number, weather = 'clear') {
  return { environment: { hour, weather, seconds: 20 }, enemies: [] } as unknown as AdventureSnapshot;
}

describe('direct PBR sky lighting', () => {
  it('restores missing IBL/SH independently of post-processing, with a single cached daytime capture', async () => {
    const target = new THREE.WebGLRenderTarget(96, 128);
    const capture = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue(target);
    const cube = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => {});
    const sh = new THREE.SphericalHarmonics3(); sh.coefficients[0].set(1, 2, 3);
    vi.mocked(captureProbe).mockResolvedValue(new THREE.LightProbe(sh));
    const scene = new THREE.Scene(), renderer = { compile: vi.fn() } as unknown as THREE.WebGLRenderer;
    const atmosphere = createAtmosphere(scene, renderer), probe = scene.children.find(o => o instanceof THREE.LightProbe) as THREE.LightProbe;
    atmosphere.prepareDirect(); expect(capture).not.toHaveBeenCalled();
    atmosphere.update(state(0), new THREE.Vector3());
    // Reproduces the original direct path: update() alone leaves physical water unlit by the sky.
    expect(scene.environment).toBeNull(); expect(probe.sh.coefficients[0].length()).toBe(0);
    atmosphere.prepareDirect(); await Promise.resolve(); atmosphere.prepareDirect();
    expect(scene.environment).toBe(target.texture); expect(probe.sh.coefficients[0].length()).toBeGreaterThan(0);
    expect(atmosphere.stats).toMatchObject({ lightingMode: 'cached-direct', iblUpdates: 1, shUpdates: 1, probeError: '' });
    const source = capture.mock.calls[0][0], sky = source.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(capture.mock.calls[0][4]).toEqual({ size: 32 });
    expect(sky.material.uniforms.nightAmount.value).toBe(0);
    expect(sky.material.uniforms.sunPosition.value.y).toBeGreaterThan(400000);
    const visibleSky = scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(visibleSky.material.uniforms.nightAmount.value).toBe(1);
    const nightEnergy = atmosphere.stats.shEnergy, nightIntensity = scene.environmentIntensity;
    for (let i = 0; i < 100; i++) { atmosphere.update(state(12, i % 2 ? 'rain' : 'clear'), new THREE.Vector3()); atmosphere.prepareDirect(); }
    expect(atmosphere.stats.shEnergy).toBeGreaterThan(nightEnergy * 30);
    expect(scene.environmentIntensity).toBeGreaterThan(nightIntensity * 30);
    expect(capture).toHaveBeenCalledTimes(1); expect(cube).toHaveBeenCalledTimes(1); expect(captureProbe).toHaveBeenCalledTimes(1);
    const dispose = vi.spyOn(target, 'dispose'); atmosphere.dispose(); expect(scene.environment).toBeNull(); expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('leaves ordinary atmosphere capture untouched and allocates no direct cache when unused', () => {
    const capture = vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene');
    const scene = new THREE.Scene(), renderer = { compile: vi.fn() } as unknown as THREE.WebGLRenderer;
    const atmosphere = createAtmosphere(scene, renderer);
    atmosphere.update(state(12), new THREE.Vector3());
    expect(atmosphere.stats.lightingMode).toBe('captured'); expect(capture).not.toHaveBeenCalled();
    expect(renderer.compile).toHaveBeenCalledTimes(1); atmosphere.dispose();
  });

  it('dims continuously through twilight and weather, without a black night or bright night-first amplification', () => {
    expect(directSkyIntensity(1, 0, false)).toBe(1);
    expect(directSkyIntensity(-1, 1, false)).toBeCloseTo(.012);
    expect(directSkyIntensity(1, 0, true)).toBeCloseTo(.65);
    const dusk = directSkyIntensity(0, .5, false);
    expect(dusk).toBeGreaterThan(.012); expect(dusk).toBeLessThan(.035);
  });
});
