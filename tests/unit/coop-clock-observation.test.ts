import {expect,it} from 'vitest';
import {CoopClockObserver,readCoopClockObservation} from '../../src/networking/coop-clock-observation';
import {CoopTimingSource,CoopTimingWindow,readCoopTiming} from '../../src/networking/coop-timing';
const clock={active:true,stats:{steps:0,turns:0,catchUpSteps:0,rebases:0,droppedMs:0,maxDebtMs:0}};
it('attributes observed clock advances to step/message entry and retains only the last large jump',()=>{
 const f=new CoopClockObserver(1000);f.observe('message',1000,0);f.observe('step',1034,0);f.observe('message',1035,1);f.observe('message',2235,1);f.observe('step',2269,1);
 expect(f.sample()).toEqual({version:1,stepEntries:2,messageEntries:3,stepAdvanceIoMs:68,messageAdvanceIoMs:1201,stepJumps:0,messageJumps:1,regressions:0,maxAdvanceIoMs:1200,lastJump:{previous:'message',current:'message',fromIoMs:1035,toIoMs:2235,advanceIoMs:1200,tick:1}});
 f.observe('step',2200,2);expect(f.sample()).toMatchObject({stepEntries:3,stepAdvanceIoMs:68,regressions:1});
});
it('accepts old telemetry and rejects malformed optional event data while copying only bounded fields',()=>{
 let now=1000;const f=new CoopTimingSource(1,()=>now);now=1400;f.stepEntered(0);const sample=f.sample(clock,0)!;expect(readCoopTiming({...sample,events:undefined})?.events).toBeUndefined();
 const copied=readCoopTiming({...sample,events:{...sample.events,unknown:'discard'}})!;sample.events!.lastJump!.tick=99;expect(copied.events!.lastJump!.tick).toBe(0);expect('unknown'in copied.events!).toBe(false);
 for(const events of [null,{}, {...sample.events,version:2},{...sample.events,stepEntries:-1},{...sample.events,stepAdvanceIoMs:Infinity},{...sample.events,messageEntries:.5},{...sample.events,lastJump:{...sample.events!.lastJump,current:'ping'}},{...sample.events,lastJump:{...sample.events!.lastJump,advanceIoMs:0}}])expect(readCoopTiming({...sample,events})).toBeUndefined();
 expect(readCoopClockObservation(undefined)).toBeUndefined();
});
it('observations do not claim synchronous CPU time and snapshots cannot mutate the source',()=>{
 const f=new CoopTimingSource(1,()=>1000);f.messageEntered(0);f.stepEntered(0);f.stepCompleted();const first=f.sample(clock,1)!;
 expect(first.events).toMatchObject({stepAdvanceIoMs:0,messageAdvanceIoMs:0,stepEntries:1,messageEntries:1});first.events!.stepEntries=50;expect(f.sample(clock,1)!.events!.stepEntries).toBe(1);
});
it('keeps at most eight distinct sampled clock jumps without retaining arbitrary event history',()=>{
 let now=1000;const source=new CoopTimingSource(1,()=>now),window=new CoopTimingWindow();for(let i=0;i<100;i++){now+=300;source.messageEntered(i);window.observe(source.sample(clock,i),i*300);window.observe(source.sample(clock,i),i*300+1);}
 const out=window.summary();expect(out.recentClockJumps).toHaveLength(8);expect(out.recentClockJumps[0].jump.tick).toBe(92);out.recentClockJumps[0].jump.tick=999;expect(window.summary().recentClockJumps[0].jump.tick).toBe(92);
});
it('does not report a continuous interval when optional event counters regress',()=>{
 let now=1000;const source=new CoopTimingSource(1,()=>now),window=new CoopTimingWindow();source.messageEntered(0);window.observe(source.sample(clock,0),10);now=1100;const sample=source.sample(clock,0)!;sample.events!.messageEntries=0;window.observe(sample,20);expect(window.summary()).toMatchObject({status:'discontinuous',delta:null});
});
it('marks hidden within-window clock regression even when the final clock has caught up',()=>{
 let now=1000;const source=new CoopTimingSource(1,()=>now),window=new CoopTimingWindow();source.messageEntered(0);window.observe(source.sample(clock,0),10);now=950;source.messageEntered(0);now=1100;source.messageEntered(0);window.observe(source.sample(clock,0),20);expect(window.summary()).toMatchObject({status:'discontinuous',delta:null});
});
