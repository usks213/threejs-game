import { meadowRecipe,meadowBuilding,upgradeCost,MAX_QUALITY } from '../content/meadows/recipes';
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
export function meadowPanel(s:AdventureSnapshot,p:Vec3,tab:string,selected=0,moving=false,mapRange=80,chestId?:number):string{
 const m=s.meadows!,cost=(c:Record<string,number>)=>Object.entries(c).map(([id,n])=>`<span class="cost ${(s.inventory[id]??0)>=n?'ready':'missing'}">${ITEM_NAMES[id]} ${s.inventory[id]??0}/${n}</span>`).join(''),enough=(c:Record<string,number>)=>Object.entries(c).every(([id,n])=>(s.inventory[id]??0)>=n);
 if(tab==='bag')return inventoryPanel(s,selected,moving,p,chestId);
 if(tab==='craft')return `<div class="panel-intro">作業台レベル ${benchLevel(p,s.buildings)} · 屋根の下で制作と無料修理</div><div class="panel-actions">${button('すべて修理','repair')}</div><div class="recipe-grid">${RECIPES.filter(r=>MEADOW_CRAFT_IDS.has(r.id)).map(meadowRecipe).map(r=>`<article class="recipe-card"><div class="card-title">${itemIcon(r.id)}<div><strong>${r.name}${r.amount>1?` ×${r.amount}`:''}</strong><small>${r.station?'作業台':'手作業'}${WEAPONS[r.id]?` · 攻撃 ${WEAPONS[r.id].damage}`:''}</small></div></div><div class="costs">${cost(r.cost)}</div>${button('制作','craft',r.id,!enough(r.cost))}${s.inventory[r.id]&&m.durability[r.id]!==undefined&&(m.quality[r.id]??1)<(MAX_QUALITY[r.id]??4)?'<div class=costs>'+cost(upgradeCost(r.id,m.quality[r.id]??1)??{})+'</div>'+button(`品質${(m.quality[r.id]??1)+1}へ強化`,'upgrade',r.id):''}</article>`).join('')}</div>`;
 if(tab==='build')return `<div class=panel-actions>${button('鍬：平らにする','landscape','level')}${button('鍬：道を作る','landscape','path')}${button('鍬：土を上げる','landscape','raise')}</div><p class="muted">鍬は足元の高さに地面を整えます。部品を選び、照準を合わせて設置。屋根のある作業台で修理と装備作り。料理台は焚き火の上へ。</p><div class="recipe-grid">${BUILDINGS.filter(b=>MEADOW_BUILD_IDS.has(b.id)).map(meadowBuilding).map(b=>`<article class="recipe-card"><strong>${b.name}</strong><div class="costs">${cost(b.cost)}</div>${button('配置する','place',b.id)}</article>`).join('')}</div>`;
 if(tab==='magic')return `<h3>旅商人</h3><p>商人に照準を合わせて開く取引画面です。</p><div class=panel-actions>${button('琥珀・宝石を売る','sell')}${button('釣り竿 · 350硬貨','trade','fishingRod')}${button('餌20個 · 10硬貨','trade','bait')}</div>`;
 return `<div class="panel-intro">${s.objective}</div>${meadowMap(s,p,mapRange)}<article class="recipe-card"><strong>雷角の主</strong><div class="costs">${cost({deerTrophy:2})}</div>祭壇・供物石に照準を合わせて使います。</article><p>草原で食事と拠点を整え、最初のボスを討伐する旅。Voxelの掘削と放水はいつでも使用できます。</p>`;
}
export function meadowStatus(s:AdventureSnapshot):string{
 const m=s.meadows!;return [m.fishing?m.fishing.phase==='bite'?'魚が食いついた！ 合わせる':m.fishing.phase==='fight'?`釣り ${Math.round(m.fishing.progress*100)}% · 張り ${Math.round(m.fishing.strain*100)}%`:'釣り · 浮きを待つ':'',m.resting&&m.resting<20?`休憩中 ${Math.ceil(20-m.resting)}秒`:'',m.smoke?'煙で息苦しい':'',m.shelter?'雨除け':'',m.warmth?'暖かい':'',m.cold?'寒い':'',m.wet>0?'濡れ':'',s.rested>0?`休息 ${Math.ceil(s.rested/60)}分`:'',m.corpseRun?'遺品回収の加護':'',m.power>0?'雷鹿の加護':'',m.raid>0?'⚠ 拠点への襲撃':''].filter(Boolean).join(' · ');
}
export { foodStats, ENEMIES };
