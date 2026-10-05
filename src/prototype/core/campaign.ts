import type {Vec3} from './voxel';
import {REGIONS,REGIONAL_POINTS,REGIONAL_ENEMIES,REGIONAL_UPGRADES,REGIONAL_QUESTS,regionAt,isRegionalOpen,type RegionalReward,type RegionId} from './regions';

/** Original, finite single-player campaign. This module owns progression, never the
 * voxel field, movement, combat hits, or the shared material inventory. */
export type EquipmentSlot='weapon'|'armor'|'grapple'|'glider'|'charm';
export interface CampaignItem {id:string;label:string;category:'weapon'|'armor'|'tool'|'food'|'medicine'|'quest'|'accessory'|'ammunition'|'resource'|'farming';icon:string;stackLimit:number;description:string;source:string;slot?:EquipmentSlot}
const item=(id:string,label:string,category:CampaignItem['category'],icon:string,description:string,source:string,slot?:EquipmentSlot):CampaignItem=>({id,label,category,icon,stackLimit:slot?1:category==='quest'?1:category==='ammunition'?200:20,description,source,slot});
const regionalItems:CampaignItem[]=[
 ...[['field-seal','野の印'],['wood-seal','森の印'],['fen-seal','根の印'],['mesa-seal','段丘の印'],['ash-seal','灰の印'],['rime-seal','雪の印'],['lake-seal','湖の印']].map(([id,label])=>item(id,label,'quest','◇','地域の探索を果たした証。次の土地の解放に必要。','対応する地域の宝箱を開く')),
 ...[['sun-herb','灯穂の薬草','灯穂の野の薬草'],['amber-resin','琥珀樹脂','琥珀枝の森の樹脂と宝箱'],['marsh-fiber','沼繊維','渡り根の窪地の植物と供物'],['singing-copper','鳴銅','鳴銅の段丘の鉱脈と工具箱'],['ash-glass','灰晶','灰鈴の城址の結晶と封印庫'],['rime-heart','霜心','燠雪の峠の結晶と遺物'],['lake-pearl','澄湖の真珠','澄鐘の湖の真珠岩と宝箱']].map(([id,label,source])=>({...item(id,label,'resource','⬡','次の地域への準備に使う特産品。',source),stackLimit:200})),
 item('bell-caller-core','灰鈴の核','quest','✦','灰鈴の封印庫を開ける鍵。','灰鈴の召喚主を倒す'),
 item('ice-keeper-core','砕氷の核','quest','✦','燠守りの遺物を回収する鍵。','砕氷の番人を倒す'),
 item('tide-guardian-core','澄鐘の核','quest','✦','水底の帰還鐘を開ける鍵。','澄鐘の環守を倒す'),
 {...item('lore-leaf','帰還者の記録','quest','▱','各地に残された灯をつなぐ人々の記録。','見張り塔・坑道・湖の碑を調べる'),stackLimit:10},
];
export const CAMPAIGN_ITEMS:Readonly<Record<string,CampaignItem>>={
 ...Object.fromEntries(regionalItems.map(i=>[i.id,i])),
 'fishing-rod':{...item('fishing-rod','葦糸の釣竿','tool','⌁','岸で釣竿を選び、水面へ投げる。食いつき中に操作すると釣り上げる。','木材5・草葉3で手作り。練り餌を用意し、水槽では先に水門のレバーを放水にする'),stackLimit:1},
 'fish-bait':{...item('fish-bait','草実の練り餌','resource','•','有効な投げ入れ1回につき1個消費。中断した餌は戻らない。','草葉2から3個作る。水辺で釣竿と一緒に使う'),stackLimit:100},
 'silverfin':item('silverfin','澄鰭魚','resource','◁','水辺で釣れる生魚。炉で焼くか、薬草と煮込む。生では食べられない。','地下墓所脇の水門を開け、水槽の南岸から西寄りへ投げる。浅い中央を避ける。澄鐘の湖でも釣れる'),
 'grilled-silverfin':item('grilled-silverfin','澄鰭魚の炉焼き','food','◁','120秒、最大HP +20・スタミナ +15。食事枠を上書き。','澄鰭魚1・木材1を灯守りの炉で調理'),
 'herb-fish-soup':item('herb-fish-soup','澄鰭魚の薬草汁','food','◉','180秒、最大HP +20・スタミナ +15。食事枠を上書き。','澄鰭魚1・摘みたての薬草1・木材1を灯守りの炉で調理'),
 'herb-seed':{...item('herb-seed','野草の種','farming','✿','畑に植えて育てる。収穫時に種が戻る。','拠点の種交換: 草葉2・土1で2粒'),stackLimit:200},
 herbs:{...item('herbs','摘みたての薬草','resource','♧','畑で収穫。拠点の加工設備で料理にする。','野草の種を植え、成長後に収穫'),stackLimit:200},
 milk:item('milk','山羊の乳','food','◉','120秒、最大HP +20・スタミナ +15。食事枠を上書き。','拠点の山羊に餌を与え、生産後に回収'),
 'iron-blade':item('iron-blade','銅風の剣','weapon','⚔','近接ダメージ +30%。鍛冶場で作る一本。','救出した鍛冶師の設備で制作','weapon'),
 bow:item('bow','旅弓','weapon','⌁','矢を消費して照準先へ放つ。近距離では取り回しに注意。','木材6・草葉4で手作り','weapon'),
 staff:item('staff','灯木の杖','weapon','✧','属性術の威力 +20%。術はスタミナを消費する。','木材4・石3・草葉2で手作り','weapon'),
 arrows:item('arrows','石先の矢','ammunition','➶','弓用の矢。1回の制作で8本。最大200本。','木材1・石1で8本制作'),
 'copper-mail':item('copper-mail','鳴銅の鎖鎧','armor','◆','物理被ダメージ −30%、移動速度 −6%。金属は通電しやすく、濡れると雷に弱い。','救出した鍛冶師の設備で金属12・布4・木材2から制作','armor'),
 'hide-coat':item('hide-coat','織り鎧','armor','◆','被ダメージ −20%。繊維と布を重ねる防具。','救出した鍛冶師の設備で制作','armor'),
 grapple:item('grapple','登り鉤','tool','↗','指定アンカーへ引き寄せる。装備後、照準を合わせてフック操作。','鍛冶師救出後、炉辺で制作','grapple'),
 glider:item('glider','風布の翼','tool','▽','空中で滑空。スタミナ消費中は落下速度を抑える。','鍛冶師救出後、炉辺で制作','glider'),
 'windwoven-glider':item('windwoven-glider','木霊の風織り翼','tool','▽','滑空速度 +20%、滑空のスタミナ消費 −25%。装備すると通常の翼と交代する。','西方の木工師マキを救出後、灯守りの炉か木霊の帰還炉で制作','glider'),
 'resin-staff':item('resin-staff','響銅の調律杖','weapon','✧','属性術の威力 +40%。強化・ジェム・耐久は通常の武器と共通。','西方の錬金師セナを救出後、灯守りの炉か木霊の帰還炉で制作','weapon'),
 'berry-meal':item('berry-meal','野草の煮込み','food','●','180秒、最大HP +20、最大スタミナ +15。同じ食事は重複せず更新。','草葉4を炉辺で調理'),
 bandage:item('bandage','繊維の包帯','medicine','✚','HPを25回復。無傷では消費しない。','草葉3と布1で手作り'),
 'mist-core':item('mist-core','霞の結晶','quest','◇','高台の霧宝箱に眠る結晶。炉の強化に必要。','登り鉤と風布の翼で霧の高台へ'),
 'warden-core':item('warden-core','番人の火種','quest','✦','銅殻の番人の確定報酬。炉の強化に必要。','地下墓所の銅殻の番人を倒す'),
 'ember-gem':item('ember-gem','灯火の石','accessory','❖','武器: 威力 +12%。防具: 被ダメージ軽減 +5%。各装備1枠。','鍛冶設備で石4・金属3から制作'),
 'ember-charm':item('ember-charm','灯守りの護符','accessory','◈','最大HP +15。尾根の野営地を再点火した証。','尾根の野営地に到着','charm'),
};
/** Canonical collectible SDF material IDs. Alternate world palettes 1/5/8 map
 * to soil/wood/stone before entering SurvivalSystem.inventory. */
