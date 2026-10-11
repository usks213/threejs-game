import {expect,it} from 'vitest';
import {FixedStepClock,type FixedStepOptions} from '../../src/networking/fixed-step-clock';
/** Worker-like event clock: integer epoch milliseconds, frozen during JS, and
 * fractional timeout delays truncated to zero. This models the starvation risk;
 * it is not a replacement for a real workerd/DO/public acceptance test. */
function workerClock(step:(cpu:(ms:number)=>void)=>void=()=>{},options:FixedStepOptions={}){
 const epoch=1791234567000;let wall=epoch,reported=epoch,next=0;const queue=new Map<number,{at:number;run:()=>void}>(),delays:number[]=[];
 const enqueue=(run:()=>void,delay:number)=>{const id=++next;queue.set(id,{at:wall+Math.max(0,Math.floor(delay)),run});return()=>{queue.delete(id);};};
 const clock=new FixedStepClock(()=>step(ms=>{wall+=ms;}),{...options,now:()=>reported,schedule:(run,delay)=>{delays.push(delay);return enqueue(run,delay);}});
 const one=()=>{const task=[...queue].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!task)throw Error('No pending event');queue.delete(task[0]);wall=Math.max(wall,task[1].at);reported=wall;task[1].run();};
 return {clock,delays,enqueue,one,get elapsed(){return wall-epoch;},advance:(ms:number)=>{const end=wall+ms;let turns=0;while([...queue.values()].some(task=>task.at<=end)){if(++turns>200)throw Error('Zero-delay timer livelock');one();}wall=Math.max(wall,end);reported=wall;}};
}
it('does not starve a queued hello under integer epoch time and sub-millisecond truncation',()=>{
 const f=workerClock();let hello=false;f.clock.start();f.enqueue(()=>{hello=true;},35);f.advance(1001);
 expect(hello).toBe(true);expect(f.clock.stats.steps).toBe(30);expect(f.clock.stats.rebases).toBe(0);expect(f.delays.every(delay=>Number.isInteger(delay)&&delay>=1)).toBe(true);f.clock.stop();
});
it('yields a Worker callback after one expensive step when its clock cannot measure synchronous CPU',()=>{
 const f=workerClock(cpu=>cpu(80),{maxCatchUpSteps:1});f.clock.start();f.enqueue(()=>{},100);f.one();
 expect(f.clock.stats.steps).toBe(1);expect(f.elapsed).toBeGreaterThanOrEqual(113);expect(f.delays.at(-1)).toBeGreaterThanOrEqual(1);f.one();expect(f.clock.stats.steps).toBe(1);f.one();expect(f.clock.stats.steps).toBe(2);f.clock.stop();
});
