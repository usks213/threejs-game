/** Keyboard navigation stays usable when rendering is suspended behind a panel. */
export function modalNavigation(signal:AbortSignal):void{
 const previous=new WeakMap<HTMLElement,HTMLElement|null>();
 const shown=()=>[...document.querySelectorAll<HTMLElement>('[role=dialog]:not([hidden])')];
 const controls=(panel:HTMLElement)=>[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length>0);
 const observed=new WeakSet<HTMLElement>();
 const observe=()=>{for(const panel of document.querySelectorAll<HTMLElement>('[role=dialog]'))if(!observed.has(panel)){observed.add(panel);const observer=new MutationObserver(()=>{if(!panel.hidden){previous.set(panel,document.activeElement instanceof HTMLElement?document.activeElement:null);controls(panel)[0]?.focus({preventScroll:true});}else previous.get(panel)?.focus({preventScroll:true});});observer.observe(panel,{attributes:true,attributeFilter:['hidden']});signal.addEventListener('abort',()=>observer.disconnect(),{once:true});}};
 const root=new MutationObserver(observe);root.observe(document.querySelector('#app')!,{childList:true,subtree:true});observe();signal.addEventListener('abort',()=>root.disconnect(),{once:true});
 window.addEventListener('keydown',event=>{
  const panels=shown(),panel=panels.find(p=>p.id==='recovery-panel')??panels.at(-1);if(!panel)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(panel.id==='recovery-panel')return;const cancel=panel.querySelector<HTMLButtonElement>('[data-modal-cancel]:not(:disabled)');if(cancel&&cancel.getClientRects().length){cancel.click();return;}const close=panel.querySelector<HTMLButtonElement>('button[id$="-close"]');if(close)close.click();else panel.hidden=true;return;}
  if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();const items=controls(panel);if(!items.length)return;const current=items.indexOf(document.activeElement as HTMLElement),next=(current+(event.shiftKey?-1:1)+items.length)%items.length;items[next].focus({preventScroll:false});}
 },{capture:true,signal});
}
