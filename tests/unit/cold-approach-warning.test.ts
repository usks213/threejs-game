import {describe,expect,it} from 'vitest';
import {REGIONS,coldRegionWarning,regionalHazard} from '../../src/prototype/core/regions';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {campaignHudText} from '../../src/prototype/campaign-hud';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {defaultSettings} from '../../src/prototype/campaign-session';

const base={level:2,xp:0,skillPoints:0,region:'銅風の尾根',objective:'探す',weather:'晴れ'};
const frozen=REGIONS.find(region=>region.climate==='freezing')!;
const point=(x:number,z:number)=>({x,y:frozen.groundY,z});

describe('local cold-region approach cue',()=>{
 it('warns on the authored approach route before the actual cold hazard starts',()=>{
  const approach=frozen.route[0];
  expect(coldRegionWarning(approach)).toBe('approaching');
  expect(regionalHazard(approach,1).coldPerSecond).toBe(0);
  expect(coldRegionWarning(point(approach.x,frozen.bounds.maxZ+4.01))).toBeUndefined();
  expect(coldRegionWarning(frozen.route[1])).toBe('inside');
  expect(regionalHazard(frozen.route[1],1).coldPerSecond).toBe(4);
 });

 it('uses all real region edges and radial corner distance, without warning across the wider map',()=>{
  const b=frozen.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  for(const p of [point(b.minX-4,cz),point(b.maxX+4,cz),point(cx,b.minZ-4),point(cx,b.maxZ+4),point(b.minX-2,b.maxZ+2)])expect(coldRegionWarning(p)).toBe('approaching');
  for(const p of [point(b.minX-4.01,cz),point(b.maxX+4.01,cz),point(cx,b.minZ-4.01),point(b.minX-3,b.maxZ+3),point(13,-48),point(0,0),point(NaN,cz)])expect(coldRegionWarning(p)).toBeUndefined();
 });

 it('switches to the inside cue on inclusive hazard bounds and clears after leaving the nearby area',()=>{
  const b=frozen.bounds;
  for(const p of [point(b.minX,b.minZ),point(b.maxX,b.maxZ),point(-7,-48)])expect(coldRegionWarning(p)).toBe('inside');
  expect(coldRegionWarning(point(-7,b.maxZ+.01))).toBe('approaching');
  expect(coldRegionWarning(point(-7,b.maxZ+4.01))).toBeUndefined();
 });

 it('feeds the actual HUD before cold accumulates and never reveals or unlocks map content',()=>{
  const sim=new CoreSimulation(true,false,true),settings=defaultSettings(),save={available:false,label:'',status:''};
  const before=campaignSnapshot(sim,settings,save,[],false),discovered=[...sim.campaign.state.discoveredRegions],unlocked=[...sim.campaign.state.unlockedRegions];
  sim.player.position={...frozen.route[0]};
  const approach=campaignSnapshot(sim,settings,save,[],false);
  expect(approach.stats.cold).toBeUndefined();
  expect(approach.stats.coldWarning).toBe('approaching');
  expect(campaignHudText(approach.stats).headline).toBe('寒冷地域が近い');
  sim.player.position=point(-7,-48);
  const inside=campaignSnapshot(sim,settings,save,[],false);
  expect(inside.stats.coldWarning).toBe('inside');
  expect(campaignHudText(inside.stats).headline).toBe('寒冷地域');
  for(const snapshot of [approach,inside]){
   expect(snapshot.map).toBe(before.map);
   expect(snapshot.map?.areas.some(region=>region.id===frozen.id)).toBe(false);
   expect(snapshot.points.some(p=>p.id.startsWith('rg-rime-'))).toBe(false);
   expect(campaignHudText(snapshot.stats).full).not.toContain(frozen.name);
  }
  expect(sim.campaign.state.discoveredRegions).toEqual(discovered);
  expect(sim.campaign.state.unlockedRegions).toEqual(unlocked);
  sim.cold=20;
  sim.player.position=point(-7,frozen.bounds.maxZ+4.01);
  const outside=campaignSnapshot(sim,settings,save,[],false),hud=campaignHudText(outside.stats);
  expect(outside.stats.coldWarning).toBeUndefined();
  expect(hud.headline).toBe('Lv.1 · 銅風の尾根');
  expect(hud.full).toContain('寒冷 20%');
  expect(hud.full).not.toContain('寒冷地域が近い');
 });
});

describe('cold advice and urgent HUD priority',()=>{
 it('shows compact preparation advice before accumulation and complete protection/retreat advice in the readout',()=>{
  const hud=campaignHudText({...base,coldWarning:'approaching',cold:0,wet:5,food:120});
  expect(hud).toMatchObject({headline:'寒冷地域が近い',detail:'服・食事・火で備える',danger:false});
  for(const text of ['保温装備','食事','火','寒冷地域の外で回復'])expect(hud.full).toContain(text);
  expect(hud.detail.length).toBeLessThanOrEqual(10);
 });

 it('keeps the in-region cue even with no exposure yet, and explains retreat while exposure is mild',()=>{
  expect(campaignHudText({...base,coldWarning:'inside',cold:0})).toMatchObject({headline:'寒冷地域',detail:'服・食・火／外で回復',danger:false});
  const hud=campaignHudText({...base,coldWarning:'inside',cold:28.1,warmth:.8});
  expect(hud.headline).toBe('寒冷地域 29%');
  expect(hud.detail.length).toBeLessThanOrEqual(10);
  expect(hud.full).toContain('火のぬくもり');
 });

 it.each([
  [{shroud:4},{headline:'霧 0:04',detail:'霧の外へ退避'}],
  [{oxygen:3},{headline:'酸素 3秒',detail:'水面へ浮上'}],
  [{burning:2},{headline:'炎上 2秒',detail:'水で消火する'}],
  [{shock:1},{headline:'感電',detail:'金属から離れる'}],
  [{cold:90},{headline:'寒冷 90%',detail:'火へ避難／退域で回復'}],
 ] as const)('keeps urgent hazard %j ahead of an approach cue',(hazard,expected)=>{
  const hud=campaignHudText({...base,coldWarning:'approaching',...hazard});
  expect(hud).toMatchObject({...expected,danger:true});
  expect(hud.full).toContain('寒冷地域が近い');
 });

 it('keeps multiple hazards and ordinary shroud countdowns visible alongside the climate information',()=>{
  expect(campaignHudText({...base,coldWarning:'inside',shroud:4,oxygen:3,burning:2,cold:90})).toMatchObject({headline:'霧 0:04',detail:'酸素 3秒 ほか2',danger:true});
  expect(campaignHudText({...base,coldWarning:'approaching',shroud:70})).toMatchObject({headline:'寒冷地域が近い',detail:'霧 1:10',danger:false});
  expect(campaignHudText({...base,coldWarning:'inside',cold:90,warmth:.8}).detail).toBe('火のそばで暖まり中');
 });
});
