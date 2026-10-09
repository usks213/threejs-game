import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {journeyGoal} from '../../src/game/journey';
import {createdPreview} from '../../src/game/skybound/preview';
import {skyBeaconGoal,caveBeaconGoal,CAVE_APPROACH} from '../../src/game/adventure-goal';
import {journeyDistance,journeyHint} from '../../src/ui/journey-distance';
import {interactionTarget} from '../../src/game/interaction/target';

it('uses actual assembly state, even if the optional practice was done out of order',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),beacon=s.resources.find(n=>n.id===810001)!;
 const make=(id:number,x:number)=>({...createdPreview('beam','wood',{x,y:sim.player.y+.5,z:sim.player.z-2}).parts[0],id,recalling:false,powered:false,lightRadius:0});
 s.inventory.wood=4;s.skybound!.parts=[make(1,2)];
 expect(journeyGoal(s,sim.player).title).toBe('もう一つ、木の梁を作ろう');
 s.skybound!.parts.push(make(2,4));expect(journeyGoal(s,sim.player).title).toBe('二つの部品をつなごう');
 s.skybound!.parts[0].links=[2];s.skybound!.parts[1].links=[1];s.skybound!.parts[0].position={x:beacon.x,y:beacon.y+.5,z:beacon.z+2};
 expect(journeyGoal(s,sim.player)).toMatchObject({title:'最初の灯をともそう',target:beacon});
});
it('prioritizes recoverable grave contents, including after the ending',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot();s.death={x:50,y:29,z:25};s.grave={wood:8};s.defeated=['stormcore'];
 expect(journeyGoal(s,sim.player)).toMatchObject({title:'墓標の荷物を取り戻そう',target:s.death});
 s.grave={};expect(journeyGoal(s,sim.player).title).toBe('三つの高さをつないだ');
});
it('guides ramp entry, ascent and the high destination separately',()=>{
 expect(skyBeaconGoal({x:0,y:3,z:8}).target).toEqual({x:10,y:2.04,z:14});
 expect(skyBeaconGoal({x:10,y:2.04,z:14}).title).toBe('斜路を上まで登ろう');
 expect(skyBeaconGoal({x:10,y:10,z:-5}).target).toEqual({x:10,y:17.5,z:-17});
 expect(skyBeaconGoal({x:10,y:18,z:-17}).title).toContain('天抜け');
 expect(skyBeaconGoal({x:10,y:18,z:-17}).target?.y).toBe(25);
 expect(skyBeaconGoal({x:18,y:25,z:-18}).title).toContain('灯をともそう');
});
it('reports vertical distance and direction without breaking heightless legacy targets',()=>{
 expect(journeyDistance({x:28,y:-10.5,z:8},{x:28,y:22.7,z:8})).toBe('33m');
 expect(journeyDistance({x:10,y:25,z:-17},{x:10,y:17.5,z:-17})).toBe('8m');
 expect(journeyDistance({x:3,y:7,z:4},{x:0,y:-5,z:0})).toBe('13m');
 expect(journeyDistance({x:3,z:4},{x:0,y:40,z:0})).toBe('5m');
 expect(journeyDistance(undefined,{x:0,y:0,z:0})).toBe('');
 const goal={title:'目的地',detail:'翼を開こう',tab:'world',progress:0,target:{x:28,y:-10.5,z:8}};
 expect(journeyHint(goal,{x:28,y:22.7,z:8})).toBe('下33m · 翼を開こう');
 expect(journeyHint({...goal,target:{x:10,y:25,z:-17}},{x:10,y:17.5,z:-17})).toBe('上8m · 翼を開こう');
 expect(journeyHint({...goal,target:undefined},{x:0,y:0,z:0})).toBe(goal.detail);
});
it('stages cave approach, landing, recovery and a continuous wing descent',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot();
 for(const id of [810001,810002])s.resources.find(n=>n.id===id)!.ready=1e10;
 expect(journeyGoal(s,{x:18,y:25,z:-18})).toMatchObject({title:'大穴の手前へ着地しよう',target:CAVE_APPROACH});
 expect(caveBeaconGoal(s,{x:0,y:3,z:8}).target).toMatchObject({x:10,z:14});
 expect(caveBeaconGoal(s,{x:10,y:2.04,z:14}).target).toEqual(CAVE_APPROACH);
 s.stamina=9;s.traversal={gliding:true,climbing:false};
 expect(caveBeaconGoal(s,{x:22,y:3.4,z:8}).title).toContain('着地');
 s.traversal.gliding=false;
 expect(caveBeaconGoal(s,CAVE_APPROACH).title).toContain('スタミナ');
 s.stamina=40;expect(caveBeaconGoal(s,CAVE_APPROACH).title).toContain('翼を開こう');
 expect(caveBeaconGoal(s,{x:28,y:1,z:8}).target?.y).toBe(-10.5);
 expect(caveBeaconGoal(s,{x:28,y:-11,z:8}).title).toContain('灯台をともそう');
});
it('labels the first beacon with the actual next action',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),beacon=s.resources.find(n=>n.id===810001)!;
 s.resources=[beacon];s.buildings=[];const p={x:beacon.x,y:beacon.y,z:beacon.z+2};
 expect(interactionTarget(s,p,{...p,y:p.y+1},{x:0,y:0,z:-1})?.label).toBe('灯をともす');
});
it('the route endpoint has a real safe ascend exit above the authored ramp',()=>{
 const sim=new GameSimulation();Object.assign(sim.player,{x:10,y:3+(8+17)*.58+.05,z:-17,grounded:true});
 const result=sim.adventure.action('sky-ascend-preview');
 expect(result.message).toContain('出口');expect(sim.skybound.snapshot('host').ascendPreview?.exit.y).toBeGreaterThan(24);
});
it('puts the opening wood cache ahead and in pickup reach, without personal grants',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),wood=s.resources.find(n=>n.kind==='wood'&&n.drop)!;
 expect(wood.z).toBeLessThan(sim.player.z);expect(Math.hypot(wood.x-sim.player.x,wood.y-sim.player.y,wood.z-sim.player.z)).toBeLessThan(3);
 expect(s.inventory.wood??0).toBe(0);expect(wood.amount).toBe(12);
});
it('still guides older graves once the most recent grave is empty',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot();s.death={x:2,y:3,z:8};s.grave={};
 s.meadows!.graves=[{x:7,y:3,z:8,items:{wood:8}},{x:2,y:3,z:9,items:{}}];
 expect(journeyGoal(s,sim.player).target).toMatchObject({x:7,z:8});
 s.meadows!.graves[0].items={};expect(journeyGoal(s,sim.player).title).not.toContain('墓標');
});
