import {expect,it} from 'vitest';
import {CoopTimingSource,CoopTimingWindow,readCoopTiming,type CoopTiming} from '../../src/networking/coop-timing';
import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import {FixedStepClock} from '../../src/networking/fixed-step-clock';
const epoch=1791234567000;
function sample(overrides:Partial<CoopTiming>={}):CoopTiming{return {version:1,clock:'worker-io',run:1,startedIoMs:epoch,nowIoMs:epoch+100,lastStepIoMs:epoch+90,tick:3,active:true,scheduler:{steps:3,turns:3,catchUpSteps:0,rebases:0,droppedMs:0,maxDebtMs:4},...overrides};}
it('accepts old pongs and passes optional timing through without changing the protocol decoder',()=>{
 const decoder=new CoopFrameDecoder();expect(decoder.accept({type:'pong'})).toEqual({type:'pong'});const pong={type:'pong' as const,timing:sample()};expect(decoder.accept(pong)).toBe(pong);
});
it('copies a bounded scalar schema without retaining source objects or unknown fields',()=>{
 const raw={...sample(),privateState:'not telemetry',scheduler:{...sample().scheduler,history:new Array(100).fill(1)}},copy=readCoopTiming(raw)!;
 raw.scheduler.steps=100;expect(copy.scheduler.steps).toBe(3);expect(Object.keys(copy.scheduler)).toHaveLength(6);expect('privateState' in copy).toBe(false);expect(JSON.stringify(copy).length).toBeLessThan(400);
});
it('rejects malformed optional telemetry without throwing',()=>{
 for(const raw of [undefined,null,{},sample({version:2 as 1}),sample({clock:'cpu' as 'worker-io'}),sample({run:0}),sample({tick:NaN}),sample({nowIoMs:Infinity}),sample({lastStepIoMs:epoch-1}),sample({lastStepIoMs:epoch+101}),sample({scheduler:{...sample().scheduler,steps:.5}}),sample({scheduler:{...sample().scheduler,droppedMs:-1}})])expect(readCoopTiming(raw)).toBeUndefined();
});
it('records event timestamps without treating frozen synchronous time as CPU work',()=>{
 let now=epoch;const source=new CoopTimingSource(1,()=>now),clock={active:true,stats:sample().scheduler};expect(source.sample(clock,0)?.lastStepIoMs).toBeNull();
 now+=34;source.stepCompleted();const first=source.sample(clock,1)!;expect(first.nowIoMs).toBe(first.lastStepIoMs);now+=40;const later=source.sample(clock,1)!;expect(later.nowIoMs-later.lastStepIoMs!).toBe(40);expect(first.nowIoMs).toBe(epoch+34);
});
it('does not schedule work or alter scheduler cadence, debt, or stop behavior',()=>{
 const run=(diagnostic:boolean)=>{let now=epoch,step=0;const delays:number[]=[],queue:(()=>void)[]=[];const source=new CoopTimingSource(1,()=>now);
  const clock=new FixedStepClock(()=>{step++;if(diagnostic)source.stepCompleted();},{maxCatchUpSteps:1,now:()=>now,schedule:(callback,delay)=>{delays.push(delay);queue.push(callback);return()=>{};}});
  clock.start();for(let i=0;i<12;i++){now+=i===5?400:34;queue.shift()!();if(diagnostic)source.sample(clock,step);}clock.stop();if(diagnostic)expect(source.sample(clock,step)?.active).toBe(false);return{delays,stats:clock.stats,step};};
 expect(run(true)).toEqual(run(false));
});
it('keeps telemetry unavailable for older servers without inventing counters',()=>{
 const window=new CoopTimingWindow();window.observe(undefined,10);window.observe(undefined,20);expect(window.summary()).toMatchObject({status:'unavailable',samples:0,missingSamples:2,delta:null,first:null,last:null});
});
it('reports separate callback/tick deltas and endpoint clocks, retaining run-cumulative maximum debt',()=>{
 const window=new CoopTimingWindow();window.observe(sample(),1000);window.observe(sample({nowIoMs:epoch+2100,lastStepIoMs:epoch+2080,tick:52,scheduler:{steps:57,turns:58,catchUpSteps:0,rebases:2,droppedMs:271.5,maxDebtMs:280}}),3010);
 expect(window.summary()).toMatchObject({status:'observed',elapsedIoMs:2000,elapsedClientMs:2010,ioMinusClientElapsedMs:-10,stepsPerIoSecond:27,delta:{steps:54,turns:55,catchUpSteps:0,rebases:2,droppedMs:271.5,ticks:49},maxLastStepAgeIoMs:20,maxDebtIoMs:280});
});
it('does not divide equal-clock endpoints or claim a single sample is an interval',()=>{
 const window=new CoopTimingWindow();window.observe(sample({lastStepIoMs:null}),1);expect(window.summary()).toMatchObject({status:'insufficient',delta:null,maxLastStepAgeIoMs:null});window.observe(sample(),2);expect(window.summary()).toMatchObject({elapsedIoMs:0,stepsPerIoSecond:null});
});
it('does not combine scheduler restarts or regressing clocks/counters into a valid interval',()=>{
 for(const changed of [sample({run:2}),sample({startedIoMs:epoch+1}),sample({nowIoMs:epoch+99}),sample({tick:2}),sample({lastStepIoMs:null}),sample({scheduler:{...sample().scheduler,steps:2}})]){const window=new CoopTimingWindow();window.observe(sample(),10);window.observe(changed,20);expect(window.summary()).toMatchObject({status:'discontinuous',delta:null});}
 const window=new CoopTimingWindow();window.observe(sample(),20);window.observe(sample(),10);expect(window.summary()).toMatchObject({status:'discontinuous',delta:null});
});
it('retains only endpoint observations and reports invalid data without failing gameplay measurement',()=>{
 const window=new CoopTimingWindow();for(let i=0;i<1000;i++)window.observe(sample({nowIoMs:epoch+100+i}),i);const summary=window.summary();expect(summary.samples).toBe(1000);expect(JSON.stringify(summary).length).toBeLessThan(2000);window.observe({version:2},1001);expect(window.summary()).toMatchObject({status:'invalid',invalidSamples:1,delta:null});
});
