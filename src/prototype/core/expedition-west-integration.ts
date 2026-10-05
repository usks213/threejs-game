import {CAMPAIGN_ITEMS,CAMPAIGN_PROFESSIONS,validCampaignState,type CampaignSystem,type CampaignResult,type CampaignProfession} from './campaign';
import {VoxelField,key,type Cell,type Vec3} from './voxel';
import {SparseOverlayField,type SparseOverlayState} from './sample-overlay';
import type {NpcLife} from './npc-life';
import {validWesternNpcLifeState,type WesternNpcLifeState} from './western-npc-life';
import type {createArena} from './world';
import type {RegionalEnemy,RegionalReward} from './regions';
import {WEST_EXPEDITION_MANIFEST,WEST_EXPEDITION_ACCESS,WEST_POINTS,WEST_RESOURCES,WEST_ENCOUNTERS,WEST_QUESTS,WEST_SPECIALISTS,WEST_SPECIALIST_QUESTS,WEST_ROUTES,setWestShortcut,setWestSpecialistLocation,type WestSpecialist} from './expedition-west';

const points=[...WEST_POINTS,...WEST_RESOURCES],pointIds=points.map(p=>p.id),enemyIds=WEST_ENCOUNTERS.map(e=>e.id);
export const WEST_PROTECTED_OBJECT_IDS:readonly string[]=pointIds;
const routeIds=['west-high-road','west-low-road'] as const;
export const WEST_SURVEY_QUEST='west-two-roads';
const questIds=[...WEST_QUESTS.map(q=>q.id),...WEST_SPECIALIST_QUESTS.map(q=>q.id),WEST_SURVEY_QUEST];
const mineEnemies=['west-pitguard','west-orewatch'];
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const finite=(p:Vec3)=>!!p&&[p.x,p.y,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<1000);
const fail=(message:string):CampaignResult=>({ok:false,message});
const ok=(message:string,extra:Partial<CampaignResult>={}):CampaignResult=>({ok:true,message,...extra});

/** Slots append after the existing 18 actors. Summon slots 15–17 retain their identity. */
export const WEST_RUNTIME_ENEMIES:readonly {key:string;slot:number;definition:RegionalEnemy}[]=WEST_ENCOUNTERS.map((enemy,index)=>({key:enemy.id,slot:18+index,definition:{id:201+index,key:enemy.id,region:'resinwood',name:enemy.name,position:{...enemy.position,y:enemy.position.y+(enemy.id==='west-lookout'?.3:0)},tactic:enemy.tactic,hp:enemy.hp,damage:enemy.damage,boss:false,reward:enemy.reward,telegraph:enemy.tactic==='archer'?'弓を引いてから射撃':enemy.tactic==='caster'?'杖先に光を集めてから鉱塵弾':enemy.tactic==='spear'?'槍先を引いてから前方へ突く':'斧を肩に上げてから振り下ろす'}}));
export interface WestRouteProgress {forward:number;reverse:number}
export interface WestExpeditionState {version:1;manifest:typeof WEST_EXPEDITION_MANIFEST;claimed:string[];defeated:string[];completed:string[];routes:Record<typeof routeIds[number],WestRouteProgress>;campUnlocked:boolean;gateOpen:boolean}
export const createWestExpeditionState=():WestExpeditionState=>({version:1,manifest:WEST_EXPEDITION_MANIFEST,claimed:[],defeated:[],completed:[],routes:{'west-high-road':{forward:0,reverse:0},'west-low-road':{forward:0,reverse:0}},campUnlocked:false,gateOpen:false});
export interface WestActorContext {authority:'host'|'guest';alive:boolean;position:Vec3}
export interface WestNpcLifeProvider {get(id:string):Pick<NpcLife,'position'|'visible'|'label'|'talk'>|undefined;snapshot():WesternNpcLifeState}
const list=(v:unknown,allowed:readonly string[])=>Array.isArray(v)&&v.length<=allowed.length&&new Set(v).size===v.length&&v.every(id=>typeof id==='string'&&allowed.includes(id));
const routeComplete=(s:WestExpeditionState,id:typeof routeIds[number])=>{const n=WEST_ROUTES.find(r=>r.id===id)!.nodes.length;return s.routes[id].forward===n||s.routes[id].reverse===n;};
export function validWestExpeditionState(value:unknown):value is WestExpeditionState{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const s=value as WestExpeditionState;
 if(s.version!==1||s.manifest!==WEST_EXPEDITION_MANIFEST||!list(s.claimed,pointIds)||!list(s.defeated,enemyIds)||!list(s.completed,questIds)||typeof s.campUnlocked!=='boolean'||typeof s.gateOpen!=='boolean'||!s.routes||typeof s.routes!=='object'||Array.isArray(s.routes)||Object.keys(s.routes).length!==2)return false;
 for(const id of routeIds){const r=s.routes[id],n=WEST_ROUTES.find(q=>q.id===id)!.nodes.length;if(!r||typeof r!=='object'||Object.keys(r).length!==2||![r.forward,r.reverse].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=n))return false;}
 if(s.campUnlocked!==s.claimed.includes('west-return-hearth')||s.gateOpen!==s.claimed.includes('west-mine-switch'))return false;
 if(s.claimed.includes('west-shortcut-gate')&&!s.gateOpen||s.claimed.includes('west-mine-cache')&&(!s.gateOpen||!mineEnemies.every(id=>s.defeated.includes(id))))return false;
 for(const npc of WEST_SPECIALISTS)if(s.claimed.includes(npc.id)&&(!npc.requiresClaims.every(id=>s.claimed.includes(id))||!npc.requiresDefeats.every(id=>s.defeated.includes(id))))return false;
 for(const q of WEST_SPECIALIST_QUESTS)if(s.completed.includes(q.id)!==s.claimed.includes(q.specialist))return false;
 for(const [index,q] of WEST_QUESTS.entries())if(s.completed.includes(q.id)&&(!q.objectives.every(id=>s.claimed.includes(id))||index>0&&!s.completed.includes(WEST_QUESTS[index-1].id)))return false;
 if(s.completed.includes(WEST_SURVEY_QUEST)&&!routeIds.every(id=>routeComplete(s,id)))return false;
 return true;
}


