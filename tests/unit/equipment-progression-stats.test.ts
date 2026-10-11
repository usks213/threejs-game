import {describe,it,expect} from 'vitest';
import {CampaignSystem,CAMPAIGN_ITEMS,validCampaignState} from '../../src/prototype/core/campaign';
import {ARMOR_STATS,GEAR_SLOTS} from '../../src/prototype/core/equipment';
import {EQUIPMENT_PROFILES,equipmentBaseStats,itemBaseStats} from '../../src/prototype/core/equipment-stats';
import {equipmentComparison,equipmentDetails} from '../../src/prototype/inventory-presenter';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {defaultSettings} from '../../src/prototype/campaign-session';
const home={x:-3,y:.25,z:4};
const prepared=()=>{const c=new CampaignSystem({3:100,4:100,6:100,7:100,10:100});c.state.flameTier=1;c.state.artisanRescued=true;return c;};

describe('canonical equipment base levels and quality',()=>{
 it('defines a deterministic profile for every upgradeable gear item',()=>{
  const gear=Object.values(CAMPAIGN_ITEMS).filter(item=>GEAR_SLOTS.includes(item.slot!));
  expect(gear.map(i=>i.id).sort()).toEqual(Object.keys(EQUIPMENT_PROFILES).sort());
  for(const item of gear)expect(item.progression).toBe(EQUIPMENT_PROFILES[item.id]);
 });
 it.each([
  ['iron-blade',2,'refined',1.3,1],['bow',1,'standard',1,1],['staff',1,'refined',1,1.2],
  ['resin-staff',3,'refined',1,1.4],['greatsword',1,'standard',1,1],['dagger',1,'standard',1,1],
 ] as const)('%s preserves exact pre-existing attack and spell multipliers', (id,level,quality,attack,spell)=>{
  const c=prepared();c.state.items[id]=1;c.state.equipment.weapon=id;
  expect(CAMPAIGN_ITEMS[id].progression).toMatchObject({level,quality});
  expect(c.attackMultiplier).toBe(attack);expect(c.spellMultiplier).toBe(spell);
 });
 it.each([
  ['hide-coat',.2,10,1,.5],['copper-mail',.3,6,.94,1],['cloth-hood',.08,10,1,1],
  ['copper-helm',.12,6,.98,1],['cloth-leggings',.1,10,1,.85],['copper-greaves',.15,6,.97,1],['copper-shield',0,6,1,1],
 ] as const)('%s preserves exact defense, material and penalties',(id,reduction,material,speed,cold)=>{
  const c=prepared();c.state.items[id]=1;c.state.equipment[CAMPAIGN_ITEMS[id].slot!]=id;
  expect(ARMOR_STATS[id]).toEqual({reduction,material,speed,cold});expect(itemBaseStats(id).reduction).toBe(reduction);
  expect(c.damageReduction).toBe(reduction);expect(c.armorMaterial).toBe(material);expect(c.moveMultiplier).toBe(speed);expect(c.coldMultiplier).toBe(cold);
 });
 it('uses each level and quality independently in actual canonical base-stat calculation',()=>{
  const blade=EQUIPMENT_PROFILES['iron-blade'];expect(equipmentBaseStats({...blade,quality:'standard'}).attackMultiplier).toBe(1.1);expect(equipmentBaseStats({...blade,level:1}).attackMultiplier).toBe(1.2);
  const mail=EQUIPMENT_PROFILES['copper-mail'];expect(equipmentBaseStats({...mail,quality:'standard'}).reduction).toBe(.22);expect(equipmentBaseStats({...mail,level:1}).reduction).toBe(.28);
  const staff=EQUIPMENT_PROFILES['resin-staff'];expect(equipmentBaseStats({...staff,quality:'standard'}).spellMultiplier).toBe(1.2);expect(equipmentBaseStats({...staff,level:1}).spellMultiplier).toBe(1.2);
 });
 it('keeps base, upgrades, gems and wear separate through existing four-field saves',()=>{
  const c=prepared();c.craft('iron-blade',home);c.equip('iron-blade');c.upgrade('iron-blade',home);c.craft('ember-gem',home);c.socket('iron-blade','ember-gem',home);
  expect(c.attackMultiplier).toBeCloseTo(1.3*(1+.1+.12));expect(itemBaseStats('iron-blade').attackMultiplier).toBe(1.3);
  const details=equipmentDetails(c,'iron-blade');for(const text of ['装備Lv.2','品質 精製','基礎通常攻撃 42','強化 +1（威力 +10%）','追加効果 灯火の石（威力 +12%）'])expect(details).toContain(text);
  c.consumeAttackDurability(100);expect(c.attackMultiplier).toBeCloseTo(1.3*1.22*.5);
  const saved=c.snapshot();expect(Object.keys(saved.gearState['iron-blade']).sort()).toEqual(['durability','maxDurability','socket','upgrade']);expect(validCampaignState(saved)).toBe(true);
  const restored=prepared();expect(restored.restore(saved)).toBe(true);expect(restored.attackMultiplier).toBe(c.attackMultiplier);expect(equipmentDetails(restored,'iron-blade')).toContain('破損');
 });
 it('shows real armor changes with separate refinement, upgrade and additional effect contributions',()=>{
  const c=prepared();for(const id of ['hide-coat','copper-mail'])c.craft(id,home);c.equip('hide-coat');c.upgrade('copper-mail',home);c.craft('ember-gem',home);c.socket('copper-mail','ember-gem',home);
  const before=c.snapshot(),text=equipmentComparison(c,'copper-mail');expect(text).toContain('総物理軽減 20→38%');expect(text).toContain('基礎物理軽減 30%');expect(text).toContain('強化 +1（物理軽減 +3ポイント）');expect(text).toContain('追加効果 灯火の石（物理軽減 +5ポイント）');expect(c.snapshot()).toEqual(before);
 });
 it('exposes the canonical profile in recipes, held items, and equipped rows',()=>{
  const s=new CoreSimulation(true,false,true);Object.assign(s.survival.inventory,{3:20,4:20,6:20});s.campaign.state.flameTier=1;s.campaign.state.artisanRescued=true;s.campaign.craft('iron-blade',home);s.campaign.equip('iron-blade');
  const ui=campaignSnapshot(s,defaultSettings(),{available:false,label:'',status:''},[],false);
  for(const row of [ui.recipes.find(r=>r.id==='iron-blade'),ui.items.find(r=>r.id==='iron-blade'),ui.equipment.find(r=>r.id==='unequip:weapon')]){expect(row?.detail).toContain('装備Lv.2');expect(row?.detail).toContain('品質 精製');expect(row?.detail).toContain('基礎通常攻撃 42');}
 });
});
