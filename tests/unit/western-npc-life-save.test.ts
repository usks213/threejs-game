import {describe,it,expect,vi} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,defaultSettings,hydrateCampaign,restoreCampaignInto,isCampaignSave,getCampaignRestoreFailure,type CampaignSave} from '../../src/prototype/campaign-session';
import {captureSharedCampaign,applySharedCampaign} from '../../src/prototype/campaign-network-state';
import {WEST_SPECIALISTS,setWestSpecialistLocation} from '../../src/prototype/core/expedition-west';
import {WEST_RUNTIME_ENEMIES,type WestActorContext} from '../../src/prototype/core/expedition-west-integration';
import {WEST_NPC_PROFILES} from '../../src/prototype/core/western-npc-life';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
import {createNpcLifeState} from '../../src/prototype/core/npc-life';

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const fresh=()=>new CoreSimulation(true,false,true,true);
const capture=(sim:CoreSimulation)=>clone(captureCampaign(sim,defaultSettings()));
function prepare(sim:CoreSimulation){
 Object.assign(sim.campaign.state,{flameTier:2,artisanRescued:true,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});
}
function context(sim:CoreSimulation,id:string):WestActorContext{const p=sim.western!.pointPosition(id)!,side=['west-mine-switch','west-alchemist'].includes(id);return {authority:'host',alive:true,position:{x:p.x+(side?.9:0),y:p.y+.1,z:p.z+(side?0:1.15)}};}
function claim(sim:CoreSimulation,id:string){const result=sim.western!.interact(id,context(sim,id));expect(result.ok,result.message+' / '+id).toBe(true);}
function defeat(sim:CoreSimulation,id:string){const e=WEST_RUNTIME_ENEMIES.find(e=>e.key===id)!;sim.enemies[e.slot].hp=0;expect(sim.western!.defeat(id,{slot:e.slot,hp:0},context(sim,'west-return-hearth')).ok).toBe(true);}
function rescue(sim:CoreSimulation,both=true){
 prepare(sim);defeat(sim,'west-axeguard');claim(sim,'west-hamlet-cache');claim(sim,'west-return-hearth');claim(sim,'west-carpenter');
 if(both){defeat(sim,'west-pitguard');defeat(sim,'west-orewatch');claim(sim,'west-mine-switch');claim(sim,'west-alchemist');}
 sim.reconcileNpc();
}
function legacy(sim:CoreSimulation){
 for(const npc of WEST_SPECIALISTS)if(sim.western!.snapshot().claimed.includes(npc.id))setWestSpecialistLocation(sim.arena.field,npc,true);
 const saved=capture(sim);delete saved.westernNpcLife;return saved;
}
function expectNoStatic(sim:CoreSimulation,id:string){const f=sim.arena.field.exportState();expect(f.suppressed).toContain(id);expect(f.order).not.toContain(id);expect(f.layers.some(layer=>layer.id===id)).toBe(false);expect([...sim.arena.field.objectSamples(id)]).toHaveLength(0);}
function rejectAtomically(sim:CoreSimulation,saved:unknown){const before=capture(sim),revision=sim.arena.field.revision;expect(restoreCampaignInto(sim,saved)).toBeNull();expect(capture(sim)).toEqual(before);expect(sim.arena.field.revision).toBe(revision);}

