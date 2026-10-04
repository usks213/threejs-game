import type { MeadowState } from './state';
import { stackSize } from './inventory';
export interface ItemSlot { id:string; count:number }
/** Layout never owns items: totals remain authoritative, preventing split/merge duplication. */
export function reconcileSlots(m:MeadowState,items:Record<string,number>):(ItemSlot|null)[]{
 const left={...items},slots:(ItemSlot|null)[]=Array.from({length:32},(_,i)=>{const s=m.slots?.[i];if(!s||!left[s.id])return null;const count=Math.min(s.count,left[s.id],stackSize(s.id));left[s.id]-=count;return count?{id:s.id,count}:null;});
 for(const [id,total]of Object.entries(left)){let count=total;if(count<=0)continue;for(const slot of slots)if(slot?.id===id){const add=Math.min(count,stackSize(id)-slot.count);slot.count+=add;count-=add;}
  while(count>0){const i=slots.indexOf(null);if(i<0)break;const n=Math.min(count,stackSize(id));slots[i]={id,count:n};count-=n;}
 }
 m.slots=slots;return slots;
}
export function changeLayout(m:MeadowState,items:Record<string,number>,action:'split'|'move',id:string):void{
 const slots=reconcileSlots(m,items),[from,to]=id.split(':').map(Number);if(!Number.isInteger(from)||from<0||from>31||!slots[from])throw new Error('持ち物を選んでください');const a=slots[from]!;
 if(action==='split'){const empty=slots.indexOf(null);if(empty<0||a.count<2)throw new Error('分割できる数と空き枠が必要です');const n=Math.floor(a.count/2);a.count-=n;slots[empty]={id:a.id,count:n};return;}
 if(!Number.isInteger(to)||to<0||to>31||from===to)return;const b=slots[to];if(b?.id===a.id){const n=Math.min(a.count,stackSize(a.id)-b.count);b.count+=n;a.count-=n;if(!a.count)slots[from]=null;}else{slots[to]=a;slots[from]=b;}
}
