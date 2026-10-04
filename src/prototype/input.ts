import type { Action,Controls } from './core/simulation';
export function createInput(canvas:HTMLCanvasElement,onAction:(action:Action)=>void,onLook:(x:number,y:number)=>void,onPause:()=>void){
 const abort=new AbortController(),signal=abort.signal,keys=new Set<string>(),held=new Set<string>();
 let enabled=false,skipMouse=false,stickPointer:number|null=null,lookPointer:number|null=null,stickX=0,stickZ=0,lastX=0,lastY=0;
 const stick=document.querySelector<HTMLElement>('#move-pad')!,knob=document.querySelector<HTMLElement>('#move-knob')!,look=document.querySelector<HTMLElement>('#look-pad')!;
 const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
 function reset(){keys.clear();held.clear();stickX=stickZ=0;stickPointer=lookPointer=null;knob.style.transform='translate(-50%, -50%)';for(const b of document.querySelectorAll('[data-action]'))b.classList.remove('pressed');}
 function controls():Controls {return {x:Math.max(-1,Math.min(1,stickX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0))),z:Math.max(-1,Math.min(1,stickZ+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0))),sprint:keys.has('ShiftLeft')||held.has('sprint'),block:held.has('block'),water:held.has('water')}};
 const actionKeys:Record<string,Action>={KeyE:'interact',Space:'jump',ControlLeft:'dodge',KeyC:'dodge',KeyR:'heavy',KeyQ:'heal',Digit1:'sword',Digit2:'chisel',KeyF:'element-next',KeyG:'cast',KeyV:'recipe-next',KeyB:'build'};
 document.addEventListener('keydown',e=>{if(e.code==='Escape'){onPause();reset();return;}if(!enabled)return;if(e.code in actionKeys||/^Key[WASD]$/.test(e.code)||e.code.startsWith('Arrow')||e.code==='ShiftLeft')e.preventDefault();if(!keys.has(e.code)&&actionKeys[e.code])onAction(actionKeys[e.code]);keys.add(e.code);},{signal});
 document.addEventListener('keyup',e=>keys.delete(e.code),{signal});document.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
 document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas)skipMouse=true;else if(!mobile){reset();if(enabled)onPause();}},{signal});
 document.addEventListener('mousemove',e=>{if(enabled&&document.pointerLockElement===canvas){if(skipMouse){skipMouse=false;return;}onLook(e.movementX*.0022,e.movementY*.0022);}},{signal});
 canvas.addEventListener('mousedown',e=>{if(!enabled||mobile)return;if(document.pointerLockElement!==canvas){void canvas.requestPointerLock().catch(()=>{});return;}if(e.button===0)onAction('attack');if(e.button===2)held.add('block');},{signal});
 document.addEventListener('mouseup',e=>{if(e.button===2)held.delete('block');},{signal});
 function updateStick(e:PointerEvent){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),max=r.width*.32;stickX=dx/Math.max(length,max);stickZ=-dy/Math.max(length,max);knob.style.transform=`translate(calc(-50% + ${stickX*max}px), calc(-50% + ${-stickZ*max}px))`;}
 stick.addEventListener('pointerdown',e=>{if(!enabled||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);},{signal});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e);},{signal});
 for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)stick.addEventListener(name,e=>{if(e.pointerId===stickPointer){stickPointer=null;stickX=stickZ=0;knob.style.transform='translate(-50%, -50%)';}},{signal});
 look.addEventListener('pointerdown',e=>{if(!enabled||lookPointer!==null)return;e.preventDefault();lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;look.setPointerCapture(e.pointerId);},{signal});
 look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;onLook((e.clientX-lastX)*.004,(e.clientY-lastY)*.004);lastX=e.clientX;lastY=e.clientY;},{signal});
 for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)look.addEventListener(name,e=>{if(e.pointerId===lookPointer)lookPointer=null;},{signal});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-action]')){const action=b.dataset.action!;
  b.addEventListener('pointerdown',e=>{if(!enabled||b.disabled)return;e.preventDefault();b.setPointerCapture(e.pointerId);b.classList.add('pressed');if(['block','sprint','water'].includes(action))held.add(action);else onAction(action as Action);},{signal});
  b.addEventListener('click',e=>{if(enabled&&!b.disabled&&e.detail===0&&!['block','sprint','water'].includes(action))onAction(action as Action);},{signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(name,()=>{held.delete(action);b.classList.remove('pressed');},{signal});
 }
 window.addEventListener('blur',()=>{reset();if(enabled)onPause();},{signal});
 return {mobile,controls,reset,setEnabled(value:boolean){enabled=value;skipMouse=value;if(!value)reset();},async lock(){if(mobile)return;skipMouse=true;try{await canvas.requestPointerLock();}catch{}},dispose(){abort.abort();reset();if(document.pointerLockElement===canvas)document.exitPointerLock();}};
}
