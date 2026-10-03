export function cameraInput(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const camera = { yaw: 0, pitch: 0.55 };
  let pointer: number | null = null, x = 0, y = 0;
  const clear = () => { pointer = null; };
  canvas.addEventListener('pointerdown', e => { if (pointer !== null) return; pointer = e.pointerId; x = e.clientX; y = e.clientY; canvas.setPointerCapture(e.pointerId); }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    camera.yaw -= (e.clientX - x) * 0.006;
    camera.pitch = Math.max(0.25, Math.min(0.95, camera.pitch + (e.clientY - y) * 0.004));
    x = e.clientX; y = e.clientY;
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, e => { if (e.pointerId === pointer) clear(); }, { signal });
  window.addEventListener('blur', clear, { signal }); window.addEventListener('resize', clear, { signal }); document.addEventListener('visibilitychange', clear, { signal });
  return camera;
}
