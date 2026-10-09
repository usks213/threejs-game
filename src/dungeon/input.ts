import type {Input} from './types';
export type DungeonControl='attack'|'heavy'|'interact'|'heal'|'cast'|'shoot'|'inventory'|'skill';
export interface InputElements {canvas:HTMLCanvasElement;movePad:HTMLElement;lookPad:HTMLElement;actionButtons:Map<string,HTMLElement>}
export interface InputCallbacks {action(action:DungeonControl):void;changed?(release?:boolean):void}
const keys:Record<string,DungeonControl>={KeyT:'attack',KeyR:'heavy',KeyE:'interact',KeyQ:'heal',KeyG:'cast',KeyF:'shoot',KeyV:'skill',KeyI:'inventory'};
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyC','ControlLeft','ControlRight','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown',...Object.keys(keys)]);
export function movementAxes(keys:ReadonlySet<string>,touchX=0,touchZ=0){const x=touchX+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),z=touchZ+(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),length=Math.max(1,Math.hypot(x,z));return {x:x/length,z:z/length};}
export const normalizeYaw=(yaw:number)=>Number.isFinite(yaw)?Math.abs(yaw)<=Math.PI?yaw:((yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI:0;
export const clampPitch=(pitch:number)=>Math.max(-1.32,Math.min(1.32,pitch));
export function pointerLook(yaw:number,pitch:number,dx:number,dy:number,sensitivity=.003){return {yaw:normalizeYaw(yaw-dx*sensitivity),pitch:clampPitch(pitch-dy*sensitivity)};}
function editing(target:EventTarget|null){return target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));}
/** Independent pointer captures allow move, look and attack with three simultaneous fingers. */
export function createDungeonInput(elements:InputElements,callbacks:InputCallbacks,now:()=>number=()=>performance.now()){
 const controller=new AbortController(),signal=controller.signal,held=new Set<string>(),blocks=new Set<number>(),crouches=new Set<number>();
 const buttonPointers=new Map<HTMLElement,Set<number>>();
 let active=false,disposed=false,yaw=0,pitch=0,touchX=0,touchZ=0,moveId:number|null=null,lookId:number|null=null,moveOrigin={x:0,y:0},lastLook={x:0,y:0};
 // Rendering, event edges and the lease heartbeat all consume this one clock.
 let previous=now();
 function advance(){
  const value=now(),current=Number.isFinite(value)?Math.max(previous,value):previous;
  const elapsed=Math.min(.1,(current-previous)/1000);previous=current;
  if(active){const rate=(held.has('ShiftLeft')||held.has('ShiftRight'))?.65:1.65;yaw+=((held.has('ArrowLeft')||held.has('Home')?1:0)-(held.has('ArrowRight')||held.has('End')?1:0))*elapsed*rate;pitch=clampPitch(pitch+((held.has('ArrowUp')||held.has('PageUp')?1:0)-(held.has('ArrowDown')||held.has('PageDown')?1:0))*elapsed*rate);}
  yaw=normalizeYaw(yaw);
 }
 // Offer fresh aim before actions; an occupied send slot still coalesces it.
 // Actions retain their synchronous acknowledgement/sequence contract.
 const trigger=(kind:DungeonControl)=>{advance();callbacks.changed?.();callbacks.action(kind);};
 let lockDenied=false,lockPending=false,lockAttempt=0;
 let mouseDrag:{id:number;x:number;y:number;originX:number;originY:number;dragged:boolean;attackOnRelease:boolean}|null=null;
 const on=<K extends keyof WindowEventMap>(target:Window|Document|HTMLElement,type:K,listener:(event:WindowEventMap[K])=>void)=>target.addEventListener(type,listener as EventListener,{signal});
 const clearStick=()=>{touchX=touchZ=0;elements.movePad.style.setProperty('--stick-x','0px');elements.movePad.style.setProperty('--stick-y','0px');};
 const reset=()=>{advance();held.clear();blocks.clear();crouches.clear();moveId=lookId=null;mouseDrag=null;clearStick();for(const [button,pointers] of buttonPointers){pointers.clear();button.classList.remove('pressed');}callbacks.changed?.(true);};
 const denyLock=()=>{lockPending=false;if(!disposed)lockDenied=true;};
 const lock=()=>{
  if(!active||lockDenied||lockPending)return;
  if(!elements.canvas.requestPointerLock){denyLock();return;}
  lockPending=true;const attempt=++lockAttempt;
  const failed=()=>{if(attempt===lockAttempt)denyLock();};
  try{const request=elements.canvas.requestPointerLock();if(request&&typeof request.catch==='function')request.catch(failed);}catch{failed();}
 };
 on(window,'keydown',event=>{
  if(editing(event.target)||event.altKey||event.metaKey||event.ctrlKey&&event.code!=='ControlLeft'&&event.code!=='ControlRight')return;
  // Inventory must remain reopenable while it has disabled gameplay input.
  if(event.code==='KeyI'){if(!event.repeat)callbacks.action('inventory');event.preventDefault();return;}
  if(!active||!movementKeys.has(event.code))return;
  event.preventDefault();advance();if(keys[event.code]){if(!event.repeat&&!(elements.actionButtons.get(keys[event.code]) as HTMLButtonElement|undefined)?.disabled)trigger(keys[event.code]);return;}const changed=!held.has(event.code);held.add(event.code);if(changed)callbacks.changed?.();
 });
 on(window,'keyup',event=>{advance();if(held.delete(event.code))callbacks.changed?.();});
 on(window,'blur',reset);on(window,'resize',reset);on(window,'orientationchange',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},{signal});
 document.addEventListener('pointerlockerror',denyLock,{signal});
 document.addEventListener('pointerlockchange',()=>{
  lockPending=false;
  if(document.pointerLockElement!==elements.canvas){reset();return;}
  mouseDrag=null;lockDenied=false;
  // A delayed permission result must not capture the cursor over an open menu.
  if(!active||disposed)document.exitPointerLock();
 },{signal});
 on(window,'mousemove',event=>{if(!active||document.pointerLockElement!==elements.canvas)return;advance();const next=pointerLook(yaw,pitch,event.movementX,event.movementY);yaw=next.yaw;pitch=next.pitch;callbacks.changed?.();});
 const mouseDown=(target:HTMLElement,event:PointerEvent)=>{
  if(!active||event.button!==0&&event.button!==2)return;
  event.preventDefault();
  if(document.pointerLockElement===elements.canvas){if(event.button===0)trigger('attack');else{blocks.add(event.pointerId);callbacks.changed?.();}return;}
  // First click captures the camera without spending an attack. If locking fails,
  // drag still looks around; subsequent short clicks attack and right holds guard.
  const fallbackReady=lockDenied;
  mouseDrag={id:event.pointerId,x:event.clientX,y:event.clientY,originX:event.clientX,originY:event.clientY,dragged:false,attackOnRelease:fallbackReady&&event.button===0};
  if(fallbackReady&&event.button===2){blocks.add(event.pointerId);callbacks.changed?.();}
  try{target.setPointerCapture(event.pointerId);}catch{/* Window release still clears this pointer. */}
  lock();
 };
 on(elements.canvas,'pointerdown',event=>{if(event.pointerType!=='touch')mouseDown(elements.canvas,event);});
 on(window,'pointermove',event=>{
  if(!active||!mouseDrag||event.pointerId!==mouseDrag.id||document.pointerLockElement===elements.canvas)return;
  advance();const next=pointerLook(yaw,pitch,event.clientX-mouseDrag.x,event.clientY-mouseDrag.y);
  yaw=next.yaw;pitch=next.pitch;mouseDrag.x=event.clientX;mouseDrag.y=event.clientY;
  if(Math.hypot(event.clientX-mouseDrag.originX,event.clientY-mouseDrag.originY)>4)mouseDrag.dragged=true;
  callbacks.changed?.();event.preventDefault();
 });
 const releasePointer=(event:PointerEvent,allowAttack=false)=>{
  advance();let changed=blocks.delete(event.pointerId);changed=crouches.delete(event.pointerId)||changed;
  if(event.pointerId===moveId){moveId=null;clearStick();changed=true;}
  if(event.pointerId===lookId)lookId=null;
  if(changed)callbacks.changed?.();
  const drag=mouseDrag;
  if(drag?.id===event.pointerId){mouseDrag=null;if(allowAttack&&active&&drag.attackOnRelease&&!drag.dragged)trigger('attack');}
  for(const [button,pointers] of buttonPointers){pointers.delete(event.pointerId);if(!pointers.size)button.classList.remove('pressed');}
 };
 on(window,'pointerup',event=>releasePointer(event,true));
 on(window,'pointercancel',event=>releasePointer(event));
 on(elements.canvas,'lostpointercapture',event=>releasePointer(event));
 on(elements.canvas,'contextmenu',event=>event.preventDefault());
 on(elements.movePad,'pointerdown',event=>{if(!active||moveId!==null)return;moveId=event.pointerId;const rect=elements.movePad.getBoundingClientRect();moveOrigin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};try{elements.movePad.setPointerCapture(event.pointerId);}catch{}move(event);event.preventDefault();});
 function move(event:PointerEvent){if(event.pointerId!==moveId)return;const x=event.clientX-moveOrigin.x,y=event.clientY-moveOrigin.y,n=Math.max(42,Math.hypot(x,y));const changed=touchX!==x/n||touchZ!==-y/n;touchX=x/n;touchZ=-y/n;elements.movePad.style.setProperty('--stick-x',`${touchX*34}px`);elements.movePad.style.setProperty('--stick-y',`${-touchZ*34}px`);if(changed)callbacks.changed?.();}
 on(elements.movePad,'pointermove',event=>{move(event);if(event.pointerId===moveId)event.preventDefault();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)on(elements.movePad,type,event=>releasePointer(event));
 on(elements.lookPad,'pointerdown',event=>{if(!active)return;if(event.pointerType==='mouse'){mouseDown(elements.lookPad,event);return;}if(lookId!==null)return;lookId=event.pointerId;lastLook={x:event.clientX,y:event.clientY};try{elements.lookPad.setPointerCapture(event.pointerId);}catch{}event.preventDefault();});
 on(elements.lookPad,'contextmenu',event=>event.preventDefault());
 on(elements.lookPad,'pointermove',event=>{if(!active||event.pointerId!==lookId)return;advance();const next=pointerLook(yaw,pitch,event.clientX-lastLook.x,event.clientY-lastLook.y,.004);yaw=next.yaw;pitch=next.pitch;lastLook={x:event.clientX,y:event.clientY};callbacks.changed?.();event.preventDefault();});
 on(elements.lookPad,'pointerup',event=>releasePointer(event,true));
 for(const type of ['pointercancel','lostpointercapture'] as const)on(elements.lookPad,type,event=>releasePointer(event));
 for(const [action,button] of elements.actionButtons){
  const pointers=new Set<number>();buttonPointers.set(button,pointers);
  on(button,'pointerdown',event=>{if(!active||(button as HTMLButtonElement).disabled)return;event.preventDefault();event.stopPropagation();try{button.setPointerCapture(event.pointerId);}catch{}pointers.add(event.pointerId);button.classList.add('pressed');if(action==='block'){blocks.add(event.pointerId);callbacks.changed?.();}else if(action==='crouch'){crouches.add(event.pointerId);callbacks.changed?.();}else if(['attack','heavy','interact','heal','cast','shoot','skill'].includes(action))trigger(action as DungeonControl);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)on(button,type,event=>releasePointer(event));
  // Keyboard/screen-reader activation has no pointerdown. Ignore physical click duplication.
  on(button,'click',event=>{if(!active||event.detail!==0||(button as HTMLButtonElement).disabled)return;advance();if(action==='block'){if(held.has('KeyZ'))held.delete('KeyZ');else held.add('KeyZ');callbacks.changed?.();}else if(action==='crouch'){if(held.has('KeyC'))held.delete('KeyC');else held.add('KeyC');callbacks.changed?.();}else if(['attack','heavy','interact','heal','cast','shoot','skill'].includes(action))trigger(action as DungeonControl);});
 }
 return {
  sample():Input{advance();const axes=active?movementAxes(held,touchX,touchZ):{x:0,z:0};return {...axes,yaw,pitch,block:active&&(held.has('KeyZ')||blocks.size>0),crouch:active&&(held.has('KeyC')||held.has('ControlLeft')||held.has('ControlRight')||crouches.size>0)};},
  setActive(value:boolean){if(active===value)return;advance();active=value;if(value){lockAttempt++;lockDenied=false;lockPending=false;}reset();if(!value&&document.pointerLockElement===elements.canvas)document.exitPointerLock();},
  setLook(nextYaw:number,nextPitch:number){advance();yaw=normalizeYaw(nextYaw);pitch=clampPitch(nextPitch);},reset,
  dispose(){if(disposed)return;disposed=true;active=false;reset();controller.abort();if(document.pointerLockElement===elements.canvas)document.exitPointerLock();},
 };
}
