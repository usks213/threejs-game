import type { AdventureSnapshot } from '../game/types';
import { ITEM_NAMES,WEAPONS } from '../content/catalog';
import { ARMOR,FOODS } from '../content/meadows/data';
import { reconcileSlots } from '../game/meadows/inventory-layout';
import { itemIcon } from './icons/item';
import { maxDurability } from '../game/meadows/state';
export function inventoryPanel(s:AdventureSnapshot,selected:number,moving:boolean,p:{x:number;z:number}){
 const m=s.meadows!,slots=reconcileSlots(m,s.inventory),item=slots[selected],id=item?.id??'';
 const action=(label:string,kind:string,value=id)=>`<button type="button" data-game-action="${kind}" data-id="${value}">${label}</button>`;
 const chest=s.buildings.find(b=>b.definition==='chest'&&Math.hypot(b.x-p.x,b.z-p.z)<3);
 return `<div class="panel-intro">${slots.filter(Boolean).length}/32枠 · 荷重 ${m.weight.toFixed(1)}/300</div><p class="muted">${moving?'移動先の枠を押してください':'品物を押すと、装備・食事・分割・箱への移動ができます'}</p><div class="slot-grid">${slots.map((slot,i)=>`<button class="${i===selected?'selected':''}" data-slot="${i}" aria-label="${slot?ITEM_NAMES[slot.id]+' '+slot.count:'空き枠'}">${slot?itemIcon(slot.id)+`<small>${slot.count}</small>`:'·'}</button>`).join('')}</div><div class="selected-item">${item?`<h3>${itemIcon(id)} ${ITEM_NAMES[id]} ×${item.count}</h3>${m.durability[id]!==undefined?`<p>耐久 ${Math.ceil(m.durability[id])}/${maxDurability(id,m.quality[id]??1)} · 品質${m.quality[id]??1}</p>`:''}<div class="panel-actions">${WEAPONS[id]||ARMOR[id]||['shield','towerShield'].includes(id)?action('装備','equip'):FOODS[id]?action('食べる','eat'):''}${action('半分に分ける','split',String(selected))}<button data-layout-move>枠を移動</button></div><label class="quantity-label">個数 <input id="item-quantity" type="number" min="1" max="${item.count}" value="1" inputmode="numeric"></label><div class="panel-actions"><button data-quantity-action="drop" data-id="${id}">地面に置く</button><button data-quantity-action="store" data-id="${id}">近くの箱へ</button></div>`:'空き枠です'}</div><h3>箱から取り出す</h3><div class="panel-actions">${chest?Object.entries(chest.contents).filter(([,n])=>n>0).map(([id,n])=>action(`${ITEM_NAMES[id]} ×${n}`,'take',id+':'+n)).join('')||'箱は空です':'近くに箱がありません'}</div><div class="panel-actions">${action('猪に餌を置く','feed','')}</div>`;
}