export const CAMPAIGN_MATERIALS:Readonly<Record<number,{id:number;label:string;category:'resource';icon:string;stackLimit:number;description:string;source:string}>>=Object.fromEntries([
 [2,'土','▧','畑と地形用の土。','地面を鑿で削る'],[3,'石','◆','炉・矢じり・建材。','入口の岩を鑿で掘る'],
 [4,'木材','▥','建築と初期装備の基本素材。','丸太や木の幹を削り、破片へ近づく'],[6,'金属','⬡','鍛冶装備・登り鉤の部材。','入口右の金属材を鑿で掘る'],
 [7,'草葉','♧','繊維、料理、餌の材料。','草や木の葉を採集する'],[10,'布','▤','織り鎧・滑空翼・包帯。','鍛冶師の救出報酬、または繊維の加工'],
].map(([id,label,icon,description,source])=>[id,{id:Number(id),label:String(label),category:'resource' as const,icon:String(icon),stackLimit:1000000,description:String(description),source:String(source)}]));
export type CampaignProfession='carpenter'|'alchemist';
export const CAMPAIGN_PROFESSIONS:Readonly<Record<CampaignProfession,{label:string;rescueHint:string}>>={
 carpenter:{label:'木工師',rescueHint:'木霊の荷場で木工師マキを救出する'},
 alchemist:{label:'錬金師',rescueHint:'二口の響銅坑で錬金師セナを救出する'},
};
/** The optional world owns rescue claims. This adapter never creates a second
 * profession ledger in CampaignState or unlocks western crafts in the v3 world. */
