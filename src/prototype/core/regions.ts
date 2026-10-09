import type {Vec3} from './voxel';
import type {ObjectState} from './world';

export type RegionId='hearthfield'|'resinwood'|'rootfen'|'coppermesa'|'cinderkeep'|'rimepass'|'mirrorlake';
export type RegionClimate='temperate'|'woodland'|'wetland'|'arid'|'ash'|'freezing'|'lake';
export interface RegionBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface RegionalReward {materials?:Record<number,number>;items?:Record<string,number>;xp:number}
export interface RegionDefinition {id:RegionId;name:string;subtitle:string;bounds:RegionBounds;groundY:number;climate:RegionClimate;recommendedTier:number;requires:string[];material:number;airColor:string;route:Vec3[];description:string}
const p=(x:number,y:number,z:number):Vec3=>({x,y,z});
/** Compact side pockets are linked to the original central region; P1 coordinates are untouched. */
export const REGIONS:readonly RegionDefinition[]=[
 {id:'hearthfield',name:'灯穂の野',subtitle:'崩れた集落と帰還の灯',bounds:{minX:-28,maxX:-18,minZ:0,maxZ:10},groundY:.25,climate:'temperate',recommendedTier:2,requires:['ridge-arrival'],material:2,airColor:'#c8ba8c',route:[p(-16,.25,7),p(-20,.25,7),p(-23,.25,5)],description:'野草と丸石の緩い丘。屋根のある集落跡で遠征の補給を整える。'},
 {id:'resinwood',name:'琥珀枝の森',subtitle:'樹脂の洞と森番の塔',bounds:{minX:-34,maxX:-24,minZ:-14,maxZ:-4},groundY:.25,climate:'woodland',recommendedTier:2,requires:['field-seal'],material:2,airColor:'#799984',route:[p(-16,.25,-9),p(-22,.25,-9),p(-26,.25,-9)],description:'枝分かれした樹冠の下に開いた洞窟。昼は獣、夜は灯を守る飛行体が巡る。'},
 {id:'rootfen',name:'渡り根の窪地',subtitle:'沈んだ祠と高根の足場',bounds:{minX:22,maxX:32,minZ:-17,maxZ:-7},groundY:.25,climate:'wetland',recommendedTier:3,requires:['wood-seal'],material:2,airColor:'#799c9a',route:[p(16,.25,-12),p(21,.25,-12),p(25,.25,-12)],description:'浅瀬から高木の足場へ登る。鉤縄支柱のそばには徒歩の木組み階段も残る。'},
 {id:'coppermesa',name:'鳴銅の段丘',subtitle:'切り立つ鉱山と銅風の橋',bounds:{minX:-34,maxX:-24,minZ:-32,maxZ:-22},groundY:3.25,climate:'arid',recommendedTier:3,requires:['fen-seal'],material:3,airColor:'#caa783',route:[p(-16,1.5,-25),p(-20,2.25,-25),p(-26,3.25,-25)],description:'赤茶けた岩棚を横切り支柱のある坑道に入る。崖上の弓兵には石柱を遮蔽物に使う。'},
 {id:'cinderkeep',name:'灰鈴の城址',subtitle:'砂に埋もれた玉座と霧の核',bounds:{minX:22,maxX:32,minZ:-37,maxZ:-27},groundY:3.25,climate:'ash',recommendedTier:4,requires:['mesa-seal'],material:1,airColor:'#a291a1',route:[p(16,3.25,-30),p(22,3.25,-30),p(25,3.25,-30)],description:'壊れた城門の先に鐘楼と地下墓所。霧の深部では召喚者の詠唱を見極める。'},
 {id:'rimepass',name:'燠雪の峠',subtitle:'白い岩稜と風待ちの炉',bounds:{minX:-12,maxX:-2,minZ:-54,maxZ:-44},groundY:5.25,climate:'freezing',recommendedTier:4,requires:['ash-seal'],material:3,airColor:'#b8d0df',route:[p(-7,3.25,-40),p(-7,5.25,-44),p(-7,5.25,-48)],description:'白い岩と針葉樹を暖かい炉でつなぐ。風の柱から湖へ滑空できるが歩いて帰る道もある。'},
 {id:'mirrorlake',name:'澄鐘の湖',subtitle:'水没聖堂と最後の守り手',bounds:{minX:8,maxX:18,minZ:-54,maxZ:-44},groundY:3.25,climate:'lake',recommendedTier:5,requires:['rime-seal'],material:3,airColor:'#7cbbca',route:[p(13,3.25,-40),p(13,3.25,-44),p(13,3.25,-46)],description:'岸辺の炉から水没した宝物庫へ潜る。湖の番人を越えた後も探索と建築は続けられる。'},
];
export type PoiTag='settlement'|'castle'|'cave'|'mine'|'tower'|'temple'|'crypt'|'camp'|'shroud-core'|'treasure';
export interface RegionalPoi {id:string;region:RegionId;name:string;tags:PoiTag[];entry:Vec3;exit:Vec3;position:Vec3;objective:string;obstacle:string;rewardPoint:string;openHours?:[number,number];closedReason?:string}
export const POIS:readonly RegionalPoi[]=[
 {id:'field-hamlet',region:'hearthfield',name:'穂守りの集落',tags:['settlement','camp'],entry:p(-21,.25,7),exit:p(-21,.25,7),position:p(-25,.25,3),objective:'屋根の下の補給箱を開く',obstacle:'集落を徘徊する斧の略奪者',rewardPoint:'rg-field-cache'},
 {id:'resin-cave',region:'resinwood',name:'琥珀滴の洞',tags:['cave','treasure'],entry:p(-30,.25,-6),exit:p(-30,.25,-6),position:p(-30,.25,-10),objective:'洞奥の森印と樹脂を回収',obstacle:'入口は狭く、洞奥の獣の突進を横に避ける',rewardPoint:'rg-wood-cache'},
 {id:'owl-tower',region:'resinwood',name:'夜灯の見張り塔',tags:['tower'],entry:p(-25,.25,-12),exit:p(-25,.25,-12),position:p(-25,2.25,-12),objective:'夜灯が点く時間に古文書を読む',obstacle:'夜間の飛行体',rewardPoint:'rg-night-lore',openHours:[18,6],closedReason:'昼は日光で薄れる文字。18時から翌6時に夜灯が照らす。'},
 {id:'root-shrine',region:'rootfen',name:'渡り根の祠',tags:['temple'],entry:p(24,.25,-10),exit:p(24,.25,-10),position:p(28,2.25,-14),objective:'根の階段か鉤縄で祠へ登る',obstacle:'浅瀬の槍兵と高低差',rewardPoint:'rg-fen-cache'},
 {id:'copper-mine',region:'coppermesa',name:'鳴り石坑',tags:['mine','camp'],entry:p(-30,3.25,-24),exit:p(-30,3.25,-24),position:p(-30,3.25,-28),objective:'坑道の鉱脈と段丘印を回収',obstacle:'崖上の弓兵と坑道の見張り',rewardPoint:'rg-mesa-cache'},
 {id:'bell-castle',region:'cinderkeep',name:'灰鈴城',tags:['castle','crypt','shroud-core'],entry:p(26,3.25,-29),exit:p(26,3.25,-29),position:p(27,3.25,-34),objective:'灰鈴の召喚主を倒して霧の核を鎮める',obstacle:'霧の消耗と遠距離詠唱、増援',rewardPoint:'rg-ash-cache'},
 {id:'ember-sanctum',region:'rimepass',name:'燠守りの石堂',tags:['temple','camp'],entry:p(-7,5.25,-47),exit:p(-7,5.25,-47),position:p(-7,5.25,-51),objective:'砕氷の番人の踏み込みを避ける',obstacle:'寒冷と衝撃波、凍った足場',rewardPoint:'rg-rime-cache'},
 {id:'drowned-vault',region:'mirrorlake',name:'澄鐘の水没聖堂',tags:['temple','treasure'],entry:p(10,3.25,-47),exit:p(10,3.25,-47),position:p(13,1.25,-50),objective:'息を残して湖底の宝物を持ち帰る',obstacle:'潜水時間と岸辺の守り手',rewardPoint:'rg-lake-cache'},
];
export interface RegionalPoint {id:string;region:RegionId;name:string;kind:ObjectState['kind'];position:Vec3;reward:RegionalReward;requires?:string[];lore?:string;openHours?:[number,number]}
const point=(id:string,region:RegionId,name:string,kind:ObjectState['kind'],position:Vec3,reward:RegionalReward,extra:Partial<RegionalPoint>={}):RegionalPoint=>({id,region,name,kind,position,reward,...extra});
export const REGIONAL_POINTS:readonly RegionalPoint[]=[
 point('rg-field-cache','hearthfield','穂守りの補給箱','cache',p(-25,.25,3),{materials:{4:12,7:8},items:{'field-seal':1},xp:30}),
 point('rg-field-herb','hearthfield','灯穂の薬草','plant',p(-25,.25,8),{materials:{7:8},items:{'sun-herb':3},xp:8}),
 point('rg-field-hearth','hearthfield','穂守りの炉','hearth',p(-21,.25,4),{xp:0}),
 point('rg-wood-cache','resinwood','森番の樹脂箱','cache',p(-30,.25,-11),{materials:{4:8,10:4},items:{'wood-seal':1,'amber-resin':4},xp:45}),
 point('rg-resin','resinwood','琥珀樹の樹脂','resource',p(-32,.25,-6),{materials:{4:6},items:{'amber-resin':4},xp:10}),
 point('rg-night-lore','resinwood','夜灯の古文書','altar',p(-25,2.25,-12),{items:{'lore-leaf':1},xp:25},{openHours:[18,6],lore:'森番は灯を一晩ずつ隣へ渡した。道を知る者を、独りにはしなかった。'}),
 point('rg-fen-cache','rootfen','根渡りの供物','cache',p(28,2.25,-14),{materials:{10:5},items:{'fen-seal':1,'marsh-fiber':4},xp:50}),
 point('rg-fen-fiber','rootfen','水辺の強靭な繊維','plant',p(30,.25,-9),{materials:{7:5,10:3},items:{'marsh-fiber':4},xp:10}),
 point('rg-fen-anchor','rootfen','高根の鉤縄支柱','anchor',p(26,2.25,-14),{xp:0}),
 point('rg-mesa-cache','coppermesa','鉱夫の工具箱','cache',p(-30,3.25,-29),{materials:{6:10},items:{'mesa-seal':1,'singing-copper':4},xp:60}),
 point('rg-copper','coppermesa','鳴銅の鉱脈','resource',p(-32,3.25,-25),{materials:{3:8,6:10},items:{'singing-copper':4},xp:12}),
 point('rg-mine-lore','coppermesa','坑夫の刻字','altar',p(-26,3.25,-30),{items:{'lore-leaf':1},xp:20},{lore:'最後の一台は空で帰した。坑道に残したのは銅ではなく、戻るための灯だった。'}),
 point('rg-ash-cache','cinderkeep','灰鈴の封印庫','cache',p(29,3.25,-35),{materials:{6:8},items:{'ash-seal':1,'ash-glass':4},xp:90},{requires:['bell-caller-core']}),
 point('rg-ash-glass','cinderkeep','灰晶の塊','resource',p(30,3.25,-29),{materials:{3:6},items:{'ash-glass':4},xp:15}),
 point('rg-ash-hearth','cinderkeep','城門の避難炉','hearth',p(23,3.25,-28),{xp:0}),
 point('rg-rime-cache','rimepass','燠守りの遺物','cache',p(-4,5.25,-52),{materials:{10:6},items:{'rime-seal':1,'rime-heart':4},xp:110},{requires:['ice-keeper-core']}),
 point('rg-rime-hearth','rimepass','燠雪の暖炉','hearth',p(-10,5.25,-47),{xp:0}),
 point('rg-rime-crystal','rimepass','霜心の結晶','resource',p(-10,5.25,-52),{materials:{3:6},items:{'rime-heart':4},xp:18}),
 point('rg-lake-cache','mirrorlake','水底の帰還鐘','cache',p(13,1.25,-50),{materials:{6:12},items:{'lake-seal':1,'lake-pearl':4},xp:150},{requires:['tide-guardian-core']}),
 point('rg-lake-pearl','mirrorlake','湖底の真珠岩','resource',p(15,1.25,-49),{materials:{3:5},items:{'lake-pearl':3},xp:20}),
 point('rg-lake-hearth','mirrorlake','澄鐘の岸炉','hearth',p(10,3.25,-45),{xp:0}),
 point('rg-final-lore','mirrorlake','帰還者の碑','altar',p(17,3.25,-52),{items:{'lore-leaf':1},xp:50},{lore:'鐘は勝利を数えない。戻った足音を数える。ここから先の地図は、あなたが描いてよい。'}),
];
export type RegionalTactic='melee'|'charge'|'archer'|'flier'|'spear'|'caster'|'summoner'|'shockwave'|'tidal-combo';
export interface RegionalEnemy {id:number;key:string;region:RegionId;name:string;position:Vec3;tactic:RegionalTactic;hp:number;damage:number;boss:boolean;reward:RegionalReward;activeHours?:[number,number];telegraph:string}
/** Tactics are integration data, not an assertion that an AI controller has been applied. */
export const REGIONAL_ENEMIES:readonly RegionalEnemy[]=[
 {id:101,key:'field-raider',region:'hearthfield',name:'穂荒らし',position:p(-23,.25,2),tactic:'melee',hp:70,damage:10,boss:false,reward:{materials:{4:3},xp:20},telegraph:'斧を肩に上げてから前方へ振る'},
 {id:102,key:'resin-boar',region:'resinwood',name:'樹脂角の獣',position:p(-30,.25,-8),tactic:'charge',hp:100,damage:14,boss:false,reward:{materials:{10:3},xp:30},telegraph:'前脚で地面を掻き、直線に突進'},
 {id:103,key:'night-moth',region:'resinwood',name:'夜灯蛾',position:p(-25,2.25,-10),tactic:'flier',hp:55,damage:8,boss:false,reward:{materials:{7:3},xp:20},activeHours:[18,6],telegraph:'頭上で円を描いてから急降下'},
 {id:104,key:'fen-sentinel',region:'rootfen',name:'泥根の槍守',position:p(26,.25,-10),tactic:'spear',hp:100,damage:15,boss:false,reward:{materials:{10:3},xp:35},telegraph:'槍先を低く構えて二段の突き'},
 {id:105,key:'mesa-bowman',region:'coppermesa',name:'銅風の射手',position:p(-26,3.25,-29),tactic:'archer',hp:90,damage:17,boss:false,reward:{materials:{6:4},xp:40},telegraph:'弓を引いた方向へ一拍後に射撃'},
 {id:106,key:'mine-guard',region:'coppermesa',name:'坑道の盾持ち',position:p(-29,3.25,-26),tactic:'melee',hp:130,damage:16,boss:false,reward:{materials:{6:4},xp:40},telegraph:'盾を上げた後に重い横薙ぎ'},
 {id:107,key:'ash-acolyte',region:'cinderkeep',name:'灰灯の唱者',position:p(25,3.25,-32),tactic:'caster',hp:95,damage:20,boss:false,reward:{materials:{3:4},xp:45},telegraph:'杖先の光が集まってから霧弾'},
 {id:108,key:'bell-caller',region:'cinderkeep',name:'灰鈴の召喚主',position:p(28,3.25,-33),tactic:'summoner',hp:320,damage:22,boss:true,reward:{items:{'bell-caller-core':1},xp:140},telegraph:'鐘を鳴らす間に増援の位置が光る。詠唱後に遠距離波'},
 {id:109,key:'ice-keeper',region:'rimepass',name:'砕氷の番人',position:p(-7,5.25,-51),tactic:'shockwave',hp:400,damage:26,boss:true,reward:{items:{'ice-keeper-core':1},xp:180},telegraph:'片脚を高く上げて着地衝撃波。側面へ避ける'},
 {id:110,key:'lake-stalker',region:'mirrorlake',name:'岸歩きの水獣',position:p(16,3.25,-46),tactic:'charge',hp:150,damage:21,boss:false,reward:{materials:{10:4},xp:50},telegraph:'水面へ身を伏せて岸沿いに突進'},
 {id:111,key:'tide-guardian',region:'mirrorlake',name:'澄鐘の環守',position:p(10,3.25,-51),tactic:'tidal-combo',hp:520,damage:28,boss:true,reward:{items:{'tide-guardian-core':1},xp:240},telegraph:'水輪の予兆、突進、広がる波の順に切り替わる'},
];
export const REGIONAL_UPGRADES=[
 {id:'wood-access',requires:['field-seal'],cost:{'sun-herb':2},opens:'resinwood',tier:2},
 {id:'fen-access',requires:['wood-seal'],cost:{'amber-resin':3},opens:'rootfen',tier:3},
 {id:'mesa-access',requires:['fen-seal'],cost:{'marsh-fiber':3},opens:'coppermesa',tier:3},
 {id:'ash-access',requires:['mesa-seal'],cost:{'singing-copper':3},opens:'cinderkeep',tier:4},
 {id:'rime-access',requires:['ash-seal'],cost:{'ash-glass':3},opens:'rimepass',tier:4},
 {id:'lake-access',requires:['rime-seal'],cost:{'rime-heart':3},opens:'mirrorlake',tier:5},
] as const;
export const REGIONAL_QUESTS=REGIONS.map((r,i)=>({id:`region-${r.id}`,region:r.id,name:`${r.name}の灯を継ぐ`,requires:i?[`region-${REGIONS[i-1].id}`]:['ridge-arrival'],objectivePoint:POIS.find(v=>v.region===r.id)!.rewardPoint,reward:{xp:25+i*10},next:i<REGIONS.length-1?REGIONS[i+1].id:'free-build',completionText:i===REGIONS.length-1?'七つの灯がつながった。物語は一区切り。未探索の土地と自由建築はこのまま続けられます。':`${r.name}に帰還路を確保した。炉で次の地域の準備をしよう。`}));
export const REGIONAL_WATERS=[{id:'rootfen-shallows',min:p(23,-.25,-16),max:p(31,.45,-12),surfaceY:.45},{id:'mirrorlake-basin',min:p(11,1.25,-52),max:p(16,3,-47),surfaceY:3}] as const;
export const REGIONAL_UPDRAFTS=[{position:p(-4,5.25,-46),radius:1.5,height:9,strength:6}] as const;
export function regionAt(position:Vec3){return REGIONS.find(r=>position.x>=r.bounds.minX&&position.x<=r.bounds.maxX&&position.z>=r.bounds.minZ&&position.z<=r.bounds.maxZ);}
export type ColdRegionWarning='approaching'|'inside';
/** A local climate cue, with no region identity or discovery/unlock side effects.
 * Match the hazard's horizontal bounds; warn four metres before their edge. */
