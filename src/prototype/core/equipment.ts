import type {CampaignItem,CampaignRecipe,EquipmentSlot} from './campaign';
import {EQUIPMENT_PROFILES,itemBaseStats} from './equipment-stats';
/** Equipment content is shared by crafting, validation, rigs and the codex. */
export const EQUIPMENT_SLOTS:readonly EquipmentSlot[]=['weapon','armor','head','legs','shield','tool','grapple','glider','charm'];
export const LEGACY_EQUIPMENT_SLOTS=['weapon','armor','grapple','glider','charm'] as const;
export const GEAR_SLOTS:readonly EquipmentSlot[]=['weapon','armor','head','legs','shield','tool'];
export const SLOT_LABELS:Record<EquipmentSlot,string>={weapon:'武器',armor:'胴',head:'頭',legs:'脚',shield:'盾',tool:'採集・建築具',grapple:'鉤縄',glider:'滑空具',charm:'護符・指輪'};
const entry=(id:string,label:string,category:CampaignItem['category'],slot:EquipmentSlot,description:string,source:string):CampaignItem=>({id,label,category,slot,description,source,icon:category==='weapon'?'⚔':category==='tool'?'⚒':'◇',stackLimit:1,progression:EQUIPMENT_PROFILES[id]});
export const EQUIPMENT_ITEMS:readonly CampaignItem[]=[
 entry('wood-axe','木割り斧','tool','tool','道具選択（2）後に攻撃。木・加工木・草に強く、石・金属には弱い。耐久を消費。','木材3・石2で手作り'),
 entry('stone-pick','石穿ちのつるはし','tool','tool','道具選択（2）後に攻撃。石・碑石・金属に強く、木には弱い。耐久を消費。','木材3・石3で手作り'),
 entry('terrain-rake','平削りの熊手','tool','tool','道具選択（2）後に土を攻撃。接触面の高さへ土・草だけを平らに削る。F / 属性切替で盛土モード。土9で0.75m角の平面を追加。無傷の撤去だけ返却。','木材4・石2で手作り'),
 entry('build-hammer','建築槌','tool','tool','装備で建築モード。攻撃で配置、重攻撃で解体。V部品、F回転、X取消、G終了。成功時に耐久を消費。石で修理できる。強化・ジェムは非対応。','木材4・石2で手作り'),
 entry('greatsword','峰割りの大剣','weapon','weapon','両手武器。長い刃1.5m、通常48/強撃78、消費30/44。遅い振り、通常も怯ませる。盾は併用不可。','鍛冶場: 金属10・木材4'),
 entry('dagger','燕返しの短剣','weapon','weapon','短い刃0.58m、通常20/強撃34、消費10/18。素早い刺突、強撃で小さな怯み。盾併用可。','木材2・石3で手作り'),
 entry('cloth-hood','織り布の頭巾','armor','head','頭枠。物理軽減 +8%。布は燃えやすい。','炉の鍛冶場: 布2・草葉3'),
 entry('copper-helm','鳴銅の兜','armor','head','頭枠。物理軽減 +12%、移動 −2%。金属は通電しやすい。','炉の鍛冶場: 金属5・布1'),
 entry('cloth-leggings','織り布の脚衣','armor','legs','脚枠。物理軽減 +10%、寒冷蓄積 −15%。布は燃えやすい。','炉の鍛冶場: 布3・草葉3'),
 entry('copper-greaves','鳴銅の脚甲','armor','legs','脚枠。物理軽減 +15%、移動 −3%。金属は通電しやすい。','炉の鍛冶場: 金属6・布2'),
 entry('copper-shield','鳴銅の丸盾','armor','shield','盾枠。ガード消費を18→12、飛び道具14→10へ軽減。破損時は標準の消費。両手武器と併用不可。','炉の鍛冶場: 木材4・金属5'),
 entry('traveler-ring','旅息の指輪','accessory','charm','護符と共用の1枠。最大スタミナ +15。戦闘防御は増やさない。','炉の鍛冶場: 金属3・石2'),
];
const costs:Record<string,Record<number,number>>={'wood-axe':{4:3,3:2},'stone-pick':{4:3,3:3},'terrain-rake':{4:4,3:2},'build-hammer':{4:4,3:2},greatsword:{6:10,4:4},dagger:{4:2,3:3},'cloth-hood':{10:2,7:3},'copper-helm':{6:5,10:1},'cloth-leggings':{10:3,7:3},'copper-greaves':{6:6,10:2},'copper-shield':{4:4,6:5},'traveler-ring':{6:3,3:2}};
export const EQUIPMENT_RECIPES:readonly CampaignRecipe[]=EQUIPMENT_ITEMS.map(i=>({id:i.id,label:i.label,output:i.id,cost:costs[i.id],station:i.slot==='tool'||i.id==='dagger'?'hand':'forge',requiresArtisan:i.slot!=='tool'&&i.id!=='dagger',description:i.description}));
export const ARMOR_STATS:Readonly<Record<string,{reduction:number;material:0|6|10;speed:number;cold:number}>>={
 'hide-coat':{reduction:itemBaseStats('hide-coat').reduction,material:10,speed:1,cold:.5},'copper-mail':{reduction:itemBaseStats('copper-mail').reduction,material:6,speed:.94,cold:1},
 'cloth-hood':{reduction:itemBaseStats('cloth-hood').reduction,material:10,speed:1,cold:1},'copper-helm':{reduction:itemBaseStats('copper-helm').reduction,material:6,speed:.98,cold:1},
 'cloth-leggings':{reduction:itemBaseStats('cloth-leggings').reduction,material:10,speed:1,cold:.85},'copper-greaves':{reduction:itemBaseStats('copper-greaves').reduction,material:6,speed:.97,cold:1},
 'copper-shield':{reduction:itemBaseStats('copper-shield').reduction,material:6,speed:1,cold:1},
};
export type MeleeArchetype='sword'|'greatsword'|'dagger';
export const meleeArchetype=(id:string|null):MeleeArchetype=>id==='greatsword'||id==='dagger'?id:'sword';
export const isTwoHanded=(id:string|null)=>id==='greatsword';
/** Powers are evaluated per occupied sample, never from only the first hit's material. */
export function toolPower(id:string|null,material:number,heavy:boolean){
 const favored=id==='wood-axe'?[4,5,7]:id==='stone-pick'?[3,6,8]:id==='terrain-rake'?[1,2,7]:[];
 if(id==='terrain-rake')return favored.includes(material)?(heavy?48:28):0;
 if(id==='build-hammer')return 0;
 if(id==='wood-axe'||id==='stone-pick')return favored.includes(material)?(heavy?135:75):(heavy?18:10);
 return heavy?100:55;
}
