import {completeAdventureBoss} from './combat/boss-rewards';
import {REGIONAL_RECORDS} from '../content/adventure-chapters';
import {newRegionalProgression} from './progression-state';
import type {Adventure} from './adventure';
import type {GameSimulation} from '../simulation/game-simulation';
import type {AdventureSave,BuildingState,EnemyState} from './types';
import type {DialogueSnapshot} from '../content/adventure-trials';
import {SITES,SITE_BOSSES,SITE_ROOMS,ANNEX_ROOMS,sitePieces,siteAnnexPieces} from '../content/adventure-sites';
import {type SiteWorld} from './site-state';
import {TREE_KINDS} from '../content/meadows/data';
import {buildingVoxels,voxelBounds,worldPoint} from './voxel/model';
import {skyContext} from './skybound/context';
import {PART_HALF,type SkyTrialTemplate} from './skybound/types';
import {dropItem} from './interaction/drops';
import {siteClear,siteSupport,walkSiteRescue} from './site-walking';
import type {Vec3} from '../world/types';
export const SITE_ACTIONS=['site-talk','site-accept','site-report','site-reset','site-rescue'] as const;
export type SiteAction=typeof SITE_ACTIONS[number];
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export interface ExpeditionsSnapshot {sites:{id:number;name:string;layer:string;x:number;y:number;z:number;accepted:boolean;rooms:number[];completed:boolean;reason:string;boss:{id:string;name:string;defeated:boolean};skipped:number}[];growth:{health:number;stamina:number};rescue?:{position:Vec3;following?:string;arrived:boolean}}
export function siteGrowth(state:AdventureSave){const count=state.siteWorld?.completed.length??0;return {health:count*3,stamina:count*4};}
function box(b:Pick<BuildingState,'definition'|'x'|'y'|'z'|'rotation'>){const local=voxelBounds(buildingVoxels(b.definition)),corners=[local.min,local.max,{...local.min,x:local.max.x},{...local.max,x:local.min.x}].map(p=>worldPoint(p,b,b.rotation));return {min:{x:Math.min(...corners.map(p=>p.x)),y:b.y+local.min.y,z:Math.min(...corners.map(p=>p.z))},max:{x:Math.max(...corners.map(p=>p.x)),y:b.y+local.max.y,z:Math.max(...corners.map(p=>p.z))}};}
function overlap(a:ReturnType<typeof box>,b:ReturnType<typeof box>,margin=0):boolean{return (['x','y','z']as const).every(k=>a.min[k]<b.max[k]+margin&&a.max[k]>b.min[k]-margin);}
function stampPieces(sim:GameSimulation,state:AdventureSave,pieces:Omit<BuildingState,'id'>[]):number{
 const occupiedBuildings=state.buildings.map(box);let skipped=0;
  for(const p of pieces){const bounds=box(p),center={x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2,z:(bounds.min.z+bounds.max.z)/2},radius=Math.hypot(bounds.max.x-center.x,bounds.max.y-center.y,bounds.max.z-center.z);
   const blocked=sim.world.edits.some(e=>Math.hypot(Math.max(bounds.min.x-e.position.x,e.position.x-bounds.max.x,0),Math.max(bounds.min.y-e.position.y,e.position.y-bounds.max.y,0),Math.max(bounds.min.z-e.position.z,e.position.z-bounds.max.z,0))<=e.radius)||occupiedBuildings.some(b=>overlap(bounds,b,.05))||sim.skybound.state.parts.some(part=>distance(part.position,center)<radius+Math.hypot(PART_HALF[part.kind].x,PART_HALF[part.kind].y,PART_HALF[part.kind].z))||[sim.player,...sim.targets.map(t=>t.player)].some(actor=>overlap(bounds,{min:{x:actor.x-.35,y:actor.y,z:actor.z-.35},max:{x:actor.x+.35,y:actor.y+1.6,z:actor.z+.35}}))||state.resources.some(n=>TREE_KINDS.has(n.kind)&&n.ready<=state.seconds&&Math.hypot(n.x-center.x,n.z-center.z)<radius+.5&&center.y>=n.y&&center.y<=n.y+7);
   if(blocked){skipped++;continue;}state.buildings.push({...p,id:sim.allocateEntityId()});
  }
 return skipped;
}
/** Explicit once-only building stamps. User edits/objects are never removed or overwritten. */
export function ensureAdventureSites(sim:GameSimulation,state:AdventureSave,fresh=false):void{
 if(sim.world.generator!==4)return;
 const world=state.siteWorld??={version:1,layout:1,storyMode:fresh?'full':'side',installed:[],bases:{},skipped:{},completed:[],evidence:{},epochs:{}};state.siteJournal??=[];
 for(const site of SITES){if(world.installed.includes(site.id))continue;
  const base=site.y??Math.max(...[-4,0,4].flatMap(x=>[-3,0,3].map(z=>sim.groundAt(site.x+x,site.z+z))))+.02;world.bases[site.id]=base;let skipped=0;
  skipped=stampPieces(sim,state,sitePieces(site.id,site.x,base,site.z));
  world.skipped[site.id]=skipped;world.installed.push(site.id);
  if(!state.resources.some(n=>n.id===site.npc))state.resources.push({id:site.npc,kind:'merchant',x:site.x,y:base+.4,z:site.z+5.5,amount:1,ready:0});
 }
 const regional=world.regional??=newRegionalProgression();
 for(const site of SITES){if(regional.installed.includes(site.id))continue;const base=world.bases[site.id];world.skipped[site.id]=(world.skipped[site.id]??0)+stampPieces(sim,state,siteAnnexPieces(site.id,site.x,base,site.z));regional.installed.push(site.id);for(const r of REGIONAL_RECORDS.filter(r=>r.site===site.id))if(!state.resources.some(n=>n.id===r.id))state.resources.push({id:r.id,kind:'runestone',x:site.x+r.x,y:base+r.y,z:site.z+r.z,amount:1,ready:0});}
 if(!state.resources.some(n=>n.id===857001))state.resources.push({id:857001,kind:'merchant',x:3,y:sim.groundAt(3,12,3),z:12,amount:1,ready:0});
 const rescueSite=SITES[1];world.rescue??={position:{x:rescueSite.x+2,y:world.bases[rescueSite.id]+.4,z:rescueSite.z-2},arrived:false};
}
export class AdventureSites {
 dialogue:DialogueSnapshot|undefined;
 private measuredTick=-1;
 private readonly stable=new Map<number,number>();
 constructor(private readonly game:Adventure){}
 private world():SiteWorld{if(this.game.sim.world.generator!==4||!this.game.state.siteWorld)throw Error('この世界には探索拠点がありません');return this.game.state.siteWorld;}
 private site(id:string|number){const n=Number(id),site=SITES.find(s=>s.id===n||s.npc===n);if(!site)throw Error('探索拠点を選んでください');return site;}
 private origin(id:number):Vec3{const site=this.site(id);return {x:site.x,y:this.world().bases[id]??site.y??this.game.sim.groundAt(site.x,site.z),z:site.z};}
 private guide(id:number):Vec3{const o=this.origin(id);return {...o,y:o.y+.4,z:o.z+5.5};}
 private near(point:Vec3,range=4):void{const p=this.game.sim.player,d=distance({...p,y:p.y+.8},{...point,y:point.y+.8});if(d>range)throw Error('対象の近くへ戻ってください');const ctx=skyContext(this.game.sim);for(let t=.2;t<d-.3;t+=.2)if(ctx.solid({x:p.x+(point.x-p.x)*t/d,y:p.y+.8+(point.y-p.y)*t/d,z:p.z+(point.z-p.z)*t/d}))throw Error('対象との間が遮られています');}
 close():void{this.dialogue=undefined;}
 talk(id:string):string{const site=this.site(id);this.near(this.guide(site.id));this.dialogue={npc:site.npc,title:site.guide,text:site.line,choices:[{id:'site-accept:'+site.id,label:site.task+'の依頼を聞く'},{id:'site-report:'+site.id,label:'依頼の結果を報告する'},{id:'chronicle-accept:'+site.id,label:'別棟の記録を探す依頼'},{id:'chronicle-report:'+site.id,label:'集めた記録を見せる'},{id:'chronicle-recover:'+site.id,label:'埋まった記録の閲覧場所を復旧する'},...(this.game.state.defeated.includes('stormcore')?[{id:'chronicle-epilogue:'+site.id,label:'嵐のあとにできること'}]:[]),{id:'site-reset:'+site.id,label:'貸出品と避難者だけを復旧する'},{id:'bye',label:'またね'}]};return site.line;}
 choose(id:string):string{if(id==='bye'){this.close();return '会話を終えました';}if(!this.dialogue?.choices.some(c=>c.id===id))throw Error('今の会話から選んでください');const [action,site]=id.split(':');if(action.startsWith('chronicle-'))return this.game.progression.action(action as import('./adventure-progression').ProgressionAction,site);return this.action(action as SiteAction,site).message;}
 action(action:SiteAction,id:string):{dirty:string[];message:string}{
  this.world();const site=this.site(id),ok=(message:string)=>({dirty:[],message});
  if(action==='site-talk')return ok(this.talk(id));
  if(action==='site-rescue'){if(site.id!==850002)throw Error('救助者を選んでください');const rescue=this.world().rescue!;this.near(rescue.position,3.5);if(rescue.arrived)return ok('測り手は避難済みです');if(rescue.following&&rescue.following!==this.game.owner)throw Error('別の冒険者が案内中です');rescue.following=rescue.following?undefined:this.game.owner;return ok(rescue.following?'測り手がついてきます。壁を避けて入口へ案内してください':'測り手はここで待ちます');}
  this.near(this.guide(site.id),action==='site-reset'?9:4);
  if(action==='site-accept'){if(!this.game.sim.skybound.state.parts.some(p=>p.loan?.site===site.id)&&site.id!==850002)this.reset(site.id);const journal=this.game.state.siteJournal??=[];if(!journal.includes(site.id))journal.push(site.id);if(this.dialogue)this.dialogue.text=site.line+' '+this.reason(site.id);return ok('依頼帳に記録しました。'+this.reason(site.id));}
  if(action==='site-reset'){this.reset(site.id);return ok('自作物と地形を残し、貸出品または避難者を復旧しました');}
  if(action==='site-report'){
   const world=this.world();if(world.completed.includes(site.id))return ok('この依頼は仲間と完了済みです。報酬は一度だけ受け取れます');const reason=this.reason(site.id);if(!(world.evidence[site.id]&1))throw Error(reason);
   if(!this.game.state.defeated.includes(site.boss)){this.spawnBoss(site.id);return ok('依頼の条件は達成済みです。目覚めた番人を鎮めてから報告してください');}
   dropItem(this.game,site.reward,4,this.guide(site.id));world.completed.push(site.id);if(this.dialogue)this.dialogue.text='途切れた連絡が一つ戻った。誰が来ても、この道を使えるよ。';return ok('連絡路を復旧しました。全員の最大体力+3・スタミナ+4。共有報酬を入口へ置きました');
  }
  throw Error('探索拠点の操作が不正です');
 }
 private reset(id:number):void{
  const world=this.world(),o=this.origin(id);if(id===850002){if(world.rescue?.following&&world.rescue.following!==this.game.owner)throw Error('仲間が救助中です。案内を終えてから復旧してください');const candidates=[{x:o.x+2,y:o.y+.4,z:o.z-2},{x:o.x-2,y:o.y+.4,z:o.z-2},{x:o.x+2,y:o.y+.4,z:o.z}];const p=candidates.find(p=>siteClear(this.game.sim,p));if(!p)throw Error('避難者の周囲を片付けてください');if(siteSupport(this.game.sim,p.x,p.z,o.y+.25)===undefined)this.game.sim.skybound.resetSiteLoan(id,[{kind:'slab',material:'stone',position:{x:p.x,y:o.y+.05,z:p.z},links:[],anchored:true}],skyContext(this.game.sim));world.rescue={position:{...p},arrived:!!(world.evidence[id]&1)};}
  else {let templates:SkyTrialTemplate[];if(id===850001)templates=[{kind:'block',material:'wood',position:{x:o.x-2,y:o.y+.9,z:o.z+1},links:[]}];else templates=[{kind:'battery',material:'metal',position:{x:o.x+1,y:o.y+.9,z:o.z-1},energy:25,links:[]},{kind:'lamp',material:'metal',position:{x:o.x+3,y:o.y+.9,z:o.z-2},links:[]},{kind:'emitter',material:'metal',position:{x:o.x+2,y:o.y+.9,z:o.z-1},links:[]},{kind:'block',material:'metal',position:{x:o.x+2,y:o.y+.9,z:o.z+2},links:[],frozen:10}];
   const pads=id===850001?[{x:o.x-2,z:o.z+1},{x:o.x+2,z:o.z-2}]:[{x:o.x+2,z:o.z-1.5},{x:o.x+2,z:o.z+2}];for(const p of pads)if(siteSupport(this.game.sim,p.x,p.z,o.y+.25)===undefined)templates.push({kind:'slab',material:'stone',position:{...p,y:o.y+.05},links:[],anchored:true});this.game.sim.skybound.resetSiteLoan(id,templates,skyContext(this.game.sim));
  }
  world.epochs[id]=Math.min(1000000,(world.epochs[id]??0)+1);if(!world.completed.includes(id))world.evidence[id]=0;this.stable.delete(id);
 }
 private reason(id:number):string{
  const world=this.world();if(world.completed.includes(id))return '仲間と連絡路を復旧済み';if(world.evidence[id]&1)return this.game.state.defeated.includes(this.site(id).boss)?'入口へ結果を報告しよう':'条件達成。入口で報告すると番人が目覚める';
  if(id===850001)return '貸出荷箱を東奥の部屋 (中心から東2m・北2m) へ運び、床上へ放して0.5秒安定させよう';
  if(id===850002)return '記録室の測り手へ声をかけ、南の入口まで歩いて案内しよう';
  return '貸出電池と灯具を接着・点灯し、機関室の凍った装置を火で融かして水で冷却しよう';
 }
 snapshot():ExpeditionsSnapshot{if(!this.game.state.siteWorld)return {sites:[],growth:{health:0,stamina:0}};const world=this.world(),journal=this.game.state.siteJournal??[];return {sites:SITES.map(site=>({...this.origin(site.id),id:site.id,name:site.name,layer:site.layer,accepted:journal.includes(site.id),rooms:[...SITE_ROOMS,...ANNEX_ROOMS].filter(r=>journal.includes(site.id*10+r.id)).map(r=>r.id),completed:world.completed.includes(site.id),reason:this.reason(site.id),boss:{id:site.boss,name:SITE_BOSSES.find(b=>b.id===site.boss)!.name,defeated:this.game.state.defeated.includes(site.boss)},skipped:world.skipped[site.id]??0})),growth:siteGrowth(this.game.state),...(world.rescue?{rescue:structuredClone(world.rescue)}:{})};}
 discover():void{if(!this.game.state.siteWorld)return;const p=this.game.sim.player,journal=this.game.state.siteJournal??=[];for(const site of SITES){const o=this.origin(site.id);for(const room of [...SITE_ROOMS,...ANNEX_ROOMS])if(Math.abs(p.y-o.y-('y'in room?room.y:0))<.9&&Math.hypot(p.x-o.x-room.x,p.z-o.z-room.z)<1.7&&!journal.includes(site.id*10+room.id))journal.push(site.id*10+room.id);}}
 step(dt:number):void{
  if(!this.game.state.siteWorld||this.measuredTick===this.game.sim.tick)return;this.measuredTick=this.game.sim.tick;const world=this.world(),sim=this.game.sim;
  const rescue=world.rescue;if(rescue?.following&&!rescue.arrived){const actor=sim.targets.find(a=>a.adventure.owner===rescue.following)??(rescue.following==='host'?{player:sim.player,adventure:sim.adventure}:undefined);if(!actor||actor.adventure.state.health<=0||distance(actor.player,rescue.position)>24)rescue.following=undefined;else walkSiteRescue(sim,rescue.position,actor.player,dt);}
  for(const site of SITES){if(world.completed.includes(site.id))continue;const o=this.origin(site.id),parts=sim.skybound.state.parts.filter(p=>p.loan?.site===site.id);let valid=false;
   if(site.id===850001){const cargo=parts.find(p=>p.loan?.role==='cargo'&&p.kind==='block');valid=!!cargo&&Math.hypot(cargo.position.x-o.x-2,cargo.position.z-o.z+2)<1&&Math.abs(cargo.position.y-(o.y+.675))<.12&&Math.hypot(cargo.velocity.x,cargo.velocity.y,cargo.velocity.z)<.25&&Math.hypot(cargo.angularVelocity?.x??0,cargo.angularVelocity?.y??0,cargo.angularVelocity?.z??0)<.1&&!sim.skybound.leases.has(cargo.id);}
   if(site.id===850002&&rescue){valid=distance(rescue.position,this.guide(site.id))<1.5;if(valid){rescue.arrived=true;rescue.following=undefined;}}
   if(site.id===850003){const lamp=parts.find(p=>p.kind==='lamp'),device=parts.find(p=>p.kind==='block');if(lamp&&sim.skybound.isPowered(lamp.id))world.evidence[site.id]=(world.evidence[site.id]??0)|2;if(device&&!device.heated)world.evidence[site.id]=(world.evidence[site.id]??0)&~(1|4|8);if(device?.heated&&(device.frozen??0)<=0)world.evidence[site.id]=(world.evidence[site.id]??0)|8;if(device&&(world.evidence[site.id]&8)&&(device.wet??0)>0)world.evidence[site.id]=(world.evidence[site.id]??0)|4;valid=(world.evidence[site.id]&6)===6;}
   const stable=valid?(this.stable.get(site.id)??0)+Math.min(dt,1/15):0;this.stable.set(site.id,stable);if(stable>=.5)world.evidence[site.id]=(world.evidence[site.id]??0)|1;
  }
 }
 release(owner:string):void{if(this.game.state.siteWorld?.rescue?.following===owner)this.game.state.siteWorld.rescue.following=undefined;}
 private spawnBoss(id:number):void{const site=this.site(id),s=this.game.state;if(s.defeated.includes(site.boss)||s.enemies.some(e=>e.definition===site.boss))return;const o=this.origin(id),boss=SITE_BOSSES.find(b=>b.id===site.boss)!;s.enemies.push({id:this.game.sim.allocateEntityId(),definition:boss.id,tier:1,x:o.x+7,y:this.game.sim.groundAt(o.x+7,o.z,o.y),z:o.z,homeX:o.x+7,homeZ:o.z,health:boss.health,cooldown:3,windup:0,slow:0,boss:true});}
 finalReady():boolean{return !this.game.state.siteWorld||this.world().storyMode==='side'||this.world().completed.length===3;}
 onBossDefeated(enemy:EnemyState):boolean{if(!SITE_BOSSES.some(b=>b.id===enemy.definition))return false;return completeAdventureBoss(this.game,enemy);}
 bossMultiplier(enemy:EnemyState,element:string,source?:Vec3):number|undefined{if(!SITE_BOSSES.some(b=>b.id===enemy.definition))return undefined;const sim=this.game.sim;if(enemy.definition==='loadwarden')return sim.skybound.state.parts.some(p=>p.mass>=12&&distance(p.position,enemy)<3)?1.7:element==='impact'?1.4:.7;if(enemy.definition==='echowarden')return sim.fluid.immersion(enemy,1.5)>.05||element==='fire'?1.5:.75;return (source?.y??this.game.sim.player.y)>enemy.y+1||element==='frost'?1.6:.8;}
}
