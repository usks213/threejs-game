import * as THREE from 'three';
import type { Player } from '../../core/player';
export function followCamera(camera: THREE.PerspectiveCamera, player: Player, dt: number) {
  const blend = 1 - Math.exp(-8 * dt);
  camera.position.x += (player.x - camera.position.x) * blend;
  camera.position.y += (9 - camera.position.y) * blend;
  camera.position.z += (player.z + 11 - camera.position.z) * blend;
  camera.lookAt(player.x, 0.6, player.z);
}
