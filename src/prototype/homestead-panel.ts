import type {CampaignRow} from './campaign-ui';

/** Reconcile life-simulation rows without detaching live pointer targets.
 * Rest countdown text changes every snapshot; its cancel button must survive
 * from pointerdown through pointerup, including on slow touch devices. */
export function createHomesteadPanel(createRow:(row:CampaignRow)=>HTMLElement){
 const root=document.createElement('div');root.className='campaign-grid';
 const entries=new Map<string,{key:string;element:HTMLElement}>();
 return {root,update(rows:CampaignRow[]){
  const wanted=new Set(rows.map(row=>row.id));
  for(const [id,entry] of entries)if(!wanted.has(id)){entry.element.remove();entries.delete(id);}
  rows.forEach((row,index)=>{
   const countdown=row.id==='player-rest:cancel';
   const key=JSON.stringify(countdown?{...row,detail:undefined}:row);
   let entry=entries.get(row.id);
   if(!entry||entry.key!==key){const element=createRow(row);if(entry)entry.element.replaceWith(element);entry={key,element};entries.set(row.id,entry);}
   if(countdown){const detail=entry.element.querySelector('p');if(detail&&detail.textContent!==row.detail)detail.textContent=row.detail??'';}
   // Never move an already correctly ordered node: even remove-and-reappend of
   // the same button can cancel an active touch sequence in the browser.
   if(root.children[index]!==entry.element)root.insertBefore(entry.element,root.children[index]??null);
  });
 }};
}
