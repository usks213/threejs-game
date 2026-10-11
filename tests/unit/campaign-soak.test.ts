import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {cpus} from 'node:os';
import {NormalPlayer,playFirstChapter} from './helpers/normal-campaign-player';
import type {Controls} from '../../src/prototype/core/simulation';
import type {Element} from '../../src/prototype/core/elements';
import {StreamedCampaignField} from '../../src/prototype/core/streamed-campaign-field';
import {SampleManifestRecorder} from '../../src/prototype/core/sample-provider';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
import {WorldMeshes} from '../../src/prototype/rendering/meshes';
import {captureCampaign,restoreCampaignInto,getCampaignRestoreFailure,isCampaignSave,defaultSettings} from '../../src/prototype/campaign-session';

const STEP=1/30,SOAK_STEPS=600*30;
const neutral:Controls={x:0,z:0,sprint:false,block:false,water:false};
function finiteTree(value:unknown,path='state'):void {
 if(typeof value==='number'){expect(Number.isFinite(value),path).toBe(true);return;}
 if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))finiteTree(child,path+'.'+key);
}

/** A NormalPlayer with a deterministic step bound instead of its short-test CPU
 * watchdog. No state, materials, HP, coordinates, cooldowns or clock are granted.
 * The only extra behavior is observation and app.ts's normal per-frame event drain. */
class SoakPlayer extends NormalPlayer {
 frames=0;drained=0;peakEvents=0;peakDrops=0;peakStates=0;peakEffects=0;peakShards=0;
 readonly kinds=new Map<string,number>();
 readonly actorCount=this.sim.enemies.length;
 readonly field=this.sim.arena.field as StreamedCampaignField;
 override tick(input:Partial<Controls>={}){
  if(++this.frames>SOAK_STEPS)throw Error(this.diagnostic('600-second deterministic soak step budget exceeded'));
  const s=this.sim;s.tick(STEP,{...neutral,...input});
  if(s.player.hp<=0)throw Error(this.diagnostic('Player died during soak'));
  if(s.enemies.length!==this.actorCount||s.enemyElements.length!==this.actorCount)throw Error('Enemy roster grew during soak');
  if(s.survival.drops.length>s.survival.maxDrops||s.enemyShots.length>32||s.tells.length>24)throw Error('Production live-buffer cap exceeded');
  for(const system of [s.elements,...s.enemyElements.map(e=>e.reactions)]){
   if(system.states.size>system.maxStates||system.effects.length>system.maxEffects||system.shards.length>64)throw Error('Element production cap exceeded');
   this.peakStates=Math.max(this.peakStates,system.states.size);this.peakEffects=Math.max(this.peakEffects,system.effects.length);this.peakShards=Math.max(this.peakShards,system.shards.length);
  }
  const cache=this.field.provider.stats;
  if(cache.blocks>this.field.provider.maxCacheBlocks||cache.numericBytes>cache.capacityBytes)throw Error('Provider numeric LRU exceeded its configured capacity');
  this.peakDrops=Math.max(this.peakDrops,s.survival.drops.length);this.peakEvents=Math.max(this.peakEvents,s.events.length);
  // This is the production app's ownership boundary, not a cap/clear on an
  // otherwise leaking queue: app.ts consumes every event after each sim frame.
  for(const event of s.events.splice(0)){this.drained++;this.kinds.set(event.kind,(this.kinds.get(event.kind)??0)+1);}
  if(s.events.length!==0)throw Error('Events remain after the application drain');
  if(this.frames%30===0){
   finiteTree({player:s.player,enemies:s.enemies,drops:s.survival.drops,pending:s.survival.pendingDrops,arrows:s.arrows,enemyShots:s.enemyShots,tells:s.tells,worldHour:s.worldHour,cold:s.cold,oxygen:s.oxygen});
   expect(s.survival.pendingDrops.length).toBeLessThanOrEqual(100000); // actual save decoder limit
   expect(s.home.state.jobs.length).toBeLessThanOrEqual(3);
   expect(s.home.state.plots).toHaveLength(3);
   expect(this.field.cells.size).toBe(0); // no duplicate full-world cell map
  }
 }
}

