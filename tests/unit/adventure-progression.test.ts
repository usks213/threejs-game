import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SessionAuthority} from '../../src/simulation/session';
import {AdventureProgression,decorationUnlocked} from '../../src/game/adventure-progression';
import {newProgression,validateProgression,validateRegionalProgression} from '../../src/game/progression-state';
import {SITES,ANNEX_ROOMS,sitePieces,siteAnnexPieces} from '../../src/content/adventure-sites';
import {REGIONAL_RECORDS,ADVENTURE_DECORATIONS} from '../../src/content/adventure-chapters';
import {ensureAdventureSites} from '../../src/game/sites';
import {skyContext} from '../../src/game/skybound/context';
import {protectedVolumes,intersectsProtection} from '../../src/game/skybound/protection';
import {siteClear} from '../../src/game/site-walking';
import {buildingVoxels} from '../../src/game/voxel/model';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {prepareNextAdventureCycle} from '../../src/save/adventure-cycle';
import {progressionPanel} from '../../src/ui/progression-panel';
const aim={x:0,y:0,z:-1};
function fixture(){const sim=new GameSimulation();sim.adventure.state.enemies=[];sim.fluid.restore([]);return {sim,game:sim.adventure,progress:new AdventureProgression(sim.adventure),world:sim.adventure.state.siteWorld!.regional!};}
function guide(sim:GameSimulation,id=850001){const site=SITES.find(s=>s.id===id)!;Object.assign(sim.player,{x:site.x,y:sim.adventure.state.siteWorld!.bases[id]+.4,z:site.z+5.5,grounded:true});}
function recordAt(sim:GameSimulation,id:number){const r=REGIONAL_RECORDS.find(r=>r.id===id)!,site=SITES.find(s=>s.id===r.site)!;Object.assign(sim.player,{x:site.x+r.x,y:sim.adventure.state.siteWorld!.bases[r.site]+r.y,z:site.z+r.z,grounded:true});}
function step(sim:GameSimulation,progress:AdventureProgression,n=16){for(let i=0;i<n;i++){sim.tick++;progress.step(1/30);}}
function part(sim:GameSimulation,site=850001,extra={}){const def=SITES.find(s=>s.id===site)!;sim.skybound.state.parts.push({id:910001+sim.skybound.state.parts.length,kind:'block',material:'stone',position:{x:def.x,y:sim.adventure.state.siteWorld!.bases[site]+.7,z:def.z-7},velocity:{x:0,y:0,z:0},mass:18,links:[],epoch:0,rotation:0,...extra});}
it('records ordered real tutorial evidence and cancels solo rescue on distance or damage',()=>{
 const {sim,game,progress}=fixture();progress.record('mine');expect(game.state.progression!.tutorial).toBe(0);progress.step(1/30);sim.player.grounded=true;
 for(let i=0;i<31;i++){sim.player.x+=.2;progress.step(1/30);}expect(game.state.progression!.tutorial).toBe(1);
 progress.record('assemble');expect(game.state.progression!.tutorial).toBe(1);progress.record('mine');progress.record('pickup');progress.record('assemble');expect(game.state.progression!.tutorial).toBe(4);
 Object.assign(sim.player,{x:3,y:sim.groundAt(3,12,3),z:12});progress.action('tutorial-rescue','start');step(sim,progress,45);expect(progress.snapshot().tutorial.practiceSeconds).toBeGreaterThan(1);sim.player.x=8;progress.step(1/30);expect(progress.snapshot().tutorial.practiceSeconds).toBe(0);
 sim.player.x=3;progress.action('tutorial-rescue','start');game.damageRevision++;progress.step(1/30);expect(progress.snapshot().tutorial.practiceSeconds).toBe(0);progress.action('tutorial-rescue','start');step(sim,progress,91);expect(game.state.progression!.tutorial).toBe(5);
});
it('adds an idempotent six-room annex with clear gallery/hall and a raised archive in each layer',()=>{
 const {sim,game,world}=fixture();expect(world.installed).toEqual(SITES.map(s=>s.id));expect(game.state.resources.filter(n=>REGIONAL_RECORDS.some(r=>r.id===n.id))).toHaveLength(9);
 const count=game.state.buildings.length;ensureAdventureSites(sim,game.state);expect(game.state.buildings.length).toBe(count);
 for(const site of SITES)for(const room of ANNEX_ROOMS){const at={x:site.x+room.x,y:game.state.siteWorld!.bases[site.id]+room.y+.2,z:site.z+room.z};expect(siteClear(sim,at),JSON.stringify(at)).toBe(true);}
 expect(sitePieces(850001,0,0,0).length+siteAnnexPieces(850001,0,0,0).length).toBeGreaterThan(70);
});
it('requires a live stable physical puzzle and personal proximity before recording its branch',()=>{
 const {sim,game,progress,world}=fixture();recordAt(sim,856002);expect(()=>progress.action('chronicle-inspect','856002')).toThrow('質量');part(sim);step(sim,progress,14);expect(world.solved).toEqual([]);step(sim,progress,2);expect(world.solved).toContain(850001);
 expect(progress.action('chronicle-inspect','856002')).toContain('図鑑');expect(game.state.progression!.records).toEqual([856002]);progress.action('chronicle-inspect','856002');expect(game.state.progression!.records).toEqual([856002]);sim.player.x+=20;expect(()=>progress.action('chronicle-inspect','856003')).toThrow('近づ');
});
it('supports distinct water and recall branches plus powered circuit alternatives',()=>{
 const {sim,progress,world}=fixture();part(sim,850002,{material:'metal',wet:2});part(sim,850003,{recalled:1.5});step(sim,progress);expect(world.solved).toEqual([850002,850003]);
 part(sim,850001,{kind:'lamp',mass:1});const lamp=sim.skybound.state.parts.at(-1)!;lamp.enabled=true;lamp.anchored=true;const battery={...lamp,id:910099,position:{...lamp.position,x:lamp.position.x+.8},kind:'battery' as const,energy:25,links:[lamp.id]};lamp.links=[battery.id];sim.skybound.state.parts.push(battery);for(let i=0;i<16;i++){sim.tick++;sim.skybound.step(1/30,skyContext(sim));progress.step(1/30);}expect(world.solved).toContain(850001);
});
it('reports one shared payout while retaining separate personal discoveries and late-join catch-up',()=>{
 const {sim,game,world}=fixture();world.solved.push(850001);game.state.progression={...newProgression(),records:[856001,856002,856003]};guide(sim);const room=new SessionAuthority(sim.save()),guest=room.join('guest');Object.assign(guest.player,room.sim.player);guest.adventure.state.progression={...newProgression(),records:[856001,856002,856003]};
 const coins=()=>room.sim.adventure.state.resources.filter(n=>n.drop&&n.kind==='coins').reduce((n,r)=>n+r.amount,0);for(const id of ['host','guest'])room.action(id,{type:'game-action',action:'chronicle-report',id:'850001',aim});expect(coins()).toBe(12);expect(room.sim.adventure.state.siteWorld!.regional!.reported).toEqual([850001]);
 const late=room.join('late');expect(late.adventure.state.progression?.records??[]).toEqual([]);expect(late.adventure.state.siteWorld!.regional!.reported).toEqual([850001]);expect(decorationUnlocked(late.adventure.state,'routeBanner')).toBe(false);
 const exported=participantSave(room,'guest');expect(exported.adventure!.progression!.records).toEqual([856001,856002,856003]);expect(room.save().members!.find(m=>m.id==='guest')!.adventure.siteWorld).toBeUndefined();expect(new GameSimulation(validateSave(exported)).adventure.state.progression!.records).toHaveLength(3);
});
it('atomically consumes post-ending delivery once, changes the shared world, and unlocks the final decoration',()=>{
 const {sim,game,progress,world}=fixture();world.solved=[...world.installed];world.reported=[...world.installed];game.state.inventory.wood=16;guide(sim);expect(()=>progress.action('chronicle-epilogue','850001')).toThrow('嵐心');game.state.defeated.push('stormcore');progress.action('chronicle-epilogue','850001');progress.action('chronicle-epilogue','850001');expect(game.state.inventory.wood).toBe(8);expect(world.epilogue).toEqual([850001]);
 for(const [id,item,count]of [[850002,'stone',6],[850003,'crystal',3]]as const){game.state.inventory[item]=count;guide(sim,id);progress.action('chronicle-epilogue',String(id));expect(game.state.inventory[item]).toBe(0);}expect(decorationUnlocked(game.state,'routeMonument')).toBe(true);
 for(const d of ADVENTURE_DECORATIONS){const model=buildingVoxels(d.id);expect(model.cells.size).toBeGreaterThan(0);expect(model.cells.size).toBeLessThan(Math.ceil(d.size[0]/.125)*Math.ceil(d.size[1]/.125)*Math.ceil(d.size[2]/.125));}
});
it('keeps delivery costs and receipt unchanged if the payout cannot be prepared',()=>{
 const {sim,game,progress,world}=fixture();guide(sim);game.state.defeated.push('stormcore');game.state.inventory.wood=8;world.solved.push(850001);world.reported.push(850001);game.state.resources=Array.from({length:100000},(_,i)=>({id:i+1,kind:'stone',amount:1,ready:0,x:400,y:3,z:400}));expect(()=>progress.action('chronicle-epilogue','850001')).toThrow('上限');expect(game.state.inventory.wood).toBe(8);expect(world.epilogue).toEqual([]);
});
it('rejects malformed progression and migrates old worlds without restarting existing quests or repeating stamps',()=>{
 const {sim,game}=fixture(),save=sim.save();delete save.adventure!.progression;delete save.adventure!.siteWorld!.regional;save.adventure!.siteWorld!.completed=[850001];const loaded=new GameSimulation(validateSave(save));expect(loaded.adventure.state.siteWorld!.completed).toEqual([850001]);expect(loaded.adventure.state.siteWorld!.regional!.installed).toHaveLength(3);
 expect(()=>validateProgression({...newProgression(),records:[856001,856001]})).toThrow();expect(()=>validateProgression({...newProgression(),tutorial:6})).toThrow();expect(()=>validateRegionalProgression({...game.state.siteWorld!.regional!,reported:[850001]})).toThrow();
});
it('prepares a distinct new cycle without mutating the old ending, terrain, supplies, or collection records',()=>{
 const {sim,game}=fixture();expect(()=>prepareNextAdventureCycle(sim.save())).toThrow('嵐心');game.state.defeated.push('stormcore');game.state.progression={...newProgression(),records:[856001,856002,856003]};game.state.inventory.wood=45;game.state.race={best:24,finishes:1};const old=sim.save(),text=JSON.stringify(old),next=prepareNextAdventureCycle(old);expect(JSON.stringify(old)).toBe(text);expect(next.adventure!.defeated).toEqual([]);expect(next.adventure!.inventory.wood??0).toBe(0);expect(next.adventure!.siteWorld!.regional!.cycle).toBe(1);expect(next.adventure!.seconds).toBe(240);expect(next.adventure!.progression!.heritage).toEqual({cycles:1,records:[856001,856002,856003],bestRace:24});expect(decorationUnlocked(next.adventure!,'routeBanner')).toBe(true);const resumed=new GameSimulation(next);expect(progressionPanel(resumed.adventure.snapshot())).toContain('第2航路');expect(resumed.adventure.progression.snapshot().regions[0].hint).toContain('18');
});
it('walks the permanent exterior stair to the upper archive without teleporting or removing old rooms',()=>{
 const {sim,game}=fixture();for(const site of SITES){const base=game.state.siteWorld!.bases[site.id];Object.assign(sim.player,{x:site.x+4,y:base+.18,z:site.z-4.7,vy:0,grounded:true});for(let i=0;i<32;i++)sim.step({x:0,z:-1,jump:false});expect(sim.player.y,site.name).toBeGreaterThan(base+2);expect(sim.player.z,site.name).toBeLessThan(site.z-6);}
});
it('leaves the previous ending intact when archive/replace fails and atomically stores its full record on retry',async()=>{
 const {SaveRepository,CURRENT,headToken}=await import('../../src/save/repository');type Batch=import('../../src/save/repository').StorageBatch;const worlds=new Map<string,unknown>(),chunks=new Map<string,unknown>();let fail=false;
 const store:import('../../src/save/repository').SaveStore={async read(name,keys){const src=name==='worlds'?worlds:chunks;return new Map(keys.filter(k=>src.has(k)).map(k=>[k,structuredClone(src.get(k))]));},async keys(name){return [...(name==='worlds'?worlds:chunks).keys()];},async commit(batch:Batch){if(fail)throw Error('archive quota');if(headToken(worlds.get(CURRENT))!==batch.expectedHead)throw Error('stale head');for(const[k,v]of batch.worlds)worlds.set(k,structuredClone(v));for(const[k,v]of batch.chunks)chunks.set(k,structuredClone(v));for(const k of batch.deleteWorlds??[])worlds.delete(k);for(const k of batch.deleteChunks??[])chunks.delete(k);}};
 const {sim,game}=fixture();game.state.defeated.push('stormcore');game.state.inventory.wood=37;const old=sim.save(),next=prepareNextAdventureCycle(old),repo=new SaveRepository(store);await repo.load();await repo.save(old);const current=structuredClone(worlds.get(CURRENT));fail=true;await expect(repo.import(next)).rejects.toThrow('archive quota');expect(worlds.get(CURRENT)).toEqual(current);expect([...worlds.keys()].filter(k=>k.startsWith('protected:'))).toHaveLength(0);fail=false;await repo.import(next);const protectedRecord=[...worlds].find(([k])=>k.startsWith('protected:'))![1] as {current:unknown};expect(protectedRecord.current).toEqual(current);const loaded=await new SaveRepository(store).load();expect(loaded.status).toBe('loaded');if(loaded.status==='loaded')expect(loaded.save.adventure!.siteWorld!.regional!.cycle).toBe(1);
});

