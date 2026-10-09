import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {CAVE_APPROACH,caveBeaconGoal,skyBeaconGoal} from '../../src/game/adventure-goal';
import type {Vec3} from '../../src/world/types';

// Real fresh terrain, water, actors and starter inventory. Only ordinary input
// and public game actions are used; no coordinate writes or flight fixtures.
function route(sim:GameSimulation){
 const g=sim.adventure;
 const step=(target?:Pick<Vec3,'x'|'z'>,keyboard=false)=>{
  const dx=target?target.x-sim.player.x:0,dz=target?target.z-sim.player.z:0,length=Math.max(1,Math.hypot(dx,dz));
  sim.step({x:keyboard?(Math.abs(dx)>.25?Math.sign(dx):0):dx/length,z:keyboard?(Math.abs(dz)>.25?Math.sign(dz):0):dz/length,jump:false});
  expect(g.state.health).toBe(25);
 };
 const walk=(target:Pick<Vec3,'x'|'z'>)=>{
  let n=0;while(Math.hypot(sim.player.x-target.x,sim.player.z-target.z)>.2&&n++<700)step(target);
  expect(n).toBeLessThan(700);
 };
 const glideTo=(target:Pick<Vec3,'x'|'z'>,control:'analog'|'released'|'keyboard'='analog')=>{
  let opened=false,ticks=0,minimum=50,airTicks=0,released=false;
  while(ticks++<700){
   if(control==='released'&&Math.hypot(sim.player.x-target.x,sim.player.z-target.z)<.3)released=true;
   step(released?undefined:target,control==='keyboard');minimum=Math.min(minimum,g.state.stamina);
   if(opened){
    airTicks++;
    expect(g.traversal.gliding).toBe(true);
    expect(g.state.stamina).toBeGreaterThan(0);
    if(sim.player.grounded)break;
   }else if(!sim.player.grounded&&sim.player.vy<-1){g.action('glide');opened=true;}
  }
  expect(opened).toBe(true);expect(ticks).toBeLessThan(700);expect(sim.player.grounded).toBe(true);
  step();expect(g.traversal.gliding).toBe(false);
  return {minimum,airSeconds:airTicks/30};
 };
 return {step,walk,glideTo};
}
it('walks from spawn into the cave with one continuous glide and starter stamina',()=>{
 const sim=new GameSimulation(),r=route(sim);
 r.walk({x:10,z:14});r.walk(CAVE_APPROACH);
 expect(sim.player.y).toBeGreaterThan(2.5);expect(sim.adventure.state.stamina).toBe(50);
 const descent=r.glideTo({x:28,z:8});
 expect(sim.player.y).toBeCloseTo(-11,1);expect(descent.minimum).toBeGreaterThan(20);expect(descent.airSeconds).toBeLessThan(6);
 expect(sim.world.edits).toHaveLength(0);expect(sim.adventure.state.inventory.glider).toBe(1);
},20000);
it('does not turn off the approach waypoint until the player has crossed onto the ramp',()=>{
 for(const destination of ['sky','cave']){
  const sim=new GameSimulation(),r=route(sim);let n=0;
  const goal=()=>destination==='sky'?skyBeaconGoal(sim.player):caveBeaconGoal(sim.adventure.snapshot(),sim.player);
  while(n++<600){const next=goal();if(next.title.includes(destination==='sky'?'天抜け':'翼を開こう'))break;r.step(next.target);}
  expect(n).toBeLessThan(600);expect(sim.player.x).toBeGreaterThan(8.3);
  if(destination==='sky'){sim.adventure.action('sky-ascend-preview');expect(sim.skybound.snapshot('host').ascendPreview?.exit.y).toBeGreaterThan(24);}
  else expect(Math.hypot(sim.player.x-22,sim.player.z-8)).toBeLessThan(1.5);
 }
},20000);
it.each([{control:'released' as const,seconds:0},{control:'keyboard' as const,seconds:900},{control:'analog' as const,seconds:900}])('lands with $control movement in wind at world second $seconds',({control,seconds})=>{
 const sim=new GameSimulation(),r=route(sim);
 // The only weather fixture is time; terrain, water, enemies, spawn, stamina
 // and inventory are unchanged. 900s selects the real storm wind model.
 sim.adventure.state.seconds=seconds;
 r.walk({x:10,z:14});r.walk(CAVE_APPROACH);
 const descent=r.glideTo({x:28,z:8},control);
 // Digital corrections briefly restore full lift, so the storm descent costs
 // more stamina than gentle analog steering but keeps a two-second reserve.
 expect(sim.player.y).toBeCloseTo(-11,1);expect(descent.minimum).toBeGreaterThan(control==='keyboard'?10:15);
 expect(Math.hypot(sim.player.x-28,sim.player.z-8)).toBeLessThan(3.2);
},20000);
it('eases descent continuously without changing the wing price or accepting invalid velocity',()=>{
 const sim=new GameSimulation(),g=sim.adventure;
 // Isolated cap/cost check; full-terrain arrival coverage is above.
 sim.player.grounded=false;g.traversal.gliding=true;
 for(const [x,cap] of [[1,-.4],[.5,-1.9],[0,-3.4],[Number.NaN,-3.4]]){
  sim.player.vy=-9;const stamina=g.state.stamina;
  g.traversal.beforeMove({x,z:0,jump:false},.1);
  expect(sim.player.vy).toBeCloseTo(cap);expect(g.state.stamina).toBeCloseTo(stamina-.5);
 }
});
it('walks the ramp, uses Ascend, then lands and rests before the cave descent',()=>{
 const sim=new GameSimulation(),r=route(sim),g=sim.adventure;
 r.walk({x:10,z:14});expect(skyBeaconGoal(sim.player).title).toContain('上まで');
 r.walk({x:10,z:-17});expect(sim.player.y).toBeGreaterThan(17);expect(skyBeaconGoal(sim.player).title).toContain('天抜け');
 g.action('sky-ascend-preview');expect(g.snapshot().skybound?.ascendPreview?.exit.y).toBeGreaterThan(24);
 g.action('sky-ascend');expect(sim.player.y).toBeGreaterThan(24);
 r.walk({x:16,z:-18});
 const skyLeg=r.glideTo(CAVE_APPROACH);
 expect(Math.hypot(sim.player.x-CAVE_APPROACH.x,sim.player.z-CAVE_APPROACH.z)).toBeLessThan(.3);
 expect(sim.player.y).toBeGreaterThan(2.5);expect(skyLeg.minimum).toBeGreaterThan(5);expect(skyLeg.minimum).toBeLessThan(15);
 expect(caveBeaconGoal(g.snapshot(),sim.player).title).toContain('スタミナ');
 let rest=0;while(g.state.stamina<40&&rest++<150)r.step();
 expect(rest).toBeLessThan(150);expect(caveBeaconGoal(g.snapshot(),sim.player).title).toContain('翼を開こう');
 const caveLeg=r.glideTo({x:28,z:8});
 expect(sim.player.y).toBeCloseTo(-11,1);expect(caveLeg.minimum).toBeGreaterThan(10);
 expect(g.action('gather','810003').message).toContain('輝き');
 expect(sim.world.edits).toHaveLength(0);
},20000);

it('derives the browser continuation save by earning the first beacon on the real world',async()=>{
 const {firstBeaconSave}=await import('../helpers/first-beacon-save');
 const save=firstBeaconSave();
 expect(save.adventure?.resources.find(n=>n.id===810001)?.ready).toBe(1e10);
 expect(save.adventure?.inventory.wood).toBe(8);
 expect(save.skybound?.parts).toHaveLength(2);expect(save.skybound?.parts.every(p=>p.links.length>0)).toBe(true);
 expect(save.player.y).toBeLessThan(3);expect(save.edits).toHaveLength(0);expect(save.fluids.length).toBeGreaterThan(0);
},20000);