const specialistGeometry=new Map<string,ReadonlyMap<string,Cell>>();
function expectedSpecialistGeometry(npc:WestSpecialist,rescued:boolean,size:number){
 const id=npc.id+':'+rescued+':'+size,cached=specialistGeometry.get(id);if(cached)return cached;
 const field=new VoxelField(size);setWestSpecialistLocation(field,npc,rescued);const cells=new Map(field.cells);specialistGeometry.set(id,cells);return cells;
}
/** Inspect the owning layer, including samples hidden beneath another object. */
function exactSpecialistGeometry(field:VoxelField,npc:WestSpecialist,rescued:boolean,overlay?:SparseOverlayState){
 const expected=expectedSpecialistGeometry(npc,rescued,field.size),actual=new Map<string,Cell>();
 if(field instanceof SparseOverlayField&&overlay){
  if(!overlay.order.includes(npc.id))return false;
  if(!overlay.suppressed.includes(npc.id)){const b=field.provider.layerBounds.get(npc.id);if(b)for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)for(let z=b.minZ;z<=b.maxZ;z++){const cell=field.provider.layersAt(x,y,z).get(npc.id);if(cell)actual.set(key(x,y,z),cell);}}
  const edits=overlay.layers.find(layer=>layer.id===npc.id);for(const id of edits?.removed??[])actual.delete(id);for(const [x,y,z,distance,material] of edits?.cells??[])actual.set(key(x,y,z),{x,y,z,distance,material,object:npc.id});
 }else for(const cell of field.objectSamples(npc.id))actual.set(key(cell.x,cell.y,cell.z),cell);
 if(actual.size!==expected.size)return false;
 for(const [id,cell] of expected){const saved=actual.get(id);if(!saved||saved.distance!==cell.distance||saved.material!==cell.material)return false;}
 return true;
}

/** Opt-in host adapter. No construction/import activates it. Save code must store this
 * snapshot alongside campaign state and terrain in the same checked checkpoint.
 * Host combat calls defeat only after resolving HP; never forward client-supplied HP. */
