import {describe,it,expect} from 'vitest';
import {CampaignSystem,CAMPAIGN_POINTS,validCampaignState,validGearState} from '../../src/prototype/core/campaign';
import {CAMPAIGN_SKILLS,skillPointsSpent} from '../../src/prototype/core/skills';
import {GEMS,type GemId} from '../../src/prototype/core/gems';
import {REGIONAL_POINTS,REGIONAL_ENEMIES,REGIONAL_UPGRADES} from '../../src/prototype/core/regions';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {captureSharedCampaign,applySharedCampaign} from '../../src/prototype/campaign-network-state';
import {validCompanionSnapshot} from '../../src/prototype/core/companion';
const home={x:-3,y:.25,z:4},idle:Controls={x:0,z:0,sprint:false,block:false,water:false};
const point=(id:string)=>({...CAMPAIGN_POINTS.find(point=>point.id===id)!.position});
const regionalPoint=(id:string)=>({...REGIONAL_POINTS.find(point=>point.id===id)!.position});
const stock=()=>({2:0,3:100,4:100,6:100,7:100,10:100});
function rescue(c:CampaignSystem){expect(c.interact('hearth',home).ok).toBe(true);expect(c.interact('artisan',point('artisan')).ok).toBe(true);}
/** Uses finite authored reward transactions, never sets XP, level or point totals. */
function earnAllPoints(c:CampaignSystem){
 rescue(c);for(const id of ['iron-blade','hide-coat','grapple','glider']){expect(c.craft(id,home).ok).toBe(true);expect(c.equip(id).ok).toBe(true);}
 expect(c.interact('mist-cache',point('mist-cache')).ok).toBe(true);expect(c.defeat(1,'warden').ok).toBe(true);expect(c.interact('hearth',home).ok).toBe(true);
 expect(c.interact('ridge-gate',point('ridge-gate')).ok).toBe(true);expect(c.interact('nextcamp',point('nextcamp')).ok).toBe(true);
 for(const id of ['rg-field-cache','rg-field-herb'])expect(c.interactRegional(id,regionalPoint(id)).ok).toBe(true);
 const caches=['rg-wood-cache','rg-fen-cache','rg-mesa-cache','rg-ash-cache','rg-rime-cache','rg-lake-cache'];
 for(const [index,upgrade] of REGIONAL_UPGRADES.entries()){
  expect(c.upgradeRegion(upgrade.id,home).ok).toBe(true);
  for(const enemy of REGIONAL_ENEMIES.filter(enemy=>enemy.region===upgrade.opens&&enemy.boss))expect(c.defeatRegional(enemy.id).ok).toBe(true);
  expect(c.interactRegional(caches[index],regionalPoint(caches[index])).ok).toBe(true);
 }
 expect(c.state.level).toBe(10);expect(c.state.skillPoints).toBe(9);expect(validCampaignState(c.snapshot())).toBe(true);
}
function learnAll(c:CampaignSystem){for(let rank=1;rank<=3;rank++)for(const skill of CAMPAIGN_SKILLS)expect(c.learn(skill.id,rank).ok).toBe(true);}
function forge(){const c=new CampaignSystem(stock());rescue(c);for(const id of ['iron-blade','hide-coat'])expect(c.craft(id,home).ok).toBe(true);return c;}
function craftTier(c:CampaignSystem,tier:1|2|3){for(const gem of GEMS.slice(0,tier))expect(c.craft(gem.id,home).ok).toBe(true);}

