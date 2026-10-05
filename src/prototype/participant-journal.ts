import type {CampaignRow} from './campaign-ui';
import type {Vec3} from './core/voxel';
interface RecordState {scope:string;before:string[];witnessed:string[];read:string[];visited:string[]}
interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
const KEY='seven-lights-participant-journal-v1',LIMIT=96;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=LIMIT&&new Set(v).size===v.length&&v.every(id=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(id));
const valid=(v:unknown):v is RecordState=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===5&&typeof Reflect.get(v,'scope')==='string'&&Reflect.get(v,'scope').length<=80&&['before','witnessed','read','visited'].every(k=>ids(Reflect.get(v,k)));
/** Private contextual progress only. It cannot grant XP, items, world unlocks or send network commands. */
export class ParticipantJournal {
 private records:RecordState[]=[];private current:RecordState|null=null;private quests:CampaignRow[]=[];private loaded=false;private previous=new Set<string>();private writable=true;
 constructor(private storage:()=>StorageLike){}
 private persist(){try{this.storage().setItem(KEY,JSON.stringify({version:1,records:this.records}));this.writable=true;}catch{this.writable=false;}}
 update(scope:string,quests:CampaignRow[],context:{position:Vec3;alive:boolean;hearth:boolean;artisan:Vec3|null}){
  if(!scope||scope.length>80)return;if(!this.loaded){this.loaded=true;try{const raw=this.storage().getItem(KEY);if(raw&&raw.length<160000){const data=JSON.parse(raw);if(data.version===1&&Array.isArray(data.records)&&data.records.length<=8&&data.records.every(valid)&&new Set(data.records.map((r:RecordState)=>r.scope)).size===data.records.length)this.records=data.records;}}catch{this.writable=false;}}
  this.quests=quests.filter(q=>/^[a-zA-Z0-9:_-]{1,100}$/.test(q.id)).slice(0,LIMIT);const completed=this.quests.filter(q=>q.completed).map(q=>q.id);let changed=false;
  if(this.current?.scope!==scope){this.current=this.records.find(r=>r.scope===scope)??null;if(!this.current){this.current={scope,before:[...completed],witnessed:[],read:[],visited:[]};this.records.push(this.current);if(this.records.length>8)this.records.shift();changed=true;}this.previous=new Set(completed);}
  const state=this.current!;for(const id of completed)if(!this.previous.has(id)&&!state.before.includes(id)&&!state.witnessed.includes(id)&&state.witnessed.length<LIMIT){state.witnessed.push(id);changed=true;}this.previous=new Set(completed);
  const near=(p:Vec3)=>Math.hypot(context.position.x-p.x,context.position.y-p.y,context.position.z-p.z)<2.8;
  for(const [id,done] of [['hearth',context.hearth&&near({x:-3,y:.25,z:4})],['artisan',context.artisan!==null&&near(context.artisan)]] as const)if(context.alive&&done&&!state.visited.includes(id)){state.visited.push(id);changed=true;}
  if(changed)this.persist();
 }
 read(id:string){const row=this.quests.find(q=>q.id===id&&q.completed);if(!row||!this.current)return null;if(!this.current.read.includes(id)&&this.current.read.length<LIMIT){this.current.read.push(id);this.persist();}return row.label+'：'+(row.detail??'世界の共有目標')+'。この記録の確認では報酬を再取得しません。';}
 rows():CampaignRow[]{const state=this.current;if(!state)return [];const known=new Set(this.quests.filter(q=>q.completed).map(q=>q.id)),unread=state.before.filter(id=>known.has(id)&&!state.read.includes(id)).length;return [
  {id:'personal-hearth',label:'自分の依頼 · 合流した拠点を訪ねる',detail:'灯守りの炉に自分の足で近づく。共有の世界解放とは別の訪問記録。',completed:state.visited.includes('hearth')},
  {id:'personal-artisan',label:'自分の依頼 · 救出されたナギを訪ねる',detail:'救出後のナギの近くへ移動する。会話は照準を合わせて操作。',completed:state.visited.includes('artisan')},
  {id:'personal-recap',label:'自分の依頼 · 合流前の経緯を確認',detail:unread?`参加前に完了した目標が${unread}件。下の「経緯を読む」で順番を確認できる。`:'参加前の目標は確認済み。いつでも経緯を読み直せる。',completed:unread===0,reason:this.writable?'この端末だけの記録。世界の報酬は共有で一度だけ。':'この端末への記録保存ができません。現在の画面内でのみ保持します。'},
  ...this.quests.filter(q=>q.completed).map(q=>({...q,id:q.id,label:'世界の記録 · '+q.label,action:'story-read' as const,reason:(state.before.includes(q.id)?'合流前に達成':state.witnessed.includes(q.id)?'参加中に達成':'共有の達成')+' · '+(state.read.includes(q.id)?'確認済み・読み直し可':'未確認')}))];}
}
