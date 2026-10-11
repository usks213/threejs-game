import type {InventoryCommand} from './core/inventory';
import type {InventoryViewModel} from './inventory-presenter';
import './inventory-view.css';
export interface InventoryDraft {slot:number|null;count:string;target:string;confirmDrop:boolean;revision?:number}
export const freshInventoryDraft=():InventoryDraft=>({slot:null,count:'1',target:'',confirmDrop:false});
export function inventoryCount(draft:string,max:number){const n=Number(draft);return draft.trim()!==''&&Number.isSafeInteger(n)&&n>=1&&n<=max?n:null;}
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function createInventoryView(model:InventoryViewModel,draft:InventoryDraft,send:(command:InventoryCommand)=>void,signal:AbortSignal){
 const root=node('section');root.className='inventory-workbench';root.setAttribute('aria-label','所持品の枠操作');
 if(draft.revision!==model.revision){draft.confirmDrop=false;draft.revision=model.revision;}
 const button=(text:string,action:()=>void)=>{const b=node('button',text);b.type='button';b.addEventListener('click',action,{signal});return b;};
 let submitted=false;
 const commit=(command:InventoryCommand)=>{if(submitted)return;submitted=true;draft.confirmDrop=false;root.querySelectorAll('button').forEach(b=>b.disabled=true);send(command);if(root.isConnected){submitted=false;render();}};
 function render(){
  root.replaceChildren();root.append(node('h3',`持物の枠 ${model.slots.length}/${model.capacity}`),node('p','同じ品物を複数の枠に分けて並べられます。枠が埋まったら結合・整理できます。採集・制作の新規入手時は必要に応じて自動整理します。装備・釣竿・重要品は落とせません。'));
  const sort=button('同じ品をまとめて種類順に整理',()=>commit({type:'inventory',id:'sort',revision:model.revision}));sort.dataset.inventoryAction='sort';sort.disabled=model.slots.length===0;root.append(sort);
  const grid=node('div');grid.className='inventory-slot-grid';
  for(const slot of model.slots){const select=button(`枠${slot.slot+1} · ${slot.label} ×${slot.count}`,()=>{draft.slot=slot.slot;draft.confirmDrop=false;draft.count='1';draft.target='';render();});select.dataset.inventorySlot=String(slot.slot);select.dataset.inventoryKey=slot.key;select.setAttribute('aria-pressed',String(draft.slot===slot.slot));grid.append(select);}root.append(grid);
  const selected=model.slots.find(s=>s.slot===draft.slot);
  if(selected){
   const detail=node('section');detail.className='inventory-selection';detail.dataset.inventorySelected=selected.key;detail.append(node('h3',`${selected.label} · 枠${selected.slot+1}の数 ${selected.count} / 所持合計 ${selected.total}`),node('p',selected.detail));
   const countLabel=node('label','操作する数'),count=node('input');count.type='number';count.min='1';count.max=String(selected.count);count.step='1';count.inputMode='numeric';count.value=draft.count;count.setAttribute('aria-label','操作する数');count.dataset.inventoryCount='true';countLabel.append(count);
   const targetLabel=node('label','移動・結合先の枠'),target=node('select');target.setAttribute('aria-label','移動・結合先の枠');const placeholder=node('option','移動先を選ぶ');placeholder.value='';target.append(placeholder);
   for(let i=0;i<model.capacity;i++){if(i===selected.slot)continue;const stack=model.slots.find(s=>s.slot===i),option=node('option',`枠${i+1} · ${stack?stack.label+' ×'+stack.count:'空き'}`);option.value=String(i);target.append(option);}target.value=draft.target;targetLabel.append(target);
   const reason=node('p'),actions=node('div');actions.className='inventory-actions';
   const operation=(id:'split'|'combine'|'move',text:string)=>{const b=button(text,()=>{const n=inventoryCount(draft.count,selected.count),to=draft.target===''?null:Number(draft.target);if(n!==null&&to!==null)commit({type:'inventory',id,revision:model.revision,slot:selected.slot,target:to,count:n});});b.dataset.inventoryAction=id;return b;};
   const split=operation('split','指定数を分割'),combine=operation('combine','指定数を結合'),move=operation('move','指定数を移動'),drop=button('指定数を落とす',()=>{draft.confirmDrop=true;render();});drop.dataset.inventoryAction='drop';
   const refresh=()=>{const n=inventoryCount(count.value,selected.count),to=target.value===''?null:Number(target.value),stack=model.slots.find(s=>s.slot===to);count.setAttribute('aria-invalid',String(n===null));reason.textContent=n===null?`1〜${selected.count}の整数を入力してください。`:selected.protected?'装備・釣竿・重要品は保護されています。':'分割・移動は空き枠、結合は同じ品物の枠を選びます。';split.disabled=n===null||n>=selected.count||to===null||!!stack;combine.disabled=n===null||to===null||stack?.key!==selected.key;move.disabled=n===null||to===null||!!stack;drop.disabled=n===null||selected.protected;};
   count.addEventListener('input',()=>{draft.count=count.value;draft.confirmDrop=false;detail.querySelector('.campaign-warning')?.remove();refresh();},{signal});target.addEventListener('change',()=>{draft.target=target.value;draft.confirmDrop=false;detail.querySelector('.campaign-warning')?.remove();refresh();},{signal});actions.append(split,combine,move,drop);detail.append(countLabel,targetLabel,reason,actions);refresh();
   if(draft.confirmDrop){const n=inventoryCount(draft.count,selected.count);if(n!==null&&!selected.protected){const warning=node('div');warning.className='campaign-warning';warning.setAttribute('role','group');warning.setAttribute('aria-label','落とす数の確認');warning.append(node('p',`${selected.label} ×${n}を目の前の地面に落とします。保存後も残り、近づいて回収できます。`),button('地面に落とす（確定）',()=>commit({type:'inventory',id:'drop',revision:model.revision,slot:selected.slot,count:n})),button('やめる',()=>{draft.confirmDrop=false;render();}));detail.append(warning);}}
   root.append(detail);
  }
  if(model.drops.length){root.append(node('h3',`地面の落とし物 ${model.drops.length}/32`));for(const drop of model.drops){const row=node('div');row.className='inventory-drop';row.dataset.inventoryDrop=String(drop.id);const label=node('label',`${drop.label} ×${drop.count} · 回収する数`),count=node('input');count.type='number';count.min='1';count.max=String(drop.count);count.step='1';count.inputMode='numeric';count.value=String(drop.count);count.setAttribute('aria-label',drop.label+'を回収する数');label.append(count);const pickup=button('指定数を回収',()=>{const n=inventoryCount(count.value,drop.count);if(n!==null&&drop.available)commit({type:'inventory',id:'pickup',target:drop.id,count:n,revision:model.revision});});const refresh=()=>{const n=inventoryCount(count.value,drop.count);pickup.disabled=n===null||!drop.available;count.setAttribute('aria-invalid',String(n===null));};count.addEventListener('input',refresh,{signal});refresh();row.append(label,pickup,node('p',drop.reason));root.append(row);}}
 }
 render();return root;
}
