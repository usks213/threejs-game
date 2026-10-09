import type {Input} from './types';

const INPUT_INTERVAL=40,WINDOW=1000,MAX_REGULAR_INPUTS=25,MAX_INPUTS=26;
const neutral=(input:Input)=>input.x===0&&input.z===0&&!input.block&&!input.crouch;
const same=(a:Input,b:Input)=>a.x===b.x&&a.z===b.z&&a.yaw===b.yaw&&a.pitch===b.pitch&&a.block===b.block&&a.crouch===b.crouch;

/** Latest-state input, never a queue of stale movement. Ordinary traffic is at most
 * 25 Hz; the rolling 26-packet ceiling leaves room for 12 actions and a hello under
 * the server's unchanged 40-packet limit. Neutral lifecycle releases can use that
 * spare slot immediately while capacity remains, before hidden timers suspend.
 * At a saturated release budget, the latest neutral waits for the first free slot. */
export function createDungeonInputSender(options:{send(input:Input):boolean;now?:()=>number}){
 const now=options.now??(()=>performance.now());
 let pending:Input|null=null,release=false,last:Input|null=null,lastSent=-Infinity,clock=-Infinity,disposed=false;
 let timer:ReturnType<typeof setTimeout>|null=null;
 const sent:number[]=[];
 function clearTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
 function flush(){
  clearTimer();if(disposed||!pending)return;
  const value=now();clock=Number.isFinite(value)?Math.max(clock,value):clock;
  while(sent.length&&clock-sent[0]>=WINDOW)sent.shift();
  const due=Math.max(release?clock:lastSent+INPUT_INTERVAL,sent.length>=(release?MAX_INPUTS:MAX_REGULAR_INPUTS)?sent[0]+WINDOW:clock);
  if(due>clock){timer=setTimeout(flush,due-clock);return;}
  const next=pending;pending=null;release=false;
  if(options.send(next)){last=next;lastSent=clock;sent.push(clock);}
 }
 return {
  submit(input:Input,priorityRelease=false){
   if(disposed)return;
   release=neutral(input)&&(priorityRelease||pending!==null&&release);pending={...input};
   // Repeated blur/visibility/reset notifications cancel stale pending movement
   // without spending another emergency slot for an already-sent neutral state.
   if(release&&last&&same(last,input)){pending=null;release=false;clearTimer();return;}
   flush();
  },
  reset(){clearTimer();pending=null;release=false;last=null;lastSent=clock=-Infinity;sent.length=0;},
  dispose(){if(disposed)return;disposed=true;clearTimer();pending=null;sent.length=0;},
 };
}
