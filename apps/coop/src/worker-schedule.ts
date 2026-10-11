import type {FixedStepOptions} from '../../../src/networking/fixed-step-clock';

export type WorkerWait=(delayMs:number,options:{signal:AbortSignal})=>Promise<unknown>;
/** Resume through the native scheduler.wait promise instead of running the game
 * inside a JS timeout callback (including that callback's microtasks). Workerd's
 * native promise reenters JS; whether its timeout clamp has been removed on the
 * deployed runtime is a public-probe hypothesis, not a raw/CPU-clock guarantee.
 * A JS Promise around setTimeout does not provide that native reentry boundary. */
export function createWorkerSchedule(wait:WorkerWait,failed:(error:unknown)=>void):NonNullable<FixedStepOptions['schedule']>{
 return (callback,delayMs)=>{
  const controller=new AbortController();let settled=false;
  const fail=(error:unknown)=>{if(!controller.signal.aborted){settled=true;failed(error);}};
  try{
   void wait(delayMs,{signal:controller.signal}).then(()=>{
    if(controller.signal.aborted)return;settled=true;
    try{callback();}catch(error){failed(error);}
   },fail);
  }catch(error){fail(error);}
  return()=>{if(!settled)controller.abort();};
 };
}