export interface CampaignProfessionProvider {rescued(role:CampaignProfession):boolean;atWorkshop(position:Vec3):boolean}
export interface CampaignRecipe {id:string;label:string;output:string;cost:Record<number,number>;station:'hand'|'hearth'|'forge';requiresArtisan:boolean;requiresProfession?:CampaignProfession;description:string;outputCount?:number;itemCost?:Record<string,number>}
export const CAMPAIGN_RECIPES:readonly CampaignRecipe[]=[
 {id:'fishing-rod',label:'葦糸の釣竿',output:'fishing-rod',cost:{4:5,7:3},station:'hand',requiresArtisan:false,description:'釣竿を選択し、水面へ投げ入れる'},
 {id:'fish-bait',label:'草実の練り餌 ×3',output:'fish-bait',cost:{7:2},station:'hand',requiresArtisan:false,description:'岸釣り1回につき1個消費',outputCount:3},
 {id:'grilled-silverfin',label:'澄鰭魚の炉焼き',output:'grilled-silverfin',cost:{4:1},itemCost:{silverfin:1},station:'hearth',requiresArtisan:false,description:'釣った魚を焼く。HP +20 / スタミナ +15、120秒'},
 {id:'herb-fish-soup',label:'澄鰭魚の薬草汁',output:'herb-fish-soup',cost:{4:1},itemCost:{silverfin:1,herbs:1},station:'hearth',requiresArtisan:false,description:'魚と栽培薬草を煮込む。HP +20 / スタミナ +15、180秒'},
 {id:'bow',label:'旅弓',output:'bow',cost:{4:6,7:4},station:'hand',requiresArtisan:false,description:'矢を使う遠距離武器'},
 {id:'arrows',label:'石先の矢 ×8',output:'arrows',outputCount:8,cost:{4:1,3:1},station:'hand',requiresArtisan:false,description:'旅弓の弾薬8本'},
 {id:'staff',label:'灯木の杖',output:'staff',cost:{4:4,3:3,7:2},station:'hand',requiresArtisan:false,description:'属性術の威力 +20%'},
 {id:'ember-gem',label:'灯火の石',output:'ember-gem',cost:{3:4,6:3},station:'forge',requiresArtisan:true,description:'武器か防具のジェム枠に装着'},
 {id:'iron-blade',label:'銅風の剣',output:'iron-blade',cost:{4:4,6:6},station:'forge',requiresArtisan:true,description:'近接ダメージ +30%'},
 {id:'copper-mail',label:'鳴銅の鎖鎧',output:'copper-mail',cost:{6:12,10:4,4:2},station:'forge',requiresArtisan:true,description:'物理被ダメージ −30% / 移動 −6% / 通電に注意'},
 {id:'hide-coat',label:'織り鎧',output:'hide-coat',cost:{7:6,10:4},station:'forge',requiresArtisan:true,description:'被ダメージ −20%'},
 {id:'grapple',label:'登り鉤',output:'grapple',cost:{6:4,7:4},station:'forge',requiresArtisan:true,description:'霧の高台にあるアンカーを利用'},
 {id:'glider',label:'風布の翼',output:'glider',cost:{4:6,10:6},station:'forge',requiresArtisan:true,description:'空中で起動、スタミナを使って滑空'},
 {id:'windwoven-glider',label:'木霊の風織り翼',output:'windwoven-glider',cost:{4:10,10:8},itemCost:{'amber-resin':4},station:'hearth',requiresArtisan:false,requiresProfession:'carpenter',description:'木工師の翼。滑空速度 +20% / 消費スタミナ −25%'},
 {id:'resin-staff',label:'響銅の調律杖',output:'resin-staff',cost:{4:6,3:4},itemCost:{'singing-copper':2,'amber-resin':2},station:'hearth',requiresArtisan:false,requiresProfession:'alchemist',description:'錬金師の杖。属性術の威力 +40%、耐久・強化に対応'},
 {id:'berry-meal',label:'野草の煮込み',output:'berry-meal',cost:{7:4},station:'hearth',requiresArtisan:false,description:'HP +20 / スタミナ +15、180秒'},
 {id:'bandage',label:'繊維の包帯',output:'bandage',cost:{7:3,10:1},station:'hand',requiresArtisan:false,description:'HPを25回復'},
];
export const CAMPAIGN_SKILLS:readonly {id:string;label:string;description:string;cost:number;requires?:string}[]=[
 {id:'vigor',label:'丈夫な身体',description:'最大HP +20',cost:1},
 {id:'endurance',label:'旅人の呼吸',description:'最大スタミナ +20、移動速度 +8%',cost:1},
 {id:'attunement',label:'霞への適応',description:'霧の滞在上限 +30秒。前提: 旅人の呼吸',cost:1,requires:'endurance'},
];
export type CampaignPointId='hearth'|'artisan'|'mist-cache'|'ridge-gate'|'nextcamp';
export const CAMPAIGN_POINTS:readonly {id:CampaignPointId;label:string;kind:'base'|'npc'|'cache'|'gate';position:Vec3;description:string}[]=[
 {id:'hearth',label:'灯守りの炉',kind:'base',position:{x:-3,y:.25,z:4},description:'木8・石6で点火。制作と復活の拠点。'},
 {id:'artisan',label:'鍛冶師ナギ',kind:'npc',position:{x:-2.5,y:.25,z:-3.5},description:'墓所に取り残された鍛冶師。救出後は炉辺で制作できる。'},
 {id:'mist-cache',label:'霧の高台の宝箱',kind:'cache',position:{x:7,y:3.25,z:-9},description:'登り鉤と風布の翼で向かう、霞の結晶の保管庫。'},
 {id:'ridge-gate',label:'銅風の関門',kind:'gate',position:{x:0,y:.25,z:-17},description:'強化した炉の加護で濃い霞を越える。'},
 {id:'nextcamp',label:'尾根の野営地',kind:'base',position:{x:0,y:3,z:-31},description:'最後の帰還点。到達後も建築・探索を続けられる。'},
];
export const CAMPAIGN_QUESTS:readonly {id:string;label:string;detail:string;side?:boolean;rewardXp:number}[]=[
 {id:'gather',label:'火を起こす支度',detail:'木材8・石6を採集する',rewardXp:20},
 {id:'hearth',label:'谷に灯を',detail:'灯守りの炉を点火する',rewardXp:25},
 {id:'rescue',label:'忘れられた鍛冶師',detail:'入口の番兵を外へ誘い、墓所の左手にいるナギを救出する。壁で敵の視線を切れる',rewardXp:35},
 {id:'forge',label:'旅に耐える装備',detail:'剣・弓・杖のいずれかと織り鎧または鎖鎧を制作し、装備する',rewardXp:30},
 {id:'traverse',label:'風と鉤',detail:'登り鉤と風布の翼を制作し、装備する',rewardXp:30},
 {id:'cache',label:'霞の向こうの結晶',detail:'霧の高台に到達し宝箱を開く',rewardXp:40},
 {id:'warden',label:'銅殻の番人',detail:'地下墓所の番人を倒し火種を得る',rewardXp:60},
 {id:'flame',label:'遠くを照らす火',detail:'結晶と火種を持ち帰り、炉を段階2へ強化する',rewardXp:40},
 {id:'ridge',label:'銅風の尾根へ',detail:'関門を開き、尾根の野営地を再点火する',rewardXp:50},
 {id:'shelter',label:'小さな住まい',detail:'木の壁と床を1つずつ建築する',side:true,rewardXp:20},
 {id:'prepared',label:'旅のひと休み',detail:'食事を取り、拠点で休息する',side:true,rewardXp:15},
];
export interface GearState {durability:number;maxDurability:number;upgrade:number;socket:'ember-gem'|null}
export interface CampaignState {
 version:1;items:Record<string,number>;gearState:Record<string,GearState>;equipment:Record<EquipmentSlot,string|null>;completed:string[];claimedEnemies:string[];
 xp:number;level:number;skillPoints:number;skills:string[];unlockedRegions:RegionId[];discoveredRegions:RegionId[];claimedPoints:string[];flameTier:number;artisanRescued:boolean;gateOpen:boolean;campUnlocked:boolean;
 foodSeconds:number;restSeconds:number;shroudSeconds:number;discovered:CampaignPointId[];built:string[];deaths:number;deathPending:boolean;
 deathBag:{position:Vec3;materials:Record<number,number>}|null;
}
export interface CampaignResult {ok:boolean;message:string;position?:Vec3;heal?:number;materials?:Record<number,number>;items?:Record<string,number>}
export interface CampaignTick {position:Vec3;inShroud?:boolean;resting?:boolean;sheltered?:boolean}
const slots:EquipmentSlot[]=['weapon','armor','grapple','glider','charm'];
const materialIds=[2,3,4,6,7,10];
const finitePosition=(p:Vec3)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)&&Math.abs(p.x)<1000&&Math.abs(p.y)<1000&&Math.abs(p.z)<1000;
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const success=(message:string,extra:Partial<CampaignResult>={}):CampaignResult=>({ok:true,message,...extra});
const fail=(message:string):CampaignResult=>({ok:false,message});
const point=(id:string)=>CAMPAIGN_POINTS.find(p=>p.id===id);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export const isShrouded=(position:Vec3)=>position.x>5&&position.x<11&&position.z<-5&&position.z>-15||position.z<-18&&position.z>-26;
export const isDeepShroud=(position:Vec3)=>position.z<-18&&position.z>-26;

export class CampaignSystem {
 state:CampaignState={version:1,items:{},gearState:{},equipment:{weapon:null,armor:null,grapple:null,glider:null,charm:null},completed:[],claimedEnemies:[],xp:0,level:1,skillPoints:0,skills:[],unlockedRegions:[],discoveredRegions:[],claimedPoints:[],flameTier:0,artisanRescued:false,gateOpen:false,campUnlocked:false,foodSeconds:0,restSeconds:0,shroudSeconds:60,discovered:['hearth'],built:[],deaths:0,deathPending:false,deathBag:null};
 constructor(readonly materials:Record<number,number>){}
 private professionProvider:CampaignProfessionProvider|null=null;
 setProfessionProvider(provider:CampaignProfessionProvider|null){this.professionProvider=provider;}
 professionUnlocked(role:CampaignProfession){return this.professionProvider?.rescued(role)??false;}
 get maxHp(){return 100+(this.state.skills.includes('vigor')?20:0)+(this.state.foodSeconds>0?20:0)+(this.state.equipment.charm==='ember-charm'?15:0);}
 get maxStamina(){return 100+(this.state.skills.includes('endurance')?20:0)+(this.state.foodSeconds>0?15:0);}
 get equippedWeapon(){return this.state.equipment.weapon;}
 get isStaffWeapon(){return this.equippedWeapon==='staff'||this.equippedWeapon==='resin-staff';}
 get spellMultiplier(){const id=this.equippedWeapon;return id==='staff'?1.2*this.gearPower(id):id==='resin-staff'?1.4*this.gearPower(id):1;}
 get attackMultiplier(){const id=this.equippedWeapon;return (id==='iron-blade'?1.3:1)*(id?this.gearPower(id):1);}
 get armorMaterial():0|6|10{return this.state.equipment.armor==='copper-mail'?6:this.state.equipment.armor==='hide-coat'?10:0;}
 get damageReduction(){const id=this.state.equipment.armor;if(id!=='hide-coat'&&id!=='copper-mail')return 0;const g=this.gearInfo(id);return Math.min(.5,((id==='copper-mail'?.3:.2)+g.upgrade*.03+(g.socket ? .05 : 0))*(g.durability>0?1:.5));}
 private gearPower(id:string){const g=this.gearInfo(id);return (1+g.upgrade*.1+(g.socket ? .12 : 0))*(g.durability>0?1:.5);}
 gearInfo(id:string):GearState {const g=this.state.gearState[id];return g?{...g}:{durability:100,maxDurability:100,upgrade:0,socket:null};}
 private ensureGear(id:string){return this.state.gearState[id]??(this.state.gearState[id]=this.gearInfo(id));}

