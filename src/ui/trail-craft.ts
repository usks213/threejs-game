import {TRAIL_RECIPES,trailRepairCost,trailUpgradeCost} from '../content/adventure-gear';
import {ADVENTURE_MEALS} from '../content/adventure-food';
import {ITEM_NAMES,WEAPONS} from '../content/catalog';
import {ARMOR} from '../content/meadows/data';
import {maxDurability} from '../game/meadows/state';
import type {AdventureSnapshot} from '../game/types';
export function trailCraftPanel(s:AdventureSnapshot):string{
 const m=s.meadows!,completed=s.expeditions?.sites.filter(site=>site.completed).length??0;
 const enough=(cost:Record<string,number>)=>Object.entries(cost).every(([id,n])=>(s.inventory[id]??0)>=n);
 const costs=(cost:Record<string,number>)=>Object.entries(cost).map(([id,n])=>`${ITEM_NAMES[id]??id} ${s.inventory[id]??0}/${n}`).join(' · ');
 const button=(label:string,action:string,id:string,disabled=false)=>`<button type="button" data-game-action="${action}" data-id="${id}" ${disabled?'disabled':''}>${label}</button>`;
 return '<h3>旅の携帯工作</h3><p>基本装備はどこでも制作できます。地域拠点の復旧で武器と品質2・3を解放。修理は装備ごとに石1・樹脂1を使います。</p><div class="recipe-grid">'+TRAIL_RECIPES.map(r=>{
  const owned=!!s.inventory[r.id]&&!r.amount,q=m.quality[r.id]??1,max=maxDurability(r.id,q),worn=(m.durability[r.id]??max)<max,locked=completed<r.sites;
  const stats=(quality:number)=>r.id==='shield'?`防御受け ${6+6*(quality-1)}`:WEAPONS[r.id]?`基礎攻撃 ${(WEAPONS[r.id].damage*(1+(quality-1)*.2)).toFixed(1)}`:ARMOR[r.id]?`防御 ${ARMOR[r.id].armor+(quality-1)*2}`:'';
  return `<article class="recipe-card"><strong>${ITEM_NAMES[r.id]}${r.amount?' ×'+r.amount:''}</strong><p>${owned?`品質${q} · 耐久 ${Math.ceil(m.durability[r.id]??max)}/${max}`:costs(r.cost)}</p>${locked?`<p>地域拠点 ${completed}/${r.sites}</p>`:''}${owned?button('修理','repair',r.id,!worn||!enough(trailRepairCost))+(q<3?`<p>${stats(q)} → ${stats(q+1)} / 最大耐久 ${max} → ${maxDurability(r.id,q+1)}</p><p>強化: ${costs(trailUpgradeCost(q))} · 拠点${completed}/${q}</p>`+button('強化','upgrade',r.id,completed<q||!enough(trailUpgradeCost(q))):'<p>最大品質</p>'):button('制作','craft',r.id,locked||!enough(r.cost))}</article>`;
 }).join('')+'</div><h3>焚き火の旅料理</h3><p>燃えている焚き火から3.5m以内で調理。食事は異なる3種まで。</p><div class="recipe-grid">'+ADVENTURE_MEALS.map(r=>`<article class="recipe-card"><strong>${r.name}</strong><p>${r.hint}</p><p>${costs(r.cost)}</p>${button('調理','craft',r.id,!enough(r.cost))}</article>`).join('')+'</div>';
}