export class WestExpeditionSystem {
 private state=createWestExpeditionState();
 private npcLife?:WestNpcLifeProvider;
 setNpcLifeProvider(provider:WestNpcLifeProvider){this.npcLife=provider;}
 constructor(readonly campaign:CampaignSystem,readonly arena:ReturnType<typeof createArena>,readonly activeManifest:string){
  if(this.enabled)campaign.setProfessionProvider({rescued:role=>this.professionUnlocked(role),atWorkshop:position=>this.accessible&&this.state.campUnlocked&&finite(position)&&distance(position,WEST_POINTS.find(p=>p.id==='west-return-hearth')!.position)<=3});
 }
 get enabled(){const provider=(this.arena.field as {provider?:{manifestId:string}}).provider;return this.activeManifest===WEST_EXPEDITION_MANIFEST&&(!provider||provider.manifestId===WEST_EXPEDITION_MANIFEST);}
 get accessible(){return this.enabled&&this.campaign.regionUnlocked(WEST_EXPEDITION_ACCESS.region)&&this.campaign.state.flameTier>=WEST_EXPEDITION_ACCESS.minimumFlameTier;}
 professionUnlocked(role:CampaignProfession){return this.accessible&&WEST_SPECIALISTS.some(npc=>npc.role===role&&this.state.claimed.includes(npc.id));}
 pointPosition(id:string):Vec3|null{const npc=WEST_SPECIALISTS.find(p=>p.id===id),point=points.find(p=>p.id===id);return point?{...(npc&&this.state.claimed.includes(id)?this.npcLife?.get(id)?.position??npc.homePosition:point.position)}:null;}
 snapshot(){return clone(this.state);}
 restore(value:unknown,validateOnly=false){if(!validWestExpeditionState(value))return false;if(!validateOnly)this.state=clone(value);return true;}
 private access(actor:WestActorContext){if(!this.enabled)return fail('西方遠征はまだ有効ではありません');if(actor.authority!=='host')return fail('世界のホストが操作を確認します');if(!actor.alive||!finite(actor.position))return fail('行動できる状態ではありません');if(!this.accessible)return fail('炉を段階2にし、琥珀枝の森を解放する');return ok('操作可能');}
 private visible(actor:WestActorContext,id:string,target:Vec3){const from={...actor.position,y:actor.position.y+1.15},to={...target,y:target.y+.4},d=distance(from,to),dir={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},hit=this.arena.field.ray(from,dir,d);return !hit||hit.cell.object===id||hit.distance>=d-.4;}
 private prepare(reward:RegionalReward){
  const next=this.campaign.snapshot(),materials={...this.campaign.materials};
  for(const [id,n] of Object.entries(reward.items??{})){const item=CAMPAIGN_ITEMS[id];if(!item||!Number.isSafeInteger(n)||n<0||(next.items[id]??0)+n>item.stackLimit)return null;next.items[id]=(next.items[id]??0)+n;}
  for(const [id,n] of Object.entries(reward.materials??{})){const current=materials[Number(id)]??0;if(![2,3,4,6,7,10].includes(Number(id))||!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(current)||current+n>1000000)return null;materials[Number(id)]=current+n;}
  if(!Number.isSafeInteger(reward.xp)||reward.xp<0)return null;next.xp=Math.min(10000,next.xp+reward.xp);const level=Math.min(10,1+Math.floor(next.xp/80));next.skillPoints+=level-next.level;next.level=level;
  return validCampaignState(next)?{next,materials}:null;
 }
 private completeQuests(next:WestExpeditionState):number{let xp=0;for(const [index,q] of WEST_QUESTS.entries()){if(!next.completed.includes(q.id)&&q.objectives.every(id=>next.claimed.includes(id))&&(index===0||next.completed.includes(WEST_QUESTS[index-1].id))){next.completed.push(q.id);xp+=q.reward.xp;}}for(const q of WEST_SPECIALIST_QUESTS)if(!next.completed.includes(q.id)&&next.claimed.includes(q.specialist)){next.completed.push(q.id);xp+=q.reward.xp;}return xp;}
 private commit(next:WestExpeditionState,reward:RegionalReward){if(!validWestExpeditionState(next))return false;if(reward.xp===0&&!Object.keys(reward.items??{}).length&&!Object.keys(reward.materials??{}).length){this.state=next;return true;}const prepared=this.prepare(reward);if(!prepared)return false;if(!this.campaign.restore(prepared.next))return false;Object.assign(this.campaign.materials,prepared.materials);this.state=next;return true;}
 handles(id:string){return pointIds.includes(id);}
 interact(id:string,actor:WestActorContext):CampaignResult{
  const access=this.access(actor);if(!access.ok)return access;const point=points.find(p=>p.id===id),object=this.arena.objects.get(id);if(!point||!object)return fail('西方遠征の対象が見つかりません');
  const position=this.pointPosition(id)!,specialist=WEST_SPECIALISTS.find(npc=>npc.id===id);
  if(specialist&&this.state.claimed.includes(id)&&this.npcLife){const resident=this.npcLife.get(id);return resident?.visible?resident.talk({...actor.position,y:actor.position.y+1.15},this.arena.field):fail(specialist.name+'は安全な足場を待っています');}
  if(distance(actor.position,position)>2.8)return fail(point.name+'の近くへ移動する');if(!this.visible(actor,id,position))return fail('遮蔽物の向こうは操作できません');
  if(this.state.claimed.includes(id))return specialist?ok(specialist.name+'「'+specialist.dialogue+'」'):point.kind==='hearth'?ok('発見済みの帰還炉です'):fail('操作・回収済みです');
  if(specialist){
   if(!specialist.requiresClaims.every(id=>this.state.claimed.includes(id))||!specialist.requiresDefeats.every(id=>this.state.defeated.includes(id)))return fail(specialist.name+'の救出: '+specialist.rescueHint);
   if(![...this.arena.field.objectSamples(id)].some(c=>c.distance<0))return fail('救出対象の姿が見つかりません');
   if(this.arena.field.overlaps({...specialist.homePosition,y:specialist.homePosition.y+.12},.44,1.8)||!this.arena.field.ray({...specialist.homePosition,y:specialist.homePosition.y+.3},{x:0,y:-1,z:0},.65))return fail('荷場の住まいが塞がれているか、足場がありません。建築を直してから救出する');
  }
  if(id==='west-mine-switch'&&!this.arena.objects.has('west-shortcut-gate'))return fail('運搬門の状態を読み込めません');
  if(id==='west-mine-cache'&&(!mineEnemies.every(id=>this.state.defeated.includes(id))||!this.state.gateOpen))return fail('坑道の盾守と監視者を倒し、開閉機を操作して金庫の封印を解く');
  if(id==='west-shortcut-gate'&&!this.state.gateOpen)return fail('坑内の開閉機で運搬門を開く');
  if(WEST_RESOURCES.some(p=>p.id===id)&&![...this.arena.field.objectSamples(id)].some(c=>c.distance<0))return fail('この資源は採集済みです');
  const next=this.snapshot();next.claimed.push(id);if(id==='west-return-hearth')next.campUnlocked=true;if(id==='west-mine-switch')next.gateOpen=true;
  const reward={...point.reward,xp:point.reward.xp+this.completeQuests(next)};
  if(!this.commit(next,reward))return fail('報酬の所持上限です。空きを作ってから再び調べる');
  object.open=true;if(id==='west-mine-switch'){setWestShortcut(this.arena.field,true);this.arena.objects.get('west-shortcut-gate')!.open=true;}
  if(specialist){setWestSpecialistLocation(this.arena.field,specialist,true);return ok(specialist.name+'を救出した。荷場の屋根の下に移り、'+specialist.recipes.map(id=>CAMPAIGN_ITEMS[id].label).join('・')+'の制作を教えてくれる');}
  if(WEST_RESOURCES.some(p=>p.id===id))this.arena.field.removeObject(id);
  return ok(point.lore??(id==='west-return-hearth'?'帰還炉を発見。地図から戻れます':id==='west-mine-switch'?'運搬門が開いた。東の出口から段丘へ帰還できます':point.name+'を調べ、報酬を得た'));
 }
 defeat(id:string,evidence:{slot:number;hp:number},actor:WestActorContext):CampaignResult{
  const access=this.access({...actor,alive:true});if(!access.ok)return access;const enemy=WEST_RUNTIME_ENEMIES.find(e=>e.key===id);if(!enemy||evidence.slot!==enemy.slot||!Number.isFinite(evidence.hp)||evidence.hp>0||evidence.hp<0)return fail('討伐の確定情報がありません');
  if(this.state.defeated.includes(id))return fail('この敵の討伐報酬は受領済み');const next=this.snapshot();next.defeated.push(id);if(!this.commit(next,enemy.definition.reward))return fail('報酬の所持上限です。空きを作って再度受け取る');return ok(enemy.definition.name+'を討伐した');
 }
 /** Progress is updated from authoritative player positions, in node order in either
  * direction. Merely touching the endpoint cannot claim a whole road. */
 observe(actor:WestActorContext):CampaignResult|null{
  if(!this.access(actor).ok)return null;const gate=WEST_POINTS.find(p=>p.id==='west-shortcut-gate')!;const passage=this.state.gateOpen&&!this.state.claimed.includes(gate.id)&&distance(actor.position,gate.position)<.8?this.interact(gate.id,actor):null;const next=this.snapshot();let changed=false;
  for(const id of routeIds){const nodes=WEST_ROUTES.find(r=>r.id===id)!.nodes,progress=next.routes[id];if(progress.forward<nodes.length&&distance(actor.position,nodes[progress.forward])<2){progress.forward++;changed=true;}if(progress.reverse<nodes.length&&distance(actor.position,nodes[nodes.length-1-progress.reverse])<2){progress.reverse++;changed=true;}}
  const bonus=!next.completed.includes(WEST_SURVEY_QUEST)&&routeIds.every(id=>routeComplete(next,id));if(bonus)next.completed.push(WEST_SURVEY_QUEST);if(!changed&&!bonus)return passage;
  if(!this.commit(next,{xp:bonus?40:0,materials:bonus?{4:4}:undefined})){next.completed=next.completed.filter(id=>id!==WEST_SURVEY_QUEST);this.commit(next,{xp:0});return fail('探索報酬の所持上限です。空きを作ると受け取れます');}return bonus?ok('二つの荷道を踏破した。探索経験値と補修用の木材を獲得'):null;
 }
 travel(id:string,actor:WestActorContext):CampaignResult{
  const access=this.access(actor);if(!access.ok)return access;if(id!=='west-return-hearth'||!this.state.campUnlocked)return fail('未発見の帰還炉です');const camp=WEST_POINTS.find(p=>p.id===id)!;
  for(const [dx,dz] of [[0,1.8],[1.8,0],[0,-1.8],[-1.8,0]]){const position={x:camp.position.x+dx,y:camp.position.y+5,z:camp.position.z+dz},hit=this.arena.field.ray(position,{x:0,y:-1,z:0},8);if(!hit)continue;position.y=hit.point.y+.12;if(!this.arena.field.overlaps(position))return ok('木霊の帰還炉へ移動',{position});}
  return fail('帰還先が建物や地形で塞がれています');
 }
 rest(actor:WestActorContext):CampaignResult{
  const access=this.access(actor);if(!access.ok)return access;const camp=WEST_POINTS.find(p=>p.id==='west-return-hearth')!;if(!this.state.campUnlocked||distance(actor.position,camp.position)>=3)return fail('点火済みの帰還炉から3m以内で休む');
  if(!this.arena.field.ray({...actor.position,y:actor.position.y+1.52},{x:0,y:1,z:0},3.5))return fail('屋根の下で休息する');const next=this.campaign.snapshot();next.restSeconds=180;if(!this.campaign.restore(next))return fail('休息状態を更新できません');return ok('屋根の下で休息した。180秒、スタミナ回復が上がる');
 }
 /** Restore calls this only after both the expedition ledger and terrain validate.
  * It does not reward anything, recreate mined resources, or close an opened shortcut. */
 geometryConsistent(npcLife:WesternNpcLifeState|null=this.npcLife?.snapshot()??null){
  const field=this.arena.field,c=field.get(-168,16,-116);if(this.state.gateOpen&&c?.object==='west-shortcut-gate')return false;
  if(npcLife!==null&&!validWesternNpcLifeState(npcLife))return false;
  const overlay=field instanceof SparseOverlayField?field.exportOverlay():undefined;
  for(const npc of WEST_SPECIALISTS){const rescued=this.state.claimed.includes(npc.id),actor=npcLife?.actors[npc.id as keyof WesternNpcLifeState['actors']];
   if(npcLife!==null){
    if(rescued!==(actor!==null))return false;
    if(rescued){
     // A tombstone alone is insufficient: a suppressed authored ID can still
     // be recreated by a later layer, including invisible/positive samples.
     if(!overlay?.suppressed.includes(npc.id)||overlay.order.includes(npc.id)||overlay.layers.some(layer=>layer.id===npc.id)||!field.objectSamples(npc.id).next().done)return false;
     continue;
    }
   }
   // Old checkpoints must contain the complete, original or relocated body
   // before conversion. Never repair a forged ledger by creating/removing it.
   const q=rescued?npc.homePosition:npc.position,other=rescued?npc.position:npc.homePosition,size=field.size,body=field.get(Math.floor(q.x/size),Math.floor((q.y+1)/size),Math.floor(q.z/size));
   if(body?.object!==npc.id||body.distance>=0||!exactSpecialistGeometry(field,npc,rescued,overlay))return false;
   if([...field.objectSamples(npc.id)].some(cell=>cell.distance<0&&Math.hypot((cell.x+.5)*size-other.x,(cell.z+.5)*size-other.z)<.6))return false;
  }
  return true;
 }
 reconcileGeometry(npcLife:WesternNpcLifeState|null=this.npcLife?.snapshot()??null){if(!this.enabled||!this.geometryConsistent(npcLife))return false;for(const id of this.state.claimed){const object=this.arena.objects.get(id);if(object)object.open=true;if(WEST_RESOURCES.some(p=>p.id===id))this.arena.field.removeObject(id);}if(this.state.gateOpen){const gate=this.arena.objects.get('west-shortcut-gate');if(gate)gate.open=true;}return true;}