 get moveMultiplier(){return (this.state.skills.includes('endurance')?1.08:1)*(this.state.equipment.armor==='copper-mail'?.94:1);}
 get staminaRegenMultiplier(){return this.state.restSeconds>0?1.4:1;}
 get shroudMaximum(){return 60+Math.max(0,this.state.flameTier-1)*30+(this.state.skills.includes('attunement')?30:0);}
 get canGlide(){return this.state.equipment.glider==='glider'||this.state.equipment.glider==='windwoven-glider';}
 get glideSpeedMultiplier(){return this.state.equipment.glider==='windwoven-glider'?1.2:1;}
 get glideStaminaMultiplier(){return this.state.equipment.glider==='windwoven-glider'?.75:1;}
 get canGrapple(){return this.state.equipment.grapple==='grapple';}
 get complete(){return this.state.completed.includes('ridge');}
 get campaignChapterComplete(){return this.complete;}
 get overallComplete(){return this.complete&&this.state.claimedPoints.includes('rg-lake-cache');}
 get regionTier(){return this.state.flameTier;}
 regionUnlocked(id:string){return id==='hearthfield'?this.complete:this.state.unlockedRegions.includes(id as RegionId);}
 get spawn(){return {...point(this.state.campUnlocked?'nextcamp':this.state.flameTier>0?'hearth':'hearth')!.position};}
 has(id:string){return (this.state.items[id]??0)>0;}
 private awardXp(amount:number){this.state.xp=Math.min(10000,this.state.xp+amount);const level=Math.min(10,1+Math.floor(this.state.xp/80));this.state.skillPoints+=level-this.state.level;this.state.level=level;}
 private finish(id:string){if(this.state.completed.includes(id))return;const quest=CAMPAIGN_QUESTS.find(q=>q.id===id);if(!quest)return;this.state.completed.push(id);this.awardXp(quest.rewardXp);}
 private refresh(){const s=this.state;
  if((this.materials[4]??0)>=8&&(this.materials[3]??0)>=6)this.finish('gather');
  if(s.flameTier>0)this.finish('hearth');if(s.artisanRescued)this.finish('rescue');
  if(s.equipment.weapon!==null&&['hide-coat','copper-mail'].includes(s.equipment.armor??''))this.finish('forge');
  if(this.canGrapple&&this.canGlide)this.finish('traverse');
  if(this.has('mist-core'))this.finish('cache');if(this.has('warden-core'))this.finish('warden');
  if(s.flameTier>=2)this.finish('flame');if(s.campUnlocked)this.finish('ridge');
  if(s.built.includes('wall')&&s.built.includes('floor'))this.finish('shelter');
  if(s.foodSeconds>0&&s.restSeconds>0)this.finish('prepared');
 }
 objective(){this.refresh();const quest=CAMPAIGN_QUESTS.find(q=>!q.side&&!this.state.completed.includes(q.id));if(!quest)return this.regionalObjective();
  const destination:Record<string,string>={gather:'hearth',hearth:'hearth',rescue:'artisan',forge:'hearth',traverse:'hearth',cache:'mist-cache',warden:'artisan',flame:'hearth',ridge:this.state.gateOpen?'nextcamp':'ridge-gate'};
  return {...quest,waypoint:point(destination[quest.id])??null};
 }
 questRows(){this.refresh();const current=this.objective().id;return CAMPAIGN_QUESTS.map(q=>({...q,status:this.state.completed.includes(q.id)?'complete' as const:q.id===current||q.side?'active' as const:'locked' as const}));}
 recipeStatus(id:string,position:Vec3,count=1):CampaignResult {const r=CAMPAIGN_RECIPES.find(r=>r.id===id);if(!r)return fail('未知のレシピ');
  if(!Number.isSafeInteger(count)||count<1||count>20)return fail('制作数は1〜20個');
  if(!finitePosition(position))return fail('制作位置が無効');
  if(r.requiresArtisan&&!this.state.artisanRescued)return fail('地下墓所の鍛冶師を救出する');
  if(r.requiresProfession&&!this.professionUnlocked(r.requiresProfession))return fail(CAMPAIGN_PROFESSIONS[r.requiresProfession].rescueHint);
  if(r.station!=='hand'&&this.state.flameTier===0)return fail('灯守りの炉を点火する');
  if(r.station!=='hand'&&dist(position,point('hearth')!.position)>3&&!(r.requiresProfession&&this.professionProvider?.atWorkshop(position)))return fail(r.requiresProfession?'灯守りの炉か発見済みの木霊の帰還炉から3m以内で制作する':'灯守りの炉から3m以内で制作する');
  if((this.state.items[r.output]??0)+count*(r.outputCount??1)>CAMPAIGN_ITEMS[r.output].stackLimit)return fail('所持上限。装備は各1個、消耗品は各20個');
  const missing=Object.entries(r.cost).filter(([key,n])=>(this.materials[Number(key)]??0)<n*count);
  if(missing.length)return fail('素材不足: '+missing.map(([key,n])=>`${({3:'石',4:'木材',6:'金属',7:'草葉',10:'布'} as Record<string,string>)[key]} ${(this.materials[Number(key)]??0)}/${n*count}`).join(' / '));
  const missingItems=Object.entries(r.itemCost??{}).filter(([id,n])=>(this.state.items[id]??0)<n*count);
  if(missingItems.length)return fail('素材不足: '+missingItems.map(([id,n])=>`${CAMPAIGN_ITEMS[id].label} ${(this.state.items[id]??0)}/${n*count} · ${CAMPAIGN_ITEMS[id].source}`).join(' / '));
  return success('制作できる');
 }
 craft(id:string,position:Vec3,count=1):CampaignResult {const status=this.recipeStatus(id,position,count);if(!status.ok)return status;const r=CAMPAIGN_RECIPES.find(r=>r.id===id)!;
  for(const [key,n] of Object.entries(r.cost))this.materials[Number(key)]-=n*count;
  for(const [id,n] of Object.entries(r.itemCost??{}))this.state.items[id]-=n*count;
  this.state.items[r.output]=(this.state.items[r.output]??0)+count*(r.outputCount??1);if(['weapon','armor'].includes(CAMPAIGN_ITEMS[r.output].slot??''))this.ensureGear(r.output);this.refresh();return success(`${CAMPAIGN_ITEMS[r.output].label} ×${count*(r.outputCount??1)}を制作。装備品は持物から装備する`);
 }
 private atForge(position:Vec3):CampaignResult {if(!finitePosition(position)||dist(position,point('hearth')!.position)>3)return fail('灯守りの炉から3m以内で作業する');if(!this.state.flameTier||!this.state.artisanRescued)return fail('炉を点火し、鍛冶師を救出する');return success('鍛冶設備を利用できる');}
 private workableGear(id:string){return this.has(id)&&['weapon','armor'].includes(CAMPAIGN_ITEMS[id]?.slot??'');}
 private canPay(cost:Record<number,number>){return Object.entries(cost).every(([id,n])=>(this.materials[Number(id)]??0)>=n);}
 private pay(cost:Record<number,number>){for(const [id,n] of Object.entries(cost))this.materials[Number(id)]-=n;}
 repairStatus(id:string,position:Vec3):CampaignResult {if(!this.workableGear(id))return fail('所持している武器か防具を選ぶ');const station=this.atForge(position);if(!station.ok)return station;const g=this.gearInfo(id);if(g.durability>=g.maxDurability)return fail('修理は不要');const cost:Record<number,number>={6:Math.ceil((g.maxDurability-g.durability)/25)};return {ok:this.canPay(cost),message:`修理: 金属${cost[6]}${this.canPay(cost)?'':'（不足）'}`,materials:cost};}
 repair(id:string,position:Vec3):CampaignResult {const check=this.repairStatus(id,position);if(!check.ok)return check;this.pay(check.materials!);const g=this.ensureGear(id);g.durability=g.maxDurability;return success(CAMPAIGN_ITEMS[id].label+'を修理');}
 upgradeStatus(id:string,position:Vec3):CampaignResult {if(!this.workableGear(id))return fail('所持している武器か防具を選ぶ');const station=this.atForge(position);if(!station.ok)return station;const g=this.gearInfo(id);if(g.upgrade>=3)return fail('強化上限 +3');if(g.upgrade>=2&&!this.state.campUnlocked)return fail('最終強化には尾根の野営地への到達が必要');if(g.upgrade>=Math.max(this.state.flameTier,this.state.campUnlocked?3:0))return fail('次の強化には炉の強化が必要');const cost:Record<number,number>={6:2*(g.upgrade+1),3:3*(g.upgrade+1)};return {ok:this.canPay(cost),message:`強化 +${g.upgrade+1}: 金属${cost[6]}・石${cost[3]}${this.canPay(cost)?'':'（不足）'}`,materials:cost};}
 upgrade(id:string,position:Vec3):CampaignResult {const check=this.upgradeStatus(id,position);if(!check.ok)return check;this.pay(check.materials!);this.ensureGear(id).upgrade++;return success(CAMPAIGN_ITEMS[id].label+`を +${this.state.gearState[id].upgrade} に強化`);}
 socket(id:string,gem:string|null,position:Vec3):CampaignResult {if(!this.workableGear(id))return fail('武器か防具にだけジェムを装着できる');const station=this.atForge(position);if(!station.ok)return station;if(gem!==null&&gem!=='ember-gem')return fail('対応していないジェム');const g=this.gearInfo(id);if(g.socket===gem)return fail(gem?'同じジェムを装着済み':'ジェムは付いていない');if(gem&&!this.has(gem))return fail('灯火の石を制作する');if(g.socket&&(this.state.items[g.socket]??0)>=CAMPAIGN_ITEMS[g.socket].stackLimit)return fail('取り外すジェムの所持枠がない');if(gem)this.state.items[gem]--;if(g.socket)this.state.items[g.socket]=(this.state.items[g.socket]??0)+1;this.ensureGear(id).socket=gem;return success(gem?'灯火の石を装着':'灯火の石を取り外した');}
 consumeAttackDurability(amount=1):CampaignResult {return this.wear(this.equippedWeapon,amount);}
 consumeArmorDurability(amount=1):CampaignResult {return this.wear(this.state.equipment.armor,amount);}
 private wear(id:string|null,amount:number):CampaignResult {if(!id||!this.workableGear(id)||!Number.isFinite(amount)||amount<=0)return fail('耐久を消費する装備がない');const g=this.ensureGear(id),old=g.durability;g.durability=Math.max(0,g.durability-Math.min(100,amount));return success(g.durability===0&&old>0?`${CAMPAIGN_ITEMS[id].label}が破損。性能が半減。炉で修理する`:g.durability<=20&&old>20?`${CAMPAIGN_ITEMS[id].label}の耐久が残り20以下`:'');}
 salvagePreview(id:string):CampaignResult {if(!this.workableGear(id))return fail('武器と防具だけ解体できる。重要品・移動具は保持する');if(Object.values(this.state.equipment).includes(id))return fail('装備中の品は解体できない');const recipe=CAMPAIGN_RECIPES.find(r=>r.output===id);if(!recipe)return fail('解体できない品');const materials:Record<number,number>={};for(const [key,n] of Object.entries(recipe.cost))if(n>=2)materials[Number(key)]=Math.floor(n/2);const socket=this.gearInfo(id).socket,items:Record<string,number>={};if(socket){if((this.state.items[socket]??0)>=CAMPAIGN_ITEMS[socket].stackLimit)return fail('取り外すジェムの所持枠がない');items[socket]=1;}return {ok:true,message:'元の制作素材の半分を返却（端数切捨て）。強化費用は返却しない',materials,items};}
 salvage(id:string,confirmed=false):CampaignResult {if(!confirmed)return fail('解体の内容を確認してから確定する');const preview=this.salvagePreview(id);if(!preview.ok)return preview;this.state.items[id]--;delete this.state.gearState[id];for(const [key,n] of Object.entries(preview.materials!))this.materials[Number(key)]=(this.materials[Number(key)]??0)+n;for(const [key,n] of Object.entries(preview.items!))this.state.items[key]=(this.state.items[key]??0)+n;return success(CAMPAIGN_ITEMS[id].label+'を解体',preview);}
 consumeAmmo(count=1):boolean {if(!Number.isSafeInteger(count)||count<1||(this.state.items.arrows??0)<count)return false;this.state.items.arrows-=count;return true;}
 equip(id:string):CampaignResult {const i=CAMPAIGN_ITEMS[id];if(!i?.slot||!this.has(id))return fail('所持している装備を選ぶ');this.state.equipment[i.slot]=id;this.refresh();return success(i.label+'を装備');}
 unequip(slot:EquipmentSlot):CampaignResult {if(!slots.includes(slot)||this.state.equipment[slot]===null)return fail('この枠には装備していない');this.state.equipment[slot]=null;return success('装備を外した');}
 consume(id:string,hp=this.maxHp):CampaignResult {if(!this.has(id))return fail('持っていない');
  if(id==='berry-meal'||id==='milk'||id==='grilled-silverfin'||id==='herb-fish-soup'){this.state.items[id]--;this.state.foodSeconds=id==='milk'||id==='grilled-silverfin'?120:180;this.refresh();return success(`${CAMPAIGN_ITEMS[id].label} · ${this.state.foodSeconds}秒、最大HP +20 / スタミナ +15`);}
  if(id==='bandage'){if(!Number.isFinite(hp)||hp<0||hp>=this.maxHp)return fail('HPが減ったときに使う');this.state.items[id]--;return success('包帯でHPを25回復',{heal:Math.min(25,this.maxHp-hp)});}
  return fail('この品は使用できない');
 }
 learn(id:string):CampaignResult {const skill=CAMPAIGN_SKILLS.find(s=>s.id===id);if(!skill)return fail('未知のスキル');if(this.state.skills.includes(id))return fail('習得済み');if(skill.requires&&!this.state.skills.includes(skill.requires))return fail('前提スキルが必要');if(this.state.skillPoints<skill.cost)return fail('スキルポイントが不足');this.state.skillPoints-=skill.cost;this.state.skills.push(id);return success(skill.label+'を習得');}
 resetSkills():CampaignResult {this.state.skillPoints+=this.state.skills.reduce((n,id)=>n+(CAMPAIGN_SKILLS.find(s=>s.id===id)?.cost??0),0);this.state.skills=[];return success('スキルを再配分できる');}
 interact(id:string,position:Vec3):CampaignResult {const p=point(id);if(!p||!finitePosition(position))return fail('対象が無効');if(dist(position,p.position)>2.8)return fail(p.label+'の近くへ移動する');this.refresh();
  if(id==='hearth'){
   if(this.state.flameTier===0){if((this.materials[4]??0)<8||(this.materials[3]??0)<6)return fail('点火には木材8・石6が必要');this.materials[4]-=8;this.materials[3]-=6;this.state.flameTier=1;this.refresh();return success('灯守りの炉を点火。復活地点と制作設備を解放');}
   if(this.state.flameTier===1&&this.has('mist-core')&&this.has('warden-core')){this.state.items['mist-core']--;this.state.items['warden-core']--;this.state.flameTier=2;this.state.shroudSeconds=this.shroudMaximum;this.refresh();return success('炉が段階2へ。濃い霞を通過できる。霧滞在 +30秒');}
   if(this.complete){const next=REGIONAL_UPGRADES.find(u=>!this.regionUnlocked(u.opens));if(next)return this.upgradeRegion(next.id,position);return success('すべての地域の準備が整った。最後の湖へ');}return success(this.state.flameTier===1?'炉は段階1。霧の結晶と番人の火種で強化できる':'炉は段階2。尾根の関門へ向かおう');
  }
  if(id==='artisan'){if(this.state.artisanRescued)return success('ナギ「炉のそばで装備を作ろう。金属は入口の鉱材、布は私の支給分を使って」');if(!this.state.flameTier)return fail('先に灯守りの炉を点火し、帰還先を用意する');this.state.artisanRescued=true;for(const [key,n] of [[10,12],[7,12],[6,6]])this.materials[key]=(this.materials[key]??0)+n;this.refresh();return success('鍛冶師ナギを救出。炉の鍛冶設備を解放 / 布12・草葉12・金属6');}
  if(id==='mist-cache'){if(this.state.completed.includes('cache'))return fail('宝箱は回収済み');if(!this.canGrapple||!this.canGlide)return fail('登り鉤と風布の翼を制作して装備する');if(this.state.shroudSeconds<=0)return fail('霧の時間切れ。安全地帯に戻る');this.state.items['mist-core']=1;this.refresh();return success('霞の結晶を入手。番人の火種と一緒に炉へ');}
  if(id==='ridge-gate'){if(this.state.flameTier<2)return fail('濃い霞が道を塞いでいる。炉を段階2に強化する');this.state.gateOpen=true;return success('銅風の関門を解放。尾根の野営地へ');}
  if(id==='nextcamp'){if(this.state.flameTier<2||!this.state.gateOpen)return fail('先に炉を強化し、銅風の関門を解放する');if(this.state.campUnlocked)return success('尾根の野営地。旅を終えた後も建築と探索を続けられる');this.state.campUnlocked=true;if(!this.state.unlockedRegions.includes('hearthfield'))this.state.unlockedRegions.push('hearthfield');this.state.items['ember-charm']=1;this.refresh();return success('第一章を完了！ 尾根の野営地と護符を獲得。次は西の灯穂の野へ');}
  return fail('操作できない');
 }
 defeat(enemyId:string|number,kind:'scavenger'|'warden'|'ridge'='scavenger'):CampaignResult {const id=String(enemyId);if(!id||id.length>80||this.state.claimedEnemies.includes(id))return fail('この敵の報酬は受領済み');if(this.state.claimedEnemies.length>=256)return fail('敵報酬記録の上限');this.state.claimedEnemies.push(id);this.awardXp(kind==='warden'?50:kind==='ridge'?35:20);if(kind==='warden'&&!this.state.completed.includes('warden'))this.state.items['warden-core']=1;this.refresh();return success(kind==='warden'?'銅殻の番人を倒した。火種を獲得':'敵を倒した。経験値を獲得');}
 private regionalObjective(){if(this.overallComplete)return {id:'complete',label:'七つの灯をつないだ',detail:'澄鐘の環守を越え、帰還鐘を回収した。未探索の場所・副依頼・自由建築は続けられる。',waypoint:null};
  const q=REGIONAL_QUESTS.find(q=>!this.state.claimedPoints.includes(q.objectivePoint))!;const r=REGIONS.find(r=>r.id===q.region)!;const cache=REGIONAL_POINTS.find(p=>p.id===q.objectivePoint)!;
  if(!this.regionUnlocked(r.id)){const u=REGIONAL_UPGRADES.find(u=>u.opens===r.id)!;const costs=Object.entries(u.cost).map(([id,n])=>`${CAMPAIGN_ITEMS[id].label} ${(this.state.items[id]??0)}/${n}`).join('・');return {id:q.id,label:r.name+'への準備',detail:`灯守りの炉で地域を解放: ${costs}`,waypoint:point('hearth')!};}
  const required=cache.requires?.find(id=>!this.has(id));if(required){const boss=REGIONAL_ENEMIES.find(e=>e.reward.items?.[required]);if(boss)return {id:q.id,label:boss.name+'を倒す',detail:boss.telegraph,waypoint:{id:boss.key,label:boss.name,kind:'boss',position:{...boss.position},description:boss.telegraph}};}
  return {id:q.id,label:q.name,detail:cache.name+'を探して地域の印を得る',waypoint:{id:cache.id,label:cache.name,kind:cache.kind,position:{...cache.position},description:r.description}};
 }
 regionQuestRows(){return REGIONAL_QUESTS.map(q=>({...q,label:q.name,detail:REGIONAL_POINTS.find(p=>p.id===q.objectivePoint)!.name,status:this.state.claimedPoints.includes(q.objectivePoint)?'complete' as const:this.regionUnlocked(q.region)?'active' as const:'locked' as const}));}
 regionUpgradeStatus(id:string,position:Vec3):CampaignResult {const u=REGIONAL_UPGRADES.find(u=>u.id===id);if(!u)return fail('未知の地域強化');const at=this.atForge(position);if(!at.ok)return at;if(!this.complete)return fail('先に尾根の野営地へ到達する');if(this.regionUnlocked(u.opens))return fail('この地域は解放済み');const previous=REGIONS[REGIONS.findIndex(r=>r.id===u.opens)-1];if(!previous||!this.regionUnlocked(previous.id))return fail('先の地域から順に探索する');const missing=u.requires.find(id=>!this.has(id));if(missing)return fail(CAMPAIGN_ITEMS[missing].label+'を前の地域で探す');const lacking=Object.entries(u.cost).filter(([id,n])=>(this.state.items[id]??0)<n);if(lacking.length)return fail('特産品が不足: '+lacking.map(([id,n])=>`${CAMPAIGN_ITEMS[id].label} ${(this.state.items[id]??0)}/${n}`).join(' / '));return {ok:true,message:REGIONS.find(r=>r.id===u.opens)!.name+`を解放 / 炉の段階${u.tier}`,items:{...u.cost}};}
 upgradeRegion(id:string,position:Vec3):CampaignResult {const check=this.regionUpgradeStatus(id,position);if(!check.ok)return check;const u=REGIONAL_UPGRADES.find(u=>u.id===id)!;for(const [id,n] of Object.entries(u.cost))this.state.items[id]-=n;this.state.unlockedRegions.push(u.opens);this.state.flameTier=Math.max(this.state.flameTier,u.tier);this.state.shroudSeconds=this.shroudMaximum;return success(check.message);}
 private rewardCheck(reward:RegionalReward):CampaignResult {for(const [id,n] of Object.entries(reward.items??{})){if(!Object.hasOwn(CAMPAIGN_ITEMS,id))return fail('未知の報酬');if((this.state.items[id]??0)+n>CAMPAIGN_ITEMS[id].stackLimit)return fail(CAMPAIGN_ITEMS[id].label+'の所持上限。空きを作って再び調べる');}for(const [id,n] of Object.entries(reward.materials??{}))if((this.materials[Number(id)]??0)+n>1000000)return fail('素材の所持上限');return success('受取可能');}
 private grantReward(reward:RegionalReward){for(const [id,n] of Object.entries(reward.items??{}))this.state.items[id]=(this.state.items[id]??0)+n;for(const [id,n] of Object.entries(reward.materials??{}))this.materials[Number(id)]=(this.materials[Number(id)]??0)+n;this.awardXp(reward.xp);}
 interactRegional(id:string,position:Vec3,hour=12):CampaignResult {const p=REGIONAL_POINTS.find(p=>p.id===id);if(!p||!finitePosition(position))return fail('地域の対象が無効');if(dist(position,p.position)>2.8)return fail(p.name+'の近くへ移動する');if(!this.regionUnlocked(p.region))return fail('先に灯守りの炉でこの地域を解放する');if(!isRegionalOpen(p.openHours,hour))return fail('この古文書は夜18時〜翌6時に読める');const missing=p.requires?.find(id=>!this.has(id));if(missing)return fail(CAMPAIGN_ITEMS[missing].label+'が必要。地域のボスを倒す');if(p.kind==='anchor')return success('指定アンカー。装備した登り鉤で移動する');if(this.state.claimedPoints.includes(id))return p.kind==='hearth'?success('発見済みの炉。地図から帰還できる'):fail('回収済み');const check=this.rewardCheck(p.reward);if(!check.ok)return check;this.grantReward(p.reward);this.state.claimedPoints.push(id);const q=REGIONAL_QUESTS.find(q=>q.objectivePoint===id);if(q)this.awardXp(q.reward.xp);return success(p.lore??(q?q.completionText:p.kind==='hearth'?'帰還地点を発見。地図から移動できる':p.name+'の報酬を回収'));}
 defeatRegional(enemyId:number):CampaignResult {const e=REGIONAL_ENEMIES.find(e=>e.id===enemyId);if(!e)return fail('未知の地域の敵');if(!this.regionUnlocked(e.region))return fail('未解放地域の報酬は受け取れない');const key='regional:'+enemyId;if(this.state.claimedEnemies.includes(key))return fail('この敵の報酬は受領済み');if(this.state.claimedEnemies.length>=256)return fail('敵報酬記録の上限');const check=this.rewardCheck(e.reward);if(!check.ok)return check;this.grantReward(e.reward);this.state.claimedEnemies.push(key);return success(e.name+'を倒した。報酬を獲得');}
 recordBuild(recipe:string){if(['wall','floor'].includes(recipe)&&!this.state.built.includes(recipe))this.state.built.push(recipe);this.refresh();}
 rest(position:Vec3,sheltered:boolean):CampaignResult {if(!finitePosition(position))return fail('休息位置が無効');const near=(this.state.flameTier>0&&dist(position,point('hearth')!.position)<3)||(this.state.campUnlocked&&dist(position,point('nextcamp')!.position)<3)||REGIONAL_POINTS.some(p=>p.kind==='hearth'&&this.state.claimedPoints.includes(p.id)&&this.regionUnlocked(p.region)&&dist(position,p.position)<3);if(!near)return fail('点火済み拠点から3m以内で休息する');if(!sheltered)return fail('屋根の下で休息する');this.state.restSeconds=180;this.refresh();return success('休息した · 180秒、スタミナ回復 +40%');}
 tick(dt:number,context:CampaignTick){if(!Number.isFinite(dt)||dt<=0||!finitePosition(context.position))return {damage:0,shrouded:false,deep:false};dt=Math.min(dt,1);const s=this.state;const shrouded=context.inShroud??isShrouded(context.position),deep=isDeepShroud(context.position)&&s.flameTier<2;
  s.foodSeconds=Math.max(0,s.foodSeconds-dt);s.restSeconds=Math.max(0,s.restSeconds-dt);s.shroudSeconds=Math.max(0,Math.min(this.shroudMaximum,s.shroudSeconds+(shrouded?-dt*(deep?6:1):dt*5)));
  const region=regionAt(context.position);if(region&&this.regionUnlocked(region.id)&&!s.discoveredRegions.includes(region.id)){s.discoveredRegions.push(region.id);this.awardXp(15);}
  for(const p of CAMPAIGN_POINTS)if(dist(context.position,p.position)<7&&!s.discovered.includes(p.id))s.discovered.push(p.id);
  if(context.resting)this.rest(context.position,context.sheltered===true);this.refresh();
  return {damage:shrouded&&s.shroudSeconds===0?20*dt:0,shrouded,deep};
 }
 canTravel(id:string):CampaignResult {const regional=REGIONAL_POINTS.find(p=>p.id===id&&p.kind==='hearth');if(regional&&this.state.claimedPoints.includes(id)&&this.regionUnlocked(regional.region))return success(regional.name+'へ帰還');if(id==='hearth'&&this.state.flameTier>0)return success('灯守りの炉へ帰還');if(id==='nextcamp'&&this.state.campUnlocked)return success('尾根の野営地へ帰還');return fail('未解放の帰還地点');}
 travel(id:string):CampaignResult {const result=this.canTravel(id);return result.ok?success(result.message,{position:{...(point(id)?.position??REGIONAL_POINTS.find(p=>p.id===id)!.position)}}):result;}
 die(position:Vec3):CampaignResult {if(!finitePosition(position))return fail('死亡位置が無効');if(this.state.deathPending)return fail('復活待ち');const lost:Record<number,number>={...this.state.deathBag?.materials};for(const key of materialIds){const count=Math.floor((this.materials[key]??0)*.25);if(count){this.materials[key]-=count;lost[key]=(lost[key]??0)+count;}}
  this.state.deathBag=Object.values(lost).some(n=>n>0)?{position:{...position},materials:lost}:null;this.state.deathPending=true;this.state.deaths++;return success('倒れた。素材の25%を落とした。装備と重要品は保持',{position:this.spawn});
 }
 respawn(){this.state.deathPending=false;this.state.foodSeconds=0;this.state.restSeconds=0;this.state.shroudSeconds=this.shroudMaximum;return this.spawn;}
 recover(position:Vec3):CampaignResult {const b=this.state.deathBag;if(!b)return fail('回収する落とし物はない');if(!finitePosition(position)||dist(position,b.position)>2.8)return fail('落とし物の近くへ移動する');for(const [key,n] of Object.entries(b.materials))this.materials[Number(key)]=(this.materials[Number(key)]??0)+n;this.state.deathBag=null;return success('死亡時の素材をすべて回収');}
 snapshot(){return clone(this.state);}
 restore(value:unknown):boolean {if(!validCampaignState(value))return false;const restored=clone(value),items=this.state.items;for(const id of Object.keys(items))delete items[id];Object.assign(items,restored.items);this.state={...restored,items};return true;}
}

