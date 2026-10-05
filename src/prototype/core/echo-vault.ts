import {VoxelField,key,type Vec3,type VoxelState,type SampleState} from './voxel';
import type {createArena,ObjectState} from './world';
import {validCampaignState,type CampaignSystem,type CampaignResult} from './campaign';

/** Runtime overlay, deliberately outside all frozen v2/v3/v4 authoring manifests. */
export const VAULT_ID='echo-vault-v1';
export const VAULT_KEY='echo-vault-key',VAULT_REWARD='echo-vault-seal';
const p=(x:number,y:number,z:number):Vec3=>({x,y,z});
export const VAULT_POINTS:readonly {id:string;name:string;kind:ObjectState['kind'];position:Vec3}[]=[
 {id:'vault-shell',name:'薄響の封庫',kind:'gate',position:p(8.5,.25,10.5)},
 {id:'vault-note',name:'封庫守の案内板',kind:'altar',position:p(6.5,.25,9)},
 {id:'vault-key',name:'鉱殻に埋もれた薄響の鍵',kind:'altar',position:p(6.5,.25,11.95)},
 {id:'vault-crust',name:'鍵を覆う脆い鉱殻',kind:'resource',position:p(6.5,.25,11.5)},
 {id:'vault-plate',name:'三本歯の鳴動床',kind:'altar',position:p(8.25,.25,13)},
 {id:'vault-brake',name:'鳴動床の停止梃子',kind:'valve',position:p(10.6,.25,12.1)},
 {id:'vault-switch',name:'薄響の鍵差し開閉機',kind:'valve',position:p(10.6,.25,14.4)},
 {id:'vault-gate',name:'封庫の吊り格子',kind:'gate',position:p(8.5,.25,15.25)},
 {id:'vault-cache',name:'帰り道の封章箱',kind:'cache',position:p(8.5,.25,17.8)},
];
export const VAULT_OBJECT_IDS=VAULT_POINTS.map(q=>q.id);
export const VAULT_PROTECTED_IDS=VAULT_OBJECT_IDS.filter(id=>id!=='vault-crust');
export interface EchoVaultState {version:1;installed:boolean;clue:boolean;keyTaken:boolean;disarmed:boolean;gateOpen:boolean;rewardTaken:boolean}
export const freshEchoVaultState=(installed=false):EchoVaultState=>({version:1,installed,clue:false,keyTaken:false,disarmed:false,gateOpen:false,rewardTaken:false});
export function validEchoVaultState(value:unknown):value is EchoVaultState {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const s=value as EchoVaultState;
 return Object.keys(s).length===7&&s.version===1&&['installed','clue','keyTaken','disarmed','gateOpen','rewardTaken'].every(k=>typeof Reflect.get(s,k)==='boolean')&&
  (s.installed||!s.clue&&!s.keyTaken&&!s.disarmed&&!s.gateOpen&&!s.rewardTaken)&&(!s.keyTaken||s.clue)&&(!s.gateOpen||s.keyTaken)&&(!s.rewardTaken||s.gateOpen);
}
export const VAULT_CLUE='封庫守の記録「入口左の鉱殻を鑿で削ると鍵が現れる。三本歯の床はせり上がってから噴く。右の白い側道を歩き、停止梃子を引こう。奥の鍵差し開閉機で格子を上げる。帰りは同じ入口へ」';
/** No destructive CSG: all new samples belong to named finite layers. */
export function authorEchoVault(field:VoxelField,gateOpen=false){
 const box=(a:Vec3,b:Vec3,m:number,id:string)=>field.box(a,b,m,id);
 // South-facing side excursion, reached by the original starter ground at z9.
 box(p(5.5,-.5,9.75),p(11.5,.25,19),3,'vault-shell');
 for(const x of [5.5,11.15])box(p(x,.25,10.5),p(x+.35,3.1,19),3,'vault-shell');
 box(p(5.5,.25,18.65),p(11.5,3.1,19),3,'vault-shell');
 box(p(5.5,3.1,10.5),p(11.5,3.45,19),3,'vault-shell');
 for(const [a,b] of [[5.5,7],[10,11.5]])box(p(a,.25,10.5),p(b,3.1,10.85),3,'vault-shell');
 box(p(7,2.7,10.5),p(10,3.1,10.85),3,'vault-shell');
 for(const [a,b] of [[5.5,7.2],[9.8,11.5]])box(p(a,.25,15.05),p(b,3.1,15.45),3,'vault-shell');
 box(p(6.15,.25,8.85),p(6.85,1.5,9.15),8,'vault-note');
 box(p(6.2,.75,11.8),p(6.8,1.25,12.15),6,'vault-key');
 box(p(6.1,.6,11.15),p(6.9,1.4,11.75),3,'vault-crust');
 box(p(7,.25,12.1),p(9.5,.34,14),6,'vault-plate');
 for(const id of ['vault-brake','vault-switch']){const q=VAULT_POINTS.find(q=>q.id===id)!.position;box(p(q.x-.2,.25,q.z-.2),p(q.x+.2,1.25,q.z+.2),6,id);}
 setEchoVaultGate(field,gateOpen);
 box(p(8.05,.25,17.45),p(8.95,.95,18.15),4,'vault-cache');
}
export function setEchoVaultGate(field:VoxelField,open:boolean){
 field.removeObject('vault-gate');field.box(p(7.2,open?2.65:.25,15.08),p(9.8,3.1,15.42),6,'vault-gate');
}
const insideFootprint=(x:number,y:number,z:number)=>x>=19&&x<=49&&y>=-5&&y<=16&&z>=31&&z<=79;
/** Old edits win. Refuse installation if any edited sample/tombstone is in the
 * safety envelope, or any reserved object name was already used. */
