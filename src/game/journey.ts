import { BIOMES, BOSSES, RECIPES } from '../content/catalog';
import type { AdventureSnapshot } from './types';
import type { Vec3 } from '../world/types';
export interface JourneyGoal { title: string; detail: string; tab: string; target?: { x:number; z:number }; progress:number }
/** Derive objectives from existing saves; no tutorial flags can become stale. */
export function journeyGoal(s: AdventureSnapshot, p: Vec3): JourneyGoal {
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
