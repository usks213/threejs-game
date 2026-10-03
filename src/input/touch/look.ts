export function cameraInput(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const camera = { yaw: 0, pitch: 0.55, distance:7, sensitivity:1 };
  let pointer: number | null = null, x = 0, y = 0;
  const clear = () => { pointer = null; };
  canvas.addEventListener('pointerdown', e => { if (pointer !== null) return; pointer = e.pointerId; x = e.clientX; y = e.clientY; canvas.setPointerCapture(e.pointerId); }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    camera.yaw -= (e.clientX - x) * 0.006 * camera.sensitivity;
    camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.pitch + (e.clientY - y) * 0.006 * camera.sensitivity));
    x = e.clientX; y = e.clientY;
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, e => { if (e.pointerId === pointer) clear(); }, { signal });
  window.addEventListener('blur', clear, { signal }); window.addEventListener('resize', clear, { signal }); document.addEventListener('visibilitychange', clear, { signal });
  canvas.addEventListener('wheel',e=>{e.preventDefault();camera.distance=Math.max(4,Math.min(11,camera.distance+e.deltaY*.008));},{signal,passive:false});
  return camera;
}