export function canInstallEchoVault(field:VoxelState,objects:readonly {id:string}[]){
 if(objects.some(o=>o.id.startsWith('vault-'))||field.order.some(id=>id.startsWith('vault-'))||field.suppressed?.some(id=>id.startsWith('vault-')))return false;
 for(const layer of [{cells:field.base,removed:field.removedBase},...field.layers]){
  if(layer.cells.some(c=>insideFootprint(c[0],c[1],c[2]))||layer.removed.some(id=>{const [x,y,z]=id.split(',').map(Number);return insideFootprint(x,y,z);}))return false;
 }return true;
}
const templates=new Map<boolean,VoxelState>();
function template(open:boolean){let value=templates.get(open);if(!value){const field=new VoxelField();authorEchoVault(field,open);value=field.exportState();templates.set(open,value);}return value;}
const sameTuple=(a:SampleState,b:SampleState)=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&Math.abs(a[3]-b[3])<1e-12&&a[4]===b[4];
/** Validate complete raw ownership, not just one occupied probe. The mined crust
 * alone may deplete its original cells; it may never grow or regain claimed ore. */
export function validEchoVaultGeometry(field:VoxelState,state:EchoVaultState){
 const actual=field.layers.filter(l=>l.id.startsWith('vault-'));let crustMined=false;
 if(!state.installed)return actual.length===0&&!field.order.some(id=>id.startsWith('vault-'))&&!field.suppressed?.some(id=>id.startsWith('vault-'));
 const expected=template(state.gateOpen).layers;
 if(actual.some(l=>!VAULT_OBJECT_IDS.includes(l.id))||field.suppressed?.some(id=>id.startsWith('vault-')))return false;
 for(const layer of expected){
  const saved=actual.find(l=>l.id===layer.id);
  if(layer.id==='vault-crust'){
   if(!saved){crustMined=true;continue;}if(saved.removed.length)return false;const samples=new Map(layer.cells.map(c=>[key(c[0],c[1],c[2]),c]));
   if(saved.cells.some(c=>{const a=samples.get(key(c[0],c[1],c[2]));return !a||c[4]!==a[4]||c[3]<a[3]-1e-12;}))return false;
   const remaining=new Map(saved.cells.map(c=>[key(c[0],c[1],c[2]),c]));if(remaining.size!==saved.cells.length)return false;crustMined=layer.cells.some(c=>c[3]<0&&(!remaining.has(key(c[0],c[1],c[2]))||remaining.get(key(c[0],c[1],c[2]))![3]>=0));
  }else{
   if(!saved||saved.removed.length||saved.cells.length!==layer.cells.length)return false;
   const samples=new Map(saved.cells.map(c=>[key(c[0],c[1],c[2]),c]));if(layer.cells.some(c=>{const a=samples.get(key(c[0],c[1],c[2]));return !a||!sameTuple(c,a);}))return false;
  }
 }
 return !state.keyTaken||crustMined;
}
export function vaultObjectOpen(id:string,s:EchoVaultState){return id==='vault-note'?s.clue:id==='vault-key'?s.keyTaken:id==='vault-brake'?s.disarmed:id==='vault-switch'||id==='vault-gate'?s.gateOpen:id==='vault-cache'?s.rewardTaken:false;}
export function validEchoVaultSave(state:EchoVaultState|undefined,field:VoxelState,objects:readonly {id:string;open:boolean;hp:number}[],items:Record<string,number>,stored:Record<string,number>){
 const s=state??freshEchoVaultState();if(!validEchoVaultState(s)||!validEchoVaultGeometry(field,s))return false;
 const mine=objects.filter(o=>o.id.startsWith('vault-'));if(mine.length!==(s.installed?VAULT_OBJECT_IDS.length:0)||mine.some(o=>!VAULT_OBJECT_IDS.includes(o.id)||o.open!==vaultObjectOpen(o.id,s)||o.hp!==100))return false;
 const count=(id:string)=>(items[id]??0)+(stored[id]??0);
 return count(VAULT_KEY)===(s.keyTaken&&!s.gateOpen?1:0)&&count(VAULT_REWARD)===(s.rewardTaken?1:0);
}
export interface VaultActor {position:Vec3;alive:boolean;mayEdit:boolean;hitPoint?:Vec3}
const fail=(message:string):CampaignResult=>({ok:false,message});
const ok=(message:string):CampaignResult=>({ok:true,message});
const finite=(v:Vec3)=>!!v&&[v.x,v.y,v.z].every(Number.isFinite);
export type VaultTrapPhase='quiet'|'warning'|'strike'|'disarmed';
export class EchoVaultSystem {
 private state=freshEchoVaultState();
 constructor(readonly campaign:CampaignSystem,readonly arena:ReturnType<typeof createArena>){}
 get enabled(){return this.state.installed;}
 snapshot():EchoVaultState{return {...this.state};}
 restore(value:unknown){if(!validEchoVaultState(value))return false;this.state={...value};return true;}
 install(blockers:readonly Vec3[]=[]){if(this.enabled||!canInstallEchoVault(this.arena.field.exportState(),[...this.arena.objects.values()]))return false;
  // A legacy actor may be standing on the previously open ground. Leave that
  // journey unchanged instead of adding a wall through the actor and teleporting it.
  const nearby=blockers.filter(q=>q.x>5&&q.x<12&&q.z>8&&q.z<19.5&&q.y<3.5&&q.y+1.8>-.5);if(nearby.length){const probe=new VoxelField();authorEchoVault(probe);if(nearby.some(position=>probe.overlaps(position)))return false;}
  authorEchoVault(this.arena.field);this.state=freshEchoVaultState(true);this.reconcileObjects();return true;}
 /** Geometry was validated/staged by the checkpoint transaction; no reseeding. */
 reconcileObjects(){for(const id of VAULT_OBJECT_IDS)this.arena.objects.delete(id);if(this.enabled)for(const q of VAULT_POINTS)this.arena.objects.set(q.id,{id:q.id,name:q.name,kind:q.kind,hp:100,open:vaultObjectOpen(q.id,this.state)});}
 handles(id:string){return this.enabled&&VAULT_OBJECT_IDS.includes(id);}
 trapPhase(seconds:number):VaultTrapPhase {if(!this.enabled||this.state.disarmed)return 'disarmed';const t=((seconds%6)+6+1e-9)%6;return t>=3&&t<4.2?'warning':t>=4.2&&t<4.65?'strike':'quiet';}
 /** One bounded pulse at each clock edge. Save/reconnect inherits seconds, so a
 * repeated snapshot cannot mint extra pulses or reward claims. */
 trapDamage(position:Vec3,from:number,to:number){
  if(!this.enabled||this.state.disarmed||!finite(position)||![from,to].every(Number.isFinite)||to<=from||to-from>.101||position.x<6.75||position.x>9.75||position.z<11.85||position.z>14.25||position.y<.15||position.y>1.05)return 0;
  const obstacle=this.arena.field.ray({x:position.x,y:.4,z:position.z},{x:0,y:1,z:0},Math.max(0,position.y-.3));if(obstacle&&obstacle.cell.object!=='vault-plate')return 0;
  return Math.floor((to-4.2+1e-9)/6)>Math.floor((from-4.2+1e-9)/6)?22:0;
 }
 /** Bounded authored-sample evidence. A different occluding solid is never
  * mistaken for mining; any genuinely depleted crust sample is sufficient. */
 crustMined(){if(!this.enabled)return false;return template(false).layers.find(l=>l.id==='vault-crust')!.cells.some(([x,y,z,d])=>{if(d>=0)return false;const current=this.arena.field.get(x,y,z);return !current||current.distance>=0;});}
 actionLabel(id:string,seconds:number){
  if(id==='vault-crust')return '鑿の攻撃で鍵の前の鉱殻を削る';
  if(id==='vault-plate')return '三本歯: '+({quiet:'停止中',warning:'せり上がり · 退避',strike:'噴出中 · 危険',disarmed:'停止梃子で解除済み'}[this.trapPhase(seconds)])+' · 右の白い側道は安全';
  return 'E / 操作 · '+(id==='vault-brake'?'罠を止める':id==='vault-switch'?'鍵を差し、格子を上げる':id==='vault-key'?'鍵を取る':'調べる');
 }
 interact(id:string,actor:VaultActor):CampaignResult {
  if(!this.enabled||!actor.alive||!finite(actor.position))return fail('生きている間に封庫を調べる');
  if(!actor.mayEdit)return fail('封庫の操作・報酬回収はホストの編集許可が必要');
  const q=VAULT_POINTS.find(q=>q.id===id);if(!q)return fail('封庫の対象がありません');
  // Core supplies the actual aimed surface point. A partially exposed key must
  // not depend on an unrelated crust sample or a different centre-line ray.
  const aim=id==='vault-key'&&actor.hitPoint?actor.hitPoint:{...q.position,y:id==='vault-plate'?.3:id==='vault-key'?1:q.position.y+.85};
  if(!finite(aim))return fail('対象の表面に照準を合わせる');
  if(Math.hypot(actor.position.x-q.position.x,actor.position.y-q.position.y,actor.position.z-q.position.z)>2.8)return fail('対象から2.8m以内へ移動する');
  const eye={...actor.position,y:actor.position.y+1.52},dir={x:aim.x-eye.x,y:aim.y-eye.y,z:aim.z-eye.z},distance=Math.hypot(dir.x,dir.y,dir.z);
  if(distance>4.5)return fail('近くの対象の表面に照準を合わせる');
  const hit=this.arena.field.ray(eye,dir,distance+(id==='vault-key'?.04:0));
  if(id==='vault-key'&&hit?.cell.object!=='vault-key')return fail('鍵が見えるまで、照準の先の鉱殻を鑿で削る');
  if(hit&&hit.cell.object!==id&&hit.distance<distance-.12)return fail('遮蔽物の向こうは操作できません');
  if(id==='vault-shell'||id==='vault-plate'||id==='vault-gate')return ok(id==='vault-gate'?(this.state.gateOpen?'格子は開通済み。入口へ歩いて帰れる':'右手の開閉機へ薄響の鍵を差すと格子が上がる'):VAULT_CLUE);
  if(id==='vault-crust')return fail('鑿を選び、鍵の前の鉱殻を攻撃して削る');
  const next=this.snapshot(),campaign=this.campaign.snapshot();let message='';
  if(id==='vault-note'){next.clue=true;message=VAULT_CLUE;}
  if(id==='vault-key'){
   if(!next.clue)return fail('先に入口手前の案内板を読む');if(next.keyTaken)return fail('鍵は回収済み。収納した場合は拠点で取り出す');
   if(!this.crustMined())return fail('鍵を覆う鉱殻を鑿で削る');
   if((campaign.items[VAULT_KEY]??0)!==0)return fail('鍵の所持上限です');next.keyTaken=true;campaign.items[VAULT_KEY]=1;message='薄響の鍵を発見。右の白い側道で停止梃子と鍵差し開閉機へ';
  }
  if(id==='vault-brake'){if(next.disarmed)return fail('鳴動床は解除済み');next.disarmed=true;message='鳴動床を停止した。三本歯が沈み、帰り道も安全になった';}
  if(id==='vault-switch'){
   if(next.gateOpen)return fail('格子は開通済み');if(!next.keyTaken||campaign.items[VAULT_KEY]!==1)return fail('入口左の薄響の鍵が必要。収納した鍵は拠点から取り出す');
   campaign.items[VAULT_KEY]=0;next.gateOpen=true;message='鍵を開閉機に残し、吊り格子を上げた。奥の封章箱を開けて入口へ帰ろう';
  }
  if(id==='vault-cache'){
   if(!next.gateOpen)return fail('先に鍵差し開閉機で格子を上げる');if(next.rewardTaken)return fail('封章箱は回収済み');if((campaign.items[VAULT_REWARD]??0)!==0)return fail('封章の所持上限です');
   next.rewardTaken=true;campaign.items[VAULT_REWARD]=1;campaign.xp=Math.min(10000,campaign.xp+40);const level=Math.min(10,1+Math.floor(campaign.xp/80));campaign.skillPoints+=level-campaign.level;campaign.level=level;message='薄響の封章と経験値40を獲得。入口へ戻れる。封章と鍵の記録は死亡しても失わない';
  }
  if(!validEchoVaultState(next)||!validCampaignState(campaign)||!this.campaign.restore(campaign))return fail('封庫の状態を更新できません');
  const opened=!this.state.gateOpen&&next.gateOpen;this.state=next;if(opened)setEchoVaultGate(this.arena.field,true);this.reconcileObjects();return ok(message);
 }
 questRow(){const s=this.state;return {id:VAULT_ID,label:'薄響の封庫',side:true,status:s.rewardTaken?'complete':s.installed?'active':'locked',detail:s.installed?'開始地点の南東、案内板（6.5, 9）から封庫へ。'+[s.clue?'✓ 案内板':'□ 案内板',s.keyTaken?'✓ 鉱殻の鍵':'□ 鉱殻の鍵',s.disarmed?'✓ 罠を停止':'□ 右の側道で罠を避ける / 停止',s.gateOpen?'✓ 格子開通':'□ 鍵差し開閉機',s.rewardTaken?'✓ 封章箱':'□ 封章箱'].join(' / '):'既存の地形編集と重なるため、この旅では封庫を追加していません。元の建築を保護しています。'};}
}
