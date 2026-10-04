import { landscapeDelta } from '../../platform/viewport/landscape';
import type { Axis } from '../../core/player';
export function touchInput(element: HTMLElement, knob: HTMLElement, signal: AbortSignal) {
  const axis: Axis = { x: 0, z: 0 };
  let pointer: number | null = null;
  const clear = () => { pointer = null; axis.x = axis.z = 0; knob.style.transform = 'translate(0px, 0px)'; };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    const box = element.getBoundingClientRect();
    const radius = Math.min(box.width,box.height) * 0.3;
    const delta=landscapeDelta(event.clientX-box.left-box.width/2,event.clientY-box.top-box.height/2,innerWidth,innerHeight);
    const x = delta.x / radius,z=delta.y/radius;
    const scale = Math.max(1, Math.hypot(x, z));
    axis.x = x / scale; axis.z = z / scale;
    knob.style.transform = `translate(${axis.x * radius}px, ${axis.z * radius}px)`;
  };
  element.addEventListener('pointerdown', e => { if (pointer !== null) return; pointer = e.pointerId; element.setPointerCapture(e.pointerId); move(e); }, { signal });
  element.addEventListener('pointermove', move, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) element.addEventListener(type, e => { if (e.pointerId === pointer) clear(); }, { signal });
  window.addEventListener('blur', clear, { signal });
  window.addEventListener('resize', clear, { signal });
  document.addEventListener('visibilitychange', clear, { signal });
  return axis;
}

