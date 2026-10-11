import type {GearContainer,GearLot} from '../game/equipment/items';
import {gearMaxDurability} from '../game/equipment/items';
import {ITEM_NAMES} from '../content/catalog';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function gearLotLabel(lot:GearLot):string{
 const quality=lot.quality===undefined&&lot.legacy?'未記録':String(lot.quality??1),durability=lot.durability===undefined&&lot.legacy?'未記録':`${Math.ceil(lot.durability??gearMaxDurability(lot.kind,lot.quality??1))}/${gearMaxDurability(lot.kind,lot.quality??1)}`;
 return `${ITEM_NAMES[lot.kind]??lot.kind} · 品質${quality} · 耐久${durability}${lot.fusion?' · '+(ITEM_NAMES[lot.fusion.material]??lot.fusion.material)+'の継ぎ装 '+lot.fusion.durability:''}${lot.count>1?' · 同じ記録の装備×'+lot.count:''}`;
}
export function heldGearPanel(container:GearContainer|undefined,kind:string,chestId?:number):string{
 const lots=container?.lots.filter(l=>l.kind===kind)??[];if(!lots.length)return '';
 return `<section class="gear-lots"><h4>個別の装備</h4><p>選んだ個体だけを使用・修理・合成します。品質や残り耐久は受け渡した後も個体に残ります。</p>${lots.map(l=>`<article class="gear-lot"><strong>${escape(gearLotLabel(l))}</strong><small>記録 #${l.id}${container?.activeByKind[kind]===l.id?' · 選択中':''}</small><div class="panel-actions"><button data-game-action="equip" data-id="gear:${l.id}">この個体を選ぶ</button><button data-quantity-action="drop" data-id="gear:${l.id}">指定数を置く</button>${l.count>1?`<button data-game-action="drop" data-id="gear:${l.id}:${l.count}">この記録の${l.count}個を全部置く</button>`:''}${chestId?`<button data-quantity-action="store" data-id="${chestId}|gear:${l.id}">指定数を箱へ</button>`:''}</div></article>`).join('')}</section>`;
}
export function storedGearPanel(container:GearContainer|undefined,chestId:number):string{
 if(!container?.lots.length)return '';
 return `<section class="gear-lots"><h4>箱の個別装備</h4>${container.lots.map(l=>`<article class="gear-lot"><strong>${escape(gearLotLabel(l))}</strong><button data-game-action="take" data-id="${chestId}|gear:${l.id}:1">この記録から1個取り出す</button></article>`).join('')}</section>`;
}
