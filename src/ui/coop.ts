import type { Snapshot } from '../simulation/protocol';
export function coopUI(signal:AbortSignal,revive:(id:string)=>void,assist:()=>boolean=()=>false,boundCode:(code:string)=>string=code=>code){
 const button=document.createElement('button'),status=document.createElement('div');button.id='revive';button.hidden=true;button.setAttribute('aria-label','倒れた仲間を助ける');status.id='coop-life';status.setAttribute('role','status');document.querySelector('#app')!.append(button,status);
 let target='',holding=false,lastPointer=-Infinity;
 const start=()=>{if(!target||holding)return;holding=true;revive(target);},end=()=>{if(holding){holding=false;revive('');}};
 button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);lastPointer=performance.now();if(assist()&&holding)end();else start();},{signal});button.addEventListener('pointerup',()=>{if(!assist())end();},{signal});button.addEventListener('pointercancel',end,{signal});button.addEventListener('lostpointercapture',()=>{if(!assist())end();},{signal});button.addEventListener('click',event=>{if(event.detail===0&&performance.now()-lastPointer>500){if(holding)end();else start();}},{signal});
 window.addEventListener('keydown',event=>{if(boundCode(event.code)==='KeyH'&&!event.repeat&&!document.querySelector('[role=dialog]:not([hidden])')&&!(event.target as HTMLElement)?.closest('input,textarea,select')){event.preventDefault();if(assist()&&holding)end();else start();}},{signal});window.addEventListener('keyup',event=>{if(boundCode(event.code)==='KeyH'&&!assist())end();},{signal});window.addEventListener('blur',end,{signal});document.addEventListener('visibilitychange',end,{signal});
 signal.addEventListener('abort',()=>{end();button.remove();status.remove();},{once:true});
 return {update(state:Snapshot){
  const current=state.adventure.coop;
  const near=state.peers?.filter(p=>p.appearance?.downed&&Math.hypot(p.player.x-state.player.x,p.player.y-state.player.y,p.player.z-state.player.z)<=3).sort((a,b)=>Math.hypot(a.player.x-state.player.x,a.player.z-state.player.z)-Math.hypot(b.player.x-state.player.x,b.player.z-state.player.z))[0];
  if(target&&target!==near?.id)end();target=near?.id??'';button.hidden=!target||!!current?.downedSeconds;
  const progress=current?.reviving;button.textContent=progress?`救助 ${progress.seconds.toFixed(1)} / ${progress.required}秒`:assist()?(holding?'救助をやめる [H]':'押して仲間を助ける [H]'):'長押しで仲間を助ける [H]';button.setAttribute('aria-pressed',String(holding));
  status.textContent=current?.downedSeconds?`倒れました · ${Math.ceil(current.downedSeconds)}秒以内に仲間の救助を${current.beingRevived?' · 救助中':''}`:current?.reviving?'距離を保ち、3秒長押しして救助します':'';status.hidden=!status.textContent;
 }};
}
