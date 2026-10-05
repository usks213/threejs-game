import type {AdventureSnapshot} from '../game/types';
export function dialogueUI(signal:AbortSignal,choose:(id:string)=>void){
 const panel=document.createElement('section');panel.id='dialogue-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','案内人との会話');panel.innerHTML='<div class="panel-header"><h2 id="dialogue-name"></h2><button id="dialogue-close">閉じる</button></div><p id="dialogue-text"></p><div id="dialogue-choices"></div>';
 document.querySelector('#app')!.append(panel);let signature='',closing=false;
 const close=()=>{closing=true;panel.hidden=true;choose('bye');};panel.querySelector('#dialogue-close')!.addEventListener('click',close,{signal});
 panel.addEventListener('click',event=>{const id=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-dialogue-choice]')?.dataset.dialogueChoice;if(id==='bye')close();else if(id)choose(id);},{signal});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close();},{signal});signal.addEventListener('abort',()=>panel.remove(),{once:true});
 return {update(state:AdventureSnapshot){const conversation=state.dialogue;if(!conversation){panel.hidden=true;signature='';closing=false;return;}if(closing)return;const next=JSON.stringify(conversation);if(signature!==next){signature=next;panel.querySelector('#dialogue-name')!.textContent=conversation.title;panel.querySelector('#dialogue-text')!.textContent=conversation.text;const choices=panel.querySelector('#dialogue-choices')!;choices.replaceChildren(...conversation.choices.map(choice=>{const button=document.createElement('button');button.dataset.dialogueChoice=choice.id;button.textContent=choice.label;return button;}));}
  if(!document.querySelector<HTMLElement>('#recovery-panel')?.hidden)return;if(panel.hidden){for(const other of document.querySelectorAll<HTMLElement>('[role=dialog]'))if(other!==panel&&other.id!=='recovery-panel')other.hidden=true;panel.hidden=false;}
 }};
}
