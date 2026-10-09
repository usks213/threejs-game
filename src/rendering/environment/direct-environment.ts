import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { captureProbe } from './probe';

/** Direct rendering skips the HDR compositor, but physical materials still need sky light.
 * Capture a small, canonical daylight sky once; subsequent day/night/weather changes only
 * scale its radiance and matching SH. This intentionally approximates moving sky reflections.
 */
export function createDirectEnvironment(renderer: THREE.WebGLRenderer, skyMaterial: THREE.ShaderMaterial) {
  const source = new THREE.Scene(), sky = new Sky();
  sky.material.dispose(); sky.material = skyMaterial.clone(); sky.scale.setScalar(450000);
  const uniforms = sky.material.uniforms;
  uniforms.sunPosition.value.set(0, 1, -.3).normalize().multiplyScalar(450000);
  uniforms.nightAmount.value = 0; uniforms.cloudCover.value = .3;
  // Display calibration belongs to the direct camera, not incident radiance.
  uniforms.skyDisplayGain.value = 1;
  uniforms.turbidity.value = 2.5; uniforms.skyTime.value = 0;
  const ground = new THREE.Mesh(
    new THREE.SphereGeometry(200, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#343e2b', side: THREE.BackSide }),
  );
  source.add(sky, ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cube = new THREE.WebGLCubeRenderTarget(16, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(.1, 500000, cube), irradiance = new THREE.SphericalHarmonics3();
  let environment: THREE.WebGLRenderTarget | null = null, pending = false, disposed = false, cubeReleased = false;
  const releaseCube = () => { if (!cubeReleased) { cubeReleased = true; cube.dispose(); } };
  const stats = { iblUpdates: 0, shUpdates: 0, shEnergy: 0, probeError: '' };
  return {
    stats,
    prepare(scene: THREE.Scene, probe: THREE.LightProbe, altitude: number, night: number, cloudy: boolean) {
      if (disposed) return;
      if (!environment) {
        // A night-first load must also cache the daylight reference, not amplify a dark capture.
        environment = pmrem.fromScene(source, 0, .1, 500000, { size: 32 });
        stats.iblUpdates++;
        camera.update(renderer, source); pending = true;
        void captureProbe(renderer, cube).then(result => {
          if (disposed) return;
          if (!result.sh.coefficients.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) {
            throw new Error('Non-finite direct sky irradiance');
          }
          irradiance.copy(result.sh); stats.shUpdates++;
        }).catch((error: unknown) => {
          if (!disposed) { stats.probeError = String(error); console.error('Direct sky probe failed', error); }
        }).finally(() => { pending = false; releaseCube(); });
      }
      const intensity = directSkyIntensity(altitude, night, cloudy);
      scene.environment = environment.texture; scene.environmentIntensity = .75 * intensity;
      probe.sh.copy(irradiance).scale(intensity);
      stats.shEnergy = probe.sh.coefficients[0].length();
    },
    dispose() {
      if (disposed) return;
      disposed = true; environment?.dispose(); pmrem.dispose();
      if (!pending) releaseCube();
      sky.geometry.dispose(); sky.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
    },
  };
}

/** Relative sky radiance, including twilight and a dim moonlit floor, without GPU recapture. */
export function directSkyIntensity(altitude: number, night: number, cloudy: boolean) {
  const daylight = THREE.MathUtils.lerp(.035, 1, Math.sqrt(Math.max(0, altitude)));
  return THREE.MathUtils.lerp(daylight, .012, night) * (cloudy ? .65 : 1);
}
