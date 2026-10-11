import type {CampaignItem,CampaignRecipe} from './campaign';
export type GemId='ember-gem'|'ember-gem-2'|'ember-gem-3';
export interface GemDefinition {id:GemId;label:string;tier:1|2|3;power:number;reduction:number;cost:Record<number,number>;previous?:GemId;requirement:string}
export const GEMS:readonly GemDefinition[]=[
 {id:'ember-gem',label:'灯火の石',tier:1,power:.12,reduction:.05,cost:{3:4,6:3},requirement:'炉の点火・鍛冶師の救出'},
 {id:'ember-gem-2',label:'灯火の石 II',tier:2,power:.18,reduction:.075,cost:{3:6,6:4},previous:'ember-gem',requirement:'炉を段階2へ強化'},
 {id:'ember-gem-3',label:'灯火の石 III',tier:3,power:.24,reduction:.1,cost:{3:9,6:6},previous:'ember-gem-2',requirement:'尾根の野営地へ到達'},
];
export const gemDefinition=(id:string|null)=>GEMS.find(gem=>gem.id===id);
export const isGemId=(value:unknown):value is GemId=>typeof value==='string'&&GEMS.some(gem=>gem.id===value);
export const gemEffect=(gem:GemDefinition)=>`武器・採集道具: 威力 +${gem.power*100}%。防具・盾: 被ダメージ軽減 +${gem.reduction*100}%。各装備1枠`;
export const gemTierLocked=(gem:GemDefinition,state:{flameTier:number;campUnlocked:boolean})=>gem.tier===2&&state.flameTier<2||gem.tier===3&&!state.campUnlocked;
export const GEM_ITEMS:readonly CampaignItem[]=GEMS.map(gem=>({id:gem.id,label:gem.label,category:'accessory',icon:'❖',stackLimit:20,description:`ランク${gem.tier}/3 · ${gemEffect(gem)}`,source:gem.previous?`鍛冶設備で前段階の石1個・石${gem.cost[3]}・金属${gem.cost[6]}を消費して強化。${gem.requirement}`:'鍛冶設備で石4・金属3から制作'}));
export const GEM_RECIPES:readonly CampaignRecipe[]=GEMS.map(gem=>({id:gem.id,label:gem.label+(gem.previous?'へ強化':''),output:gem.id,cost:gem.cost,...(gem.previous?{itemCost:{[gem.previous]:1}}:{}),station:'forge',requiresArtisan:true,description:`ランク${gem.tier}/3 · ${gemEffect(gem)}。${gem.requirement}${gem.previous?'。前段階の石1個を消費':''}`}));
