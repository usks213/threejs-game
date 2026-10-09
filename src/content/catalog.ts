import {ADVENTURE_DECORATIONS} from './adventure-chapters';
import {ADVENTURE_ENEMIES} from './adventure-encounters';
import {SITE_BOSSES} from './adventure-sites';
export interface BiomeDefinition { id: string; name: string; tier: number; center: { x: number; z: number }; grass: string; sky: string; fog: string; boss: string; resource: string }
export const BIOMES: BiomeDefinition[] = [
 { id: 'verdant', name: '若葉の林', tier: 1, center: { x: 0, z: 0 }, grass: '#74955a', sky: '#abc8dc', fog: '#b8cbc0', boss: 'root', resource: 'stone' },
 { id: 'dusk', name: '黄昏の丘陵', tier: 2, center: { x: 90, z: 0 }, grass: '#526c58', sky: '#9aafc0', fog: '#97a9ae', boss: 'tusk', resource: 'copper' },
 { id: 'mire', name: '翡翠の湿原', tier: 3, center: { x: 90, z: 90 }, grass: '#596d3c', sky: '#91a6a0', fog: '#879889', boss: 'mirelord', resource: 'iron' },
 { id: 'frost', name: '霜火の高地', tier: 4, center: { x: 0, z: 90 }, grass: '#bac5c9', sky: '#b7cfdd', fog: '#c2d0d3', boss: 'frostwing', resource: 'crystal' },
 { id: 'rift', name: '星裂の領域', tier: 5, center: { x: -90, z: 90 }, grass: '#8b6b97', sky: '#b0a1ca', fog: '#a998bd', boss: 'riftheart', resource: 'aether' },
];
export function biomeAt(x: number, z: number): BiomeDefinition { return BIOMES.reduce((nearest, b) => Math.hypot(x - b.center.x, z - b.center.z) < Math.hypot(x - nearest.center.x, z - nearest.center.z) ? b : nearest); }
export interface EnemyDefinition { id: string; name: string; health: number; damage: number; speed: number; reach: number; color: string; shape: 'boar' | 'slime' | 'walker' | 'flyer'; element: string; resistance: string }
export const ENEMIES: EnemyDefinition[] = [
 { id: 'boar', name: '猪', health: 10, damage: 10, speed: 1.8, reach: 1.3, color: '#9a7157', shape: 'boar', element: 'physical', resistance: 'none' },
 { id: 'slime', name: '苔スライム', health: 24, damage: 6, speed: 1.1, reach: 1.2, color: '#73a866', shape: 'slime', element: 'poison', resistance: 'poison' },
 { id: 'walker', name: '石の番人', health: 48, damage: 12, speed: 1.3, reach: 1.6, color: '#8b9896', shape: 'walker', element: 'physical', resistance: 'physical' },
 { id: 'flyer', name: '裂け目の羽獣', health: 32, damage: 9, speed: 2.2, reach: 1.4, color: '#a690bb', shape: 'flyer', element: 'frost', resistance: 'frost' },
];
export interface BossDefinition { id: string; name: string; health: number; damage: number; color: string; summon: Record<string, number>; reward: string; element: string }
export const BOSSES: BossDefinition[] = [
 ...SITE_BOSSES,
 { id: 'stormcore', name: '嵐心の機殻', health: 260, damage: 12, color: '#6db9be', summon: { crystal: 3 }, reward: 'star', element: 'magic' },
 { id: 'root', name: '古樹の守護者', health: 220, damage: 15, color: '#587652', summon: { wood: 8, resin: 2 }, reward: 'copper', element: 'physical' },
 { id: 'tusk', name: '黒角の巨獣', health: 340, damage: 20, color: '#7c645c', summon: { copper: 6, fang: 4 }, reward: 'iron', element: 'physical' },
 { id: 'mirelord', name: '沼の王', health: 460, damage: 25, color: '#60896a', summon: { iron: 6, resin: 6 }, reward: 'crystal', element: 'poison' },
 { id: 'frostwing', name: '霜翼', health: 600, damage: 30, color: '#9fb9d3', summon: { crystal: 6, fang: 8 }, reward: 'aether', element: 'frost' },
 { id: 'riftheart', name: '星裂の心臓', health: 780, damage: 36, color: '#b189cf', summon: { aether: 8, crystal: 8 }, reward: 'star', element: 'magic' },
];
export const ITEM_NAMES: Record<string, string> = { glider: '帆布の翼', wood: '木材', stone: '石', resin: '樹脂', berry: '木の実', fang: '牙', copper: '銅鉱', iron: '鉄鉱', crystal: '霜晶', aether: '魔晶', star: '星核', sword: '石剣', axe: '石斧', shield: '木盾', bow: '弓', staff: '杖', armor: '革鎧', stew: '森の煮込み', copperSword: '銅剣', ironSword: '鉄剣', crystalSword: '霜晶剣', aetherSword: '星裂剣', greatsword: '大剣', spear: '槍', book: '魔導書' };
export const WEAPONS: Record<string, { damage: number; reach: number; stamina: number; cooldown: number; ranged?: boolean }> = {
 hands: { damage: 7, reach: 2.2, stamina: 8, cooldown: 0.35 },
 axe: { damage: 16, reach: 2.5, stamina: 12, cooldown: 0.5 },
 sword: { damage: 18, reach: 2.7, stamina: 12, cooldown: 0.4 },
 greatsword: { damage: 32, reach: 3.4, stamina: 20, cooldown: 0.8 },
 spear: { damage: 20, reach: 4, stamina: 12, cooldown: 0.5 },
 bow: { damage: 25, reach: 25, stamina: 12, cooldown: 0.6, ranged: true },
 staff: { damage: 10, reach: 2.5, stamina: 10, cooldown: 0.5 },
 book: { damage: 8, reach: 2.2, stamina: 8, cooldown: 0.4 },
 copperSword: { damage: 26, reach: 2.7, stamina: 12, cooldown: 0.4 },
 ironSword: { damage: 36, reach: 2.8, stamina: 13, cooldown: 0.4 },
 crystalSword: { damage: 48, reach: 2.9, stamina: 14, cooldown: 0.4 },
 aetherSword: { damage: 62, reach: 3, stamina: 15, cooldown: 0.4 },
};
export interface RecipeDefinition { id: string; name: string; cost: Record<string, number>; output: string; amount: number; tier: number; station: boolean }
export const RECIPES: RecipeDefinition[] = [
 { id: 'axe', name: '石斧', cost: { wood: 3, stone: 2 }, output: 'axe', amount: 1, tier: 1, station: false },
 { id: 'sword', name: '石剣', cost: { wood: 2, stone: 4 }, output: 'sword', amount: 1, tier: 1, station: false },
 { id: 'shield', name: '木盾', cost: { wood: 5 }, output: 'shield', amount: 1, tier: 1, station: false },
 { id: 'bow', name: '弓', cost: { wood: 6, resin: 2 }, output: 'bow', amount: 1, tier: 1, station: true },
 { id: 'staff', name: '杖', cost: { wood: 5, resin: 3, stone: 3 }, output: 'staff', amount: 1, tier: 1, station: true },
 { id: 'armor', name: '革鎧', cost: { fang: 4, resin: 2 }, output: 'armor', amount: 1, tier: 1, station: true },
 { id: 'stew', name: '森の煮込み', cost: { berry: 3 }, output: 'stew', amount: 1, tier: 1, station: false },
 { id: 'greatsword', name: '大剣', cost: { wood: 4, stone: 8 }, output: 'greatsword', amount: 1, tier: 1, station: true },
 { id: 'spear', name: '槍', cost: { wood: 4, stone: 3 }, output: 'spear', amount: 1, tier: 1, station: false },
 { id: 'book', name: '魔導書', cost: { wood: 3, resin: 5, crystal: 2 }, output: 'book', amount: 1, tier: 3, station: true },
 ...['copper', 'iron', 'crystal', 'aether'].map((material, i) => ({ id: material + 'Sword', name: ['銅剣', '鉄剣', '霜晶剣', '星裂剣'][i], cost: { [material]: 6, wood: 4 }, output: material + 'Sword', amount: 1, tier: i + 2, station: true })),
];
export interface BuildingDefinition { id: string; name: string; cost: Record<string, number>; size: [number, number, number]; support: number; color: string; station?: boolean }
export const BUILDINGS: BuildingDefinition[] = [
 { id: 'foundation', name: '基礎', cost: { stone: 4 }, size: [2, 0.35, 2], support: 8, color: '#8b8d7d' },
 { id: 'floor', name: '床', cost: { wood: 3 }, size: [2, 0.15, 2], support: 4, color: '#b69a6c' },
 { id: 'wall', name: '壁', cost: { wood: 4 }, size: [2, 2, 0.2], support: 4, color: '#a88d65' },
 { id: 'roof', name: '屋根', cost: { wood: 4 }, size: [2.2, 0.2, 2.2], support: 3, color: '#725a4d' },
 { id: 'pillar', name: '柱', cost: { wood: 2 }, size: [0.25, 2, 0.25], support: 6, color: '#886d4d' },
 { id: 'bench', name: '作業台', cost: { wood: 6, stone: 2 }, size: [1.5, 0.8, 0.8], support: 3, color: '#bc9466', station: true },
 { id: 'fire', name: '焚き火', cost: { wood: 3, stone: 3 }, size: [0.7, 0.3, 0.7], support: 2, color: '#ea9e52' },
 { id: 'bed', name: '寝床', cost: { wood: 5, resin: 2 }, size: [1, 0.3, 2], support: 2, color: '#9caa76' },
 { id: 'chest', name: '箱', cost: { wood: 5 }, size: [1, 0.8, 0.7], support: 3, color: '#9f794e' },
 { id: 'spring', name: '水源', cost: { stone: 6, crystal: 1 }, size: [1, 0.6, 1], support: 3, color: '#69b5c9' },
 { id: 'drain', name: '排水器', cost: { stone: 4, copper: 2 }, size: [1, 0.3, 1], support: 3, color: '#667e85' },
 { id: 'portal', name: '転移門', cost: { wood: 10, crystal: 2 }, size: [2, 3, 0.4], support: 3, color: '#ae9dcc' },
];
export const SPELLS = [
 { id: 'ember', name: '火球', mana: 12, cooldown: 0.7, damage: 26, element: 'fire', color: '#ffc077' },
 { id: 'frost', name: '霜波', mana: 18, cooldown: 1.2, damage: 18, element: 'frost', color: '#b6eafa' },
 { id: 'quake', name: '砕岩', mana: 24, cooldown: 2, damage: 35, element: 'physical', color: '#f1d6a4' },
 { id: 'raise', name: '隆起', mana: 20, cooldown: 2, damage: 12, element: 'earth', color: '#8cbb76' },
 { id: 'mend', name: '癒し', mana: 25, cooldown: 3, damage: 0, element: 'heal', color: '#abffd0' },
];