describe('Q08 bounded long-session acceptance (CPU/core evidence, not browser or device FPS)',()=>{
 it('plays one campaign for ten simulated minutes with ordinary controls, repeated reactions/building/exploration and valid checkpoints',()=>{
  const started=performance.now(),cpuStarted=process.cpuUsage(),d=new SoakPlayer(),s=d.sim,settings=defaultSettings();
  const waterCells=s.water.volume.length,waterBuffer=s.water.volume.buffer;
  let saves=0,cycles=0,casts=0,nextSave=240;
  const checkpointTimings:{seconds:number;captureMs:number;encodeMs:number;envelopeMs:number;decodeMs:number;restoreMs:number;bytes:number}[]=[];
  const saveAndResume=()=>{
   d.idle();expect(s.events).toHaveLength(0);
   let at=performance.now();const saved=captureCampaign(s,settings),captureMs=performance.now()-at;finiteTree(saved);
   at=performance.now();const valid=isCampaignSave(saved),envelopeMs=performance.now()-at;expect(valid).toBe(true);
   at=performance.now();const bytes=JSON.stringify(saved),encodeMs=performance.now()-at;
   at=performance.now();const parsed:unknown=JSON.parse(bytes),decodeMs=performance.now()-at;
   at=performance.now();const restored=restoreCampaignInto(s,parsed),restoreMs=performance.now()-at;
   expect(restored,getCampaignRestoreFailure(s)??'checkpoint must restore').not.toBeNull();
   checkpointTimings.push({seconds:Number(s.seconds.toFixed(2)),captureMs,encodeMs,envelopeMs,decodeMs,restoreMs,bytes:Buffer.byteLength(bytes,'utf8')});
   expect(captureCampaign(s,settings)).toEqual(saved);
   expect(s.survival.exportState().buildings.length).toBeLessThanOrEqual(s.survival.maxBuildings);
   expect(s.survival.exportState().sourceIds.length).toBeLessThanOrEqual(8192);
   expect(s.elements.exportState().drops).toHaveLength(0); // syncMaterials already transferred them
   expect(s.water.volume.length).toBe(waterCells);expect(s.water.volume.buffer).toBe(waterBuffer);
   for(const volume of s.water.volume)if(!Number.isFinite(volume)||volume<0||volume>1.000001)throw Error('Invalid finite-volume water cell');
   saves++;return Buffer.byteLength(bytes,'utf8');
  };
  // The existing ordinary-player route includes real gathering, three fights,
  // rescue, paid crafting, grapple/glide, progression and the ridge camp.
  playFirstChapter(d,{reserveManaDoses:16,reserveManaLeaves:32});d.menu('travel','hearth');d.walk(-3.5,5.3);
  // The chapter gathered finite leaves before unlocking forest threats.
  for(let dose=0;dose<16;dose++)d.menu('craft','mana-draught');
  const chapterSeconds=s.seconds;saveAndResume();
  expect(s.campaign.state.deaths).toBe(0);expect(s.campaign.state.campUnlocked).toBe(true);
  const cast=(element:Element)=>{
   d.until(()=>s.player.stamina>=40,4,{},'recover stamina for paid elemental cast');d.idle();
   while(s.selectedElement!==element)d.act('element-next');
   // Aim at an unmined end post, not above the horizontal bar harvested earlier.
   d.look({x:3.8,y:.8,z:7.1});
   expect(s.target(7)?.hit.cell.object,d.diagnostic('retained metal sample for repeat reactions')).toBe('sample-metal');
   if(s.combat.mana<20)d.menu('consume','mana-draught');const mana=s.combat.mana;
   d.act('cast');expect(s.player.phase,d.diagnostic(element+' accepted')).toBe('cast');expect(s.combat.mana).toBe(mana-20);casts++;
   d.until(()=>s.combat.pending===null,1,{},'ordinary spell cast finishes');
   expect([...s.elements.states.values()].some(state=>element==='water'?state.wet>0:state.charge>0)).toBe(true);
   d.advance(.8);
  };
  // Each loop uses the world, not a timer-only idle soak. The intact workbench
  // is paid for, verified, then undone through the same action used by X.
  // No resource respawns are injected; repeat mining is not falsely claimed.
  while(s.seconds<560){
   d.walk(-3.5,5.3);
   const held=s.survival.inventory[4];d.menu('homestead','deposit:4');d.menu('homestead','withdraw:4');expect(s.survival.inventory[4]).toBe(held);
   d.walk(0,6);d.act('build');d.look({x:-1.5,y:.27,z:4.9});
   const before=s.arena.field.exportState(),edits=d.field.editSampleCount;
   expect(s.buildPreview()?.ok,d.diagnostic('repeat paid workbench placement')).toBe(true);d.act('build');
   expect(s.survival.exportState().buildings).toHaveLength(1);expect(s.survival.inventory[4]).toBe(held-8);
   d.act('special');expect(s.survival.exportState().buildings).toHaveLength(0);expect(s.survival.inventory[4]).toBe(held);
   expect(s.arena.field.exportState()).toEqual(before);expect(d.field.editSampleCount).toBe(edits);d.act('cast');
   d.walk(2.5,5.3);cast('water');cast('lightning');
   for(const [x,z] of [[7,5.3],[11,5.3],[7,5.3],[0,5.3],[-3.5,5.3]])d.walk(x,z);
   cycles++;
   if(s.seconds>=nextSave){saveAndResume();nextSave+=120;}
  }
  expect(cycles).toBeGreaterThanOrEqual(6);expect(casts).toBe(cycles*2);
  // A final short ordinary-clock settle verifies particle/event expiry. Exactly
  // 18,000 production-sized frames were simulated, with no large-dt fast forward.
  while(d.frames<SOAK_STEPS)d.tick();
  expect(s.seconds).toBeCloseTo(600,7);expect(s.campaign.state.deaths).toBe(0);
  expect(s.elements.effects).toHaveLength(0);expect(s.elements.shards).toHaveLength(0);
  expect(s.arrows).toHaveLength(0);expect(s.enemyShots).toHaveLength(0);expect(s.tells).toHaveLength(0);expect(s.events).toHaveLength(0);
  const finalSaveBytes=saveAndResume();expect(saves).toBeGreaterThanOrEqual(4);
  expect(d.kinds.get('step')).toBeGreaterThan(100);expect(d.kinds.get('hit')).toBeGreaterThan(0);expect(d.kinds.get('break')).toBeGreaterThan(0);expect(d.kinds.get('water')).toBe(cycles);
  const cpu=process.cpuUsage(cpuStarted);
  console.info('Q08 CPU/core soak',{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,logicalCpus:cpus().length,simulatedSeconds:s.seconds,frames:d.frames,chapterSeconds,cycles,casts,saves,wallMs:Math.round(performance.now()-started),cpuMs:Math.round((cpu.user+cpu.system)/1000),finalSaveBytes,drainedEvents:d.drained,peakEvents:d.peakEvents,peakDrops:d.peakDrops,peakStates:d.peakStates,peakEffects:d.peakEffects,peakShards:d.peakShards,provider:d.field.provider.stats,checkpointTimings});
 },120000);

 it('repeatedly evicts and disposes streamed mesh geometry in an explicit small CPU render fixture',()=>{
  // Separate authored fixture, not campaign exploration or a WebGL measurement.
  const recorder=new SampleManifestRecorder();
  for(const x of [0,80,160])recorder.box({x:x-1,y:0,z:-1},{x:x+1,y:1,z:1},4,'fixture:'+x,.1);
  const field=new SparseOverlayField(recorder.createProvider('q08-render-fixture',4)),scene=new THREE.Scene(),world=new WorldMeshes(field,scene);
  const created=new Set<THREE.BufferGeometry>(),disposed=new Set<THREE.BufferGeometry>();let materialDisposed=0;
  world.material.addEventListener('dispose',()=>materialDisposed++);
  const observe=()=>{for(const mesh of world.chunks.values())if(!created.has(mesh.geometry)){const geometry=mesh.geometry;created.add(geometry);geometry.addEventListener('dispose',()=>disposed.add(geometry));}};
  let baselineTriangles:number|undefined;
  try{
   for(let cycle=0;cycle<8;cycle++)for(const x of [0,80,160]){
    for(let frame=0;frame<20;frame++){world.sync({x,y:0,z:0},4);observe();if(!world.lastBuiltChunks)break;if(frame===19)throw Error('Small fixture mesh work did not settle');}
    const stats=world.stats;expect(stats.residentChunks).toBeGreaterThan(0);expect(stats.provider!.numericCacheBytes).toBeLessThanOrEqual(stats.provider!.numericCacheBudgetBytes);
    expect(stats.provider!.cachedBlocks).toBeLessThanOrEqual(4);expect(stats.bucketScans).toBe(0);expect(field.cells.size).toBe(0);
    if(x===0){baselineTriangles??=stats.triangles;expect(stats.triangles).toBe(baselineTriangles);}
    expect(created.size-disposed.size).toBe(world.chunks.size);expect(scene.children).toHaveLength(world.chunks.size);
    const built=world.remeshes;for(let frame=0;frame<5;frame++)world.sync({x,y:0,z:0},4);expect(world.remeshes).toBe(built);
    world.sync({x:400,y:0,z:0},4);expect(world.chunks.size).toBe(0);expect(scene.children).toHaveLength(0);expect(disposed.size).toBe(created.size);
   }
   expect(world.stats.provider!.cacheEvictions).toBeGreaterThan(0);
  }finally{world.dispose();}
  expect(created.size).toBeGreaterThan(24);expect(disposed.size).toBe(created.size);expect(materialDisposed).toBe(1);expect(scene.children).toHaveLength(0);
 });
});
