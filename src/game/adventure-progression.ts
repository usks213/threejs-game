import type {Adventure} from './adventure';
import type {AdventureSave} from './types';
import type {Vec3} from '../world/types';
import {TUTORIAL_STEPS,REGIONAL_RECORDS,REGIONAL_COMMISSIONS,ADVENTURE_DECORATIONS,decorationForSite,type TutorialEvent} from '../content/adventure-chapters';
import {SITES} from '../content/adventure-sites';
import {newProgression,newRegionalProgression} from './progression-state';
import {siteClear} from './site-walking';
import {skyContext} from './skybound/context';
import {dropItem} from './interaction/drops';
import {reconcileSlots} from './meadows/inventory-layout';
export const PROGRESSION_ACTIONS=['tutorial-rescue','chronicle-inspect','chronicle-accept','chronicle-report','chronicle-epilogue','chronicle-recover'] as const;
export type ProgressionAction=typeof PROGRESSION_ACTIONS[number];
export interface ProgressionSnapshot {tutorial:{step:number;title:string;hint:string;walked:number;practiceSeconds:number};records:number[];locations:Record<string,Vec3>;heritage:number[];previousBest?:number;cycle:number;regions:{site:number;accepted:boolean;count:number;solved:boolean;reported:boolean;epilogue:boolean;hint:string}[];decorations:string[];ending:boolean}
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function decorationUnlocked(s:AdventureSave,id:string):boolean{
 const index=ADVENTURE_DECORATIONS.findIndex(d=>d.id===id);if(index<0)return true;
 if(index===3)return s.siteWorld?.regional?.epilogue.length===3||s.progression?.heritage?.memorial===true;
 const site=SITES[index].id,records=new Set([...(s.progression?.records??[]),...(s.progression?.heritage?.records??[])]);return REGIONAL_RECORDS.filter(r=>r.site===site).every(r=>records.has(r.id));
}
/** Player-owned discoveries, room-owned restoration, with no inventory grant on join. */
export class AdventureProgression {
 private previous:Vec3|undefined;
 private practice:{seconds:number;damage:number}|undefined;
 private readonly stable=new Map<number,number>();
 private measuredTick=-1;
 constructor(private readonly game:Adventure){}
 private personal(){return this.game.state.progression??=newProgression();}
 private world(){const site=this.game.state.siteWorld;if(!site)throw Error('地域の準備を待ってください');return site.regional??=newRegionalProgression();}
 private origin(id:number){const site=SITES.find(s=>s.id===id);if(!site)throw Error('地域を選んでください');return {x:site.x,y:this.game.state.siteWorld!.bases[id],z:site.z};}
 private guide(id:number){const o=this.origin(id);return {...o,y:o.y+.4,z:o.z+5.5};}
 private near(point:Vec3,range=3.5){const p=this.game.sim.player,d=distance(p,point);if(d>range)throw Error('対象へ近づいてください');const ctx=skyContext(this.game.sim);for(let t=.15;t<d-.25;t+=.15)if(ctx.solid({x:p.x+(point.x-p.x)*t/d,y:p.y+.8+(point.y-p.y)*t/d,z:p.z+(point.z-p.z)*t/d}))throw Error('対象との間が遮られています');}
 record(event:TutorialEvent):void{if(this.game.sim.world.generator!==4)return;const p=this.personal();if(TUTORIAL_STEPS[p.tutorial]?.id===event)p.tutorial++;}
 inspect(id:string):string|null{if(Number(id)===857001){if(this.personal().tutorial!==4)return '練習人形：図鑑の実地練習を順に進めよう。移動、採掘、拾得、接着を体験したら、ここで協力救助を練習できます';return this.action('tutorial-rescue','start');}if(!REGIONAL_RECORDS.some(r=>r.id===Number(id)))return null;return this.action('chronicle-inspect',id);}
 private requirement(site:number):{mass:number;lamps:number}{const cycle=this.world().cycle;return {mass:12+(cycle%3)*6,lamps:cycle%2+1};}
 action(action:ProgressionAction,id=''):string{
  if(this.game.sim.world.generator!==4)throw Error('この世界には航路の記録がありません');const s=this.game.state,p=this.personal(),world=this.world();
  if(action==='tutorial-rescue'){
   if(id==='cancel'){this.practice=undefined;return '救助の練習を止めました';}if(p.tutorial!==4)throw Error('先に移動・採掘・拾得・組み立てを体験してください');this.near(this.practicePoint());this.practice={seconds:0,damage:this.game.damageRevision};return '練習人形を救助中。3秒そばに立ち、途中で離れると中断します';
  }
  if(action==='chronicle-inspect'){
   const record=REGIONAL_RECORDS.find(r=>r.id===Number(id));if(!record)throw Error('記録を選んでください');const node=s.resources.find(n=>n.id===record.id);if(!node)throw Error('案内人に記録の閲覧場所を確認してください');this.near(node);
   if(p.records.includes(record.id))return '記録済み。'+record.line;
   if(record.kind==='mechanism'&&!world.solved.includes(record.site))throw Error(this.hint(record.site));
   if(record.kind==='loft'&&!world.solved.includes(record.site))throw Error('別棟中央の機関室を復旧してから、上の書架を調べてください');
   p.records.push(record.id);return record.name+'を図鑑へ写しました。'+record.line;
  }
  const site=Number(id),definition=SITES.find(r=>r.id===site);if(!definition)throw Error('地域を選んでください');this.near(this.guide(site),4);
  if(action==='chronicle-recover'){
   const ctx=skyContext(this.game.sim),o=this.origin(site),records=REGIONAL_RECORDS.filter(r=>r.site===site),planned:{node:AdventureSave['resources'][number];point:Vec3}[]=[];
   for(const record of records){const node=s.resources.find(n=>n.id===record.id);if(!node)throw Error('記録が見つかりません。保存を読み直してください');if(![.3,.8,1.3].some(dy=>ctx.solid({x:node.x,y:node.y+dy,z:node.z})))continue;
    const point=[[-3,8.5],[0,8.5],[3,8.5],[-2,10],[2,10]].map(([dx,dz])=>({x:o.x+dx,y:this.game.sim.groundAt(o.x+dx,o.z+dz,o.y)+.2,z:o.z+dz})).find(at=>Math.abs(at.y-o.y)<1&&siteClear(this.game.sim,at)&&!planned.some(p=>distance(p.point,at)<1.5)&&!s.resources.some(n=>REGIONAL_RECORDS.some(r=>r.id===n.id)&&distance(n,at)<1.5));if(!point)throw Error('入口の閲覧場所を空けてください。地形や建築は変更していません');planned.push({node,point});
   }
   if(!planned.length)return '地形や建築に埋まった記録はありません。図鑑の座標から探してみてください';for(const {node,point}of planned)Object.assign(node,point);return `${planned.length}枚の埋まった記録を入口の閲覧台へ移しました。地形と建築はそのままです`;
  }
  if(action==='chronicle-accept'){if(!p.accepted.includes(site))p.accepted.push(site);return definition.guide+'：別棟の回廊、機関室、上の書架にある三つの記録を写してきて。'+this.hint(site);}
  if(action==='chronicle-report'){
   if(!REGIONAL_RECORDS.filter(r=>r.site===site).every(r=>p.records.includes(r.id)))throw Error('この地域の三つの記録を実際に調べてください');
   if(world.reported.includes(site))return '地域の報酬は仲間と受取済み。あなたも'+decorationForSite(site).name+'を建築できます';
   dropItem(this.game,'coins',12,this.guide(site));world.reported.push(site);return '途切れた物語をつなぎました。共有の銀貨12枚を入口へ置き、'+decorationForSite(site).name+'を建築できるようになりました';
  }
  if(action==='chronicle-epilogue'){
   if(!s.defeated.includes('stormcore'))throw Error('嵐心を鎮めてから、これからの暮らしを相談してください');if(!world.reported.includes(site))throw Error('先にこの地域の記録を三つ報告してください');if(world.epilogue.includes(site))return '新しい航路の支度は仲間と完了済みです';
   const commission=REGIONAL_COMMISSIONS.find(c=>c.site===site)!;for(const [kind,count]of Object.entries(commission.cost))if((s.inventory[kind]??0)<count)throw Error(commission.line+' 必要な素材は図鑑の依頼欄で確認できます');
   // Prepare the fallible shared payout before changing supplies or the once-only receipt.
   dropItem(this.game,'coins',20,this.guide(site));for(const[kind,count]of Object.entries(commission.cost))s.inventory[kind]-=count;if(s.meadows)reconcileSlots(s.meadows,s.inventory);world.epilogue.push(site);
   return commission.title+'を終えました。共有の銀貨20枚を入口へ置きました。'+(world.epilogue.length===3?'三層の帰還碑が全員に解放されました。':'残る地域にも、新しい依頼が届いています。');
  }
  throw Error('記録の操作が不正です');
 }
 private practicePoint():Vec3{return {x:3,y:this.game.sim.groundAt(3,12,3),z:12};}
 private hint(site:number){const {mass,lamps}=this.requirement(site);const physical=site===850001?`質量${mass}以上の部品を床に置く`:site===850002?'金属部品へ水を流して濡らす':'1m以上軌跡戻しした部品を運び込んで床に置く';return `別棟中央（X ${SITES.find(s=>s.id===site)!.x}, Z ${SITES.find(s=>s.id===site)!.z-7}）で${physical}。または周囲の灯具${lamps}個へ電力をつないで点灯。掴むのをやめて0.5秒保つ。屋外階段・屋根・自作の足場も使えます。`;}
 step(dt:number):void{
  if(this.game.sim.world.generator!==4||!this.game.state.siteWorld||!Number.isFinite(dt)||dt<=0)return;const sim=this.game.sim,s=this.game.state,p=this.personal(),at=sim.player;
  if(this.previous&&p.tutorial===0&&at.grounded){const moved=distance(at,this.previous);if(moved<=Math.max(.5,dt*14)){p.walked=Math.min(6,p.walked+moved);if(p.walked>=6)this.record('walk');}}this.previous={x:at.x,y:at.y,z:at.z};
  if(this.practice){try{if(s.health<=0||this.practice.damage!==this.game.damageRevision)throw Error();this.near(this.practicePoint(),3);this.practice.seconds+=Math.min(dt,.1);if(this.practice.seconds>=3){this.record('revive');this.practice=undefined;}}catch{this.practice=undefined;}}
  if(this.measuredTick===sim.tick)return;this.measuredTick=sim.tick;const world=this.world();
  for(const site of SITES){if(world.solved.includes(site.id))continue;const o=this.origin(site.id),point={x:o.x,y:o.y,z:o.z-7},req=this.requirement(site.id),parts=sim.skybound.state.parts;
   const mass=parts.filter(part=>!part.anchored&&!sim.skybound.leases.has(part.id)&&Math.hypot(part.position.x-point.x,part.position.z-point.z)<1.4&&Math.abs(part.position.y-o.y-.7)<.7&&Math.hypot(part.velocity.x,part.velocity.y,part.velocity.z)<.2).reduce((sum,part)=>sum+part.mass,0);
   const lamps=parts.filter(part=>part.kind==='lamp'&&distance(part.position,{...point,y:point.y+1})<3&&sim.skybound.isPowered(part.id)).length;
   const nearParts=parts.filter(part=>!sim.skybound.leases.has(part.id)&&distance(part.position,{...point,y:point.y+.7})<2);const physical=site.id===850001?mass>=req.mass:site.id===850002?nearParts.some(part=>part.material==='metal'&&(part.wet??0)>0):nearParts.some(part=>(part.recalled??0)>=1&&Math.hypot(part.velocity.x,part.velocity.y,part.velocity.z)<.2);
   const valid=physical||lamps>=req.lamps,stable=valid?(this.stable.get(site.id)??0)+Math.min(dt,.1):0;this.stable.set(site.id,stable);if(stable>=.5)world.solved.push(site.id);
  }
 }
 snapshot():ProgressionSnapshot{
  const p=this.game.state.progression??newProgression(),world=this.game.state.siteWorld?.regional??newRegionalProgression(),step=TUTORIAL_STEPS[p.tutorial];
  return {tutorial:{step:p.tutorial,title:step?.title??'出発の練習を終えた',hint:step?.hint??'三つの高さを巡り、自分の道を作ろう。',walked:p.walked,practiceSeconds:this.practice?.seconds??0},records:[...p.records],locations:Object.fromEntries(this.game.state.resources.filter(n=>REGIONAL_RECORDS.some(r=>r.id===n.id)).map(n=>[n.id,{x:n.x,y:n.y,z:n.z}])),heritage:[...(p.heritage?.records??[])],...(p.heritage?.bestRace===undefined?{}:{previousBest:p.heritage.bestRace}),cycle:world.cycle,regions:SITES.map(site=>({site:site.id,accepted:p.accepted.includes(site.id),count:REGIONAL_RECORDS.filter(r=>r.site===site.id&&p.records.includes(r.id)).length,solved:world.solved.includes(site.id),reported:world.reported.includes(site.id),epilogue:world.epilogue.includes(site.id),hint:this.game.state.siteWorld?this.hint(site.id):''})),decorations:ADVENTURE_DECORATIONS.filter(d=>decorationUnlocked(this.game.state,d.id)).map(d=>d.id),ending:this.game.state.defeated.includes('stormcore')};
 }
}
