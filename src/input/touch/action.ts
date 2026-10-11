// Trigger on contact: secondary fingers never depend on compatibility clicks.
export function actionInput(button: HTMLButtonElement, action: () => void, signal: AbortSignal): void {
 pointerSafeClick(button,action,signal);
 button.addEventListener('pointerdown',event=>{if(event.button!==0||button.disabled)return;event.preventDefault();action();},{signal});
}
/** Accept keyboard/accessibility clicks without replaying an already handled pointer contact. */
export function pointerSafeClick(button: HTMLButtonElement, action: () => void, signal: AbortSignal): void {
 let lastPointer=-Infinity,lastPointerId=-1,keyboardActivation=false;
 button.addEventListener('pointerdown',event=>{if(event.button!==0||button.disabled)return;lastPointer=performance.now();lastPointerId=event.pointerId;keyboardActivation=false;},{signal});
 button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')keyboardActivation=true;},{signal});
 button.addEventListener('click',event=>{
  const pointer=event as MouseEvent&Partial<PointerEvent>,identifiedPointer=typeof pointer.pointerId==='number'&&pointer.pointerId>=0&&pointer.pointerId===lastPointerId&&!!pointer.pointerType,identifiedKeyboard=pointer.pointerId===-1&&pointer.pointerType==='';
  const fromTouch=(event as MouseEvent&{sourceCapabilities?:{firesTouchEvents?:boolean}}).sourceCapabilities?.firesTouchEvents;
  // A delayed synthesized PointerEvent click still belongs to the same touch, even after a slow frame.
  // Older event stacks fall back to sourceCapabilities and the short ambiguity window.
  // A genuine keyboard activation remains available immediately after touching.
  if(event.detail===0&&!button.disabled&&!fromTouch&&!identifiedPointer&&(keyboardActivation||identifiedKeyboard||performance.now()-lastPointer>500))action();
  keyboardActivation=false;
 },{signal});
}
