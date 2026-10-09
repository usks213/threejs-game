import {describe,it,expect} from 'vitest';
import {CampaignSystem,CAMPAIGN_ITEMS,CAMPAIGN_MATERIALS,validCampaignState} from '../../src/prototype/core/campaign';
import {acquisitionInventory,MAX_DISCOVERY_IDS,validDiscoveryIds} from '../../src/prototype/core/discovery';
import {campaignCodex,filterCodex} from '../../src/prototype/campaign-codex';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {CROP_SECONDS,ANIMAL_SECONDS} from '../../src/prototype/core/homestead';
import {FishingSystem,type FishingActor} from '../../src/prototype/core/fishing';
import {VoxelField} from '../../src/prototype/core/voxel';
import {REGIONAL_POINTS} from '../../src/prototype/core/regions';
import {WEST_RESOURCES} from '../../src/prototype/core/expedition-west';
import {captureCampaign,hydrateCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
const idle={x:0,z:0,sprint:false,block:false,water:false};
const base={x:-3,y:.25,z:4};
const homeContext={position:base,basePosition:base,baseActive:true,artisanRescued:true};
const known=(c:CampaignSystem,id:string)=>expect(c.state.collections).toContain(id);

describe('C16 bounded acquisition history and read-only codex',()=>{
 it('lists exactly the actual canonical material and item IDs, all initially unknown',()=>{
  const c=new CampaignSystem({2:0,3:0,4:0,6:0,7:0,10:0}),before=c.snapshot(),entries=campaignCodex(c);
  expect(entries).toHaveLength(Object.keys(CAMPAIGN_ITEMS).length+Object.keys(CAMPAIGN_MATERIALS).length);expect(entries.length).toBeLessThanOrEqual(MAX_DISCOVERY_IDS);expect(new Set(entries.map(e=>e.id)).size).toBe(entries.length);expect(entries.every(e=>!e.discovered)).toBe(true);
  expect(entries.every(e=>e.region==='未確認'&&!e.source.includes('座標'))).toBe(true);expect(c.snapshot()).toEqual(before);
  expect(filterCodex(entries,{query:'不存在の名称',status:'all'})).toEqual([]);expect(filterCodex(entries,{query:'',status:'discovered'})).toEqual([]);expect(filterCodex(entries,{query:'木材',status:'unknown'})).toHaveLength(1);
 });
 it('observes successful positive writes synchronously, without intercepting quantities or inventing invalid discoveries',()=>{
  const calls:string[]=[],inventory=acquisitionInventory<number>({4:0},id=>calls.push(id));inventory[4]+=2;inventory[4]-=2;inventory[4]=0;inventory[4]=NaN;inventory[4]=-1;inventory[4]=2.5;
  expect(calls).toEqual(['4']);expect(inventory[4]).toBe(2.5);expect(JSON.parse(JSON.stringify(acquisitionInventory({wood:2},()=>{})))).toEqual({wood:2});
 });
 it('registers actual crafting before immediate consumption and keeps one record after repeated acquisition',()=>{
  const c=new CampaignSystem({4:2,3:2,7:0}),before={...c.materials};expect(c.craft('arrows',base).ok).toBe(true);known(c,'item:arrows');expect(c.materials[4]).toBe(before[4]-1);expect(c.materials[3]).toBe(before[3]-1);
  expect(c.consumeAmmo(8)).toBe(true);expect(c.state.items.arrows).toBe(0);known(c,'item:arrows');expect(c.craft('arrows',base).ok).toBe(true);expect(c.state.collections?.filter(id=>id==='item:arrows')).toHaveLength(1);
  const snapshot=c.snapshot();campaignCodex(c);campaignCodex(c);expect(c.snapshot()).toEqual(snapshot);expect(c.craft('bow',base).ok).toBe(false);expect(c.hasDiscovered('item:bow')).toBe(false);
 });
 it('retains only well-formed bounded known history; malformed restores are atomic',()=>{
  const c=new CampaignSystem({4:0,3:0}),fresh=c.snapshot();for(const collections of [null,{},['item:arrows','item:arrows'],['__proto__'],['material:04'],['item:'],[13],Array(1),Array.from({length:MAX_DISCOVERY_IDS+1},(_,i)=>'item:future-'+i)]){
   expect(validDiscoveryIds(collections)).toBe(false);expect(c.restore({...fresh,collections})).toBe(false);expect(c.snapshot()).toEqual(fresh);
  }
  const saved={...fresh,collections:['item:arrows','item:future-crystal','material:999']};expect(validCampaignState(saved)).toBe(true);expect(c.restore(saved)).toBe(true);expect(c.state.collections).toEqual(['item:arrows']);expect(c.state.items.arrows??0).toBe(0);expect(c.state.unlockedRegions).toEqual([]);
 });
 it('loads pre-codex saves from their real holdings and keeps shared item identity',()=>{
  const c=new CampaignSystem({4:0,3:0}),items=c.state.items,old=c.snapshot();delete old.collections;old.items={'fish-bait':2};expect(c.restore(old)).toBe(true);expect(c.state.items).toBe(items);expect(c.state.collections).toEqual(['item:fish-bait']);expect(c.hasDiscovered('item:grapple')).toBe(false);
  items['herb-seed']=1;items['herb-seed']--;known(c,'item:herb-seed');
 });
 it('reveals useful real recipe, region, source and use data only after acquisition',()=>{
  const c=new CampaignSystem({4:1,3:1});c.craft('arrows',base);const entries=campaignCodex(c),arrows=entries.find(e=>e.id==='item:arrows')!;expect(arrows.discovered).toBe(true);expect(arrows.region).toContain('手作り');expect(arrows.source).toContain('木材1');expect(arrows.uses).toContain('弓');expect(entries.find(e=>e.id==='material:4')!.uses).toContain('木の梯子');
  expect(filterCodex(entries,{query:'手作り',status:'discovered'}).map(e=>e.id)).toContain('item:arrows');expect(c.state.discoveredRegions).toEqual([]);
 });
});

describe('C16 real production acquisition paths and persistence',()=>{
 it('registers proximity-collected drops and companion shared material writes with no extra consumption',()=>{
  const sim=new CoreSimulation(true,false,true);const position={...sim.player.position,y:sim.player.position.y+.85};sim.survival.addDrops([{material:4,count:2,position}]);expect(sim.campaign.state.collections).toEqual([]);sim.tick(1/60,idle);expect(sim.survival.inventory[4]).toBe(2);known(sim.campaign,'material:4');
  sim.enableCompanion({x:3,y:.25,z:5});sim.survival.addDrops([{material:3,count:1,position:{x:3,y:1.1,z:5}}]);sim.tick(1/60,idle);expect(sim.survival.inventory[3]).toBe(1);known(sim.campaign,'material:3');
 });
 it('records regional rewards, boss rewards and western restore-based transactions at acquisition',()=>{
  const sim=new CoreSimulation(true,false,true,true),c=sim.campaign;Object.assign(c.state,{flameTier:2,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});
  const herb=REGIONAL_POINTS.find(p=>p.id==='rg-field-herb')!;expect(c.interactRegional(herb.id,herb.position).ok).toBe(true);expect(c.state.items['sun-herb']).toBe(3);known(c,'item:sun-herb');known(c,'material:7');
  expect(c.defeat('first-warden','warden').ok).toBe(true);known(c,'item:warden-core');
  const resin=WEST_RESOURCES.find(p=>p.id==='west-resin-a')!;expect(sim.western!.interact(resin.id,{authority:'host',alive:true,position:{...resin.position,x:resin.position.x+.9}}).ok).toBe(true);known(c,'item:amber-resin');known(c,'material:4');expect(sim.home.items).toBe(c.state.items);
  const before=c.snapshot();expect(sim.western!.interact(resin.id,{authority:'host',alive:true,position:{...resin.position,x:resin.position.x+.9}}).ok).toBe(false);expect(c.snapshot()).toEqual(before);
 });
 it('records farming, processing, animal production and storage round trips through shared ledgers',()=>{
  const sim=new CoreSimulation(true,false,true),home=sim.home,c=sim.campaign;Object.assign(sim.survival.inventory,{2:5,4:20,7:40});
  expect(home.prepareSeeds(homeContext).ok).toBe(true);known(c,'item:herb-seed');expect(home.plant(0,homeContext).ok).toBe(true);expect(c.hasDiscovered('item:herbs')).toBe(false);for(let i=0;i<CROP_SECONDS;i++)home.tick(1);expect(home.harvest(0,homeContext).ok).toBe(true);known(c,'item:herbs');
  expect(home.startProcessing('weave',homeContext).ok).toBe(true);expect(c.hasDiscovered('material:10')).toBe(false);for(let i=0;i<30;i++)home.tick(1);expect(home.claimProcessing(1,homeContext).ok).toBe(true);known(c,'material:10');expect(c.materials[10]).toBe(2);
  const animalPosition={...home.state.animal.physical!.position},context={...homeContext,position:animalPosition,animalPosition,animalVisible:true};expect(home.tame(context).ok).toBe(true);expect(home.feed(context).ok).toBe(true);for(let i=0;i<ANIMAL_SECONDS;i++)home.tick(1);expect(home.claimAnimal(context).ok).toBe(true);known(c,'item:milk');expect(c.consume('milk').ok).toBe(true);known(c,'item:milk');
  const count=c.state.items.herbs;expect(home.deposit('herbs',count,homeContext).ok).toBe(true);expect(c.state.items.herbs).toBe(0);known(c,'item:herbs');expect(home.withdraw('herbs',count,homeContext).ok).toBe(true);expect(c.state.items.herbs).toBe(count);
 });
 it('records a timed fish catch through the actual fishing state machine before it is cooked or stored',()=>{
  const c=new CampaignSystem({4:8,7:5}),actor:FishingActor={authority:'host',alive:true,swimming:false,position:{x:3,y:.25,z:-2}},field=new VoxelField();c.craft('fishing-rod',actor.position);c.craft('fish-bait',actor.position);const fishing=new FishingSystem(c,field,()=>({spot:'trial-basin',surfaceY:0,depth:.5}));fishing.selectRod(true);expect(fishing.cast({x:5.5,y:0,z:-2},actor).ok).toBe(true);expect(c.hasDiscovered('item:silverfin')).toBe(false);
  for(let i=0;i<600&&fishing.phase!=='bite';i++)fishing.tick(1/60,actor);expect(fishing.reel(actor).ok).toBe(true);expect(c.state.items.silverfin).toBe(1);known(c,'item:silverfin');expect(fishing.reel(actor).ok).toBe(false);expect(c.state.collections?.filter(id=>id==='item:silverfin')).toHaveLength(1);
 });
 it('round trips spent discoveries, hydrates stored-only legacy holdings, and rejects malformed history without touching a live world',()=>{
  const sim=new CoreSimulation(true,false,true);sim.survival.inventory[4]=1;sim.survival.inventory[3]=1;expect(sim.campaign.craft('arrows',base).ok).toBe(true);sim.campaign.consumeAmmo(8);const saved=captureCampaign(sim,defaultSettings()),loaded=hydrateCampaign(saved)!.sim;
  expect(loaded.campaign.state.collections).toEqual(sim.campaign.state.collections);expect(loaded.campaign.state.items.arrows).toBe(0);known(loaded.campaign,'item:arrows');expect(loaded.home.items).toBe(loaded.campaign.state.items);
  const before=loaded.campaign.snapshot(),malformed=structuredClone(saved);malformed.campaign.collections=['item:arrows','item:arrows'];expect(restoreCampaignInto(loaded,malformed)).toBeNull();expect(loaded.campaign.snapshot()).toEqual(before);
  const legacy=structuredClone(saved);delete legacy.campaign.collections;legacy.home.storage={materials:{10:2},items:{herbs:3}};const old=hydrateCampaign(legacy)!.sim;known(old.campaign,'material:10');known(old.campaign,'item:herbs');expect(old.campaign.hasDiscovered('item:arrows')).toBe(false);expect(old.campaign.hasDiscovered('item:lake-pearl')).toBe(false);
  expect(old.home.withdraw('herbs',3,homeContext).ok).toBe(true);old.campaign.state.items['fish-bait']=1;known(old.campaign,'item:fish-bait');expect(old.campaign.state.collections?.filter(id=>id==='item:herbs')).toHaveLength(1);
 });
});
