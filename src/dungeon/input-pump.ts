import type {Input} from './types';

/** Keep the authoritative input lease alive even when WebGL delays animation frames.
 * The server's stale-input expiry remains unchanged. Hidden pages send no heartbeat. */
export function startDungeonInputPump(options:{sample(dt:number):Input;send(input:Input):void;enabled():boolean;now?:()=>number}){
 const now=options.now??(()=>performance.now());
 let previous=now(),disposed=false;
 const timer=setInterval(()=>{
  const current=now(),dt=Math.min(.1,Math.max(0,(current-previous)/1000));previous=current;
  if(!disposed&&options.enabled())options.send(options.sample(dt));
 },50);
 return ()=>{if(disposed)return;disposed=true;clearInterval(timer);};
}