it('protects record access and the rescue dummy while keeping the nearby branch mechanism buildable',()=>{
 const {sim,game}=fixture(),volumes=protectedVolumes(sim);for(const node of game.state.resources.filter(n=>n.id>=856001&&n.id<=856009||n.id===857001))expect(intersectsProtection(node,.1,volumes)).toBe(true);
 for(const site of SITES){const y=game.state.siteWorld!.bases[site.id];for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5])for(const dy of [.2,.7,1.2])expect(intersectsProtection({x:site.x+dx,y:y+dy,z:site.z-7+dz},0,volumes)).toBe(false);}
 const room=new SessionAuthority(sim.save()),node=room.sim.adventure.state.resources.find(n=>n.id===856002)!;Object.assign(room.sim.player,{x:node.x,y:node.y,z:node.z+2});expect(()=>room.action('host',{type:'action',tool:'add',target:node})).toThrow('保護');expect(()=>room.action('host',{type:'game-action',action:'build',id:'wall',target:node,aim})).toThrow('保護');
});
it('recovers only pre-buried markers at the guide without deleting private terrain or buildings',()=>{
 const {sim,game,progress}=fixture(),node=game.state.resources.find(n=>n.id===856001)!;game.state.buildings.push({id:991991,definition:'wall',x:node.x,y:node.y,z:node.z,rotation:0,support:8,contents:{},creator:'other',shared:false});const original=JSON.stringify(game.state.buildings);guide(sim);expect(progress.action('chronicle-recover','850001')).toContain('1枚');expect(JSON.stringify(game.state.buildings)).toBe(original);expect(node.z).toBeGreaterThan(SITES[0].z+7);Object.assign(sim.player,node);expect(progress.action('chronicle-inspect',String(node.id))).toContain('空の荷札');const loaded=new GameSimulation(validateSave(sim.save()));expect(loaded.adventure.progression.snapshot().locations[node.id]).toEqual({x:node.x,y:node.y,z:node.z});
});

it('carries all four decoration unlocks and readable former records across later voyages',()=>{
 const {sim,game,world}=fixture();game.state.defeated.push('stormcore');world.solved=[...world.installed];world.reported=[...world.installed];world.epilogue=[...world.installed];game.state.progression={...newProgression(),records:REGIONAL_RECORDS.map(r=>r.id)};game.state.race={best:21.25,finishes:1};const next=new GameSimulation(prepareNextAdventureCycle(sim.save()));for(const decoration of ADVENTURE_DECORATIONS)expect(decorationUnlocked(next.adventure.state,decoration.id)).toBe(true);const html=progressionPanel(next.adventure.snapshot());expect(html).toContain('最後の荷は食料ではなく');expect(html).toContain('21.25秒');next.adventure.state.defeated.push('stormcore');const later=prepareNextAdventureCycle(next.save());expect(later.adventure!.progression!.heritage!.memorial).toBe(true);
});
