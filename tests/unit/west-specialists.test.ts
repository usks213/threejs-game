import {describe,it,expect} from 'vitest';
import {CampaignSystem,CAMPAIGN_RECIPES,validCampaignState} from '../../src/prototype/core/campaign';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
import {createWesternSamplePrototype} from '../../src/prototype/core/western-sample-provider';
import {createCampaignSamplePrototype,CAMPAIGN_SAMPLE_MANIFEST} from '../../src/prototype/core/campaign-sample-provider';
import {WEST_SPECIALISTS,WEST_EXPEDITION_MANIFEST,setWestSpecialistLocation} from '../../src/prototype/core/expedition-west';
import {WestExpeditionSystem,WEST_RUNTIME_ENEMIES,WEST_PROTECTED_OBJECT_IDS,validWestExpeditionState,type WestActorContext} from '../../src/prototype/core/expedition-west-integration';

const hearth={x:-3,y:.25,z:4};
function setup(){
 const prototype=createWesternSamplePrototype(16),field=new SparseOverlayField(prototype.provider),arena={field,objects:prototype.objects},campaign=new CampaignSystem({2:100,3:100,4:100,6:100,7:100,10:100});
 Object.assign(campaign.state,{flameTier:2,artisanRescued:true,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});
 const west=new WestExpeditionSystem(campaign,arena,WEST_EXPEDITION_MANIFEST);return {field,arena,campaign,west};
}
const actor=(west:WestExpeditionSystem,id:string,dx=id==='west-alchemist'?.9:0,dz=id==='west-alchemist'?0:1.15):WestActorContext=>{const p=west.pointPosition(id)!;return {authority:'host',alive:true,position:{x:p.x+dx,y:p.y+.1,z:p.z+dz}};};
function claim(west:WestExpeditionSystem,id:string){const a=['west-mine-switch','west-alchemist'].includes(id)?actor(west,id,.9,0):actor(west,id);const result=west.interact(id,a);expect(result.ok,result.message+' / '+id).toBe(true);}
function defeat(west:WestExpeditionSystem,id:string){const enemy=WEST_RUNTIME_ENEMIES.find(e=>e.key===id)!;expect(west.defeat(id,{slot:enemy.slot,hp:0},actor(west,'west-return-hearth')).ok).toBe(true);}
function prepareCarpenter(west:WestExpeditionSystem){defeat(west,'west-axeguard');claim(west,'west-hamlet-cache');claim(west,'west-return-hearth');}
function prepareAlchemist(west:WestExpeditionSystem){claim(west,'west-return-hearth');defeat(west,'west-pitguard');defeat(west,'west-orewatch');claim(west,'west-mine-switch');}

