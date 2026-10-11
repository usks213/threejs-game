/** Momentary flight controls: releasing either input leaves the other one intact. */
export function debugFlightInput(up:HTMLButtonElement,down:HTMLButtonElement,signal:AbortSignal,active:()=>boolean,changed:(vertical:number)=>void,boundCode:(code:string)=>string=(code=>code)) {
 const keys=new Set<string>(),pointers=new Map<number,number>();let last=0;
 const publish=()=>{const next=active()?Math.sign((keys.has('Space')?1:0)-(keys.has('KeyV')?1:0)+(keys.has('button-up')?1:0)-(keys.has('button-down')?1:0)+[...pointers.values()].reduce((sum,n)=>sum+n,0)):0;if(next!==last){last=next;changed(next);}up.setAttribute('aria-pressed',String(next>0));down.setAttribute('aria-pressed',String(next<0));};
 const release=()=>{keys.clear();pointers.clear();publish();};
 for(const [button,axis]of[[up,1],[down,-1]]as const){
  const key=axis===1?'button-up':'button-down';
  button.addEventListener('keydown',event=>{if(event.key!=='Enter'||button.disabled||!active())return;event.preventDefault();keys.add(key);publish();},{signal});
  button.addEventListener('keyup',event=>{if(event.key==='Enter'){event.preventDefault();keys.delete(key);publish();}},{signal});
  button.addEventListener('blur',()=>{keys.delete(key);publish();},{signal});
  button.addEventListener('pointerdown',event=>{if(event.button!==0||button.disabled||!active())return;event.preventDefault();pointers.set(event.pointerId,axis);button.setPointerCapture(event.pointerId);publish();},{signal});
  for(const type of['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>{pointers.delete((event as PointerEvent).pointerId);publish();},{signal});
 }
 window.addEventListener('keydown',event=>{const code=boundCode(event.code);if(!active()||!['Space','KeyV'].includes(code)||(event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]')||document.querySelector('[role=dialog]:not([hidden])'))return;event.preventDefault();event.stopImmediatePropagation();keys.add(code);publish();},{signal,capture:true});
 window.addEventListener('keyup',event=>{const code=boundCode(event.code);if(keys.delete(code)){event.preventDefault();publish();}},{signal,capture:true});
 window.addEventListener('blur',release,{signal});window.addEventListener('resize',release,{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)release();},{signal});
 signal.addEventListener('abort',release,{once:true});
 return {release};
}
