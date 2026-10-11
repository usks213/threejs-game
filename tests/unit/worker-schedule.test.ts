import {expect,it,vi} from 'vitest';
import {createWorkerSchedule,type WorkerWait} from '../../apps/coop/src/worker-schedule';
import {FixedStepClock} from '../../src/networking/fixed-step-clock';

function pendingWait(){
 let resolve!:(value?:unknown)=>void,reject!:(error:unknown)=>void;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),wait=vi.fn<WorkerWait>(()=>promise);
 return{wait,resolve,reject};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
it('uses the supplied native wait with the positive delay and invokes a callback only after fulfillment',async()=>{
 const f=pendingWait(),callback=vi.fn(),failed=vi.fn(),schedule=createWorkerSchedule(f.wait,failed);
 const cancel=schedule(callback,34);expect(f.wait).toHaveBeenCalledWith(34,{signal:expect.any(AbortSignal)});expect(callback).not.toHaveBeenCalled();
 f.resolve();await flush();expect(callback).toHaveBeenCalledOnce();expect(failed).not.toHaveBeenCalled();cancel();expect(f.wait.mock.calls[0][1].signal.aborted).toBe(false);
});
it('aborts pending native waits and suppresses canceled failures and already-queued fulfillment',async()=>{
 for(const settle of ['resolve','reject'] as const){const f=pendingWait(),callback=vi.fn(),failed=vi.fn(),cancel=createWorkerSchedule(f.wait,failed)(callback,1);
  f[settle](Error('cancelled'));cancel();cancel();await flush();expect(f.wait.mock.calls[0][1].signal.aborted).toBe(true);expect(callback).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();}
});
it('reports native rejection, synchronous wait failure and callback failure without an unhandled rejection',async()=>{
 const error=Error('runtime failure');
 for(const mode of ['reject','throw','callback']){const failed=vi.fn(),callback=vi.fn(()=>{if(mode==='callback')throw error;}),wait:WorkerWait=()=>{if(mode==='throw')throw error;return mode==='reject'?Promise.reject(error):Promise.resolve();};
  createWorkerSchedule(wait,failed)(callback,1);await flush();expect(failed).toHaveBeenCalledExactlyOnceWith(error);expect(callback).toHaveBeenCalledTimes(mode==='callback'?1:0);}
});
it('keeps stopped/restarted clock runs isolated from stale native fulfillment or rejection',async()=>{
 const waits:ReturnType<typeof pendingWait>[]=[],failed=vi.fn(),step=vi.fn();let now=0;
 const clock=new FixedStepClock(step,{now:()=>now,maxCatchUpSteps:1,schedule:createWorkerSchedule((delay,options)=>{const f=pendingWait();waits.push(f);return f.wait(delay,options);},failed)});
 clock.start();clock.stop();clock.start();now=34;waits[0].resolve();await flush();expect(step).not.toHaveBeenCalled();
 waits[1].resolve();await flush();expect(step).toHaveBeenCalledOnce();expect(waits).toHaveLength(3);clock.stop();waits[2].reject(Error('abort'));await flush();expect(failed).not.toHaveBeenCalled();expect(clock.active).toBe(false);
});

/** Hypothesis model, not a production runtime emulator. It assumes the native
 * continuation's timeout clamp has been removed on reentry. The source proves
 * the reentry boundary, not deployed cleanup ordering: a public probe must test
 * that assumption. Callback timers report their scheduled time when late. */
async function clampedClock(native:boolean){
 const epoch=1791234567000;let wall=epoch,reported=epoch,id=0;const ticks:number[]=[];
 const timers=new Map<number,{at:number;logical:number;run:()=>void}>();
 const enqueue=(run:()=>void,delay:number)=>{const key=++id;timers.set(key,{at:wall+delay,logical:reported+delay,run});return()=>{timers.delete(key);};};
 const wait:WorkerWait=(delay,{signal})=>new Promise((resolve,reject)=>{const cancel=enqueue(()=>{reported=wall;resolve(undefined);},delay);signal.addEventListener('abort',()=>{cancel();reject(signal.reason);},{once:true});});
 const failed=vi.fn(),clock=new FixedStepClock(()=>{ticks.push(wall);wall+=10;},{maxCatchUpSteps:1,now:()=>reported,schedule:native?createWorkerSchedule(wait,failed):enqueue});
 clock.start();const end=wall+3001;
 while(true){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>end)break;timers.delete(first[0]);wall=Math.max(wall,first[1].at);reported=first[1].logical;first[1].run();await flush();}
 clock.stop();expect(timers.size).toBe(0);expect(failed).not.toHaveBeenCalled();return{...clock.stats,observedTickHz:(ticks.length-11)*1000/(ticks.at(-1)!-ticks[10])};
}
it('recovers drift in a clamp model when native continuation reentry observes post-timeout time',async()=>{
 const callback=await clampedClock(false),native=await clampedClock(true);
 expect(callback.steps).toBeLessThan(72);expect(callback.maxDebtMs).toBeLessThan(1);
 expect(callback.observedTickHz).toBeLessThan(24);expect(native.observedTickHz).toBeCloseTo(30,1);expect(native.rebases).toBe(0);expect(native.maxDebtMs).toBeGreaterThan(9);expect(native.turns).toBe(native.steps);
});
