import { landscapeDelta } from '../../platform/viewport/landscape';
export const DEFAULT_CAMERA_PITCH=0.32;
export function cameraInput(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const camera = { yaw: 0, pitch: DEFAULT_CAMERA_PITCH, distance:7, sensitivity:1 };
  let pointer: number | null = null, x = 0, y = 0;
  const clear = () => { pointer = null; };
  canvas.addEventListener('pointerdown', e => { if(e.pointerType==='mouse'&&e.button!==1)return;if (pointer !== null) return; pointer = e.pointerId; x = e.clientX; y = e.clientY; canvas.setPointerCapture(e.pointerId); }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    const delta=landscapeDelta(e.clientX-x,e.clientY-y,innerWidth,innerHeight);camera.yaw -= delta.x * 0.006 * camera.sensitivity;
    camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch + delta.y * 0.006 * camera.sensitivity));
    x = e.clientX; y = e.clientY;
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, e => { if (e.pointerId === pointer) clear(); }, { signal });
  window.addEventListener('blur', clear, { signal }); window.addEventListener('resize', clear, { signal }); document.addEventListener('visibilitychange', clear, { signal });
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=Math.max(4,Math.min(11,camera.distance+e.deltaY*.008));},{signal,passive:false});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas)return;camera.yaw-=e.movementX*.003*camera.sensitivity;camera.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.pitch+e.movementY*.003*camera.sensitivity));},{signal});
  return camera;
}

