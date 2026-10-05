import {progressionPanel} from './progression-panel';
import type {AdventureSnapshot} from '../game/types';
import {BOSSES,ITEM_NAMES} from '../content/catalog';
import {FOODS} from '../content/meadows/data';
import {itemIcon} from './icons/item';
export function fieldGuide(state:AdventureSnapshot):string{
 const ids=[...new Set([...(state.meadows?.discovered??[]),...Object.keys(state.inventory).filter(id=>state.inventory[id]>0)])].filter(id=>Object.hasOwn(ITEM_NAMES,id)).sort((a,b)=>ITEM_NAMES[a].localeCompare(ITEM_NAMES[b],'ja'));
 return progressionPanel(state)+'<h3>見つけた素材と道具</h3><p>拾得・制作・所持した品を記録します。知らない物の位置を自動公開しません。</p><div class=recipe-grid>'+ids.map(id=>{const food=FOODS[id];return `<article class=recipe-card data-guide-name="${ITEM_NAMES[id]}"><strong>${itemIcon(id)} ${ITEM_NAMES[id]}</strong><p>${food?`食事: 最大HP +${food.health} / 持久 +${food.stamina} / ${Math.round(food.seconds/60)}分`:'素材や装備。持ち物・制作・能力から使えます。'}</p></article>`;}).join('')+'</div><h3>旅の記録</h3>'+state.defeated.map(id=>`<p>◆ ${BOSSES.find(b=>b.id===id)?.name??'大きな敵'}を鎮めた</p>`).join('')+'<h3>三層の手引き</h3><p>地表で素材を集め、南側の緩い斜路から空へ。翼は上昇風の中で開くと高く舞い上がれます。北西の風は白凪の高嶺へ、東の風は遠い台地へ続きます。</p><p>濡れた壁は持久を多く使います。寒い場所は陽だまりの煮込み、暑い洞は水庭の冷茶、暗い道は灯具か灯石のスープで備えましょう。</p><p>共有ワールドは画面を開いても時間が進みます。危険のない場所で設計や持ち物を整理してください。</p><details><summary>水と創作物理の範囲</summary><p>水は0.5mのセルです。近い2048セルずつを毎秒10回計算し、遠い水は消さず保存し、近づくと更新します。液体の厳密な圧力や波を再現するものではありません。地形を掘って流路を変え、浮力と流れを移動に利用できます。</p><p>濡れ・凍結は火より優先し、火を消して発火や電池の爆発を抑えます。濡れた物と金属は電気を伝え、水没した電池は漏電します。乾いた充電池の爆発や風による延焼は周囲へ伝わりますが、連鎖は1回8部品、効果は1tick32件、延焼は16件まで処理します。溜め攻撃は近接武器で最大1.5秒、放して発動します。</p></details>';
}
