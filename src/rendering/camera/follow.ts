import * as THREE from 'three';

export const CAMERA_FOCUS_HEIGHT = 1.35;
export const CAMERA_SHOULDER_OFFSET = .6;
export const CAMERA_RADIUS = .2;

/** A shoulder-height pivot keeps the character to the left of the center reticle. */
export function orbitPose(player: THREE.Vector3, yaw: number, pitch: number, focus: THREE.Vector3, offset: THREE.Vector3, up: THREE.Vector3): void {
  const sin = Math.sin(yaw), cos = Math.cos(yaw), elevation = Math.sin(pitch), horizontal = Math.cos(pitch);
  focus.set(player.x + cos * CAMERA_SHOULDER_OFFSET, player.y + CAMERA_FOCUS_HEIGHT, player.z - sin * CAMERA_SHOULDER_OFFSET);
  offset.set(sin * horizontal, elevation, cos * horizontal);
  // This orbit-relative up vector also works at exactly +90° and -90° pitch.
  up.set(-sin * elevation, horizontal, -cos * elevation);
}

export type CameraCast = (origin: THREE.Vector3, direction: THREE.Vector3, limit: number) => number;

/** Five rays sweep the camera volume, including the lateral shoulder offset. */
export function createCameraBoom(cast: CameraCast) {
  const anchor = new THREE.Vector3(), desired = new THREE.Vector3(), direction = new THREE.Vector3();
  const right = new THREE.Vector3(), sweepUp = new THREE.Vector3(), probe = new THREE.Vector3();
  const samples = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  let previousLength: number | null = null;
  return (player: THREE.Vector3, focus: THREE.Vector3, backward: THREE.Vector3, up: THREE.Vector3, distance: number, dt: number, position: THREE.Vector3): number => {
    anchor.copy(player); anchor.y += CAMERA_FOCUS_HEIGHT;
    desired.copy(focus).addScaledVector(backward, distance);
    direction.copy(desired).sub(anchor);
    const length = direction.length(); direction.divideScalar(length);
    right.crossVectors(up, direction).normalize(); sweepUp.crossVectors(direction, right).normalize();
    let clear = length;
    for (const [x, y] of samples) {
      probe.copy(anchor).addScaledVector(right, x * CAMERA_RADIUS).addScaledVector(sweepUp, y * CAMERA_RADIUS);
      const hit = cast(probe, direction, length);
      if (hit < length) clear = Math.min(clear, Math.max(0, hit - .06));
      if (clear === 0) break;
    }
    // Retract immediately; ease only the recovery so walls never lag behind the camera.
    previousLength = previousLength === null || clear < previousLength ? clear : THREE.MathUtils.lerp(previousLength, clear, 1 - Math.exp(-12 * dt));
    const fraction = Math.min(1, previousLength / length);
    focus.lerpVectors(anchor, focus, fraction);
    position.copy(focus).addScaledVector(backward, distance * fraction);
    return distance * fraction;
  };
}
