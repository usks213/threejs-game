import { defaultLaunchPosition, validLaunchPosition, type LaunchPosition } from '../core/launch-position';
interface Picker { pickLaunchPosition(x:number,y:number):LaunchPosition|null;setLaunchPosition(position:LaunchPosition,player:0|1,visible:boolean):void }
export function setupLaunchPointer(root:HTMLElement,arena:Picker|null,signal:AbortSignal){
  const canvas=root.querySelector<HTMLCanvasElement>('#arena-canvas')!,button=root.querySelector<HTMLButtonElement>('#pick-position')!,reset=root.querySelector<HTMLButtonElement>('#reset-position')!,label=root.querySelector<HTMLElement>('#position-value')!;
  let player:0|1=0,position=defaultLaunchPosition(player),enabled=false,selecting=false,pointer:number|null=null,before:LaunchPosition|null=null;
  function display(){label.textContent=`X ${(position.x*100).toFixed(1)} / Z ${(position.z*100).toFixed(1)} cm`;canvas.dataset.launchX=String(position.x);canvas.dataset.launchZ=String(position.z);arena?.setLaunchPosition(position,player,enabled);}
  function end(cancel=false){if(cancel&&before)position=before;if(pointer!==null&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=null;before=null;selecting=false;canvas.classList.remove('picking');button.setAttribute('aria-pressed','false');button.textContent='ポインターで位置を選ぶ';display();}
  button.addEventListener('click',()=>{if(!enabled)return;if(selecting){end();return;}selecting=true;canvas.classList.add('picking');button.setAttribute('aria-pressed','true');button.textContent='位置の選択を終了';canvas.scrollIntoView({block:'center',behavior:'instant'});canvas.focus({preventScroll:true});},{signal});
  function pick(event:PointerEvent){const candidate=arena?.pickLaunchPosition(event.clientX,event.clientY);if(candidate&&validLaunchPosition(candidate,player)){position=candidate;display();}}
  canvas.addEventListener('pointerdown',event=>{if(!enabled||!selecting||pointer!==null||event.button!==0)return;event.preventDefault();before={...position};pointer=event.pointerId;canvas.setPointerCapture(pointer);pick(event);},{signal});
  canvas.addEventListener('pointermove',event=>{if(event.pointerId===pointer)pick(event);},{signal});
  canvas.addEventListener('pointerup',event=>{if(event.pointerId===pointer){pick(event);end();}},{signal});
  canvas.addEventListener('pointercancel',()=>end(true),{signal});canvas.addEventListener('lostpointercapture',()=>{if(pointer!==null)end(true);},{signal});
  canvas.addEventListener('keydown',event=>{if(!enabled||!selecting)return;if(event.key==='Escape'){end(true);return;}if(event.key==='Enter'){end();return;}const delta:Record<string,[number,number]>={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]};const d=delta[event.key];if(d){event.preventDefault();const p={x:position.x+d[0],z:position.z+d[1]};if(validLaunchPosition(p,player)){position=p;display();}}},{signal});
  reset.addEventListener('click',()=>{if(enabled){end();position=defaultLaunchPosition(player);display();}},{signal});
  window.addEventListener('blur',()=>end(true),{signal});window.addEventListener('resize',()=>end(true),{signal});signal.addEventListener('abort',()=>end(true),{once:true});
  return{
    value:()=>({...position}),
    sync(nextEnabled:boolean,nextPlayer:0|1){if(player!==nextPlayer){end(true);player=nextPlayer;position=defaultLaunchPosition(player);}if(enabled&&!nextEnabled)end(true);enabled=nextEnabled&&!!arena;button.disabled=!enabled;reset.disabled=!enabled;display();},
    stop:()=>end(),
  };
}
