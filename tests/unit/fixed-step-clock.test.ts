import {expect,it} from 'vitest';
import {FixedStepClock,type FixedStepOptions} from '../../src/networking/fixed-step-clock';
function fixture(step:()=>void=()=>{},options:FixedStepOptions={}){
 let now=0,next=0;const scheduled=new Map<number,{at:number;run:()=>void}>(),all:(()=>void)[]=[];
 const clock=new FixedStepClock(step,{...options,now:()=>now,schedule:(run,delay)=>{const id=++next;scheduled.set(id,{at:now+delay,run});all.push(run);return()=>{scheduled.delete(id);};}});
 return {clock,scheduled,all,get now(){return now;},work:(ms:number)=>now+=ms,jump:(ms:number)=>now+=ms,one:()=>{const entry=[...scheduled].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)throw Error('No timer');scheduled.delete(entry[0]);now=Math.max(now,entry[1].at);entry[1].run();},advance:(ms:number)=>{const until=now+ms;let count=0;while(true){const entry=[...scheduled].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>until+1e-7)break;if(++count>10000)throw Error('Timer spin');scheduled.delete(entry[0]);now=Math.max(now,entry[1].at);entry[1].run();}now=Math.max(now,until);}};
}
it('recovers broadcast-sized delays while preserving exactly thirty fixed simulation calls per second',()=>{
 let ticks=0;const f=fixture(()=>{ticks++;f.work(ticks%3===0?50:2);});f.clock.start();f.advance(1000);expect(ticks).toBe(30);expect(f.clock.stats.steps).toBe(30);expect(f.clock.stats.rebases).toBe(0);expect(f.clock.stats.droppedMs).toBe(0);f.clock.stop();expect(f.scheduled.size).toBe(0);
});
it('bounds catch-up steps and yields between chunks rather than looping through a long backlog',()=>{
 const f=fixture(undefined,{intervalMs:10,maxCatchUpSteps:3,maxBacklogMs:250});f.clock.start();f.jump(100);f.one();expect(f.clock.stats.steps).toBe(3);expect(f.clock.stats.catchUpSteps).toBe(2);expect(f.scheduled.size).toBe(1);f.one();expect(f.clock.stats.steps).toBe(6);expect(f.clock.stats.rebases).toBe(0);
});
it('bounds work duration as well as tick count and records overload rebasing exactly',()=>{
 const events:unknown[]=[];const f=fixture(()=>f.work(8),{intervalMs:10,maxCatchUpSteps:9,maxWorkMs:12,maxBacklogMs:250,onOverload:event=>events.push(event)});f.clock.start();f.jump(100);f.one();expect(f.clock.stats.steps).toBe(2);f.jump(1000);f.one();expect(f.clock.stats.steps).toBe(3);expect(f.clock.stats.rebases).toBe(1);expect(f.clock.stats.droppedMs).toBe(1086);expect(f.clock.stats.maxDebtMs).toBe(1086);expect(events).toHaveLength(1);
});
it('handles early timers, repeated start/stop and stale callbacks without duplicate ticks',()=>{
 const f=fixture();f.clock.start();f.clock.start();expect(f.scheduled.size).toBe(1);const stale=f.all[0];f.clock.stop();f.clock.start();stale();expect(f.clock.stats.steps).toBe(0);expect(f.scheduled.size).toBe(1);f.advance(1000);expect(f.clock.stats.steps).toBe(30);f.clock.stop();f.advance(1000);expect(f.clock.stats.steps).toBe(30);
});
it('does not reschedule after a step stops it or leaves an uncaught failure',()=>{
 const stopped=fixture(()=>stopped.clock.stop());stopped.clock.start();stopped.one();expect(stopped.clock.active).toBe(false);expect(stopped.scheduled.size).toBe(0);
 const failed=fixture(()=>{throw Error('failed');});failed.clock.start();expect(()=>failed.one()).toThrow('failed');expect(failed.clock.active).toBe(false);expect(failed.scheduled.size).toBe(0);
});
it('does not retain time debt across a leave/rejoin or restart during the callback',()=>{
 let ticks=0;const f=fixture(()=>{if(++ticks===1){f.clock.stop();f.clock.start();}});f.clock.start();f.one();expect(f.scheduled.size).toBe(1);f.clock.stop();f.jump(10000);f.clock.start();f.one();expect(ticks).toBe(2);expect(f.clock.stats.rebases).toBe(0);
});
it('rejects invalid scheduler bounds',()=>{for(const options of [{intervalMs:0},{maxCatchUpSteps:0},{maxWorkMs:NaN},{maxBacklogMs:1}])expect(()=>new FixedStepClock(()=>{},options)).toThrow('limits');});
