import { inventoryPanel } from './meadow-inventory';
import { meadowMap } from './meadow-map';
import { occupiedSlots } from '../game/meadows/inventory';
import { BUILDINGS, ENEMIES, ITEM_NAMES, RECIPES, WEAPONS } from '../content/catalog';
import { ARMOR, COOKING, FOODS, MEADOW_BUILD_IDS, MEADOW_CRAFT_IDS } from '../content/meadows/data';
import { benchLevel, foodStats, maxDurability } from '../game/meadows/state';
import type { AdventureSnapshot } from '../game/types';
import type { Vec3 } from '../world/types';
import { itemIcon } from './icons/item';
const button=(label:string,action:string,id='',disabled=false)=>`<button type="button" data-game-action="${action}" data-id="${id}" ${disabled?'disabled':''}>${label}</button>`;
export function meadowPanel(s:AdventureSnapshot,p:Vec3,tab:string,selected=0,moving=false,mapRange=80):string{
 const m=s.meadows!,cost=(c:Record<string,number>)=>Object.entries(c).map(([id,n])=>`<span class="cost ${(s.inventory[id]??0)>=n?'ready':'missing'}">${ITEM_NAMES[id]} ${s.inventory[id]??0}/${n}</span>`).join(''),enough=(c:Record<string,number>)=>Object.entries(c).every(([id,n])=>(s.inventory[id]??0)>=n);
 if(tab==='bag')return inventoryPanel(s,selected,moving,p);
 if(tab==='craft')return `<div class="panel-intro">作業台レベル ${benchLevel(p,s.buildings)} · 屋根の下で制作と無料修理</div><div class="panel-actions">${button('すべて修理','repair')}</div><div class="recipe-grid">${RECIPES.filter(r=>MEADOW_CRAFT_IDS.has(r.id)).map(r=>`<article class="recipe-card"><div class="card-title">${itemIcon(r.id)}<div><strong>${r.name}${r.amount>1?` ×${r.amount}`:''}</strong><small>${r.station?'作業台':'手作業'}${WEAPONS[r.id]?` · 攻撃 ${WEAPONS[r.id].damage}`:''}</small></div></div><div class="costs">${cost(r.cost)}</div>${button('制作','craft',r.id,!enough(r.cost))}${s.inventory[r.id]&&m.durability[r.id]!==undefined?button(`品質${(m.quality[r.id]??1)+1}へ強化`,'upgrade',r.id):''}</article>`).join('')}</div>`;
 if(tab==='build')return `<p class="muted">部品を選び、照準を合わせて設置。屋根のある作業台で修理と装備作り。料理台は焚き火の上へ。</p><div class="panel-actions">${button('扉・設備を使う','interact')}${button('燃料を追加','fuel')}${button('肉を焼く／回収','cook')}${button('寝床で休む','rest')}${button('近くを解体','remove')}${button('建物を修理','repairBuilding')}</div><div class="recipe-grid">${BUILDINGS.filter(b=>MEADOW_BUILD_IDS.has(b.id)).map(b=>`<article class="recipe-card"><strong>${b.name}</strong><div class="costs">${cost(b.cost)}</div>${button('配置する','place',b.id)}</article>`).join('')}</div>`;
 if(tab==='magic')return `<h3>野営と料理</h3><label>看板の文字 <input id="sign-label" maxlength="40"></label><button data-custom-action="label" data-field="sign-label">近くの看板へ書く</button><div class="panel-actions">${button('設備を使う','interact')}${button('焚き火に燃料','fuel')}${button('焼けた料理を回収','cook')}${button('ベッドで休む','rest')}</div><div class="recipe-grid">${Object.entries(COOKING).map(([id,c])=>`<article class="recipe-card"><strong>${ITEM_NAMES[c.output]}</strong><p>${ITEM_NAMES[id]} ×1 · ${c.seconds}秒</p>${button('料理台に載せる','cook',id,!s.inventory[id])}</article>`).join('')}</div><h3>釣りと旅商人</h3><p>川の西側にいる旅商人で購入。釣りは餌とスタミナを使います。</p><div class=panel-actions>${button('釣り竿 · 350硬貨','trade','fishingRod')}${button('餌20個 · 10硬貨','trade','bait')}${button('釣る','fish')}</div><h3>雷鹿の加護</h3><p>ボスの証を出発地点の供物石に奉納すると解放。</p>${button(m.powerCooldown>0?`再使用 ${Math.ceil(m.powerCooldown)}秒`:'加護を使う','power','',!m.offered||m.powerCooldown>0)}<h3>熟練度</h3><p>${Object.entries(m.skills).map(([id,n])=>`${ITEM_NAMES[id]??id}: ${Math.floor(n)}`).join(' · ')||'行動を繰り返すと熟練度が上がります'}</p>`;
 return `<div class="panel-intro">${s.objective}</div>${meadowMap(s,p,mapRange)}<article class="recipe-card"><strong>雷角の主</strong><div class="costs">${cost({deerTrophy:2})}</div>${button('祭壇に供物を捧げる','summon')}${button('ボスの証を奉納','offer')}</article><p>草原で食事と拠点を整え、最初のボスを討伐する旅。Voxelの掘削と放水はいつでも使用できます。</p>`;
}
export function meadowStatus(s:AdventureSnapshot):string{
 const m=s.meadows!;return [m.shelter?'雨除け':'',m.warmth?'暖かい':'',m.cold?'寒い':'',m.wet>0?'濡れ':'',s.rested>0?`休息 ${Math.ceil(s.rested/60)}分`:'',m.power>0?'雷鹿の加護':'',m.raid>0?'⚠ 拠点への襲撃':''].filter(Boolean).join(' · ');
}
export { foodStats, ENEMIES };
