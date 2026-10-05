import type { Action,Controls } from './core/simulation';
export function createInput(canvas:HTMLCanvasElement,onAction:(action:Action)=>void,onLook:(x:number,y:number)=>void,onPause:()=>void){
 const abort=new AbortController(),signal=abort.signal,keys=new Set<string>(),held=new Set<string>();
 let padX=0,padZ=0,padBlock=false,padSprint=false,padId:string|null=null,padArmed=false,padButtons=new Set<number>(),menuAxis=0,padHelp='';
 const padActions:Partial<Record<number,Action>>={0:'jump',1:'dodge',2:'interact',3:'element-next',4:'recipe-next',5:'cast',7:'attack',8:'special',11:'tool',12:'heavy',13:'heal',14:'dismantle',15:'build'};
 let sensitivity=1,enabled=false,skipMouse=false,stickPointer:number|null=null,lookPointer:number|null=null,stickX=0,stickZ=0,lastX=0,lastY=0;
 const stick=document.querySelector<HTMLElement>('#move-pad')!,knob=document.querySelector<HTMLElement>('#move-knob')!,look=document.querySelector<HTMLElement>('#look-pad')!;
 const mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
 function reset(){clearPad();keys.clear();held.clear();stickX=stickZ=0;stickPointer=lookPointer=null;knob.style.transform='translate(-50%, -50%)';for(const b of document.querySelectorAll('[data-action]'))b.classList.remove('pressed');}
 function controls():Controls {return {x:Math.max(-1,Math.min(1,stickX+padX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0))),z:Math.max(-1,Math.min(1,stickZ+padZ+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0))),sprint:keys.has('ShiftLeft')||held.has('sprint')||padSprint,block:held.has('block')||keys.has('KeyZ')||padBlock,water:held.has('water')}};
 const lookKeys=new Set(['Home','End','PageUp','PageDown']);
 function tick(dt:number){if(!Number.isFinite(dt)||dt<=0)return;pollGamepad(Math.min(dt,.1));if(!enabled||textEditing())return;const x=Number(keys.has('End'))-Number(keys.has('Home')),y=Number(keys.has('PageDown'))-Number(keys.has('PageUp'));if(x||y){const rate=1.4*sensitivity*Math.min(dt,.1)*(keys.has('ShiftLeft')?.04:1);onLook(x*rate,y*rate);}}
 function neutralPad(){padX=padZ=0;padBlock=padSprint=false;}
 function clearPad(){neutralPad();padArmed=false;padButtons.clear();menuAxis=0;}
 function textEditing(){const el=document.activeElement as HTMLElement|null,tag=el?.tagName?.toUpperCase();return !!el?.isContentEditable||tag==='TEXTAREA'||tag==='INPUT'&&!['range','checkbox','radio','button','submit'].includes((el as HTMLInputElement).type);}
 function axes(x:number|undefined,y:number|undefined){x=Number.isFinite(x)?x!:0;y=Number.isFinite(y)?y!:0;const length=Math.hypot(x,y);if(length<=.18)return {x:0,y:0};const scale=Math.min(1,(length-.18)/.82)/length;return {x:x*scale,y:y*scale};}
 function reportPad(message:string){if(message===padHelp)return;padHelp=message;const label=document.getElementById?.('gamepad-status');if(label)label.textContent=message;}
 function focusMenu(pressed:Set<number>,left:{x:number;y:number}){
  const axis=Math.abs(left.y)>.55?(left.y>0?1:-1):Math.abs(left.x)>.55?(left.x>0?1:-1):0,axisChanged=axis!==menuAxis;if(![0,1,9,12,13,14,15].some(button=>pressed.has(button))&&(!axis||!axisChanged)){menuAxis=axis;return;}
  const root=['rotate','death','campaign-panel','menu'].map(id=>document.getElementById?.(id)).find(el=>el&&!el.hidden);
  if(!root)return;
  const options=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input[type="range"]:not(:disabled),input[type="checkbox"]:not(:disabled),select:not(:disabled)')].filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  if(!options.length)return;
  const focus=(el:HTMLElement)=>{el.focus();el.scrollIntoView({block:'nearest',inline:'nearest'});};
  let current=options.indexOf(document.activeElement as HTMLElement);if(current<0){current=options.findIndex(el=>el.id==='start'||el.id==='retry');if(current<0)current=0;focus(options[current]);}
  const direction=pressed.has(13)||pressed.has(15)?1:pressed.has(12)||pressed.has(14)?-1:axis&&axisChanged?axis:0;menuAxis=axis;
  if(direction){const active=options[current],horizontal=pressed.has(14)||pressed.has(15)||Math.abs(left.x)>.55&&Math.abs(left.y)<=.55;
   if(horizontal&&active.tagName==='INPUT'&&(active as HTMLInputElement).type==='range'){if(direction>0)(active as HTMLInputElement).stepUp();else (active as HTMLInputElement).stepDown();active.dispatchEvent(new Event('input',{bubbles:true}));active.dispatchEvent(new Event('change',{bubbles:true}));}
   else if(horizontal&&active.tagName==='SELECT'){const select=active as HTMLSelectElement;select.selectedIndex=Math.max(0,Math.min(select.options.length-1,select.selectedIndex+direction));select.dispatchEvent(new Event('change',{bubbles:true}));}
   else {current=(current+direction+options.length)%options.length;focus(options[current]);}
  }
  if(pressed.has(1)||pressed.has(9)){if(root.id==='campaign-panel')root.querySelector<HTMLButtonElement>('[aria-label="旅の記録を閉じる"]')?.click();else if(root.id==='menu')root.querySelector<HTMLButtonElement>('#start:not(:disabled)')?.click();return;}
  if(pressed.has(0))options[current].click();
 }
 function pollGamepad(dt:number){
  if(document.hidden||typeof document.hasFocus==='function'&&!document.hasFocus()){clearPad();return;}
  let pad:Gamepad|undefined;try{pad=typeof navigator.getGamepads==='function'?[...navigator.getGamepads()].find((p):p is Gamepad=>!!p&&p.connected&&p.mapping==='standard'):undefined;}catch{pad=undefined;}
  if(!pad){neutralPad();padId=null;clearPad();reportPad('未接続 / 標準配列を使用');return;}
  reportPad('接続済み · 標準配列');const left=axes(pad.axes[0],pad.axes[1]),right=axes(pad.axes[2],pad.axes[3]),buttons=new Set<number>();for(let i=0;i<Math.min(17,pad.buttons.length);i++)if(pad.buttons[i].pressed||pad.buttons[i].value>.55)buttons.add(i);
  const id=pad.index+':'+pad.id;if(id!==padId){clearPad();padId=id;}
  if(textEditing()){neutralPad();padArmed=false;padButtons=buttons;return;}
  if(!padArmed){neutralPad();padButtons=buttons;if(!buttons.size&&!left.x&&!left.y&&!right.x&&!right.y)padArmed=true;return;}
  const pressed=new Set([...buttons].filter(button=>!padButtons.has(button)));padButtons=buttons;
  if(!enabled){neutralPad();focusMenu(pressed,left);return;}
  menuAxis=0;padX=left.x;padZ=-left.y;padBlock=buttons.has(6);padSprint=buttons.has(10);
  if(pressed.has(9)){clearPad();onPause();return;}
  if(right.x||right.y)onLook(right.x*1.7*sensitivity*dt,right.y*1.7*sensitivity*dt);
  for(const button of pressed){const action=padActions[button];if(action)onAction(action);if(!enabled)break;}
 }
 window.addEventListener('gamepaddisconnected',()=>{clearPad();padId=null;reportPad('未接続 / 標準配列を使用');},{signal});
 const actionKeys:Record<string,Action>={KeyT:'attack',KeyE:'interact',Space:'jump',ControlLeft:'dodge',KeyC:'dodge',KeyR:'heavy',KeyQ:'heal',Digit1:'sword',Digit2:'chisel',KeyF:'element-next',KeyG:'cast',KeyV:'recipe-next',KeyB:'build',KeyX:'special',Delete:'dismantle'};const originalKeys={...actionKeys};
 document.addEventListener('keydown',e=>{if(e.code==='Escape'){onPause();reset();return;}if(!enabled)return;if(e.code in actionKeys||lookKeys.has(e.code)||e.code==='KeyZ'||/^Key[WASD]$/.test(e.code)||e.code.startsWith('Arrow')||e.code==='ShiftLeft')e.preventDefault();if(!keys.has(e.code)&&actionKeys[e.code])onAction(actionKeys[e.code]);keys.add(e.code);},{signal});
 document.addEventListener('keyup',e=>keys.delete(e.code),{signal});document.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
 document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas)skipMouse=true;else if(!mobile){reset();if(enabled)onPause();}},{signal});
 document.addEventListener('mousemove',e=>{if(enabled&&document.pointerLockElement===canvas){if(skipMouse){skipMouse=false;return;}onLook(e.movementX*.0022*sensitivity,e.movementY*.0022*sensitivity);}},{signal});
 canvas.addEventListener('mousedown',e=>{if(!enabled||mobile)return;if(document.pointerLockElement!==canvas){void canvas.requestPointerLock().catch(()=>{});return;}if(e.button===0)onAction('attack');if(e.button===2)held.add('block');},{signal});
 document.addEventListener('mouseup',e=>{if(e.button===2)held.delete('block');},{signal});
 function updateStick(e:PointerEvent){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),max=r.width*.32;stickX=dx/Math.max(length,max);stickZ=-dy/Math.max(length,max);knob.style.transform=`translate(calc(-50% + ${stickX*max}px), calc(-50% + ${-stickZ*max}px))`;}
 stick.addEventListener('pointerdown',e=>{if(!enabled||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);},{signal});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e);},{signal});
 for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)stick.addEventListener(name,e=>{if(e.pointerId===stickPointer){stickPointer=null;stickX=stickZ=0;knob.style.transform='translate(-50%, -50%)';}},{signal});
 look.addEventListener('pointerdown',e=>{if(!enabled||lookPointer!==null)return;e.preventDefault();lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;look.setPointerCapture(e.pointerId);},{signal});
 look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;onLook((e.clientX-lastX)*.004*sensitivity,(e.clientY-lastY)*.004*sensitivity);lastX=e.clientX;lastY=e.clientY;},{signal});
 for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)look.addEventListener(name,e=>{if(e.pointerId===lookPointer)lookPointer=null;},{signal});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-action]')){const action=b.dataset.action!;
  b.addEventListener('pointerdown',e=>{if(!enabled||b.disabled)return;e.preventDefault();b.setPointerCapture(e.pointerId);b.classList.add('pressed');if(['block','sprint','water'].includes(action))held.add(action);else onAction(action as Action);},{signal});
  b.addEventListener('keydown',e=>{if(e.code!=='Enter'&&e.code!=='Space')return;e.preventDefault();e.stopPropagation();if(enabled&&!b.disabled&&!e.repeat&&!['block','sprint','water'].includes(action))onAction(action as Action);},{signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(name,()=>{held.delete(action);b.classList.remove('pressed');},{signal});
 }
 window.addEventListener('blur',()=>{reset();if(enabled)onPause();},{signal});
 return {mobile,controls,reset,tick,bindings(){return Object.entries(actionKeys).filter(([key])=>key!=='KeyC').map(([key,action])=>({action,label:({attack:'斬撃',interact:'操作',jump:'ジャンプ/滑空',dodge:'回避',heavy:'強撃',heal:'回復',sword:'剣',chisel:'鑿','element-next':'属性切替',cast:'属性術','recipe-next':'建築切替',build:'設置',special:'集中技/建築を戻す',dismantle:'建築を解体'} as Record<string,string>)[action]??action,key}));},bind(action:string,key:string){if(!Object.values(originalKeys).includes(action as Action)||!/^((Key[A-Z])|(Digit[0-9])|Space|ControlLeft|AltLeft|Delete)$/.test(key)||['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyI','KeyJ','KeyM'].includes(key)||actionKeys[key]&&actionKeys[key]!==action)return false;for(const [old,a] of Object.entries(actionKeys))if(a===action)delete actionKeys[old];actionKeys[key]=action as Action;reset();return true;},resetBindings(){for(const key of Object.keys(actionKeys))delete actionKeys[key];Object.assign(actionKeys,originalKeys);reset();},setSensitivity(value:number){sensitivity=Math.max(.5,Math.min(2,value));},setEnabled(value:boolean){if(enabled!==value)clearPad();enabled=value;skipMouse=value;if(!value)reset();},async lock(){if(mobile)return;skipMouse=true;try{await canvas.requestPointerLock();}catch{}},dispose(){abort.abort();reset();if(document.pointerLockElement===canvas)document.exitPointerLock();}};
}
