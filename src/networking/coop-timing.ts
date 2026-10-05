import type {FixedStepClock,FixedStepStats} from './fixed-step-clock';
/** Worker event/I/O-clock observations, never synchronous CPU measurements. */
export interface CoopTiming {
 version:1;clock:'worker-io';run:number;startedIoMs:number;nowIoMs:number;
 lastStepIoMs:number|null;tick:number;active:boolean;scheduler:FixedStepStats;
}
const counters=['steps','turns','catchUpSteps','rebases','droppedMs','maxDebtMs'] as const;
const bounded=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
/** Copy only the bounded scalar schema; absent/unknown telemetry stays optional. */
export function readCoopTiming(raw:unknown):CoopTiming|undefined {
 if(!raw||typeof raw!=='object')return;const value=raw as CoopTiming,stats=value.scheduler;
 if(value.version!==1||value.clock!=='worker-io'||!Number.isSafeInteger(value.run)||value.run<1||!bounded(value.startedIoMs)||!bounded(value.nowIoMs)||value.nowIoMs<value.startedIoMs||!Number.isSafeInteger(value.tick)||value.tick<0||typeof value.active!=='boolean'||!stats||typeof stats!=='object')return;
 if(value.lastStepIoMs!==null&&(!bounded(value.lastStepIoMs)||value.lastStepIoMs<value.startedIoMs||value.lastStepIoMs>value.nowIoMs))return;
 if(counters.some(key=>!bounded(stats[key]))||(['steps','turns','catchUpSteps','rebases'] as const).some(key=>!Number.isSafeInteger(stats[key])))return;
 return {version:1,clock:'worker-io',run:value.run,startedIoMs:value.startedIoMs,nowIoMs:value.nowIoMs,lastStepIoMs:value.lastStepIoMs,tick:value.tick,active:value.active,scheduler:{steps:stats.steps,turns:stats.turns,catchUpSteps:stats.catchUpSteps,rebases:stats.rebases,droppedMs:stats.droppedMs,maxDebtMs:stats.maxDebtMs}};
}
/** One source per scheduler run, with no timers, retained samples or world writes. */
export class CoopTimingSource {
 private readonly startedIoMs:number;private lastStepIoMs:number|null=null;
 constructor(private readonly run:number,private readonly now:()=>number=()=>performance.now()){this.startedIoMs=this.now();}
 stepCompleted():void{this.lastStepIoMs=this.now();}
 sample(clock:Pick<FixedStepClock,'active'|'stats'>,tick:number):CoopTiming|undefined {
  return readCoopTiming({version:1,clock:'worker-io',run:this.run,startedIoMs:this.startedIoMs,nowIoMs:this.now(),lastStepIoMs:this.lastStepIoMs,tick,active:clock.active,scheduler:clock.stats});
 }
}
interface Sample {timing:CoopTiming;clientReceivedMs:number}
/** Bounded probe receipt: only first/last samples and scalar counts are retained. */
export class CoopTimingWindow {
 private first:Sample|undefined;private last:Sample|undefined;private samples=0;private missing=0;private invalid=0;private discontinuities=0;private maxAge:number|null=null;
 observe(raw:unknown,clientReceivedMs:number):void {
  if(raw===undefined){this.missing++;return;}const timing=readCoopTiming(raw);
  if(!timing||!bounded(clientReceivedMs)){this.invalid++;return;}
  const previous=this.last;
  if(previous&&(timing.run!==previous.timing.run||timing.startedIoMs!==previous.timing.startedIoMs||timing.nowIoMs<previous.timing.nowIoMs||timing.tick<previous.timing.tick||clientReceivedMs<previous.clientReceivedMs||counters.some(key=>timing.scheduler[key]<previous.timing.scheduler[key])||previous.timing.lastStepIoMs!==null&&(timing.lastStepIoMs===null||timing.lastStepIoMs<previous.timing.lastStepIoMs)))this.discontinuities++;
  const sample={timing,clientReceivedMs};this.first??=sample;this.last=sample;this.samples++;
  if(timing.lastStepIoMs!==null)this.maxAge=Math.max(this.maxAge??0,timing.nowIoMs-timing.lastStepIoMs);
 }
 summary(){
  const first=this.first,last=this.last,comparable=this.samples>=2&&!this.invalid&&!this.discontinuities&&!!first&&!!last;
  const elapsedIoMs=comparable?last.timing.nowIoMs-first.timing.nowIoMs:null,elapsedClientMs=comparable?last.clientReceivedMs-first.clientReceivedMs:null;
  const delta=comparable?{steps:last.timing.scheduler.steps-first.timing.scheduler.steps,turns:last.timing.scheduler.turns-first.timing.scheduler.turns,catchUpSteps:last.timing.scheduler.catchUpSteps-first.timing.scheduler.catchUpSteps,rebases:last.timing.scheduler.rebases-first.timing.scheduler.rebases,droppedMs:last.timing.scheduler.droppedMs-first.timing.scheduler.droppedMs,ticks:last.timing.tick-first.timing.tick}:null;
  return {status:this.invalid?'invalid':this.discontinuities?'discontinuous':comparable?'observed':this.samples?'insufficient':'unavailable',samples:this.samples,missingSamples:this.missing,invalidSamples:this.invalid,discontinuities:this.discontinuities,first:first??null,last:last??null,elapsedIoMs,elapsedClientMs,ioMinusClientElapsedMs:elapsedIoMs!==null&&elapsedClientMs!==null?elapsedIoMs-elapsedClientMs:null,delta,stepsPerIoSecond:delta&&elapsedIoMs?delta.steps*1000/elapsedIoMs:null,maxLastStepAgeIoMs:this.maxAge,maxDebtIoMs:last?.timing.scheduler.maxDebtMs??null,interpretation:'I/O-clock counters over the first/last measured pong interval; client receive timing includes network jitter. maxDebt is run-cumulative. No CPU-time measurement or causal attribution.'};
 }
}
