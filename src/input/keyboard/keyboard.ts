import type { Axis } from '../../core/player';
export function keyboardInput(signal: AbortSignal,boundCode:(code:string)=>string=code=>code) {
  const keys = new Set<string>();
  const supported = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => { if((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]'))return; if (supported.includes(boundCode(e.code))) { e.preventDefault(); keys.add(boundCode(e.code)); } }, { signal });
  window.addEventListener('focusin',()=>keys.clear(),{signal});
  window.addEventListener('keyup', e => keys.delete(boundCode(e.code)), { signal });
  window.addEventListener('blur', () => keys.clear(), { signal });
  window.addEventListener('resize', () => keys.clear(), { signal });
  document.addEventListener('visibilitychange', () => keys.clear(), { signal });
  return (out: Axis) => { out.x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')); out.z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')); };
}

