import type { BuildingDefinition,RecipeDefinition } from '../catalog';
export function meadowRecipe(r:RecipeDefinition):RecipeDefinition{
 const cost=r.id==='axe'?{wood:5,stone:4}:r.id==='shield'?{wood:10,resin:4,leatherScraps:4}:r.cost;
 return {...r,cost:cost as Record<string,number>,station:r.id==='shield'||r.station};
}
const costs:Record<string,Record<string,number>>={floor:{wood:2},wall:{wood:2},roof:{wood:2},bench:{wood:10},fire:{wood:2,stone:5},bed:{wood:8},chest:{wood:10}};
export function meadowBuilding(b:BuildingDefinition):BuildingDefinition{return costs[b.id]?{...b,cost:costs[b.id]}:b;}
export const MAX_QUALITY:Record<string,number>={shield:3,towerShield:3,hammer:3,hoe:3,antlerPickaxe:1,torch:1};
const upgrades:Record<string,Record<string,number>>={axe:{wood:2,stone:2},flintAxe:{wood:2,flint:4},club:{wood:5,bone:5},hammer:{wood:1,stone:1},hoe:{wood:1,stone:1},shield:{wood:5,resin:2,leatherScraps:2},towerShield:{wood:5,leatherScraps:3},crudeBow:{wood:5,leatherScraps:4,deerHide:1},flintSpear:{wood:5,flint:5,leatherScraps:2},flintKnife:{wood:2,flint:2,leatherScraps:2},ragTunic:{leatherScraps:5},ragPants:{leatherScraps:5},leatherHelmet:{deerHide:6,bone:5},leatherTunic:{deerHide:6,bone:5},leatherPants:{deerHide:6,bone:5},deerCape:{deerHide:2,bone:5}};
export function upgradeCost(id:string,quality:number):Record<string,number>|undefined{const base=upgrades[id];return base?Object.fromEntries(Object.entries(base).map(([key,n])=>[key,n*quality])):undefined;}
