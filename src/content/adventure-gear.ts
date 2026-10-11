import type {Adventure} from '../game/adventure';
import {canCarry} from '../game/meadows/inventory';
import {maxDurability} from '../game/meadows/state';
import {ARMOR} from './meadows/data';
import {ITEM_NAMES,WEAPONS} from './catalog';
export interface TrailRecipe {id:string;cost:Record<string,number>;sites:number;amount?:number}
/** Portable recipes belong to generator 4 only; old worlds retain their station rules. */
export const TRAIL_RECIPES:TrailRecipe[]=[
 {id:'club',cost:{wood:3},sites:0},{id:'axe',cost:{wood:4,stone:3},sites:0},{id:'hammer',cost:{wood:3,stone:2},sites:0},
 {id:'shield',cost:{wood:6,resin:2},sites:0},{id:'crudeBow',cost:{wood:8,resin:2},sites:0},{id:'woodArrow',cost:{wood:2,stone:1},amount:12,sites:0},
 {id:'spear',cost:{wood:4,stone:4},sites:0},{id:'torch',cost:{wood:1,resin:1},sites:0},
 {id:'ragTunic',cost:{wood:3,resin:2},sites:0},{id:'ragPants',cost:{wood:3,resin:2},sites:0},
 {id:'fireArrow',cost:{wood:2,resin:3},amount:8,sites:0},{id:'ironSword',cost:{iron:4,wood:3},sites:1},
 {id:'crystalSword',cost:{crystal:5,iron:2},sites:2},
];
export const trailUpgradeCost=(quality:number):Record<string,number>=>({stone:quality*2,resin:quality,crystal:quality});
export const trailRepairCost:Record<string,number>={stone:1,resin:1};
export function craftTrailGear(game:Adventure,action:'craft'|'upgrade'|'repair',id:string):string{
 const s=game.state,m=s.meadows!;const recipe=TRAIL_RECIPES.find(r=>r.id===id);
 const spend=(cost:Record<string,number>)=>{const next={...s.inventory};for(const[item,n]of Object.entries(cost)){if((next[item]??0)<n)throw Error('工作の素材が足りません');next[item]-=n;}return next;};
 if(action==='repair'){
  if(!id)throw Error('修理する装備を選んでください');
  if(!recipe||recipe.amount||!s.inventory[id])throw Error('修理できる装備を選んでください');
  const max=maxDurability(id,m.quality[id]??1);if((m.durability[id]??max)>=max)throw Error('まだ修理は必要ありません');
  game.gear.edit(id,lot=>lot.durability=max,spend(trailRepairCost));return ITEM_NAMES[id]+'を修理しました';
 }
 if(!recipe)throw Error('旅の工作一覧から品物を選んでください');
 const completed=s.siteWorld?.completed.length??0;if(completed<recipe.sites)throw Error(`地域拠点を${recipe.sites}か所復旧すると制作できます`);
 if(action==='upgrade'){
  if(recipe.amount||!s.inventory[id])throw Error('強化する装備を選んでください');
  const q=m.quality[id]??1;if(q>=3)throw Error('この装備は最大品質です');if(completed<q)throw Error(`地域拠点を${q}か所復旧すると次の強化ができます`);
  game.gear.edit(id,lot=>{lot.quality=q+1;lot.durability=maxDurability(id,q+1);},spend(trailUpgradeCost(q)));return `${ITEM_NAMES[id]}を品質${q+1}へ強化しました`;
 }
 if(!recipe.amount&&s.inventory[id])throw Error('この装備は持っています。修理または強化を選んでください');
 const inventory=spend(recipe.cost),amount=recipe.amount??1;if(!canCarry(inventory,id,amount,m))throw Error('持ち物の空きを作ってください');
 if(!recipe.amount)game.gear.craft(id,amount,inventory);else{inventory[id]=(inventory[id]??0)+amount;s.inventory=inventory;}if(!m.discovered.includes(id))m.discovered.push(id);
 if(!recipe.amount){if(WEAPONS[id]&&!['hammer','torch'].includes(id))s.equipment=id;if(ARMOR[id])m.gear[ARMOR[id].slot]=id;if(id==='shield')m.gear.offhand=id;}
 return `${ITEM_NAMES[id]}を${amount}個作りました`;
}