export function coldRegionWarning(position:Vec3):ColdRegionWarning|undefined{
 if(!Number.isFinite(position.x)||!Number.isFinite(position.z))return undefined;
 let approaching=false;
 for(const region of REGIONS){
  if(region.climate!=='freezing')continue;
  const b=region.bounds,dx=Math.max(b.minX-position.x,0,position.x-b.maxX),dz=Math.max(b.minZ-position.z,0,position.z-b.maxZ);
  if(dx===0&&dz===0)return 'inside';
  if(dx*dx+dz*dz<=16)approaching=true;
 }
 return approaching?'approaching':undefined;
}
export function regionUnlocked(id:RegionId,tokens:readonly string[]){const r=REGIONS.find(r=>r.id===id);return !!r&&r.requires.every(t=>tokens.includes(t));}
export function isRegionalOpen(hours:readonly[number,number]|undefined,hour:number){if(!hours)return true;if(!Number.isFinite(hour))return false;const h=((hour%24)+24)%24;return hours[0]<hours[1]?h>=hours[0]&&h<hours[1]:h>=hours[0]||h<hours[1];}
export function regionalHazard(position:Vec3,flameTier:number){const r=regionAt(position);return {region:r?.id,climate:r?.climate??'temperate',recommendedTier:r?.recommendedTier??1,shroudDrain:!r?0:r.climate==='ash'?(flameTier<r.recommendedTier?6:1):0,coldPerSecond:r?.climate==='freezing'?Math.max(0,5-flameTier):0,submerged:REGIONAL_WATERS.some(w=>position.x>w.min.x&&position.x<w.max.x&&position.z>w.min.z&&position.z<w.max.z&&position.y+1.4<w.surfaceY)};}
