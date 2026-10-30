import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Image-based lighting from a procedural room environment (no external assets).
 * Metals in this project previously rendered as flat grey plastic because
 * MeshStandardMaterial metalness had no environment to reflect. ACES tone
 * mapping keeps the added reflections from clipping the UI-like palette.
 * Returns the environment texture so the caller can dispose it.
 */
export function setupStudioLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, environmentIntensity = .85): THREE.Texture {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();
  scene.environment = texture;
  scene.environmentIntensity = environmentIntensity;
  return texture;
}

/** Soft radial blob used as a contact shadow: dark centre fading to transparent. */
export function makeBlobShadowTexture(): THREE.Texture {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, size * .06, size / 2, size / 2, size * .5);
  gradient.addColorStop(0, 'rgba(10,16,28,0.92)');
  gradient.addColorStop(.55, 'rgba(10,16,28,0.45)');
  gradient.addColorStop(1, 'rgba(10,16,28,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