describe('bounded skill ranks conserve actually earned level points',()=>{
 it('spends all nine earned points, applies all ranks and refunds exactly once',()=>{
  const c=new CampaignSystem(stock());earnAllPoints(c);const earned=c.state.skillPoints;learnAll(c);
  expect(c.state.skillPoints).toBe(0);expect(skillPointsSpent(c.state)).toBe(earned);expect(c.state.skillRanks).toEqual({vigor:3,endurance:3,attunement:3});
  expect(c.maxHp).toBe(160);expect(c.maxStamina).toBe(160);expect(c.moveMultiplier).toBe(1.24);expect(c.shroudMaximum).toBe(270);
  const capped=c.snapshot();for(const skill of CAMPAIGN_SKILLS)expect(c.learn(skill.id).ok).toBe(false);expect(c.snapshot()).toEqual(capped);
  c.state.shroudSeconds=270;expect(c.resetSkills()).toMatchObject({ok:true,message:expect.stringContaining('9ポイント')});expect(c.state.skillPoints).toBe(9);expect(c.maxHp).toBe(100);expect(c.maxStamina).toBe(100);expect(c.moveMultiplier).toBe(1);expect(c.state.shroudSeconds).toBe(180);
  const reset=c.snapshot();expect(c.resetSkills().ok).toBe(false);expect(c.snapshot()).toEqual(reset);learnAll(c);expect(validCampaignState(c.snapshot())).toBe(true);
 });
 it('rejects insufficient points, skipped ranks, level gates, unmet matching-rank prerequisites and stale requests without changes',()=>{
  const c=new CampaignSystem(stock());const initial=c.snapshot();expect(c.learn('vigor').ok).toBe(false);expect(c.snapshot()).toEqual(initial);rescue(c);expect(c.state.level).toBe(2);expect(c.learn('vigor',2).ok).toBe(false);expect(c.learn('attunement',1).ok).toBe(false);expect(c.learn('endurance',1).ok).toBe(true);
  const before=c.snapshot();expect(c.learn('vigor',1).ok).toBe(false);expect(c.learn('endurance',2).message).toContain('レベル4');expect(c.learn('endurance',1).ok).toBe(false);expect(c.snapshot()).toEqual(before);
  const high=new CampaignSystem(stock());earnAllPoints(high);expect(high.learn('endurance',1).ok).toBe(true);expect(high.learn('attunement',1).ok).toBe(true);expect(high.learn('attunement',2).message).toContain('旅人の呼吸 ランク2');
  expect(high.learn('endurance',2).ok).toBe(true);expect(high.learn('attunement',2).ok).toBe(true);expect(high.learn('vigor',3).ok).toBe(false);
 });
 it('normalizes legacy skills to rank one and preserves the old spent balance and exact respec refund',()=>{
  const c=new CampaignSystem(stock());earnAllPoints(c);for(const skill of CAMPAIGN_SKILLS)c.learn(skill.id,1);
  const legacy=c.snapshot();delete legacy.skillRanks;const restored=new CampaignSystem(stock()),items=restored.state.items;
  expect(restored.restore(legacy)).toBe(true);expect(restored.state.items).toBe(items);expect(restored.state.skillRanks).toEqual({vigor:1,endurance:1,attunement:1});expect(restored.state.skillPoints).toBe(6);expect(restored.maxHp).toBe(120);expect(restored.maxStamina).toBe(120);expect(restored.shroudMaximum).toBe(210);
  expect(restored.resetSkills().ok).toBe(true);expect(restored.state.skillPoints).toBe(9);expect(restored.resetSkills().ok).toBe(false);
 });
 it('atomically rejects malformed, unknown, over-budget and mismatched rank maps',()=>{
  const c=new CampaignSystem(stock());earnAllPoints(c);c.learn('vigor');const valid=c.snapshot();
  for(const skillRanks of [null,[],{},{vigor:0},{vigor:-1},{vigor:4},{vigor:1.5},{vigor:NaN},{vigor:Infinity},{vigor:undefined},{vigor:'1'},{vigor:2},{unknown:1},{vigor:1,endurance:1}]){expect(c.restore({...valid,skillRanks}),JSON.stringify(skillRanks)).toBe(false);expect(c.snapshot()).toEqual(valid);}
  expect(c.restore({...valid,skills:['endurance','attunement'],skillRanks:{endurance:1,attunement:2},skillPoints:6})).toBe(false);
  expect(c.restore({...valid,xp:80,level:2,skillRanks:{vigor:2},skillPoints:0})).toBe(false);
 });
 it('uses explicit rank requests in the production command path and explains real costs, prerequisites and caps',()=>{
  const sim=new CoreSimulation(true,false,true);Object.assign(sim.survival.inventory,stock());earnAllPoints(sim.campaign);
  expect(executeGameCommand(sim,{type:'learn',id:'vigor:1'}).ok).toBe(true);const after=sim.campaign.snapshot();expect(executeGameCommand(sim,{type:'learn',id:'vigor:1'}).ok).toBe(false);expect(sim.campaign.snapshot()).toEqual(after);
  for(const id of ['vigor:0','vigor:4','vigor:NaN','vigor:2:extra','vigor:02'])expect(executeGameCommand(sim,{type:'learn',id}).ok).toBe(false);
  let rows=campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[]).skills;expect(rows.find(row=>row.id==='vigor:2')).toMatchObject({available:true,label:expect.stringContaining('1/3'),detail:expect.stringContaining('1ポイント・レベル4')});expect(rows.find(row=>row.id==='attunement:1')).toMatchObject({available:false,reason:expect.stringContaining('前提')});
  for(const rank of [2,3])expect(executeGameCommand(sim,{type:'learn',id:`vigor:${rank}`}).ok).toBe(true);rows=campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[]).skills;expect(rows.find(row=>row.id==='vigor:3')).toMatchObject({available:false,completed:true,detail:expect.stringContaining('最大HP +60')});
 });
});

