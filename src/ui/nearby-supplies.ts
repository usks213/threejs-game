import type {AdventureSnapshot} from '../game/types';
import type {Vec3} from '../world/types';
import {ITEM_NAMES} from '../content/catalog';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function nearbySupplies(state:AdventureSnapshot,player:Vec3):string{
 const drops=state.resources.filter(n=>n.drop&&!n.removed&&n.amount>0&&Math.hypot(n.x-player.x,n.y-player.y,n.z-player.z)<3).sort((a,b)=>a.id-b.id);
 return '<section aria-label="近くの共有物資"><h3>近くの共有物資</h3><p>拾った素材は一人の持ち物へ移ります。仲間へ渡すときは持ち物から地面へ置いてください。</p><div id="bag-material-counts">'+['wood','stone','resin','iron'].map(id=>`<span data-item="${id}" data-count="${state.inventory[id]??0}">${ITEM_NAMES[id]??id} ${state.inventory[id]??0}</span>`).join(' · ')+'</div><div class="panel-actions">'+(drops.map(n=>`<button data-game-action="gather" data-id="${n.id}" data-drop-kind="${escape(n.kind)}">${escape(ITEM_NAMES[n.kind]??n.kind)} ×${n.amount} を拾う</button>`).join('')||'<p>手の届く地面に物資はありません。</p>')+'</div></section>';
}
