import { landscapeDelta, viewportSize } from '../../platform/viewport/landscape';
export const DEFAULT_CAMERA_PITCH = .18;
export const DEFAULT_CAMERA_DISTANCE = 5;
export const MIN_CAMERA_DISTANCE = 2.5;
export const MAX_CAMERA_DISTANCE = 8;
export interface CameraView { yaw: number; pitch: number; distance: number; sensitivity: number }

/** Positive pointer movement turns right/down for touch and Pointer Lock alike. */
export function applyCameraLook(camera: CameraView, dx: number, dy: number, scale: number): void {
  camera.yaw -= dx * scale * camera.sensitivity;
  camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch + dy * scale * camera.sensitivity));
}

export function cameraInput(canvas: HTMLCanvasElement, signal: AbortSignal): CameraView {
  const camera = { yaw: 0, pitch: DEFAULT_CAMERA_PITCH, distance: DEFAULT_CAMERA_DISTANCE, sensitivity: 1 };
  let pointer: number | null = null, x = 0, y = 0;
  const clear = () => {
    const active = pointer; pointer = null;
    if (active !== null && canvas.hasPointerCapture(active)) canvas.releasePointerCapture(active);
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && (e.button !== 1 || document.pointerLockElement === canvas)) return;
    if (pointer !== null) return;
    pointer = e.pointerId; x = e.clientX; y = e.clientY; canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer || document.pointerLockElement === canvas) return;
    const size = viewportSize(), delta = landscapeDelta(e.clientX - x, e.clientY - y, size.width, size.height);
    applyCameraLook(camera, delta.x, delta.y, .006);
    x = e.clientX; y = e.clientY;
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, e => { if (e.pointerId === pointer) clear(); }, { signal });
  window.addEventListener('blur', clear, { signal }); window.addEventListener('resize', clear, { signal });
  document.addEventListener('visibilitychange', clear, { signal }); document.addEventListener('pointerlockchange', clear, { signal });
  signal.addEventListener('abort', clear, { once: true });
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); camera.distance = Math.max(MIN_CAMERA_DISTANCE, Math.min(MAX_CAMERA_DISTANCE, camera.distance + e.deltaY * .008));
  }, { signal, passive: false });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    const size = viewportSize(), delta = landscapeDelta(e.movementX, e.movementY, size.width, size.height);
    applyCameraLook(camera, delta.x, delta.y, .003);
  }, { signal });
  return camera;
}
