import * as THREE from 'three';

// The up vector follows the orbit, so looking exactly vertically stays stable.
export function orbitPose(player: THREE.Vector3, yaw: number, pitch: number, focus: THREE.Vector3, offset: THREE.Vector3, up: THREE.Vector3): void {
  const sin = Math.sin(yaw), cos = Math.cos(yaw), elevation = Math.sin(pitch), horizontal = Math.cos(pitch);
  focus.set(player.x - sin * 1.8, player.y + 0.9, player.z - cos * 1.8);
  offset.set(sin * horizontal, elevation, cos * horizontal);
  up.set(-sin * elevation, horizontal, -cos * elevation);
}
