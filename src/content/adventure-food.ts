import type {Adventure} from '../game/adventure';
import type {AdventureSave} from '../game/types';
import {FOODS} from './meadows/data';
import {canCarry} from '../game/meadows/inventory';
export const ADVENTURE_MEALS=[
 {id:'sunSoup',name:'陽だまりの煮込み',cost:{berry:2,mushroom:1},hint:'耐寒 / 5分'},
 {id:'coolInfusion',name:'水庭の冷茶',cost:{honey:1,mushroom:2},hint:'耐熱 / 5分'},
 {id:'trailTea',name:'道草の蜜茶',cost:{berry:2,honey:1},hint:'持久力 / 4分'},
 {id:'glowBroth',name:'灯石のスープ',cost:{crystal:1,mushroom:1},hint:'ほのかな発光 / 4分'},
 {id:'dawnSoup',name:'朝焼けの果実汁',cost:{berry:3,mushroom:2},hint:'即時回復15 / 自然回復 / 3分'},
] as const;
export function foodEffect(state:AdventureSave,effect:NonNullable<(typeof FOODS)[string]['effect']>):boolean{return !!state.meadows?.foods.some(f=>f.remaining>0&&FOODS[f.id]?.effect===effect);}
export function craftAdventureMeal(game:Adventure,id:string):string|null{
 const recipe=ADVENTURE_MEALS.find(r=>r.id===id);if(!recipe)return null;
 if(!game.state.buildings.some(b=>b.definition==='fire'&&!b.open&&(b.fuel??0)>0&&Math.hypot(b.x-game.sim.player.x,b.y-game.sim.player.y,b.z-game.sim.player.z)<3.5))throw Error('燃えている焚き火へ近づいて調理してください');
 const inventory={...game.state.inventory};for(const[item,count]of Object.entries(recipe.cost)){if((inventory[item]??0)<count)throw Error('料理の素材が足りません');inventory[item]-=count;}
 if(!canCarry(inventory,id,1,game.state.meadows))throw Error('料理を入れる持ち物の空きを作ってください');inventory[id]=(inventory[id]??0)+1;game.state.inventory=inventory;if(!game.state.meadows?.discovered.includes(id))game.state.meadows?.discovered.push(id);return recipe.name+'を作りました。持ち物から食べられます';
}
