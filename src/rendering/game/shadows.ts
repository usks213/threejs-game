import * as THREE from 'three';
import type { Snapshot } from '../../simulation/protocol';
import { Instances } from './instances';

/** Ground contact shading in one draw call; this is not a directional shadow map. */
export function createContactShadows(scene: THREE.Scene) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1), i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 1.8) * 150);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat); texture.needsUpdate = true; texture.magFilter = THREE.LinearFilter;
  const geometry = new THREE.PlaneGeometry(2, 2); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: '#18241f', map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const batch = new Instances(scene, geometry, material, false), matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function add(x: number, y: number, z: number, radius: number): void { matrix.compose(position.set(x, y + 0.025, z), rotation, scale.set(radius, 1, radius)); batch.add(matrix); }
  return {
    update(state: Snapshot): void {
      batch.begin();
      if (state.player.grounded) add(state.player.x, state.player.y, state.player.z, 0.65);
      for (const peer of state.peers ?? []) if (peer.player.grounded) add(peer.player.x, peer.player.y, peer.player.z, 0.65);
      for (const n of state.adventure.resources) if (n.ready <= state.adventure.seconds) add(n.x, n.y, n.z, n.kind === 'wood' ? 1 : 0.85);
      for (const e of state.adventure.enemies) if (e.health > 0) add(e.x, e.y, e.z, e.boss ? 1.8 : 0.8);
      for (const b of state.bodies) if (b.sleeping) add(b.position.x, b.position.y - b.radius, b.position.z, b.radius * 1.2);
      batch.end();
    },
    dispose(): void { batch.dispose(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