/** Strict, atomic hydration rejects unknown IDs and duplicate reward records. */
export function validCampaignState(value:unknown):value is CampaignState {if(!value||typeof value!=='object'||Array.isArray(value))return false;const s=value as CampaignState;
 const number=(n:unknown,min:number,max:number,integer=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isSafeInteger(n));
 const list=(v:unknown,allowed:readonly string[],max=allowed.length)=>Array.isArray(v)&&v.length<=max&&new Set(v).size===v.length&&v.every(x=>typeof x==='string'&&allowed.includes(x));
 if(s.version!==1||!number(s.xp,0,10000,true)||!number(s.level,1,10,true)||s.level!==Math.min(10,1+Math.floor(s.xp/80))||!number(s.skillPoints,0,9,true)||!number(s.flameTier,0,5,true)||!number(s.deaths,0,1000000,true))return false;
 if(!list(s.skills,CAMPAIGN_SKILLS.map(s=>s.id))||s.skills.includes('attunement')&&!s.skills.includes('endurance')||s.skillPoints+s.skills.length!==s.level-1)return false;
 if(!list(s.unlockedRegions,REGIONS.map(r=>r.id))||!list(s.discoveredRegions,REGIONS.map(r=>r.id))||!list(s.claimedPoints,REGIONAL_POINTS.map(p=>p.id)))return false;
 for(const id of s.unlockedRegions){const r=REGIONS.find(r=>r.id===id)!,index=REGIONS.indexOf(r);if(!s.campUnlocked||s.flameTier<r.recommendedTier||index>0&&!s.unlockedRegions.includes(REGIONS[index-1].id))return false;}
 if(s.discoveredRegions.some(id=>!s.unlockedRegions.includes(id))||s.claimedPoints.some(id=>!s.unlockedRegions.includes(REGIONAL_POINTS.find(p=>p.id===id)!.region)))return false;
 if(!list(s.completed,CAMPAIGN_QUESTS.map(q=>q.id))||!list(s.discovered,CAMPAIGN_POINTS.map(p=>p.id))||!list(s.built,['wall','floor']))return false;
 if(!Array.isArray(s.claimedEnemies)||s.claimedEnemies.length>256||new Set(s.claimedEnemies).size!==s.claimedEnemies.length||s.claimedEnemies.some(id=>typeof id!=='string'||!id.length||id.length>80))return false;
 for(const key of ['artisanRescued','gateOpen','campUnlocked','deathPending'] as const)if(typeof s[key]!=='boolean')return false;
 if(!number(s.foodSeconds,0,180)||!number(s.restSeconds,0,180)||!number(s.shroudSeconds,0,210))return false;
 if(!s.items||typeof s.items!=='object'||Array.isArray(s.items)||Object.entries(s.items).some(([id,n])=>!Object.hasOwn(CAMPAIGN_ITEMS,id)||!number(n,0,CAMPAIGN_ITEMS[id].stackLimit,true)))return false;
 if(!s.gearState||typeof s.gearState!=='object'||Array.isArray(s.gearState))return false;
 for(const [id,g] of Object.entries(s.gearState)){if(!Object.hasOwn(CAMPAIGN_ITEMS,id)||!['weapon','armor'].includes(CAMPAIGN_ITEMS[id].slot??'')||(s.items[id]??0)<1||!g||typeof g!=='object'||!number(g.maxDurability,100,100,true)||!number(g.durability,0,g.maxDurability)||!number(g.upgrade,0,3,true)||(g.socket!==null&&g.socket!=='ember-gem'))return false;}
 for(const [id,n] of Object.entries(s.items))if(n>0&&['weapon','armor'].includes(CAMPAIGN_ITEMS[id].slot??'')&&!Object.hasOwn(s.gearState,id))return false;
 if(!s.equipment||typeof s.equipment!=='object'||Array.isArray(s.equipment)||Object.keys(s.equipment).length!==slots.length||slots.some(slot=>{const id=s.equipment[slot];return id!==null&&(typeof id!=='string'||!Object.hasOwn(CAMPAIGN_ITEMS,id)||CAMPAIGN_ITEMS[id].slot!==slot||(s.items[id]??0)<1);}))return false;
 if(s.flameTier===0&&(s.artisanRescued||s.gateOpen||s.campUnlocked)||s.gateOpen&&s.flameTier<2||s.campUnlocked&&!s.gateOpen)return false;
 if(s.deathBag!==null){const b=s.deathBag;if(!b||!finitePosition(b.position)||!b.materials||typeof b.materials!=='object'||Array.isArray(b.materials)||Object.entries(b.materials).some(([id,n])=>!materialIds.includes(Number(id))||!number(n,0,100000000,true)))return false;}
 return true;
}