describe('strict western dynamic resident checkpoints',()=>{
 it('captures the optional resident field only in western worlds and preserves independent optional modules',()=>{
  const sim=fresh(),saved=capture(sim);expect(saved.westernNpcLife).toEqual({version:1,actors:{'west-carpenter':null,'west-alchemist':null}});expect(isCampaignSave(saved)).toBe(true);
  const ordinary=capture(new CoreSimulation(true,false,true));expect(ordinary.westernNpcLife).toBeUndefined();expect(isCampaignSave({...ordinary,westernNpcLife:saved.westernNpcLife})).toBe(false);expect(isCampaignSave({...saved,westernNpcLife:null})).toBe(false);
  delete (saved as {npcLife?:unknown}).npcLife;const withDungeon=hydrateCampaign(saved);expect(withDungeon).not.toBeNull();expect(withDungeon!.sim.dungeon.snapshot()).toEqual(saved.dungeon);
  const old=clone(saved);delete old.dungeon;old.objects=old.objects.filter(o=>!o.id.startsWith('vault-'));old.field.order=old.field.order.filter(id=>!id.startsWith('vault-'));old.field.layers=old.field.layers.filter(layer=>!layer.id.startsWith('vault-'));expect(hydrateCampaign(old)).not.toBeNull();expect(saved.westernNpcLife?.actors['west-carpenter']).toBeNull();
 });
 it('round trips both real actors with terrain edits and rewards unchanged, without any duplicate static body',()=>{
  const sim=fresh();rescue(sim);sim.arena.field.box({x:0,y:1,z:7},{x:1,y:2,z:8},4,'build:resident-save-wall');sim.arena.field.carve({x:-30,y:.1,z:-6},.4);
  for(const actor of sim.westNpcs.actors){actor.state!.activity='talking';actor.state!.talkSeconds=3;actor.state!.yaw=.7;actor.state!.phase=5;expectNoStatic(sim,actor.profile.id);}
  const saved=capture(sim),rewards=sim.campaign.snapshot(),items={...sim.survival.inventory},loaded=hydrateCampaign(saved);expect(loaded).not.toBeNull();
  expect(loaded!.sim.westNpcs.snapshot()).toEqual(saved.westernNpcLife);expect(loaded!.sim.campaign.snapshot()).toEqual(rewards);expect(loaded!.sim.survival.inventory).toEqual(items);expect(loaded!.sim.arena.field.exportState()).toEqual(saved.field);expect(loaded!.sim.western!.geometryConsistent()).toBe(true);
  for(const npc of WEST_SPECIALISTS)expectNoStatic(loaded!.sim,npc.id);
  const again=capture(loaded!.sim);expect(restoreCampaignInto(loaded!.sim,again)).not.toBeNull();expect(capture(loaded!.sim)).toEqual(again);
  saved.westernNpcLife!.actors['west-carpenter']!.position.x=-46;expect(loaded!.sim.westNpcs.get('west-carpenter')!.position.x).not.toBe(-46);
 },20000);
 it('retains residents, finite soil and watermill escrow together across a shared checkpoint',()=>{
  const sim=fresh();rescue(sim);Object.assign(sim.survival.inventory,{2:18,4:30,3:30,6:20,7:20});
  sim.player.position={x:0,y:.25,z:6};const target={x:0,y:.25,z:4.5};expect(sim.survival.soil.place(target,sim.soilContext(target)).ok).toBe(true);
  sim.player.position={x:2.5,y:.25,z:-1.3};expect(executeGameCommand(sim,{type:'homestead',id:'watermill-build'}).ok).toBe(true);expect(executeGameCommand(sim,{type:'homestead',id:'watermill-start'}).ok).toBe(true);
  const saved=capture(sim),loaded=hydrateCampaign(saved);expect(loaded).not.toBeNull();expect(loaded!.sim.westNpcs.snapshot()).toEqual(saved.westernNpcLife);expect(loaded!.sim.watermill.snapshot()).toEqual(saved.watermill);expect(loaded!.sim.survival.soil.snapshot()).toEqual(saved.survival.soil);expect(loaded!.sim.survival.inventory).toEqual(saved.survival.inventory);
  const bad=clone(saved);bad.watermill!.job!.remaining=-1;rejectAtomically(loaded!.sim,bad);const brokenSoil=clone(saved);brokenSoil.field.layers.find(l=>l.id===saved.survival.soil!.patches[0].id)!.cells[0][4]=6;rejectAtomically(loaded!.sim,brokenSoil);
 },20000);
 it('requires a bounded actor if and only if its particular rescue is claimed',()=>{
  const sim=fresh();rescue(sim,false);const saved=capture(sim);expect(saved.westernNpcLife!.actors['west-alchemist']).toBeNull();
  const mutations:((v:CampaignSave)=>void)[]=[
   v=>{v.westernNpcLife!.actors['west-carpenter']=null;},
   v=>{v.westernNpcLife!.actors['west-alchemist']=createNpcLifeState(WEST_NPC_PROFILES[1]);},
   v=>{v.westernNpcLife!.actors['west-carpenter']!.position={x:-3.95,y:.27,z:4.8};},
   v=>{v.westernNpcLife!.actors['west-carpenter']!.position.x=-80;},
   v=>{v.westernNpcLife!.actors['west-carpenter']!.position.y=4;},
   v=>{v.westernNpcLife!.actors['west-carpenter']!.accumulator=1;},
  ];
  for(const mutate of mutations){const bad=clone(saved);mutate(bad);expect(isCampaignSave(bad)).toBe(false);rejectAtomically(sim,bad);}
  for(const actor of [{...saved.westernNpcLife!.actors,ghost:null},{'west-carpenter':saved.westernNpcLife!.actors['west-carpenter']}])rejectAtomically(sim,{...saved,westernNpcLife:{version:1,actors:actor}});
 },20000);
 it('rejects static layer resurrection, missing tombstones, claim/object mismatch and corrupt late bodies atomically',()=>{
  const sim=fresh();rescue(sim);const saved=capture(sim),id='west-carpenter';
  const mutations:((v:CampaignSave)=>void)[]=[
   v=>{v.field.suppressed=v.field.suppressed!.filter(name=>name!==id);},
   v=>{v.field.order.push(id);v.field.layers.push({id,cells:[],removed:[]});},
   v=>{v.field.order.push(id);v.field.layers.push({id,cells:[[0,20,0,.25,10]],removed:[]});},
   v=>{v.field.order.push(id);v.field.layers.push({id,cells:[[0,20,0,-.25,10]],removed:[]});},
   v=>{v.field.suppressed=v.field.suppressed!.filter(name=>name!==id);v.field.order.push(id);v.field.layers.push({id,cells:[],removed:[]});},
   v=>{v.objects.find(o=>o.id===id)!.open=false;},
   v=>{v.entities[21].field.base.push([0,0,0,NaN,4]);},
  ];
  for(const mutate of mutations){const bad=clone(saved);mutate(bad);rejectAtomically(sim,bad);}
  const downgrade=clone(saved);delete downgrade.westernNpcLife;rejectAtomically(sim,downgrade);expect(getCampaignRestoreFailure(sim)).toBe('western-geometry');
 },20000);
 it('validates an exact old home body before migrating each claimed resident, with no rewards or player-edit loss',()=>{
  const sim=fresh();rescue(sim,false);sim.arena.field.box({x:2,y:1,z:7},{x:3,y:2,z:8},4,'build:legacy-resident-wall');const saved=legacy(sim),raw=JSON.stringify(saved),rewards=clone(saved.campaign),items=clone(saved.survival.inventory);
  expect(saved.westernNpcLife).toBeUndefined();expect(saved.field.order).toContain('west-carpenter');const loaded=hydrateCampaign(saved);expect(loaded).not.toBeNull();expect(JSON.stringify(saved)).toBe(raw);
  expect(loaded!.sim.westNpcs.get('west-carpenter')!.visible).toBe(true);expect(loaded!.sim.westNpcs.get('west-alchemist')!.state).toBeNull();expectNoStatic(loaded!.sim,'west-carpenter');expect(loaded!.sim.western!.pointPosition('west-alchemist')).toEqual(WEST_SPECIALISTS[1].position);
  expect(loaded!.sim.campaign.snapshot()).toEqual(rewards);expect(loaded!.sim.survival.inventory).toEqual(items);expect(loaded!.sim.arena.field.exportState().layers.find(layer=>layer.id==='build:legacy-resident-wall')).toEqual(saved.field.layers.find(layer=>layer.id==='build:legacy-resident-wall'));
  const migrated=capture(loaded!.sim);expect(migrated.westernNpcLife?.actors['west-carpenter']).not.toBeNull();expect(restoreCampaignInto(loaded!.sim,migrated)).not.toBeNull();expect(capture(loaded!.sim)).toEqual(migrated);
 },20000);
 it('never converts malformed legacy bodies, even with a valid central torso or hidden remote duplicates',()=>{
  const sim=fresh();rescue(sim);const saved=legacy(sim),id='west-carpenter',layer=saved.field.layers.find(layer=>layer.id===id)!;
  const badExtra=clone(saved);badExtra.field.layers.find(layer=>layer.id===id)!.cells.push([200,20,200,-.25,10]);badExtra.field.order.push('build:hidden-duplicate');badExtra.field.layers.push({id:'build:hidden-duplicate',cells:[[200,20,200,-.5,4]],removed:[]});rejectAtomically(sim,badExtra);
  const badLimb=clone(saved),cells=badLimb.field.layers.find(layer=>layer.id===id)!.cells;cells[0][3]+=cells[0][3]>.4?-.001:.001;rejectAtomically(sim,badLimb);
  const badEmpty=clone(saved);badEmpty.field.layers.find(layer=>layer.id===id)!.cells=[];rejectAtomically(sim,badEmpty);
  expect(layer.cells.length).toBeGreaterThan(100);
  setWestSpecialistLocation(sim.arena.field,WEST_SPECIALISTS[0],false);const wrongLocation=capture(sim);delete wrongLocation.westernNpcLife;rejectAtomically(sim,wrongLocation);
 },20000);
 it('rejects unrescued geometry damage before either legacy conversion or new-state hydration',()=>{
  const sim=fresh(),saved=capture(sim),npc=WEST_SPECIALISTS[1];sim.arena.field.removeObject(npc.id);const missing=capture(sim);rejectAtomically(sim,missing);delete missing.westernNpcLife;rejectAtomically(sim,missing);
  expect(restoreCampaignInto(sim,saved)).not.toBeNull();const q=npc.position;sim.arena.field.box({x:3,y:5,z:7},{x:3.5,y:5.5,z:7.5},10,npc.id);const duplicate=capture(sim);expect([...sim.arena.field.objectSamples(npc.id)].some(c=>Math.abs((c.x+.5)*.25-q.x)<.5)).toBe(true);rejectAtomically(sim,duplicate);
 },20000);
 it('shares resident saves without terrain churn and rejects forged actors before updating the guest',()=>{
  const host=fresh();rescue(host);const guest=fresh(),shared=captureSharedCampaign(host,defaultSettings());expect(applySharedCampaign(guest,shared).ok).toBe(true);expect(guest.westNpcs.snapshot()).toEqual(host.westNpcs.snapshot());const revision=guest.arena.field.revision;
  expect(applySharedCampaign(guest,shared).ok).toBe(true);expect(guest.arena.field.revision).toBe(revision);const before=capture(guest),bad=clone(shared);bad.westernNpcLife!.actors['west-alchemist']=null;expect(applySharedCampaign(guest,bad).ok).toBe(false);expect(capture(guest)).toEqual(before);
 },20000);

 it('offers western beds through the real menu only at their rescued camp, respecting costs and body occupancy',()=>{
  const sim=fresh(),rows=()=>campaignSnapshot(sim,defaultSettings(),{available:false,label:'',status:''},[],false).homestead!,id='furniture:west-carpenter-bed';prepare(sim);sim.survival.inventory[4]=30;sim.survival.inventory[10]=15;sim.player.position={x:-3,y:.27,z:4};
  expect(rows().find(row=>row.id===id)?.available).toBe(false);rescue(sim,false);const actor=sim.westNpcs.get('west-carpenter')!;actor.state!.position={...actor.profile.social};
  expect(rows().find(row=>row.id===id)?.available).toBe(false);sim.player.position={x:-47.2,y:.77,z:-14.5};expect(rows().find(row=>row.id===id)?.available).toBe(true);expect(rows().find(row=>row.id==='furniture:west-alchemist-bed')?.available).toBe(false);expect(rows().find(row=>row.id==='furniture:bed')?.available).toBe(false);expect(rows().find(row=>row.id==='deposit:4')?.available).toBe(false);
  actor.state!.position={...actor.profile.bed,y:.77};const blocked=rows().find(row=>row.id===id)!;expect(blocked.available).toBe(false);expect(blocked.reason).toContain('住人');actor.state!.position={...actor.profile.social};sim.survival.inventory[4]=0;expect(rows().find(row=>row.id===id)?.reason).toContain('素材');sim.survival.inventory[4]=30;
  const before=capture(sim);rows();expect(capture(sim)).toEqual(before);expect(executeGameCommand(sim,{type:'homestead',id}).ok).toBe(true);expect(rows().find(row=>row.id===id)).toMatchObject({completed:true});expect(rows().find(row=>row.id===id)?.action).toBeUndefined();
 },15000);
 it('uses a rescued resident’s real position and dialogue provider and blocks invisible resident fallbacks',()=>{
  const sim=fresh();rescue(sim);for(const npc of WEST_SPECIALISTS){const actor=sim.westNpcs.get(npc.id)!;actor.state!.position={...actor.profile.social};expect(sim.western!.pointPosition(npc.id)).toEqual(actor.position);
   const talk=vi.spyOn(actor,'talk').mockReturnValue({ok:true,message:npc.name+'の今の生活会話'}),response=sim.western!.interact(npc.id,context(sim,npc.id));expect(response.message).toBe(npc.name+'の今の生活会話');expect(talk).toHaveBeenCalledOnce();talk.mockRestore();
   actor.state!.recovery='overlap';actor.state!.activity='recovering';actor.state!.grounded=false;actor.state!.vy=0;expect(sim.western!.interact(npc.id,context(sim,npc.id)).ok).toBe(false);
  }
 });
});
