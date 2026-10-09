import { BEACONS } from '../content/adventure-world';
import type { AdventureSnapshot } from './types';
import type { Vec3 } from '../world/types';
import type { JourneyGoal } from './journey';

const distance = (a:Vec3,b:Vec3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Previously dropped possessions remain actionable after a later death. */
export function graveRecoveryGoal(s:AdventureSnapshot,p:Vec3):JourneyGoal|undefined {
 const graves=[...(s.death&&Object.values(s.grave??{}).some(n=>n>0)?[s.death]:[]),...(s.meadows?.graves??[]).filter(grave=>Object.values(grave.items).some(n=>n>0))];
 const grave=graves.sort((a,b)=>distance(a,p)-distance(b,p))[0];
 return grave?{title:'墓標の荷物を取り戻そう',detail:'矢印を頼りに墓標へ。近づいて照準の「回収」',tab:'world',target:grave,progress:0}:undefined;
}
/** Guidance follows the actual objective, not the optional ordered practice log. */
export function openingBeaconGoal(s:AdventureSnapshot,p:Vec3):JourneyGoal {
 const beacon=s.resources.find(n=>n.id===810001)??BEACONS[0];
 const parts=s.skybound?.parts??[];
 const linked=parts.filter(part=>part.links.length>0);
 if(linked.some(part=>distance(part.position,beacon)<7))return {title:'最初の灯をともそう',detail:'道標へ近づき、照準の「灯をともす」。空への道が開く',tab:'world',target:beacon,progress:.18};
 const assembly=linked.filter(part=>distance(part.position,p)<12).sort((a,b)=>distance(a.position,p)-distance(b.position,p))[0];
 if(assembly)return {title:'組み立てた部品を灯へ',detail:'能力で掴み、風原の道標から7m以内へ運ぼう',tab:'powers',target:beacon,progress:.14};
 const nearby=parts.filter(part=>!part.trial&&!part.anchored&&distance(part.position,p)<7);
 if(nearby.length>=2)return {title:'二つの部品をつなごう',detail:'能力 → 部品を掴む → 近い部品と接着 → 確定',tab:'powers',progress:.1};
 const woodNeeded=(2-nearby.length)*2;
 if((s.inventory.wood??0)<woodNeeded){
  const supply=s.resources.filter(n=>(n.kind==='wood'&&n.drop||n.kind==='branch')&&n.ready<=s.seconds&&Math.abs(n.y-p.y)<5).sort((a,b)=>distance(a,p)-distance(b,p))[0];
  return {title:'木材で最初の灯をつなごう',detail:`木材 ${Math.min(s.inventory.wood??0,woodNeeded)}/${woodNeeded}。荷に照準を合わせて「拾う」`,tab:'bag',target:supply??beacon,progress:.02};
 }
 return {title:nearby.length?'もう一つ、木の梁を作ろう':'木の梁を二つ作ろう',detail:nearby.length?'能力 → 選んだ部品に重ねて作る → 位置を見て確定':'道標の近くで、能力 → 梁・木 → 照準の先に作る',tab:'powers',target:beacon,progress:nearby.length?.08:.05};
}

/** Approach the authored ramp rather than pointing through the island's wall. */
export function skyBeaconGoal(p:Vec3):JourneyGoal {
 if(p.y<-3)return {title:'地表の灯へ戻ろう',detail:'安全な地面で、地図 → 灯した道標へ移動',tab:'world',target:BEACONS[0],progress:.2};
 if(p.y>=23)return {title:'空の航路灯をともそう',detail:'台地の道標に近づき、照準の「灯をともす」',tab:'world',target:BEACONS[1],progress:.3};
 if(p.y<14&&!(p.x>=7&&p.x<=13&&p.z<10))return {title:'空へ続く斜路へ',detail:'矢印の先、石の斜路を北へ登ろう',tab:'world',target:{x:10,z:14},progress:.22};
 if(p.z>-14)return {title:'斜路を上まで登ろう',detail:'石の道を北へ。頭上の台地に「天抜け」で上がれる',tab:'world',target:{x:10,z:-17},progress:.25};
 return {title:'頭上の台地へ天抜け',detail:'能力 → 移動 → 出口を探す → 出口へ上がる',tab:'powers',target:{x:10,z:-17},progress:.28};
}
