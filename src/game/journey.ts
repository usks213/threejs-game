import { BEACONS } from '../content/adventure-world';
import { roofed } from './meadows/state';
import { BIOMES, BOSSES, RECIPES } from '../content/catalog';
import type { AdventureSnapshot } from './types';
import type { Vec3 } from '../world/types';
export interface JourneyGoal { title: string; detail: string; tab: string; target?: { x:number; z:number }; progress:number }
/** Derive objectives from existing saves; no tutorial flags can become stale. */
export function journeyGoal(s: AdventureSnapshot, p: Vec3): JourneyGoal {
 if(s.generator===4){
  if(s.defeated.includes('stormcore'))return {title:'三つの高さをつないだ',detail:'仲間と設計帳を持ち、新しい航路へ',tab:'world',progress:1};
  const next=BEACONS.find(b=>(s.resources.find(n=>n.id===b.id)?.ready??0)<1e9);
  const active=s.enemies.find(e=>e.definition==='stormcore'&&e.health>0);
  if(active)return {title:'嵐心の機殻を鎮める',detail:'予兆を避け、隙に合成した装備で攻撃',tab:'world',target:active,progress:.85};
  if(next?.id===810004&&s.siteWorld?.storyMode==='full'){const site=s.expeditions?.sites.find(site=>!site.completed);if(site)return {title:site.name,detail:site.reason,tab:'world',target:site,progress:.6+s.siteWorld.completed.length*.07};}
  return {title:next?.name??'灯の航路を探索',detail:next?.hint??s.objective,tab:'world',target:next,progress:(s.unlocked-1)/5};
 }
 if(s.meadows){
  const nearest=(kind:string)=>s.resources.filter(n=>n.kind===kind&&n.ready<=s.seconds).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  if(s.death&&Object.values(s.grave??{}).some(n=>n>0))return {title:'墓標へ戻ろう',detail:'落とした荷物は「採集」で回収',tab:'bag',target:s.death,progress:0};
  const activeBoss=s.enemies.find(e=>e.boss&&e.health>0);if(activeBoss)return {title:'雷角の主を倒す',detail:'角・雷撃・足踏みの予兆から逃れ、隙に攻撃',tab:'world',target:activeBoss,progress:.8};
  if(s.defeated.includes('stormstag'))return s.meadows.offered?{title:'草原の試練を越えた',detail:'角のつるはしを作り、拠点と水路を広げよう',tab:'craft',progress:1}:{title:'雷鹿の証を奉納しよう',detail:'出発地点の供物石へ戻り「採集」',tab:'world',target:nearest('sacrifice')??{x:0,z:3},progress:.9};
  if(!s.inventory.axe&&!s.inventory.flintAxe)return {title:'落ち枝と石を拾おう',detail:'木材5・石4 → 石斧。近づいて採集',tab:'craft',target:nearest((s.inventory.wood??0)<5?'branch':'stone'),progress:.05};
  if(!s.inventory.hammer)return {title:'ハンマーを作ろう',detail:'木材3・石2。道具で拠点を築く',tab:'craft',progress:.12};
  if(!s.buildings.some(b=>b.definition==='bench'&&roofed(b,s.buildings)))return {title:'作業台と屋根を作ろう',detail:'屋根の下の作業台で弓・防具・修理を解放',tab:'build',progress:.2};
  if(!s.buildings.some(b=>b.definition==='cook'))return {title:'火を起こして料理しよう',detail:'焚き火の上に料理台。猪と鹿を狩って肉を焼く',tab:'build',progress:.3};
  if(s.meadows.foods.length<3)return {title:'3種類の食事で備えよう',detail:'焼肉・木の実・キノコや蜂蜜を組み合わせる',tab:'bag',progress:.4};
  if(!s.inventory.crudeBow&&!s.inventory.flintSpear)return {title:'狩猟の道具を整えよう',detail:'猪の皮と木で弓、または火打石の槍を制作',tab:'craft',progress:.5};
  return {title:'鹿の証を2個、祭壇へ',detail:'食事と盾を準備して北の祭壇で召喚',tab:'world',target:nearest('altar')??{x:0,z:-40},progress:.65};
 }
 const biome=BIOMES.find(b=>b.id===s.biome)!, boss=BOSSES.find(b=>b.id===biome.boss)!;
 const nearest=(kind:string)=>s.resources.filter(n=>n.kind===kind&&n.ready<=s.seconds).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
 if(s.death&&Object.values(s.grave??{}).some(n=>n>0))return {title:'落とした素材を回収',detail:'墓標へ戻り「採集」',tab:'bag',target:s.death,progress:0};
 if(!s.inventory.axe&&!s.inventory.sword&&s.defeated.length===0){
  const wood=s.inventory.wood??0,stone=s.inventory.stone??0;
  return {title:'最初の道具を作ろう',detail:`木材 ${Math.min(wood,3)}/3 · 石 ${Math.min(stone,2)}/2 → 石斧`,tab:'craft',target:wood<3?nearest('wood'):stone<2?nearest('stone'):undefined,progress:(Math.min(wood,3)+Math.min(stone,2))/5};
 }
 if(!s.buildings.some(b=>b.definition==='bench'))return {title:'探索の拠点を作ろう',detail:`作業台：木材 ${s.inventory.wood??0}/6 · 石 ${s.inventory.stone??0}/2`,tab:'build',target:nearest((s.inventory.wood??0)<6?'wood':'stone'),progress:.25};
 const weapon=RECIPES.find(r=>r.id===(biome.tier===1?'sword':['','', 'copperSword','ironSword','crystalSword','aetherSword'][biome.tier]));
 if(weapon&&!s.inventory[weapon.output])return {title:`${weapon.name}で戦いに備える`,detail:'制作タブで必要素材と武器性能を確認',tab:'craft',progress:.45};
 const active=s.enemies.find(e=>e.boss&&e.health>0);
 if(active)return {title:`${boss.name}を倒す`,detail:'赤い予兆から回避 → 攻撃後の隙を狙う',tab:'world',target:active,progress:.8};
 if(!s.defeated.includes(boss.id))return {title:'祭壇で守護者に挑む',detail:'素材を供えるとボス出現。食事と休息で準備',tab:'world',target:{x:biome.center.x,z:biome.center.z-14},progress:.65};
 const next=BIOMES[Math.min(4,s.unlocked-1)];return {title:s.defeated.length===5?'五つの領域を踏破':'次の領域へ',detail:s.defeated.length===5?'自分だけの拠点と世界を作ろう':`${next.name}で新たな素材と装備を発見`,tab:'world',target:next.center,progress:1};
}