describe('finite three-tier gems and capacity-safe gear transactions',()=>{
 it('uses actual forge materials and the previous stone, gates both upgrades, and stops after tier three',()=>{
  const c=forge(),before={...c.materials};expect(c.craft('ember-gem-2',home).ok).toBe(false);expect(c.craft('ember-gem-3',home).ok).toBe(false);expect(c.materials).toEqual(before);
  expect(c.craft('ember-gem',home).ok).toBe(true);expect(c.materials[3]).toBe(before[3]-4);expect(c.materials[6]).toBe(before[6]-3);c.state.flameTier=2;
  expect(c.craft('ember-gem-2',home).ok).toBe(true);expect(c.state.items['ember-gem']).toBe(0);expect(c.state.items['ember-gem-2']).toBe(1);expect(c.materials[3]).toBe(before[3]-10);expect(c.materials[6]).toBe(before[6]-7);
  const tierTwo=c.snapshot(),materials={...c.materials};expect(c.craft('ember-gem-2',home).ok).toBe(false);expect(c.craft('ember-gem-3',home).ok).toBe(false);expect(c.snapshot()).toEqual(tierTwo);expect(c.materials).toEqual(materials);
  c.state.gateOpen=true;c.state.campUnlocked=true;expect(c.craft('ember-gem-3',home).ok).toBe(true);expect(c.state.items['ember-gem-2']).toBe(0);expect(c.state.items['ember-gem-3']).toBe(1);expect(c.materials[3]).toBe(before[3]-19);expect(c.materials[6]).toBe(before[6]-13);
  const max=c.snapshot(),paid={...c.materials};for(const id of ['ember-gem-3','ember-gem-4'])expect(c.craft(id,home).ok).toBe(false);expect(c.snapshot()).toEqual(max);expect(c.materials).toEqual(paid);expect(validCampaignState(max)).toBe(true);
 });
 it('atomically refuses missing finite materials, missing source gems, full output stacks and remote forges',()=>{
  const c=forge();c.state.flameTier=2;c.craft('ember-gem',home);c.materials[6]=3;const before=c.snapshot(),materials={...c.materials};expect(c.craft('ember-gem-2',home).ok).toBe(false);expect(c.craft('ember-gem',point('artisan')).ok).toBe(false);expect(c.snapshot()).toEqual(before);expect(c.materials).toEqual(materials);
  c.materials[6]=100;c.state.items['ember-gem-2']=20;const full=c.snapshot(),fullMaterials={...c.materials};expect(c.craft('ember-gem-2',home).ok).toBe(false);expect(c.snapshot()).toEqual(full);expect(c.materials).toEqual(fullMaterials);
  c.materials[6]=1000000;const salvageBlocked=c.snapshot(),salvageMaterials={...c.materials};expect(c.salvage('iron-blade',true).ok).toBe(false);expect(c.snapshot()).toEqual(salvageBlocked);expect(c.materials).toEqual(salvageMaterials);
 });
 it.each(GEMS)('$id survives socket, replacement, removal and salvage without duplicates or loss',gem=>{
  const c=forge();c.state.flameTier=2;c.state.gateOpen=true;c.state.campUnlocked=true;craftTier(c,gem.tier);c.equip('iron-blade');
  expect(c.socket('iron-blade',gem.id,home).ok).toBe(true);expect(c.attackMultiplier).toBeCloseTo(1.3*(1+gem.power));expect(c.state.items[gem.id]).toBe(0);
  const attached=c.snapshot();expect(c.socket('iron-blade',gem.id,home).ok).toBe(false);expect(c.snapshot()).toEqual(attached);
  c.state.items[gem.id]=20;if(gem.id!=='ember-gem')c.craft('ember-gem',home);c.unequip('weapon');const full=c.snapshot();for(const next of [null,'ember-gem'] as const){expect(c.socket('iron-blade',next,home).ok).toBe(false);expect(c.snapshot()).toEqual(full);}expect(c.salvage('iron-blade',true).ok).toBe(false);expect(c.snapshot()).toEqual(full);
  c.state.items[gem.id]=19;expect(c.socket('iron-blade',null,home).ok).toBe(true);expect(c.state.items[gem.id]).toBe(20);expect(c.socket('iron-blade',null,home).ok).toBe(false);
  expect(c.socket('iron-blade',gem.id,home).ok).toBe(true);if(gem.id!=='ember-gem'){expect(c.socket('iron-blade','ember-gem',home).ok).toBe(true);expect(c.state.items[gem.id]).toBe(20);expect(c.gearInfo('iron-blade').socket).toBe('ember-gem');}
  const socket=c.gearInfo('iron-blade').socket!,count=c.state.items[socket];expect(c.salvage('iron-blade',true).ok).toBe(true);expect(c.state.items[socket]).toBe(count+1);const salvaged=c.snapshot();expect(c.salvage('iron-blade',true).ok).toBe(false);expect(c.snapshot()).toEqual(salvaged);expect(validCampaignState(salvaged)).toBe(true);
 });
 it('supports weapon/tool and armor/shield effects, halves them when broken, and rejects non-slots and malformed gear',()=>{
  const c=forge();c.state.flameTier=2;c.state.gateOpen=true;c.state.campUnlocked=true;for(const id of ['hide-coat','copper-shield','wood-axe']){if(!c.has(id))c.craft(id,home);c.equip(id);craftTier(c,3);expect(c.socket(id,'ember-gem-3',home).ok).toBe(true);}
  expect(c.damageReduction).toBeCloseTo(.4);expect(c.toolEfficiency).toBe(1.24);c.consumeArmorDurability(100);c.consumeToolDurability(100);expect(c.damageReduction).toBeCloseTo(.2);expect(c.toolEfficiency).toBe(.62);
  for(const id of ['grapple','glider','traveler-ring','build-hammer']){c.craft(id,home);expect(c.socket(id,'ember-gem',home).ok).toBe(false);}
  const gear=c.gearInfo('hide-coat');expect(validGearState('hide-coat',gear)).toBe(true);for(const change of [{socket:'ember-gem-4'},{socket:1},{upgrade:4},{durability:NaN},{durability:101},{extra:1}])expect(validGearState('hide-coat',{...gear,...change})).toBe(false);expect(validGearState('build-hammer',{...gear,durability:100})).toBe(false);
 });
 it('exposes each upgrade cost and truthful socket availability, then guards shared mutations during attacks',()=>{
  const sim=new CoreSimulation(true,false,true),c=sim.campaign;Object.assign(sim.survival.inventory,stock());rescue(c);c.craft('iron-blade',home);c.craft('ember-gem',home);sim.player.position={...home};
  let snapshot=campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[]);expect(snapshot.recipes.find(row=>row.id==='ember-gem-2')).toMatchObject({available:false,reason:expect.stringContaining('段階2'),craft:{costs:expect.arrayContaining([{label:'灯火の石',perCraft:1,owned:1}])}});expect(snapshot.equipment.find(row=>row.id==='socket:iron-blade:ember-gem')).toMatchObject({available:true});
  const command={type:'gear' as const,id:'socket:iron-blade:ember-gem'};sim.enableCompanion();sim.companion!.phase='windup';expect(executeGameCommand(sim,command).ok).toBe(false);sim.companion!.phase='idle';expect(executeGameCommand(sim,command).ok).toBe(true);expect(executeGameCommand(sim,command).ok).toBe(false);
  sim.player.position=point('artisan');snapshot=campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[]);expect(snapshot.equipment.find(row=>row.id==='unsocket:iron-blade')).toMatchObject({available:false,reason:expect.stringContaining('3m')});
 });
});

