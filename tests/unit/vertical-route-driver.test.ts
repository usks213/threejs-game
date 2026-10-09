import {expect,it} from 'vitest';
import {nativeRouteAxis,RouteCadence} from '../helpers/vertical-route-driver';
import {firstBeaconSave} from '../helpers/first-beacon-save';
import {GameSimulation} from '../../src/simulation/game-simulation';

it('uses camera-relative native axes and keeps the recent worst observation interval',()=>{
 expect(nativeRouteAxis({x:0,z:0},{x:10,z:0},Math.PI/2,.1,3.4)).toMatchObject({distance:10,z:1});
 const cadence=new RouteCadence();expect(cadence.observe(0)).toBe(.1);expect(cadence.observe(90)).toBe(3);expect(cadence.observe(93)).toBe(3);
 expect(nativeRouteAxis({x:9,z:14},{x:10,z:14},0,3,3.4).x).toBeCloseTo(1/20.4);
});
it('reproduces the previous delayed-feedback miss and arrives with bounded native stick input',()=>{
 const save=firstBeaconSave(),results=[];
 for(const adaptive of [false,true])for(const hold of [30,60,90]){
  const sim=new GameSimulation(save),cadence=new RouteCadence();let ticks=0,distance=Infinity;
  while(ticks<900){
   const p=sim.player;distance=Math.hypot(10-p.x,14-p.z);if(distance<.4)break;
   const axis=nativeRouteAxis(p,{x:10,z:14},0,adaptive?cadence.observe(sim.tick):.1,3.4);
   expect(Math.hypot(axis.x,axis.z)).toBeLessThanOrEqual(1.000001);
   for(let i=0;i<hold;i++){sim.step({x:axis.x,z:axis.z,jump:false});ticks++;}
  }
  results.push({adaptive,hold,ticks,distance});
  expect(distance<.4,JSON.stringify(results)).toBe(adaptive);
 }
},40000);

it.each([30,60])('keeps both continuous glide legs safe with %i-tick feedback and observes the current ground stage',async(hold)=>{
 const {caveBeaconGoal}=await import('../../src/game/adventure-goal');
 const sim=new GameSimulation(firstBeaconSave()),g=sim.adventure;
 const walk=(target:{x:number;z:number})=>{let n=0;while(Math.hypot(sim.player.x-target.x,sim.player.z-target.z)>.3&&n++<900){const a=nativeRouteAxis(sim.player,target,0,.1,3.4);sim.step({...a,jump:false});}expect(n).toBeLessThan(900);};
 let opens=0;
 const glide=(target:{x:number;z:number})=>{
  const cadence=new RouteCadence();let opened=false,n=0;
  while(n<1350){
   const p=sim.player;if(opened&&p.grounded)break;
   const a=nativeRouteAxis(p,target,0,cadence.observe(sim.tick),g.traversal.gliding?5.1:3.4);
   if(!opened&&!p.grounded&&p.vy<-1){g.action('glide');opened=true;opens++;}
   for(let i=0;i<hold;i++){sim.step({...a,jump:false});n++;expect(g.state.health).toBe(25);if(opened&&!sim.player.grounded){expect(g.traversal.gliding).toBe(true);expect(g.state.stamina).toBeGreaterThan(0);}}
  }
  expect(n).toBeLessThan(1350);expect(opened).toBe(true);expect(sim.player.grounded).toBe(true);
 };
 walk({x:10,z:14});walk({x:10,z:-17});g.action('sky-ascend-preview');g.action('sky-ascend');walk({x:16,z:-18});
 glide({x:22,z:8});expect(sim.player.y).toBeGreaterThan(2.5);
 const stage=caveBeaconGoal(g.snapshot(),sim.player);
 expect(stage.title).toBe(g.state.stamina<40?'地面でスタミナを戻そう':'大穴へ歩き、翼を開こう');
 // Safe landing and exact waypoint arrival are separate: correct normally on
 // the ground, and never infer that a transient low-stamina hint still applies.
 walk({x:22,z:8});for(let n=0;n<150&&g.state.stamina<40;n++)sim.step({x:0,z:0,jump:false});expect(g.state.stamina).toBeGreaterThanOrEqual(40);
 glide({x:28,z:8});expect(sim.player.y).toBeLessThan(-10);expect(opens).toBe(2);
},20000);
