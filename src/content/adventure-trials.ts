import type { Adventure } from '../game/adventure';
import type { GameSimulation } from '../simulation/game-simulation';
import type { AdventureSave } from '../game/types';
import type { Vec3 } from '../world/types';
import { PART_HALF } from '../game/skybound/types';
import type { SkyTrialTemplate } from '../game/skybound/types';
import { skyContext } from '../game/skybound/context';
import { dropItem } from '../game/interaction/drops';
export interface TrialWorld { version: 1; completed: number[]; epochs: Record<string, number>; evidence: number[] }
export interface DialogueSnapshot { npc: number; title: string; text: string; choices: {id: string; label: string}[] }
export interface JourneySnapshot { completed: number[]; journal: number[]; growth: {health: number; stamina: number}; current?: {id: number; reason: string} }
export const TRIALS = [
 {id:825001,name:'衡りの庭',x:-8,z:8,y:undefined,hint:'石の重りを貸出床へ運ぶ。床上の合計質量12以上で安定させよう。',reward:'stone'},
 {id:825002,name:'旅荷の橋',x:18,z:-18,y:25,hint:'東の荷を組み手で2m以上運び、貸出床の中央へ置こう。',reward:'wood'},
 {id:825003,name:'風の輪',x:10,z:-15,y:undefined,hint:'上昇風の中で翼を開き、高さ28以上まで2m以上浮上しよう。',reward:'resin'},
 {id:825004,name:'灯線の間',x:-12,z:-4,y:undefined,hint:'貸出電池と灯具を近づけて接着し、放してから灯具を点灯しよう。',reward:'iron'},
 {id:825005,name:'ぬくもりの壺',x:28,z:14,y:-10.5,hint:'放射器で貸出木材を加熱し、装置を切って水で消火しよう。木材は燃やし尽くさないこと。',reward:'resin'},
 {id:825006,name:'帰り石の間',x:34,z:8,y:-10.5,hint:'貸出石が落ちるのを待ち、軌跡戻しで1m以上戻して上部へ戻そう。履歴が消えたら初期化できる。',reward:'crystal'},
 {id:825007,name:'天窓の小塔',x:-5,z:-10,y:undefined,hint:'貸出床の中央から天抜けを確認・確定し、頭上の足場へ抜けよう。',reward:'wood'},
] as const;
export const GUIDES = [
 {id:830001,name:'測り手キリ',x:0,z:14,y:undefined,trials:[825001,825004,825007],line:'重さも光も、物のつなぎ方で道になる。貸した部品は何度でも元に戻せるよ。'},
 {id:830002,name:'風読みノノ',x:18,z:-15,y:25,trials:[825002,825003],line:'翼は風の中で開こう。届かなければ一度地面へ。急ぐより、帰れる道を残してね。'},
 {id:830003,name:'洞守トワ',x:25,z:14,y:-10.5,trials:[825005,825006],line:'熱は水でほどき、石の歩みは軌跡でたどる。持ち物と命は時間を戻しても戻らないよ。'},
] as const;
const range = (a: Vec3,b: Vec3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function trialGrowth(state: AdventureSave): {health: number; stamina: number} { const count=state.trialWorld?.completed.length??0;return {health:count*2,stamina:count*3}; }
/** Idempotent migration for existing version-4 worlds; no personal supplies are spawned here. */
export function ensureAdventureTrials(sim: GameSimulation,state: AdventureSave): void {
 if(sim.world.generator!==4)return;
 const movedGuide=state.resources.find(n=>n.id===830003&&n.x===31&&n.z===14);if(movedGuide)movedGuide.x=25;
 state.trialWorld??={version:1,completed:[],epochs:{},evidence:[]};state.trialJournal??=[];
 for(const entry of [...TRIALS,...GUIDES])if(!state.resources.some(n=>n.id===entry.id))state.resources.push({id:entry.id,kind:entry.id>=830000?'merchant':'runestone',x:entry.x,y:entry.y??sim.groundAt(entry.x,entry.z),z:entry.z,amount:1,ready:0});
}
export class AdventureTrials {
 dialogue: DialogueSnapshot | undefined;
 current: JourneySnapshot['current'];
 private riseStart: number | undefined;
 private lastMeasuredTick=-1;
 private readonly stable=new Map<number,{ticks:number;lastTick:number;epoch:number}>();
 constructor(private readonly game: Adventure) {}
 snapshot(): JourneySnapshot { const s=this.game.state;return {completed:[...(s.trialWorld?.completed??[])],journal:[...(s.trialJournal??[])],growth:trialGrowth(s),current:this.current?{...this.current}:undefined}; }
 private world(): TrialWorld { const s=this.game.state;if(this.game.sim.world.generator!==4||!s.trialWorld)throw new Error('この世界には創作試練がありません');return s.trialWorld; }
 private node(id: number) { const node=this.game.state.resources.find(n=>n.id===id);if(!node)throw new Error('案内標が見つかりません');return node; }
 private near(id: number,reset=false):void {
  const node=this.node(id),p=this.game.sim.player;
  if(Math.hypot(p.x-node.x,p.z-node.z)>(reset?10:4)||Math.abs(p.y-node.y)>(reset?24:8))throw new Error('試練の案内標へ近づいてください');
 }
 talk(id: string): string {
  this.world();const guide=GUIDES.find(g=>g.id===Number(id));if(!guide)throw new Error('案内人を選んでください');const node=this.node(guide.id),p=this.game.sim.player;
  if(range(node,p)>3.5)throw new Error('案内人へ近づいてください');
  const context=skyContext(this.game.sim),length=range(node,p);for(let d=.2;d<length-.3;d+=.2){const point={x:p.x+(node.x-p.x)*d/length,y:p.y+.8+(node.y-p.y)*d/length,z:p.z+(node.z-p.z)*d/length};if(context.solid(point))throw new Error('案内人との間が遮られています');}
  this.dialogue={npc:guide.id,title:guide.name,text:guide.line,choices:[...guide.trials.flatMap(id=>[{id:'accept-'+id,label:TRIALS.find(t=>t.id===id)!.name+'の依頼を聞く'},{id:'hint-'+id,label:TRIALS.find(t=>t.id===id)!.name+'の助言'}]),{id:'bye',label:'またね'}]};return guide.line;
 }
 choose(id: string):string {
  if(id==='bye'){this.dialogue=undefined;return '案内人との会話を終えました';}
  const previous=this.dialogue;if(!previous||!previous.choices.some(choice=>choice.id===id))throw new Error('今の会話の選択肢を選んでください');
  this.talk(String(previous.npc));const trial=TRIALS.find(t=>t.id===Number(id.split('-')[1]))!;
  if(id.startsWith('accept-')){const journal=this.game.state.trialJournal??=[];if(!journal.includes(trial.id))journal.push(trial.id);}
  const complete=this.world().completed.includes(trial.id),text=(complete?'この試練は仲間と達成済み。':id.startsWith('accept-')?'依頼を記録したよ。':'助言：')+trial.hint+' 達成すると全員の最大体力+2・スタミナ+3。素材は案内標に一度だけ現れる。';
  this.dialogue!.text=text;return text;
 }
 private templates(id:number):SkyTrialTemplate[] {
  const n=this.node(id),x=n.x+3,y=n.y+.35,z=n.z;
  const base:SkyTrialTemplate={kind:'slab',material:'stone',position:{x,y,z},links:[],anchored:true};
  if(id===825001)return [base,{kind:'block',material:'stone',position:{x:x+2.5,y:y+1,z},links:[]}];
  if(id===825002)return [base,{kind:'block',material:'wood',position:{x:x+3,y:y+1,z},links:[]}];
  if(id===825003)return [{...base,position:{x:n.x-3,y,z}}];
  if(id===825004)return [base,{kind:'battery',material:'metal',position:{x:x-.7,y:y+.5,z},energy:25,links:[]},{kind:'lamp',material:'metal',position:{x:x+.7,y:y+.5,z},links:[]}];
  if(id===825005)return [{...base,links:[1,2]},{kind:'battery',material:'metal',position:{x:x-.6,y:y+.55,z:z-.6},energy:25,links:[0],anchored:true},{kind:'emitter',material:'metal',position:{x:x+.1,y:y+.55,z:z-.6},links:[0],anchored:true},{kind:'block',material:'wood',position:{x:x+.1,y:y+.63,z:z+.7},links:[]}];
  if(id===825006)return [base,{kind:'block',material:'stone',position:{x,y:y+3.5,z},links:[]}];
  return [base,{kind:'slab',material:'stone',position:{x,y:y+3.5,z},links:[],anchored:true}];
 }
 reset(id: string):string {
  const world=this.world(),trial=TRIALS.find(t=>t.id===Number(id));if(!trial)throw new Error('試練を選んでください');this.near(trial.id,true);
  this.game.sim.skybound.resetTrial(trial.id,this.templates(trial.id),skyContext(this.game.sim));world.epochs[trial.id]=(world.epochs[trial.id]??0)+1;world.evidence=world.evidence.filter(id=>id!==trial.id);this.riseStart=undefined;this.stable.delete(trial.id);
  this.current={id:trial.id,reason:'貸出部品と固定足場を復旧しました。自作物と地形は変更していません。'};return this.current.reason;
 }
 private condition(id:number,live=false):string|null {
  const game=this.game,n=this.node(id),parts=game.sim.skybound.state.parts.filter(p=>p.trial===id),base=parts.find(p=>p.anchored&&p.kind==='slab'),world=this.world();
  if(world.evidence.includes(id))return null;
  if(!base)return '初期化を押して貸出部品と固定足場を用意してください';
  const placed=(p:typeof base)=>!game.sim.skybound.leases.has(p.id)&&Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z)<.25&&Math.hypot(p.angularVelocity?.x??0,p.angularVelocity?.y??0,p.angularVelocity?.z??0)<.1&&Math.abs(p.position.y-(base.position.y+.125+PART_HALF[p.kind].y))<.08;
  if(id===825001){const mass=game.sim.skybound.state.parts.filter(p=>p.id!==base.id&&!p.anchored&&Math.abs(p.position.x-base.position.x)<.9&&Math.abs(p.position.z-base.position.z)<.9&&placed(p)).reduce((sum,p)=>sum+p.mass,0);return mass>=12?(live?null:'掴むのをやめ、床の重りを0.5秒安定させてください'):`床に載った質量は${Math.round(mass)}。12以上になる重りを置いてください`;}
  if(id===825002){const payload=parts.find(p=>p.kind==='block');return payload&&(payload.carried??0)>=2&&Math.hypot(payload.position.x-base.position.x,payload.position.z-base.position.z)<.9&&placed(payload)?(live?null:'掴むのをやめ、荷を床で0.5秒安定させてください'):'東の貸出荷を組み手で2m以上運び、貸出床の中央へ置いてください';}
  if(id===825003)return world.evidence.includes(id)?null:'上昇風で翼を開き、2m以上浮上して高さ28以上へ到達してください';
  if(id===825004){const battery=parts.find(p=>p.kind==='battery'),lamp=parts.find(p=>p.kind==='lamp');const connected=new Set<number>(),queue=battery?[battery.id]:[];while(queue.length){const next=queue.pop()!;if(connected.has(next))continue;connected.add(next);queue.push(...(game.sim.skybound.state.parts.find(p=>p.id===next)?.links??[]));}return battery&&lamp&&connected.has(lamp.id)&&(battery.energy??25)<25&&game.sim.skybound.isPowered(lamp.id)?null:'貸出電池と灯具を接着し、掴むのをやめて灯具を点灯してください';}
  if(id===825005){const wood=parts.find(p=>p.kind==='block'&&p.material==='wood');return wood?.heated&&(wood.wet??0)>0&&!(wood.burning??0)&&(wood.integrity??100)>0?null:'貸出木材を放射器で加熱し、その後に水で消火してください。燃やし尽くしたら初期化できます';}
  if(id===825006){const stone=parts.find(p=>p.kind==='block');return stone&&(stone.recalled??0)>=1&&stone.position.y>=n.y+3?null:'落下した貸出石を、軌跡戻しで1m以上戻して上部へ戻してください';}
  return world.evidence.includes(id)?null:'貸出床の中央から、頭上の足場へ天抜けを確認・確定してください';
 }
 complete(id:string):string {
  const world=this.world(),trial=TRIALS.find(t=>t.id===Number(id));if(!trial)throw new Error('試練を選んでください');this.near(trial.id);
  if(world.completed.includes(trial.id)){this.current={id:trial.id,reason:'仲間と達成済みです。報酬はすでに共有されています'};return this.current.reason;}
  const reason=this.condition(trial.id);this.current={id:trial.id,reason:reason??'試練を達成しました'};if(reason)throw new Error(reason);
  // One synchronous room transaction creates the shared reward once. Growth is derived, not reissued on join.
  const n=this.node(trial.id);dropItem(this.game,trial.reward,3,{x:n.x,y:n.y+.3,z:n.z});world.completed.push(trial.id);n.ready=1e10;
  return `${trial.name}を達成。全員の最大体力+2・スタミナ+3。共有素材を案内標へ置きました`;
 }
 recordAscend(from:Vec3,to:Vec3):void {
  if(this.game.sim.world.generator!==4)return;const node=this.game.state.resources.find(n=>n.id===825007),ceiling=this.game.sim.skybound.state.parts.find(p=>p.trial===825007&&p.anchored&&p.kind==='slab'&&p.position.y>(node?.y??Infinity)+2);
  if(node&&ceiling&&Math.hypot(from.x-ceiling.position.x,from.z-ceiling.position.z)<.7&&from.y<ceiling.position.y&&to.y>ceiling.position.y&&to.y-from.y>2&&!this.world().evidence.includes(825007))this.world().evidence.push(825007);
 }
 step():void {
  if(this.game.sim.world.generator!==4)return;const p=this.game.sim.player,world=this.world(),tick=this.game.sim.tick;
  if(this.lastMeasuredTick!==tick){this.lastMeasuredTick=tick;for(const id of [825001,825002,825004,825005,825006]){
   if(!this.game.state.resources.some(node=>node.id===id)||world.completed.includes(id)||world.evidence.includes(id))continue;
   if(this.condition(id,true)){this.stable.delete(id);continue;}
   const previous=this.stable.get(id),epoch=world.epochs[id]??0,ticks=previous&&previous.lastTick===tick-1&&previous.epoch===epoch?previous.ticks+1:1;
   this.stable.set(id,{ticks,lastTick:tick,epoch});if(id>=825004||ticks>=15){world.evidence.push(id);if(this.current?.id===id)this.current.reason='条件を達成しました。案内標へ戻って報告できます';}
  }}
  if(this.game.traversal.gliding&&Math.hypot(p.x-10,p.z+15)<3){this.riseStart??=p.y;if(p.y>=28&&p.y-this.riseStart>=2&&!this.world().evidence.includes(825003))this.world().evidence.push(825003);}else this.riseStart=undefined;
 }
}
