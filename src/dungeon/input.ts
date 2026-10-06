import type {Input} from './types';
export type DungeonControl='attack'|'heavy'|'interact'|'heal'|'cast'|'shoot'|'inventory';
export interface InputElements {canvas:HTMLCanvasElement;movePad:HTMLElement;lookPad:HTMLElement;actionButtons:Map<string,HTMLElement>}
export interface InputCallbacks {action(action:DungeonControl):void;changed?():void}
const keys:Record<string,DungeonControl>={KeyT:'attack',KeyR:'heavy',KeyE:'interact',KeyQ:'heal',KeyG:'cast',KeyF:'shoot',KeyI:'inventory'};
export function movementAxes(keys:ReadonlySet<string>,touchX=0,touchZ=0){const x=touchX+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),z=touchZ+(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),length=Math.max(1,Math.hypot(x,z));return {x:x/length,z:z/length};}
export const normalizeYaw=(yaw:number)=>Number.isFinite(yaw)?Math.abs(yaw)<=Math.PI?yaw:((yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI:0;
export const clampPitch=(pitch:number)=>Math.max(-1.32,Math.min(1.32,pitch));
export function pointerLook(yaw:number,pitch:number,dx:number,dy:number,sensitivity=.003){return {yaw:normalizeYaw(yaw-dx*sensitivity),pitch:clampPitch(pitch-dy*sensitivity)};}
function editing(target:EventTarget|null){return target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));}
/** Independent pointer captures allow move, look and attack with three simultaneous fingers. */
export function createDungeonInput(elements:InputElements,callbacks:InputCallbacks){
 const controller=new AbortController(),signal=controller.signal,held=new Set<string>(),blocks=new Set<number>(),crouches=new Set<number>();
 let active=false,disposed=false,yaw=0,pitch=0,touchX=0,touchZ=0,moveId:number|null=null,lookId:number|null=null,moveOrigin={x:0,y:0},lastLook={x:0,y:0};
 const on=<K extends keyof WindowEventMap>(target:Window|Document|HTMLElement,type:K,listener:(event:WindowEventMap[K])=>void)=>target.addEventListener(type,listener as EventListener,{signal});
 const reset=()=>{held.clear();blocks.clear();crouches.clear();touchX=touchZ=0;moveId=lookId=null;elements.movePad.style.setProperty('--stick-x','0px');elements.movePad.style.setProperty('--stick-y','0px');for(const button of elements.actionButtons.values())button.classList.remove('pressed');callbacks.changed?.();};
 const lock=()=>{if(!active)return;try {const request=elements.canvas.requestPointerLock?.();if(request&&typeof request.catch==='function')request.catch(()=>{});}catch{/* Pointer lock can be denied; touch and keyboard camera stay available. */}};
 on(window,'keydown',event=>{if(editing(event.target)||event.altKey||event.metaKey||event.ctrlKey&&event.code!=='ControlLeft'&&event.code!=='ControlRight')return;if(event.code==='KeyI'){if(!event.repeat)callbacks.action('inventory');event.preventDefault();return;}if(!active)return;if(['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyC','ControlLeft','ControlRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown',...Object.keys(keys)].includes(event.code)){event.preventDefault();held.add(event.code);if(!event.repeat&&keys[event.code])callbacks.action(keys[event.code]);}});
 on(window,'keyup',event=>{held.delete(event.code);});
 on(window,'blur',reset);on(window,'resize',reset);on(window,'orientationchange',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},{signal});
 document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==elements.canvas)reset();},{signal});
 on(window,'mousemove',event=>{if(!active||document.pointerLockElement!==elements.canvas)return;const next=pointerLook(yaw,pitch,event.movementX,event.movementY);yaw=next.yaw;pitch=next.pitch;});
 on(elements.canvas,'pointerdown',event=>{if(!active||event.pointerType==='touch')return;if(document.pointerLockElement!==elements.canvas){lock();return;}if(event.button===0)callbacks.action('attack');if(event.button===2)blocks.add(event.pointerId);event.preventDefault();});
 on(window,'pointerup',event=>{blocks.delete(event.pointerId);crouches.delete(event.pointerId);});
 on(window,'pointercancel',reset);
 on(elements.canvas,'contextmenu',event=>event.preventDefault());
 on(elements.movePad,'pointerdown',event=>{if(!active||moveId!==null)return;moveId=event.pointerId;const rect=elements.movePad.getBoundingClientRect();moveOrigin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};try{elements.movePad.setPointerCapture(event.pointerId);}catch{}move(event);event.preventDefault();});
 function move(event:PointerEvent){if(event.pointerId!==moveId)return;const x=event.clientX-moveOrigin.x,y=event.clientY-moveOrigin.y,n=Math.max(42,Math.hypot(x,y));touchX=x/n;touchZ=-y/n;elements.movePad.style.setProperty('--stick-x',`${touchX*34}px`);elements.movePad.style.setProperty('--stick-y',`${-touchZ*34}px`);}
 on(elements.movePad,'pointermove',event=>{move(event);if(event.pointerId===moveId)event.preventDefault();});
 const releaseMove=(event:PointerEvent)=>{if(event.pointerId!==moveId)return;moveId=null;touchX=touchZ=0;elements.movePad.style.setProperty('--stick-x','0px');elements.movePad.style.setProperty('--stick-y','0px');};
 on(elements.movePad,'pointerup',releaseMove);on(elements.movePad,'lostpointercapture',releaseMove);
 on(elements.lookPad,'pointerdown',event=>{if(!active)return;if(event.pointerType==='mouse'){if(document.pointerLockElement!==elements.canvas){lock();return;}if(event.button===0)callbacks.action('attack');if(event.button===2)blocks.add(event.pointerId);event.preventDefault();return;}if(lookId!==null)return;lookId=event.pointerId;lastLook={x:event.clientX,y:event.clientY};try{elements.lookPad.setPointerCapture(event.pointerId);}catch{}event.preventDefault();});
 on(elements.lookPad,'contextmenu',event=>event.preventDefault());
 on(elements.lookPad,'pointermove',event=>{if(!active||event.pointerId!==lookId)return;const next=pointerLook(yaw,pitch,event.clientX-lastLook.x,event.clientY-lastLook.y,.004);yaw=next.yaw;pitch=next.pitch;lastLook={x:event.clientX,y:event.clientY};event.preventDefault();});
 const releaseLook=(event:PointerEvent)=>{if(event.pointerId===lookId)lookId=null;};on(elements.lookPad,'pointerup',releaseLook);on(elements.lookPad,'lostpointercapture',releaseLook);
 for(const [action,button] of elements.actionButtons){
  on(button,'pointerdown',event=>{if(!active)return;event.preventDefault();event.stopPropagation();try{button.setPointerCapture(event.pointerId);}catch{}button.classList.add('pressed');if(action==='block')blocks.add(event.pointerId);else if(action==='crouch')crouches.add(event.pointerId);else if(['attack','heavy','interact','heal','cast','shoot'].includes(action))callbacks.action(action as DungeonControl);});
  const release=(event:PointerEvent)=>{button.classList.remove('pressed');blocks.delete(event.pointerId);crouches.delete(event.pointerId);};on(button,'pointerup',release);on(button,'lostpointercapture',release);on(button,'pointercancel',release);
  // Keyboard/screen-reader activation has no pointerdown. Ignore physical click duplication.
  on(button,'click',event=>{if(!active||event.detail!==0)return;if(action==='block'){if(held.has('KeyZ'))held.delete('KeyZ');else held.add('KeyZ');}else if(action==='crouch'){if(held.has('KeyC'))held.delete('KeyC');else held.add('KeyC');}else if(['attack','heavy','interact','heal','cast','shoot'].includes(action))callbacks.action(action as DungeonControl);});
 }
 return {
  sample(dt=0):Input{if(active){const rate=held.has('ShiftLeft')?.65:1.65;yaw+=((held.has('ArrowLeft')||held.has('Home')?1:0)-(held.has('ArrowRight')||held.has('End')?1:0))*dt*rate;pitch=clampPitch(pitch+((held.has('ArrowUp')||held.has('PageUp')?1:0)-(held.has('ArrowDown')||held.has('PageDown')?1:0))*dt*rate);}yaw=normalizeYaw(yaw);const axes=active?movementAxes(held,touchX,touchZ):{x:0,z:0};return {...axes,yaw,pitch,block:active&&(held.has('KeyZ')||blocks.size>0),crouch:active&&(held.has('KeyC')||held.has('ControlLeft')||held.has('ControlRight')||crouches.size>0)};},
  setActive(value:boolean){if(active===value)return;active=value;reset();if(!value&&document.pointerLockElement===elements.canvas)document.exitPointerLock();},
  setLook(nextYaw:number,nextPitch:number){yaw=normalizeYaw(nextYaw);pitch=clampPitch(nextPitch);},reset,
  dispose(){if(disposed)return;disposed=true;active=false;reset();controller.abort();if(document.pointerLockElement===elements.canvas)document.exitPointerLock();},
 };
}
