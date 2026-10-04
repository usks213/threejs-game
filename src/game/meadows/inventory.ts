import type { MeadowState } from './state';
import { ARMOR, ITEM_WEIGHT, TOOL_DURABILITY } from '../../content/meadows/data';
import { WEAPONS } from '../../content/catalog';
export function stackSize(id:string):number{return WEAPONS[id]||ARMOR[id]||TOOL_DURABILITY[id]?1:id==='coins'?999:id.endsWith('Arrow')?100:50;}
export function occupiedSlots(items:Record<string,number>):number{return Object.entries(items).reduce((n,[id,amount])=>n+Math.ceil(amount/stackSize(id)),0);}
export function canCarry(items:Record<string,number>,id:string,amount:number,m?:MeadowState):boolean{
 if(m?.slots){const space=m.slots.reduce((n,s)=>n+(s===null?stackSize(id):s.id===id?Math.max(0,stackSize(id)-s.count):0),0);if(space<amount)return false;}
 const next={...items,[id]:(items[id]??0)+amount};return occupiedSlots(next)<=32&&Object.entries(next).reduce((n,[key,count])=>n+(ITEM_WEIGHT[key]??1)*count,0)<=300;
}
