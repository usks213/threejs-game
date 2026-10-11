import {heldGearPanel,storedGearPanel} from './equipment-lots';
import { stackSize } from '../game/meadows/inventory';
import type { AdventureSnapshot } from '../game/types';
import { ITEM_NAMES,WEAPONS } from '../content/catalog';
import { ARMOR,FOODS } from '../content/meadows/data';
import { reconcileSlots } from '../game/meadows/inventory-layout';
import { itemIcon } from './icons/item';
import { maxDurability } from '../game/meadows/state';
export function inventoryPanel(s:AdventureSnapshot,selected:number,moving:boolean,p:{x:number;z:number},chestId?:number){
 const m=s.meadows!,slots=reconcileSlots(m,s.inventory),item=slots[selected],id=item?.id??'';
 const action=(label:string,kind:string,value=id)=>`<button type="button" data-game-action="${kind}" data-id="${value}">${label}</button>`;
 const chest=s.buildings.find(b=>b.id===chestId&&b.definition==='chest'&&Math.hypot(b.x-p.x,b.z-p.z)<3);
 return `<div class="panel-intro">${slots.filter(Boolean).length}/${slots.length}枠 · 荷重 ${m.weight.toFixed(1)}/300</div><p class="muted">${moving?'移動先の枠を押してください':'上段8枠がクイックスロットです。品物を選び、枠を移動すると割り当てられます'}</p><div class="slot-grid">${slots.map((slot,i)=>`<button class="${i===selected?'selected':''}" data-slot="${i}" aria-label="${slot?ITEM_NAMES[slot.id]+' '+slot.count:'空き枠'}">${slot?itemIcon(slot.id)+`<small>${slot.count}</small>`:'·'}</button>`).join('')}</div><div class="selected-item">${item?`<h3>${itemIcon(id)} ${ITEM_NAMES[id]} ×${item.count}</h3>${m.durability[id]!==undefined?`<p>耐久 ${Math.ceil(m.durability[id])}/${maxDurability(id,m.quality[id]??1)} · 品質${m.quality[id]??1}</p>`:''}<div class="panel-actions">${WEAPONS[id]||ARMOR[id]||['shield','towerShield','fishingRod'].includes(id)?action('装備','equip'):FOODS[id]?action('食べる','eat'):''}${action('半分に分ける','split',String(selected))}<button data-layout-move>枠を移動</button></div><label class="quantity-label">個数 <input id="item-quantity" type="number" min="1" max="${item.count}" value="1" inputmode="numeric"></label><div class="panel-actions"><button data-quantity-action="drop" data-id="${id}">地面に置く</button>${chest?`<button data-quantity-action="store" data-id="${chest.id}|${id}">この箱へ</button>`:''}</div>`:'空き枠です'}</div>${heldGearPanel(s.gearItems,id,chest?.id)}<h3>箱から取り出す</h3><div class="panel-actions">${chest?Object.entries(chest.contents).filter(([,n])=>n>0).map(([id,n])=>action(`${ITEM_NAMES[id]} ×${n}`,'take',chest.id+'|'+id+':'+Math.min(n,stackSize(id)))).join('')||'箱は空です':'箱に照準を合わせて開くと収納できます'}</div>${chest?storedGearPanel(chest.gearItems,chest.id):''}`;
}
