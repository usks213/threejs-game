import type {BuildingDefinition} from './catalog';
export const TUTORIAL_STEPS=[
 {id:'walk',title:'足で道を確かめる',hint:'出発地の周囲を6m歩こう。右側のジャンプで段差も越えられる。'},
 {id:'mine',title:'地形を掘る',hint:'出発地の保護された足元から少し離れ、地面へ照準を合わせて掘ろう。'},
 {id:'pickup',title:'共有の荷を拾う',hint:'出発地の木材・石などの荷を拾おう。同じ荷は仲間と取り合っても一度だけ移る。'},
 {id:'assemble',title:'二つの部品をつなぐ',hint:'能力の組み手で部品を作り、持ち上げて別の部品に接着しよう。'},
 {id:'revive',title:'仲間を助けて帰る',hint:'倒れた仲間を3秒助けよう。一人なら出発地の練習人形（X3/Z12）で同じ距離・中断条件を体験できる。'},
] as const;
export type TutorialEvent=typeof TUTORIAL_STEPS[number]['id'];
export const REGIONAL_RECORDS=[
 {id:856001,site:850001,room:3,name:'空の荷札',line:'荷守りたちは荷の軽さより、帰り道の丈夫さを競った。',x:-3,y:.3,z:-8,kind:'read'},
 {id:856002,site:850001,room:4,name:'衡りの記録',line:'重い荷でも、灯りを伝える道でも、庫の扉は開いた。',x:0,y:.3,z:-9.3,kind:'mechanism'},
 {id:856003,site:850001,room:5,name:'最後の送り状',line:'最後の荷は食料ではなく、各地へ帰る人の名前だった。',x:3,y:2.5,z:-8,kind:'loft'},
 {id:856004,site:850002,room:3,name:'水音の譜',line:'水の落ちる間隔で、洞海の住人は夜明けを数えた。',x:-3,y:.3,z:-8,kind:'read'},
 {id:856005,site:850002,room:4,name:'測り手の返事',line:'測り手は独りで出口を決めず、隣の灯が返るまで待った。',x:0,y:.3,z:-9.3,kind:'mechanism'},
 {id:856006,site:850002,room:5,name:'帰還の音板',line:'帰り着いた者は、次に歩く誰かのために音板を残した。',x:3,y:2.5,z:-8,kind:'loft'},
 {id:856007,site:850003,room:3,name:'風待ちの日記',line:'強い風の日には、庭師は種を飛ばさず帆を修繕した。',x:-3,y:.3,z:-8,kind:'read'},
 {id:856008,site:850003,room:4,name:'灯継ぎの設計',line:'ひとつの電池から届く小さな光が、三つの高さを結んだ。',x:0,y:.3,z:-9.3,kind:'mechanism'},
 {id:856009,site:850003,room:5,name:'明日の余白',line:'最後の頁は白い。帰ってきた冒険者が、次の航路を書き足すために。',x:3,y:2.5,z:-8,kind:'loft'},
] as const;
export const REGIONAL_COMMISSIONS=[
 {site:850001,title:'帰り道の荷支度',cost:{wood:8} as Record<string,number>,line:'道が戻った。次は、旅立つ人へ丈夫な箱を届けたい。'},
 {site:850002,title:'洞海の目印',cost:{stone:6} as Record<string,number>,line:'測り手は帰れた。今度は、迷った人のために道を刻もう。'},
 {site:850003,title:'次の灯をともす',cost:{crystal:3} as Record<string,number>,line:'嵐が静まった今、遠くの小さな灯にも返事を送りたい。'},
] as const;
export const ADVENTURE_DECORATIONS:BuildingDefinition[]=[
 {id:'routeBanner',name:'荷守りの航路旗',cost:{wood:3,resin:1},size:[1,1.75,.25],support:3,color:'#d8a260'},
 {id:'echoMemorial',name:'洞海の音碑',cost:{stone:4,crystal:1},size:[1,1.25,.5],support:4,color:'#83bace'},
 {id:'windChime',name:'記録庭の風飾り',cost:{wood:2,iron:1},size:[1,1.75,.5],support:3,color:'#abd38c'},
 {id:'routeMonument',name:'三層の帰還碑',cost:{stone:6,crystal:2,resin:2},size:[1.5,2,.75],support:4,color:'#d6c88e'},
];
export const decorationForSite=(site:number)=>ADVENTURE_DECORATIONS[[850001,850002,850003].indexOf(site)];