// Meadows content extends the old campaign rather than making existing saves unreadable.
import { MEADOW_ITEMS, MEADOW_RECIPE_COSTS } from './meadows/data';
Object.assign(ITEM_NAMES,MEADOW_ITEMS,{bone:'骨片'});
BIOMES[0].name='草原';
ENEMIES.push(
 {id:'deer',name:'鹿',health:10,damage:0,speed:5,reach:0,color:'#9c704a',shape:'boar',element:'physical',resistance:'none'},
 {id:'neck',name:'ネック',health:5,damage:5,speed:1.7,reach:1.1,color:'#739c53',shape:'slime',element:'physical',resistance:'none'},
 {id:'greyling',name:'グレイリング',health:20,damage:5,speed:2,reach:1.4,color:'#706b4b',shape:'walker',element:'physical',resistance:'none'},
 {id:'gull',name:'カモメ',health:1,damage:0,speed:6,reach:0,color:'#deded1',shape:'flyer',element:'physical',resistance:'none'},
 {id:'greydwarf',name:'森人',health:40,damage:14,speed:2,reach:1.5,color:'#616954',shape:'walker',element:'physical',resistance:'none'},
 {id:'draugr',name:'村の亡者',health:100,damage:40,speed:2,reach:1.8,color:'#788b74',shape:'walker',element:'physical',resistance:'none'});