describe('real combat and save/network coherence',()=>{
 function combat(gem:GemId|null,incoming=false){
  const sim=new CoreSimulation(true,false,true),c=sim.campaign;Object.assign(sim.survival.inventory,stock());rescue(c);c.state.flameTier=2;c.state.gateOpen=true;c.state.campUnlocked=true;
  const id=incoming?'hide-coat':'iron-blade';c.craft(id,home);c.equip(id);if(gem){craftTier(c,GEMS.find(g=>g.id===gem)!.tier);c.socket(id,gem,home);}
  for(const enemy of sim.enemies){enemy.hp=0;enemy.phase='dead';}const enemy=sim.enemies[0];enemy.position={x:0,y:.25,z:4.8};enemy.hp=100;enemy.phase=incoming?'windup':'stagger';enemy.yaw=Math.PI;enemy.time=0;
  if(!incoming)sim.action('attack',idle);for(let frame=0;frame<(incoming?75:55);frame++)sim.tick(1/60,idle);return {sim,enemy};
 }
 // Eight independent simulation fixtures; the explicit timeout bounds liveness only.
 it('higher gem tiers increase actual SDF sword damage and reduce actual enemy melee damage',()=>{
  const outgoing=[null,...GEMS.map(gem=>gem.id)].map(gem=>combat(gem));for(let i=1;i<outgoing.length;i++)expect(outgoing[i].enemy.hp).toBeLessThan(outgoing[i-1].enemy.hp);expect(outgoing[0].enemy.hp).toBeLessThan(100);
  const incoming=[null,...GEMS.map(gem=>gem.id)].map(gem=>combat(gem,true));expect(incoming[0].sim.player.hp).toBeLessThan(100);for(let i=1;i<incoming.length;i++)expect(incoming[i].sim.player.hp).toBeGreaterThan(incoming[i-1].sim.player.hp);
 },30000);
 it('round-trips ranks, tier-three gems and expanded companion shroud timers through disk and shared snapshots atomically',()=>{
  const host=new CoreSimulation(true,false,true),c=host.campaign;Object.assign(host.survival.inventory,stock());earnAllPoints(c);learnAll(c);craftTier(c,3);c.socket('iron-blade','ember-gem-3',home);c.state.shroudSeconds=270;host.enableCompanion();expect(validCompanionSnapshot(host.companionSnapshot())).toBe(true);
  const disk=captureCampaign(host,defaultSettings()),target=new CoreSimulation(true,false,true),itemLedger=target.campaign.state.items;expect(restoreCampaignInto(target,disk)).not.toBeNull();expect(target.campaign.state.items).toBe(itemLedger);expect(target.campaign.snapshot()).toEqual(c.snapshot());expect(target.companionSnapshot()?.aux.shroudSeconds).toBe(270);expect(target.campaign.attackMultiplier).toBe(c.attackMultiplier);
  const shared=captureSharedCampaign(host,defaultSettings()),guest=new CoreSimulation(true,false,true);expect(applySharedCampaign(guest,shared)).toMatchObject({ok:true});expect(guest.campaign.snapshot()).toEqual(c.snapshot());
  const prior=guest.campaign.snapshot();for(const mutate of [(bad:typeof shared)=>{bad.campaign.skillRanks!.vigor=4;},(bad:typeof shared)=>{bad.campaign.gearState['iron-blade'].socket='forged' as GemId;}]){const bad=structuredClone(shared);mutate(bad);expect(applySharedCampaign(guest,bad)).toEqual({ok:false});expect(guest.campaign.snapshot()).toEqual(prior);}
 });
});
