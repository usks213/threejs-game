import type {Snapshot} from '../simulation/protocol';
import {actionInput} from '../input/touch/action';
import {debugFlightInput} from '../input/debug-flight-input';
import './debug-flight.css';

export function debugFlightUI(signal:AbortSignal,toggle:(id:'on'|'off')=>void,vertical:(axis:number)=>void,boundCode:(code:string)=>string,hint:(code:string)=>string){
 const app=document.querySelector<HTMLElement>('#app')!,settings=document.createElement('section'),controls=document.createElement('section');
 settings.id='debug-flight-settings';settings.innerHTML='<h3>デバッグ</h3><button id="debug-flight-toggle" type="button" aria-pressed="false" aria-describedby="debug-flight-description">デバッグ飛行 ON</button><p id="debug-flight-description">ひとりプレイ専用。翼のように移動し、スタミナを使いません。終了時は下の安全な足場か出発位置へ戻ります。飛行中の保存は安全な復帰位置になり、再読込ではOFFです。</p>';
 controls.id='debug-flight-controls';controls.hidden=true;controls.setAttribute('aria-label','デバッグ飛行操作');controls.innerHTML='<strong>デバッグ飛行中</strong><span id="debug-flight-hint"></span><button id="debug-flight-up" type="button" aria-label="デバッグ飛行 上昇" aria-pressed="false">上昇 ↑</button><button id="debug-flight-down" type="button" aria-label="デバッグ飛行 下降" aria-pressed="false">下降 ↓</button><button id="debug-flight-stop" type="button">飛行終了・安全な足場へ</button>';
 document.querySelector('#system-panel .panel-header')!.after(settings);app.append(controls);
 const button=settings.querySelector<HTMLButtonElement>('button')!,up=controls.querySelector<HTMLButtonElement>('#debug-flight-up')!,down=controls.querySelector<HTMLButtonElement>('#debug-flight-down')!,stop=controls.querySelector<HTMLButtonElement>('#debug-flight-stop')!;
 let flying=false,available=false;
 // Native click keeps a swipe beginning on this settings button scrollable.
 button.addEventListener('click',()=>{if(available)toggle(flying?'off':'on');},{signal});actionInput(stop,()=>toggle('off'),signal);
 const input=debugFlightInput(up,down,signal,()=>flying&&available,vertical,boundCode);
 signal.addEventListener('abort',()=>{settings.remove();controls.remove();delete app.dataset.debugFlying;},{once:true});
 return {release:input.release,update(state:Snapshot|null,multiplayer:boolean){
  const previous=flying;flying=!multiplayer&&!!state?.adventure.traversal?.debugFlying;available=!multiplayer&&!!state?.adventure.traversal?.debugFlightAvailable&&!!state&&state.adventure.health>0;
  if(previous&&!flying||!available)input.release();controls.hidden=!flying;app.dataset.debugFlying=String(flying);
  button.disabled=!available;button.setAttribute('aria-pressed',String(flying));const buttonText=multiplayer?'デバッグ飛行：協力プレイでは使用不可':flying?'デバッグ飛行 OFF・安全な足場へ':'デバッグ飛行 ON';if(button.textContent!==buttonText)button.textContent=buttonText;
  const message='スタミナ不要 · '+(hint('Space')||'Space')+' 上昇 / '+(hint('KeyV')||'V')+' 下降';const label=controls.querySelector('#debug-flight-hint')!;if(label.textContent!==message)label.textContent=message;
 }};
}