BOSSES.push({id:'stormstag',name:'雷角の主',health:500,damage:20,color:'#746359',summon:{deerTrophy:2},reward:'hardAntler',element:'lightning'});
Object.assign(WEAPONS,{
 club:{damage:12,reach:2.4,stamina:6,cooldown:.65},torch:{damage:8,reach:2.2,stamina:5,cooldown:.55},flintAxe:{damage:20,reach:2.5,stamina:8,cooldown:.6},flintKnife:{damage:12,reach:1.8,stamina:5,cooldown:.3},flintSpear:{damage:20,reach:3,stamina:7,cooldown:.5},crudeBow:{damage:22,reach:35,stamina:8,cooldown:1,ranged:true},hammer:{damage:0,reach:2,stamina:0,cooldown:.3},hoe:{damage:0,reach:2,stamina:0,cooldown:.3},antlerPickaxe:{damage:18,reach:2.2,stamina:8,cooldown:.8}
});
for(const [id,cost] of Object.entries(MEADOW_RECIPE_COSTS))RECIPES.push({id,name:ITEM_NAMES[id],cost,output:id,amount:id.endsWith('Arrow')?20:1,tier:1,station:!['club','torch','hammer'].includes(id)});
const meadowBuildings:[string,string,Record<string,number>,[number,number,number]][]=[
 ['smallFloor','木の床 1m',{wood:1},[1,.15,1]],['halfWall','木の半壁',{wood:1},[2,1,.2]],['slantWall','斜めの壁',{wood:2},[2,2,.2]],['shortPole','柱 1m',{wood:1},[.2,1,.2]],['beam','梁 2m',{wood:2},[2,.2,.2]],['shortBeam','梁 1m',{wood:1},[1,.2,.2]],['beam26','斜梁 26°',{wood:2},[2,1,.2]],['beam45','斜梁 45°',{wood:2},[2,2,.2]],['roof45','茅葺き屋根 45°',{wood:2},[2,2,2]],['ridge','屋根の棟 26°',{wood:2},[2,.5,2]],['ridge45','屋根の棟 45°',{wood:2},[2,1,2]],['roofCorner','屋根の外隅',{wood:2},[2,1,2]],['roofInner','屋根の内隅',{wood:2},[2,1,2]],['stairs','木の階段',{wood:2},[2,2,2]],['ladder','木の梯子',{wood:2},[1,2,2]],['door','木の扉',{wood:4},[1,2,.2]],['gate','木の門',{wood:12},[2,3,.3]],['fence','木の柵',{wood:1},[2,1,.15]],['stakeWall','丸太の防壁',{wood:4},[2,3,.3]],['spikes','防御杭',{wood:6,corewood:4},[2,1,2]],['cook','料理台',{wood:2},[1,1.2,.6]],['choppingBlock','切り株',{wood:10,flint:10},[1,.7,1]],['tanningRack','皮なめし台',{wood:10,flint:15,leatherScraps:20,deerHide:5},[2,2,.4]],['beehive','蜂箱',{wood:10,queenBee:1},[.8,1.4,.8]],['sign','看板',{wood:2,coal:1},[1,1,.2]],['standingTorch','立て松明',{wood:2,resin:2},[.3,1.5,.3]],['raft','いかだ',{wood:20,leatherScraps:6,resin:6},[4,.5,4]]
];
ITEM_NAMES.corewood='丸太';
for(const [id,name,cost,size] of meadowBuildings)BUILDINGS.push({id,name,cost,size,support:4,color:'#a5875b'});

for(const id of ['roofCorner45','roofInner45'])BUILDINGS.push({id,name:id==='roofCorner45'?'屋根の外隅 45°':'屋根の内隅 45°',cost:{wood:2},size:[2,2,2],support:3,color:'#a38d58'});

ENEMIES.push({id:'draugrArcher',name:'弓を持つ亡者',health:100,damage:40,speed:1.6,reach:12,color:'#718271',shape:'walker',element:'physical',resistance:'poison'},{id:'draugrElite',name:'亡者の精鋭',health:200,damage:58,speed:2,reach:2,color:'#5a715f',shape:'walker',element:'physical',resistance:'poison'});

ENEMIES.push({id:'greydwarfBrute',name:'森の剛腕',health:150,damage:30,speed:2,reach:2,color:'#686b43',shape:'walker',element:'physical',resistance:'poison'},{id:'greydwarfShaman',name:'森の祈祷師',health:60,damage:14,speed:1.6,reach:1.7,color:'#659e67',shape:'walker',element:'physical',resistance:'poison'});

export const LEGACY_ENEMIES:readonly EnemyDefinition[]=[...ENEMIES];
ENEMIES.push(...ADVENTURE_ENEMIES);

BUILDINGS.push(...ADVENTURE_DECORATIONS);
