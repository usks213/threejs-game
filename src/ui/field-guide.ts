import type {AdventureSnapshot} from '../game/types';
import {BOSSES,ITEM_NAMES} from '../content/catalog';
import {FOODS} from '../content/meadows/data';
import {itemIcon} from './icons/item';
export function fieldGuide(state:AdventureSnapshot):string{
 const ids=[...new Set([...(state.meadows?.discovered??[]),...Object.keys(state.inventory).filter(id=>state.inventory[id]>0)])].filter(id=>Object.hasOwn(ITEM_NAMES,id)).sort((a,b)=>ITEM_NAMES[a].localeCompare(ITEM_NAMES[b],'ja'));
 return '<h3>見つけた素材と道具</h3><label>図鑑を検索<input id="guide-search" type="search" placeholder="名前で探す"></label><p>拾得・制作・所持した品を記録します。知らない物の位置を自動公開しません。</p><div class=recipe-grid>'+ids.map(id=>{const food=FOODS[id];return `<article class=recipe-card data-guide-name="${ITEM_NAMES[id]}"><strong>${itemIcon(id)} ${ITEM_NAMES[id]}</strong><p>${food?`食事: 最大HP +${food.health} / 持久 +${food.stamina} / ${Math.round(food.seconds/60)}分`:'素材や装備。持ち物・制作・能力から使えます。'}</p></article>`;}).join('')+'</div><h3>旅の記録</h3>'+state.defeated.map(id=>`<p>◆ ${BOSSES.find(b=>b.id===id)?.name??'大きな敵'}を鎮めた</p>`).join('')+'<h3>三層の手引き</h3><p>地表で素材を集め、南側の緩い斜路から空へ。翼は上昇風の中で開くと高く舞い上がれます。北西の風は白凪の高嶺へ、東の風は遠い台地へ続きます。</p><p>濡れた壁は持久を多く使います。寒い場所は陽だまりの煮込み、暑い洞は水庭の冷茶、暗い道は灯具か灯石のスープで備えましょう。</p><p>共有ワールドは画面を開いても時間が進みます。危険のない場所で設計や持ち物を整理してください。</p>';
}