describe('western rescued specialists and canonical profession crafting',()=>{
 it('adds two protected solid identities without changing the base v3 manifest or actor roster',()=>{
  const {field,arena,west}=setup(),old=createCampaignSamplePrototype();expect(old.provider.manifestId).toBe(CAMPAIGN_SAMPLE_MANIFEST);expect(CAMPAIGN_SAMPLE_MANIFEST).toBe('campaign-samples-v1/c1602605');
  expect(WEST_RUNTIME_ENEMIES.map(e=>e.slot)).toEqual([18,19,20,21]);expect(WEST_SPECIALISTS).toHaveLength(2);expect(west.geometryConsistent()).toBe(true);
  for(const npc of WEST_SPECIALISTS){expect(old.objects.has(npc.id)).toBe(false);expect(arena.objects.get(npc.id)?.kind).toBe('artisan');expect(WEST_PROTECTED_OBJECT_IDS).toContain(npc.id);expect([...field.objectSamples(npc.id)].some(c=>c.distance<0)).toBe(true);expect(west.specialistRows().find(r=>r.id===npc.id)).toMatchObject({rescued:false,status:'locked',role:npc.role});}
 });
 it('requires actual rescue conditions, a living host, range and unoccluded SDF interaction',()=>{
  const {west,campaign,field}=setup(),npc=WEST_SPECIALISTS[0],before=campaign.snapshot();
  expect(west.interact(npc.id,actor(west,npc.id)).message).toContain('斧兵');expect(campaign.snapshot()).toEqual(before);expect(west.professionUnlocked('carpenter')).toBe(false);
  prepareCarpenter(west);expect(west.specialistRows()[0].status).toBe('ready');const a=actor(west,npc.id);
  expect(west.interact(npc.id,{...a,authority:'guest'}).ok).toBe(false);expect(west.interact(npc.id,{...a,alive:false}).ok).toBe(false);expect(west.interact(npc.id,{...a,position:hearth}).ok).toBe(false);
  field.box({x:npc.position.x-.6,y:npc.position.y,z:npc.position.z+.5},{x:npc.position.x+.6,y:npc.position.y+2,z:npc.position.z+.7},3,'test-sight-wall');expect(west.interact(npc.id,a).message).toContain('遮蔽物');expect(west.professionUnlocked('carpenter')).toBe(false);
 });
 it('moves a rescued carpenter to the roofed settlement once and repeats useful dialogue without rewards',()=>{
  const {west,campaign,field}=setup(),npc=WEST_SPECIALISTS[0];prepareCarpenter(west);const original=actor(west,npc.id),xp=campaign.state.xp,wood=campaign.materials[4],cloth=campaign.materials[10];
  claim(west,npc.id);expect(campaign.state.xp-xp).toBe(85);expect(campaign.materials[4]-wood).toBe(8);expect(campaign.materials[10]-cloth).toBe(4);expect(campaign.professionUnlocked('carpenter')).toBe(true);expect(west.pointPosition(npc.id)).toEqual(npc.homePosition);expect(west.snapshot().completed).toContain('west-rescue-carpenter');expect(west.geometryConsistent()).toBe(true);
  expect(field.overlaps({...npc.position,y:npc.position.y+.12})).toBe(false);expect(field.overlaps({...npc.homePosition,y:npc.homePosition.y+.12})).toBe(true);expect(west.interact(npc.id,original).ok).toBe(false);
  const saved=campaign.snapshot(),materials={...campaign.materials},terrain=field.exportOverlay();for(let i=0;i<3;i++){const talk=west.interact(npc.id,actor(west,npc.id,.8,.4));expect(talk.ok,talk.message).toBe(true);expect(talk.message).toContain('木材10・布8・琥珀樹脂4');}
  expect(campaign.snapshot()).toEqual(saved);expect(campaign.materials).toEqual(materials);expect(field.exportOverlay()).toEqual(terrain);
 });
 it('keeps rescue atomic at full reward capacity or an obstructed settlement home',()=>{
  const {west,campaign,field}=setup(),npc=WEST_SPECIALISTS[0];prepareCarpenter(west);campaign.materials[10]=1000000;const before=campaign.snapshot(),state=west.snapshot(),terrain=field.exportOverlay();expect(west.interact(npc.id,actor(west,npc.id)).ok).toBe(false);expect(campaign.snapshot()).toEqual(before);expect(west.snapshot()).toEqual(state);expect(field.exportOverlay()).toEqual(terrain);
  campaign.materials[10]-=4;field.box(npc.homePosition,{x:npc.homePosition.x+.4,y:npc.homePosition.y+2,z:npc.homePosition.z+.4},4,'player-home-wall');expect(west.interact(npc.id,actor(west,npc.id)).message).toContain('住まい');expect(west.snapshot()).toEqual(state);field.removeObject('player-home-wall');claim(west,npc.id);
 });
 it('requires both mine defeats, the return camp and opened escape route for the alchemist',()=>{
  const {west,campaign}=setup(),npc=WEST_SPECIALISTS[1];claim(west,'west-return-hearth');defeat(west,'west-pitguard');expect(west.interact(npc.id,actor(west,npc.id)).ok).toBe(false);defeat(west,'west-orewatch');expect(west.interact(npc.id,actor(west,npc.id)).ok).toBe(false);claim(west,'west-mine-switch');const xp=campaign.state.xp;claim(west,npc.id);expect(campaign.state.xp-xp).toBe(115);expect(west.professionUnlocked('alchemist')).toBe(true);expect(west.professionUnlocked('carpenter')).toBe(false);expect(west.geometryConsistent()).toBe(true);expect(west.interact(npc.id,actor(west,npc.id,.8,.3)).message).toContain('威力を40%');
 });
 it('rejects forged rescue claims, omitted one-time quest records and duplicated claims',()=>{
  const {west}=setup(),base=west.snapshot();expect(validWestExpeditionState({...base,claimed:['west-carpenter'],completed:['west-rescue-carpenter']})).toBe(false);prepareCarpenter(west);claim(west,'west-carpenter');const saved=west.snapshot();
  expect(validWestExpeditionState({...saved,completed:saved.completed.filter(id=>id!=='west-rescue-carpenter')})).toBe(false);expect(west.restore({...saved,claimed:[...saved.claimed,'west-carpenter']})).toBe(false);expect(west.restore({...saved,defeated:[]})).toBe(false);expect(west.snapshot()).toEqual(saved);
 });
 it('makes recipes spend the canonical shared materials/items atomically at a discovered workshop',()=>{
  const {west,campaign}=setup(),plain=new CampaignSystem({...campaign.materials});Object.assign(plain.state,campaign.snapshot());campaign.state.items['amber-resin']=12;campaign.state.items['singing-copper']=4;
  for(const id of ['windwoven-glider','resin-staff'])expect(campaign.craft(id,hearth).ok).toBe(false);expect(plain.craft('windwoven-glider',hearth).ok).toBe(false);prepareCarpenter(west);claim(west,'west-carpenter');prepareAlchemist(west);claim(west,'west-alchemist');
  const camp=west.pointPosition('west-return-hearth')!,invalid={x:-43,y:.75,z:-10},before=campaign.snapshot(),wood=campaign.materials[4];expect(campaign.craft('windwoven-glider',invalid).ok).toBe(false);expect(campaign.craft('windwoven-glider',camp,2).ok).toBe(false);expect(campaign.snapshot()).toEqual(before);expect(campaign.materials[4]).toBe(wood);
  const resin=campaign.state.items['amber-resin'],cloth=campaign.materials[10];campaign.state.items['amber-resin']=3;const lacking=campaign.snapshot(),wallet={...campaign.materials};expect(campaign.craft('windwoven-glider',camp).ok).toBe(false);expect(campaign.snapshot()).toEqual(lacking);expect(campaign.materials).toEqual(wallet);campaign.state.items['amber-resin']=resin;
  expect(campaign.craft('windwoven-glider',camp).ok).toBe(true);expect(campaign.materials[4]).toBe(wood-10);expect(campaign.materials[10]).toBe(cloth-8);expect(campaign.state.items['amber-resin']).toBe(resin-4);expect(campaign.equip('windwoven-glider').ok).toBe(true);expect(campaign.canGlide).toBe(true);expect(campaign.glideSpeedMultiplier).toBe(1.2);expect(campaign.glideStaminaMultiplier).toBe(.75);
  expect(campaign.craft('resin-staff',hearth).ok).toBe(true);expect(campaign.equip('resin-staff').ok).toBe(true);expect(campaign.isStaffWeapon).toBe(true);expect(campaign.spellMultiplier).toBeCloseTo(1.4);campaign.consumeAttackDurability(100);expect(campaign.spellMultiplier).toBeCloseTo(.7);expect(validCampaignState(campaign.snapshot())).toBe(true);
  expect(CAMPAIGN_RECIPES.filter(r=>r.requiresProfession).map(r=>r.output)).toEqual(['windwoven-glider','resin-staff']);
 });
 it('preserves both residents, recipe unlocks and moved SDF bodies across restore without regeneration',()=>{
  const {west,campaign,field,arena}=setup();prepareCarpenter(west);claim(west,'west-carpenter');prepareAlchemist(west);claim(west,'west-alchemist');const saved=west.snapshot(),terrain=field.exportOverlay(),c=campaign.snapshot();field.provider.clearCache();
  const restoredField=new SparseOverlayField(field.provider);expect(restoredField.restoreOverlay(terrain)).toBe(true);const restoredCampaign=new CampaignSystem({...campaign.materials});expect(restoredCampaign.restore(c)).toBe(true);const restored=new WestExpeditionSystem(restoredCampaign,{field:restoredField,objects:new Map([...arena.objects].map(([id,o])=>[id,{...o}]))},WEST_EXPEDITION_MANIFEST);expect(restored.restore(saved)).toBe(true);const before=restoredField.exportOverlay();expect(restored.reconcileGeometry()).toBe(true);expect(restoredField.exportOverlay()).toEqual(before);expect(restoredCampaign.snapshot()).toEqual(c);expect(restoredCampaign.professionUnlocked('carpenter')).toBe(true);expect(restoredCampaign.professionUnlocked('alchemist')).toBe(true);
  for(const npc of WEST_SPECIALISTS)expect(restored.interact(npc.id,actor(restored,npc.id,.8,.3)).ok).toBe(true);
  const mismatchedField=new SparseOverlayField(field.provider);expect(mismatchedField.restoreOverlay(terrain)).toBe(true);setWestSpecialistLocation(mismatchedField,WEST_SPECIALISTS[0],false);const badTerrain=mismatchedField.exportOverlay(),incompatible=new WestExpeditionSystem(restoredCampaign,{field:mismatchedField,objects:arena.objects},WEST_EXPEDITION_MANIFEST);incompatible.restore(saved);expect(incompatible.reconcileGeometry()).toBe(false);expect(mismatchedField.exportOverlay()).toEqual(badTerrain);
 });
 it('protects both residents against ordinary durability damage and fire in the actual Core',()=>{
  const sim=new CoreSimulation(true,false,true,true);for(const npc of WEST_SPECIALISTS){expect(sim.elements.protectedObjects.has(npc.id)).toBe(true);const cell=[...sim.arena.field.objectSamples(npc.id)].find(c=>c.distance<0&&c.material===10)!;expect(cell).toBeDefined();const point={x:(cell.x+.5)*sim.arena.field.size,y:(cell.y+.5)*sim.arena.field.size,z:(cell.z+.5)*sim.arena.field.size},hit={cell,point,normal:{x:0,y:0,z:1},distance:1};expect(sim.elements.damage(hit,999,0)).toEqual({damaged:0,destroyed:0});sim.elements.cast('fire',hit,{x:0,y:0,z:-1});expect(sim.elements.exportState().states.filter(([,s])=>s.fire>0).every(([,s])=>Math.hypot(s.position.x-point.x,s.position.y-point.y,s.position.z-point.z)>.2)).toBe(true);}
 });
});
