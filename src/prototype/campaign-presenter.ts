import {nearShroudBoundary} from './core/shroud-zones';
import {inventoryViewModel,equipmentComparison,equipmentDetails,equipmentBaseDescription} from './inventory-presenter';
import {collectibleDisplayRows} from './collectible-display-presenter';
import {skillRows,gemSocketRows,skillResetRow} from './progression-presenter';
import {watermillRows} from './watermill-presenter';
import {campaignCodex} from './campaign-codex';

import {GEAR_SLOTS,SLOT_LABELS} from './core/equipment';
import {WEST_POINTS,WEST_POIS} from './core/expedition-west';
import {campaignMapData,type CampaignMapData} from './campaign-map';
import {homesteadRows} from './homestead-presenter';
import {hearthRows} from './hearth-presenter';
import type {CoreSimulation} from './core/simulation';
import {CAMPAIGN_ITEMS,CAMPAIGN_RECIPES,CAMPAIGN_POINTS,CAMPAIGN_MATERIALS,isShrouded,type CampaignSystem} from './core/campaign';
import type {CampaignUISnapshot,CampaignRow} from './campaign-ui';
import {REGIONAL_POINTS,REGIONS,coldRegionWarning} from './core/regions';
import type {CampaignSettings} from './campaign-session';
const mapCache=new WeakMap<CoreSimulation,{key:string;value:CampaignMapData}>();
/** Derive quantity limits from the same core checks used at commit time. */
export function campaignRecipeRows(c:CampaignSystem,position:{x:number;y:number;z:number},includeCraftDetails=true):CampaignRow[]{
 return CAMPAIGN_RECIPES.map(r=>{
  if(!includeCraftDetails){const status=c.recipeStatus(r.id,position);return {id:r.id,label:r.label,detail:r.description+(CAMPAIGN_ITEMS[r.output].progression?' / '+equipmentBaseDescription(r.output):''),reason:status.message,available:status.ok,action:'craft'};}
  const statuses=Array.from({length:20},(_,i)=>c.recipeStatus(r.id,position,i+1));
  const status=statuses[0],output=CAMPAIGN_ITEMS[r.output];
  return {id:r.id,label:r.label,detail:r.description+(CAMPAIGN_ITEMS[r.output].progression?' / '+equipmentBaseDescription(r.output):''),reason:status.message,available:status.ok,action:'craft',craft:{
   maxCount:statuses.reduce((max,result,index)=>result.ok?index+1:max,0),statuses,
   output:{label:output.label,perCraft:r.outputCount??1,owned:c.state.items[r.output]??0,stackLimit:output.stackLimit},
   costs:[...Object.entries(r.cost).map(([id,count])=>({label:CAMPAIGN_MATERIALS[Number(id)]?.label??id,perCraft:count,owned:c.materials[Number(id)]??0})),
    ...Object.entries(r.itemCost??{}).map(([id,count])=>({label:CAMPAIGN_ITEMS[id]?.label??id,perCraft:count,owned:c.state.items[id]??0}))]}};
 });
}
export function campaignSnapshot(sim:CoreSimulation,settings:CampaignSettings,save:CampaignUISnapshot['save'],bindings:CampaignUISnapshot['bindings'],includeCraftDetails=true):CampaignUISnapshot{
 const c=sim.campaign,s=c.state,west=sim.western?.accessible?sim.western.snapshot():null;
 const mapKey=JSON.stringify([s.discoveredRegions,s.unlockedRegions,sim.westernContent,west?.routes,west?.claimed,west?.gateOpen]);
 let cached=mapCache.get(sim);if(!cached||cached.key!==mapKey){cached={key:mapKey,value:campaignMapData(s.discoveredRegions,s.unlockedRegions,sim.westernContent,west)};mapCache.set(sim,cached);}
 const map=cached.value,inventory=inventoryViewModel(sim);
 return {inventory,codex:campaignCodex(c),homestead:[...hearthRows(sim),...(s.artisanRescued?[{id:'nagi-life',label:'鍛冶師ナギ · '+sim.npc.label,detail:'8〜12時・14〜18時は道具の手入れ、朝昼夕は交流、22〜6時は休息。屋根付きの寝床と空いた通路を用意する。制作はいつでも炉で利用できる。',completed:true}]:[]),...watermillRows(sim.watermill,sim.watermillContext),...collectibleDisplayRows(sim.display,sim.displayContext),...homesteadRows(sim.home,sim.homeContext,{context:id=>sim.furnitureContext(id),blocked:id=>sim.furnitureBlocked(id)},inventory.revision),...(sim.western?.accessible?sim.western.specialistRows().map(npc=>({id:npc.id,label:npc.name+' · '+npc.label,detail:npc.description+' · '+npc.requirements.map(r=>(r.done?'✓ ':'□ ')+r.label).join(' / '),completed:npc.rescued,reason:npc.rescued?(sim.westNpcs.get(npc.id)?.label??'集落に滞在中')+' · 世界で照準を合わせて会話':npc.status==='ready'?'現地で話しかけると救出できる':'救出条件を整える'})):[])],materials:Object.values(CAMPAIGN_MATERIALS).map(m=>({id:String(m.id),label:m.icon+' '+m.label,count:c.materials[m.id]??0,detail:m.description+' / '+m.source})),
 items:Object.entries(s.items).filter(([,n])=>n>0).map(([id,count])=>{const item=CAMPAIGN_ITEMS[id];return {id,label:item.icon+' '+item.label,count,detail:item.description+' / '+item.source+(item.slot?' / '+equipmentComparison(c,id):''),action:id==='fishing-rod'?'gear':item.slot?'equip':item.category==='food'||item.category==='medicine'?'consume':undefined} as CampaignRow;}),
 recipes:campaignRecipeRows(c,sim.player.position,includeCraftDetails),
 quests:[...c.questRows(),sim.dungeon.questRow(),...c.regionQuestRows().map(q=>({...q,side:false})),...(sim.western?.questRows().map(q=>({...q,side:true,detail:q.objectives.map(o=>(o.done?'✓ ':'')+(WEST_POINTS.find(p=>p.id===o.id)?.name??o.id)).join(' / ')}))??[])].map(q=>({id:q.id,label:(q.side?'副依頼 · ':'主目的 · ')+q.label,detail:q.detail,completed:q.status==='complete',reason:q.id==='echo-vault-v1'&&!sim.dungeon.enabled?'追加条件未達 · 詳細を確認':q.status==='locked'?'前の主目的から進める':q.status==='active'?'進行中':'完了'})),
 map,points:[
  {id:'rescue',label:'安全帰還（素材25%を残す）',detail:'地形に閉じ込められた場合の救済。装備と重要品は保持',action:'gear'},
  {id:'player',label:'現在地',position:sim.player.position,mapIcon:'▲'},
  ...CAMPAIGN_POINTS.filter(p=>s.discovered.includes(p.id)).map(p=>({id:p.id,label:p.label,detail:p.description,position:p.id==='artisan'&&sim.npc.state?{...sim.npc.position}:p.position,mapIcon:p.kind==='base'?'⌂':p.kind==='npc'?'人':'●',action:p.kind==='base'?'travel' as const:undefined,available:c.canTravel(p.id).ok,reason:p.kind==='base'?c.canTravel(p.id).message:undefined})),
  ...REGIONAL_POINTS.filter(p=>map.areas.some(area=>area.id===p.region)).map(p=>({id:p.id,label:p.name,detail:p.lore??'地域の探索地点',position:p.position,mapIcon:p.kind==='hearth'?'⌂':'●',action:p.kind==='hearth'?'travel' as const:undefined,available:c.canTravel(p.id).ok,reason:p.kind==='hearth'?c.canTravel(p.id).message:undefined})),
  ...(west?[
   ...WEST_POIS.filter(p=>map.westernPois.includes(p.id)).map(p=>({id:p.id,label:p.name,detail:'探索した道から記録した場所。入口や段差は現地で確認する。',position:p.position})),
   ...WEST_POINTS.filter(p=>west.claimed.includes(p.id)).map(p=>({id:p.id,label:p.name,position:sim.western!.pointPosition(p.id)??p.position,mapIcon:p.kind==='hearth'?'⌂':p.kind==='artisan'?'人':'●',detail:p.kind==='artisan'?'救出済み · '+(sim.westNpcs.get(p.id)?.label??'木霊の荷場で生活'):undefined,action:p.kind==='hearth'?'travel' as const:undefined,available:west.campUnlocked})),
   ...(west.campUnlocked?[{id:'rest:west-return-hearth',label:'木霊の帰還炉で休息',detail:'炉から3m以内の屋根の下で休む',action:'gear' as const}]:[])
  ]:[]),
  ...settings.pins.map(p=>({id:p.id,label:'手動ピン',position:p,mapIcon:'◆',action:'remove-pin' as const}))],
 skills:skillRows(c),
 equipment:[{id:'equipment-progression-guide',label:'装備Lv・品質・強化・追加効果',detail:'装備Lvは同じ型の基礎性能の段階で、人物Lvの装備制限ではありません。品質は制作する品ごとに固定。基礎値は装備Lvと品質を含み、強化とジェムは別に加算します。武器の型・防具の部位が違うときは比較欄の実数値を確認してください。'},...Object.entries(s.equipment).map(([slot,id])=>({id:'unequip:'+slot,label:SLOT_LABELS[slot as keyof typeof SLOT_LABELS],detail:id?CAMPAIGN_ITEMS[id].label+' · '+CAMPAIGN_ITEMS[id].description+(equipmentDetails(c,id)?' / '+equipmentDetails(c,id):''):slot==='shield'?'旅の木盾（初期装備）':slot==='tool'?'初期の鑿（2で選択）':'未装備',action:id?'gear' as const:undefined})),...Object.entries(s.items).filter(([id,count])=>count>0&&GEAR_SLOTS.includes(CAMPAIGN_ITEMS[id].slot!)).flatMap(([id])=>{const gear=c.gearInfo(id),repair=c.repairStatus(id,sim.player.position),upgrade=c.upgradeStatus(id,sim.player.position),salvage=c.salvagePreview(id);return [{id:'repair:'+id,label:CAMPAIGN_ITEMS[id].label+' · 耐久 '+gear.durability+'/'+gear.maxDurability,detail:repair.message,available:repair.ok,action:'gear' as const},{id:'upgrade:'+id,label:'強化 +'+gear.upgrade+' → '+(gear.upgrade+1),detail:upgrade.message,available:upgrade.ok,action:'gear' as const},...gemSocketRows(c,id,sim.player.position),{id:'salvage:'+id,label:CAMPAIGN_ITEMS[id].label+'を解体',detail:salvage.message+' '+Object.entries(salvage.materials??{}).map(([key,n])=>CAMPAIGN_MATERIALS[Number(key)].label+' '+n).join(' / '),available:salvage.ok,action:'gear' as const}];}),skillResetRow(c)],
 stats:{coldWarning:coldRegionWarning(sim.player.position),mistWarning:nearShroudBoundary(sim.player.position)?(sim.player.position.z<-18&&sim.player.position.z>-26&&s.flameTier<2?'濃い霧 · 炉を強化してから進む':'霧の境界 · 滞在時間に注意'):undefined,burning:sim.environment.burning,wet:sim.environment.wet,shock:sim.environment.shock,weather:sim.weather.label.split(' · ')[0],level:s.level,xp:s.xp,skillPoints:s.skillPoints,region:REGIONS.find(r=>s.discoveredRegions.includes(r.id)&&sim.player.position.x>=r.bounds.minX&&sim.player.position.x<=r.bounds.maxX&&sim.player.position.z>=r.bounds.minZ&&sim.player.position.z<=r.bounds.maxZ)?.name??(sim.player.position.z<-20?'銅風の尾根':isShrouded(sim.player.position)?'霞の高台':'火守りの谷'),objective:c.objective().label,shroud:isShrouded(sim.player.position)?s.shroudSeconds:undefined,food:s.foodSeconds,rest:s.restSeconds,oxygen:sim.swimming?sim.oxygen:undefined,cold:sim.cold>0?sim.cold:undefined,warmth:sim.warmth,focus:sim.focus.value},settings,save,bindings};
}
