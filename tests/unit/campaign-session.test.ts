import {beforeAll,describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,defaultSettings,isCampaignSave,restoreCampaignInto,type CampaignSave} from '../../src/prototype/campaign-session';
import {REGIONAL_ENEMIES} from '../../src/prototype/core/regions';
let sim:CoreSimulation,source:CampaignSave;
const copy=()=>JSON.parse(JSON.stringify(source)) as CampaignSave;
beforeAll(()=>{sim=new CoreSimulation(true);sim.survival.inventory[4]=17;source=captureCampaign(sim,defaultSettings());},20000);
describe('strict campaign session boundary',()=>{
 it('accepts the canonical world and roster',()=>{expect(isCampaignSave(source)).toBe(true);});
 it.each([{x:81,y:1,z:0},{x:0,y:101,z:0},{x:0,y:-31,z:0},{x:0,y:1,z:101},{x:NaN,y:0,z:0},{x:Infinity,y:0,z:0}])('rejects out-of-world enemy positions %o',position=>{const data=copy();data.enemies[0].position=position;expect(isCampaignSave(data)).toBe(false);expect(restoreCampaignInto(sim,data)).toBeNull();});
 it('rejects unknown, non-summoning, self and fractional summon owners',()=>{const reserve=4+REGIONAL_ENEMIES.length;for(const owner of [-2,0,reserve,999,11.5,NaN]){const data=copy();data.enemies[reserve].summonOwner=owner;expect(isCampaignSave(data)).toBe(false);}const ordinary=copy();ordinary.enemies[0].summonOwner=4+REGIONAL_ENEMIES.findIndex(e=>e.tactic==='summoner');expect(isCampaignSave(ordinary)).toBe(false);});
 it('accepts a real summoner owner and dead unused slots, rejects orphan live summons',()=>{const reserve=4+REGIONAL_ENEMIES.length,data=copy();expect(data.enemies[reserve].summonOwner).toBe(-1);data.enemies[reserve].hp=35;expect(isCampaignSave(data)).toBe(false);data.enemies[reserve].summonOwner=4+REGIONAL_ENEMIES.findIndex(e=>e.tactic==='summoner');expect(isCampaignSave(data)).toBe(true);data.enemies[reserve].hp=36;expect(isCampaignSave(data)).toBe(false);});
 it('rejects missing/duplicate enemy records and sparse arrays',()=>{const data=copy();data.enemies[1].id=0;expect(isCampaignSave(data)).toBe(false);const sparse=copy();delete sparse.enemies[1];expect(isCampaignSave(sparse)).toBe(false);const water=copy();delete water.water.volume[0];expect(isCampaignSave(water)).toBe(false);const entities=copy();delete entities.entities[0];expect(isCampaignSave(entities)).toBe(false);});
 it('validates object records before looking up live metadata',()=>{for(const mutation of [(d:CampaignSave)=>{d.objects.push({...d.objects[0]});},(d:CampaignSave)=>{d.objects[0].open='yes' as unknown as boolean;},(d:CampaignSave)=>{d.objects[0].hp=NaN;},(d:CampaignSave)=>{d.objects[0].id='';},(d:CampaignSave)=>{Object.assign(d.objects[0],{kind:'cache'});}]){const data=copy();mutation(data);expect(isCampaignSave(data)).toBe(false);}});
 it('rejects unknown bindings, duplicate key/pin identities and injected player fields',()=>{const binding=copy();binding.settings.bindings={constructor:'KeyZ'};expect(isCampaignSave(binding)).toBe(false);binding.settings.bindings={cast:'KeyZ',heal:'KeyZ'};expect(isCampaignSave(binding)).toBe(false);binding.settings.bindings={cast:'KeyW'};expect(isCampaignSave(binding)).toBe(false);const pins=copy();pins.settings.pins=[{id:'a',x:0,z:0},{id:'a',x:1,z:1}];expect(isCampaignSave(pins)).toBe(false);const injected=copy();Object.assign(injected.player,{attack:'not-an-attack'});expect(isCampaignSave(injected)).toBe(false);});
});
describe('atomic session staging',()=>{
 it('dry-runs the exact voxel decoder without changing revision, dirty chunks or samples',()=>{const state=sim.arena.field.exportState(),revision=sim.arena.field.revision,dirty=[...sim.arena.field.dirty],cells=sim.arena.field.cells;expect(sim.arena.field.restoreState(state,true)).toBe(true);expect(sim.arena.field.revision).toBe(revision);expect([...sim.arena.field.dirty]).toEqual(dirty);expect(sim.arena.field.cells).toBe(cells);});
 it('rejects every malformed late component without partial state installation',()=>{const before=JSON.stringify(captureCampaign(sim,defaultSettings())),revision=sim.arena.field.revision,dirty=[...sim.arena.field.dirty];const corruptions:[string,(data:CampaignSave)=>void][]=[
 ['terrain',d=>{d.field.base.push([0,0,0,NaN,3]);}],
 ['survival',d=>{d.survival.inventory[4]=-1;}],
 ['elements',d=>{d.elements.damagedObjects.push('duplicate','duplicate');}],
 ['campaign',d=>{d.campaign.items.unknown=1;}],
 ['home',d=>{d.home.jobs.push({id:999,recipe:'missing',remaining:0});}],
 ['last entity',d=>{d.entities[d.entities.length-1].reward=999;}],
 ['sparse scars',d=>{d.entities[d.entities.length-1].scars.length=1;}],
 ['unknown object',d=>{d.objects[d.objects.length-1].id='unknown-object';}],
 ['missing object',d=>{d.objects.pop();}],
 ];for(const [label,corrupt] of corruptions){const data=copy();data.survival.inventory[4]=777;data.player.hp=19;data.objects[0].open=true;corrupt(data);expect(restoreCampaignInto(sim,data),label).toBeNull();expect(JSON.stringify(captureCampaign(sim,defaultSettings())),label).toBe(before);expect(sim.arena.field.revision,label).toBe(revision);expect([...sim.arena.field.dirty],label).toEqual(dirty);}},20000);
 it('commits validated records together and preserves shared inventory/items',()=>{const data=copy(),reserve=4+REGIONAL_ENEMIES.length,owner=4+REGIONAL_ENEMIES.findIndex(e=>e.tactic==='summoner');data.survival.inventory[4]=24;data.enemies[0].summonOwner=-1;data.enemies[reserve].summonOwner=owner;data.enemies[reserve].hp=35;data.objects[0].open=true;const materials=sim.survival.inventory,items=sim.campaign.state.items;expect(restoreCampaignInto(sim,data)).not.toBeNull();expect(sim.survival.inventory).toBe(materials);expect(sim.campaign.materials).toBe(materials);expect(sim.home.materials).toBe(materials);expect(sim.home.items).toBe(items);expect(sim.survival.inventory[4]).toBe(24);expect(sim.enemies[0].summonOwner).toBeUndefined();expect(sim.enemies[reserve].summonOwner).toBe(owner);expect(sim.arena.objects.get(data.objects[0].id)?.open).toBe(true);data.survival.inventory[4]=99;data.enemies[reserve].position.x=55;expect(sim.survival.inventory[4]).toBe(24);expect(sim.enemies[reserve].position.x).not.toBe(55);},15000);
});
