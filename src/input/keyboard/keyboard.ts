import type { Axis } from '../../core/player';
export function keyboardInput(signal: AbortSignal,boundCode:(code:string)=>string=code=>code,onChange:()=>void=()=>{}) {
  const keys = new Set<string>();
  const supported = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  const clear=()=>{if(keys.size){keys.clear();onChange();}};
  window.addEventListener('keydown', e => { if((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]'))return; if (supported.includes(boundCode(e.code))) { e.preventDefault(); const code=boundCode(e.code);if(!keys.has(code)){keys.add(code);onChange();} } }, { signal });
  window.addEventListener('focusin',clear,{signal});
  window.addEventListener('keyup', e => {if(keys.delete(boundCode(e.code)))onChange();}, { signal });
  window.addEventListener('blur', clear, { signal });
  window.addEventListener('resize', clear, { signal });
  document.addEventListener('visibilitychange', clear, { signal });
  signal.addEventListener('abort',clear,{once:true});
  return Object.assign((out: Axis) => { out.x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')); out.z = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')); },{clear});
}

