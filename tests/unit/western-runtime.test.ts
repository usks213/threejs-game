import {describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {WEST_EXPEDITION_MANIFEST} from '../../src/prototype/core/expedition-west';
import {captureGameFrame,validGameFrame} from '../../src/prototype/network/game-frame';
import {createPlayerState,validCompanionSnapshot} from '../../src/prototype/core/companion';
const idle={x:0,z:0,sprint:false,block:false,water:false};
describe('explicit western runtime adapter (fixture integration, not a normal-play proof)',()=>{
 it('leaves the original18-slot registry intact and appends four bounded west actors',()=>{
  const sim=new CoreSimulation(true,false,true,true);expect(sim.arena.field.exportState().baseline).toBe(WEST_EXPEDITION_MANIFEST);expect(sim.arena.field.cells.size).toBe(0);expect(sim.enemies).toHaveLength(22);
  expect(sim.enemies.slice(15,18).map(e=>e.summonOwner)).toEqual([-1,-1,-1]);expect(sim.enemies.slice(18).map(e=>e.regional)).toEqual([201,202,203,204]);expect(sim.enemies.slice(18).every(e=>!sim.enemyActive(e))).toBe(true);
  const before=sim.enemies.slice(18).map(e=>({...e.position}));sim.tick(1/60,idle);expect(sim.enemies.slice(18).map(e=>e.position)).toEqual(before);expect(sim.elements.protectedObjects.has('west-mine-switch')).toBe(true);
  const ordinary=new CoreSimulation(true,false,true);expect(ordinary.western).toBeNull();expect(ordinary.enemies).toHaveLength(18);
 });
 it('dispatches an actual ray-selected western cache through Core.action exactly once',()=>{
  const sim=new CoreSimulation(true,false,true,true);Object.assign(sim.campaign.state,{flameTier:2,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});
  sim.player.position={x:-49.7,y:.75,z:-11.5};const eye=sim.eye(),point={x:-50,y:1.1,z:-13},dx=point.x-eye.x,dz=point.z-eye.z;sim.player.yaw=Math.atan2(-dx,-dz);sim.player.pitch=Math.atan2(point.y-eye.y,Math.hypot(dx,dz));
  expect(sim.target()?.hit.cell.object).toBe('west-hamlet-cache');sim.action('interact',idle);expect(sim.western!.snapshot().claimed).toContain('west-hamlet-cache');expect(sim.survival.inventory[4]).toBe(12);
  sim.action('interact',idle);expect(sim.survival.inventory[4]).toBe(12);expect(sim.campaign.state.items['amber-resin']).toBe(2);
 });
 it('accepts the expanded physical bounds only for the explicit22-slot backend',()=>{
  const sim=new CoreSimulation(true,false,true,true);sim.enableCompanion();sim.player.position.x=-110;sim.companion!.position.x=-111;const frame=captureGameFrame(sim);frame.arrows.push({position:{x:-150,y:2,z:-40},velocity:{x:-18,y:0,z:0},life:1});expect(validGameFrame(frame,22)).toBe(true);expect(validGameFrame(frame,18)).toBe(false);
  const companion=sim.companionSnapshot()!;expect(validCompanionSnapshot(companion,true)).toBe(true);expect(validCompanionSnapshot(companion)).toBe(false);companion.player.position.x=-129;expect(validCompanionSnapshot(companion,true)).toBe(false);
  const p=createPlayerState();expect(p.position.x).toBe(0);
 });
});