 specialistRows(){return WEST_SPECIALISTS.map(npc=>({id:npc.id,name:npc.name,label:CAMPAIGN_PROFESSIONS[npc.role].label,role:npc.role,position:this.pointPosition(npc.id)!,rescued:this.state.claimed.includes(npc.id),status:this.state.claimed.includes(npc.id)?'rescued' as const:this.accessible&&npc.requiresClaims.every(id=>this.state.claimed.includes(id))&&npc.requiresDefeats.every(id=>this.state.defeated.includes(id))?'ready' as const:'locked' as const,recipes:[...npc.recipes],description:this.state.claimed.includes(npc.id)?npc.dialogue:npc.rescueHint,requirements:[...npc.requiresClaims.map(id=>({id,label:points.find(p=>p.id===id)!.name,done:this.state.claimed.includes(id)})),...npc.requiresDefeats.map(id=>({id,label:WEST_ENCOUNTERS.find(e=>e.id===id)!.name,done:this.state.defeated.includes(id)}))]}));}
 questRows(){return [...WEST_QUESTS.map(q=>({id:q.id,label:q.name,status:this.state.completed.includes(q.id)?'complete':this.accessible&&q.requires.every(id=>id==='region-resinwood'||this.state.completed.includes(id))?'active':'locked',objectives:q.objectives.map(id=>({id,done:this.state.claimed.includes(id)}))})),...WEST_SPECIALIST_QUESTS.map(q=>({id:q.id,label:q.name,status:this.state.completed.includes(q.id)?'complete':this.accessible?'active':'locked',objectives:q.objectives.map(id=>({id,done:this.state.claimed.includes(id)}))})),{id:WEST_SURVEY_QUEST,label:'二つの荷道を踏破する',status:this.state.completed.includes(WEST_SURVEY_QUEST)?'complete':this.accessible?'active':'locked',objectives:routeIds.map(id=>({id,done:routeComplete(this.state,id)}))}];}
}
