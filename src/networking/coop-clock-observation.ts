/** Bounded observations of the Worker-owned event clock, never CPU/wall time. */
export type CoopClockEvent='step'|'message';
export interface CoopClockJump {previous:'start'|CoopClockEvent;current:CoopClockEvent;fromIoMs:number;toIoMs:number;advanceIoMs:number;tick:number}
export interface CoopClockObservation {
 version:1;stepEntries:number;messageEntries:number;stepAdvanceIoMs:number;messageAdvanceIoMs:number;
 stepJumps:number;messageJumps:number;regressions:number;maxAdvanceIoMs:number;lastJump:CoopClockJump|null;
}
export const COOP_CLOCK_JUMP_MS=250;
const countKeys=['stepEntries','messageEntries','stepJumps','messageJumps','regressions'] as const;
const timeKeys=['stepAdvanceIoMs','messageAdvanceIoMs','maxAdvanceIoMs'] as const;
const bounded=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const event=(s:unknown):s is CoopClockEvent=>s==='step'||s==='message';
export function readCoopClockObservation(raw:unknown):CoopClockObservation|undefined{
 if(!raw||typeof raw!=='object')return;const v=raw as CoopClockObservation;
 if(v.version!==1||countKeys.some(k=>!bounded(v[k])||!Number.isSafeInteger(v[k]))||timeKeys.some(k=>!bounded(v[k])))return;
 if(v.stepJumps>v.stepEntries||v.messageJumps>v.messageEntries)return;
 const j=v.lastJump;let lastJump:CoopClockJump|null=null;
 if(j!==null){if(!j||typeof j!=='object'||j.previous!=='start'&&!event(j.previous)||!event(j.current)||![j.fromIoMs,j.toIoMs,j.advanceIoMs,j.tick].every(bounded)||!Number.isSafeInteger(j.tick)||j.advanceIoMs<=COOP_CLOCK_JUMP_MS||j.advanceIoMs>v.maxAdvanceIoMs||Math.abs(j.toIoMs-j.fromIoMs-j.advanceIoMs)>1e-7)return;lastJump={previous:j.previous,current:j.current,fromIoMs:j.fromIoMs,toIoMs:j.toIoMs,advanceIoMs:j.advanceIoMs,tick:j.tick};}
 return{version:1,stepEntries:v.stepEntries,messageEntries:v.messageEntries,stepAdvanceIoMs:v.stepAdvanceIoMs,messageAdvanceIoMs:v.messageAdvanceIoMs,stepJumps:v.stepJumps,messageJumps:v.messageJumps,regressions:v.regressions,maxAdvanceIoMs:v.maxAdvanceIoMs,lastJump};
}
export function coopClockObservationRegressed(previous:CoopClockObservation,next:CoopClockObservation):boolean{return next.regressions>previous.regressions||[...countKeys,...timeKeys].some(key=>next[key]<previous[key]);}
export class CoopClockObserver{
 private previous:'start'|CoopClockEvent='start';private lastIoMs:number;
 private readonly value:CoopClockObservation={version:1,stepEntries:0,messageEntries:0,stepAdvanceIoMs:0,messageAdvanceIoMs:0,stepJumps:0,messageJumps:0,regressions:0,maxAdvanceIoMs:0,lastJump:null};
 constructor(startedIoMs:number){this.lastIoMs=startedIoMs;}
 observe(current:CoopClockEvent,nowIoMs:number,tick:number):void{
  const v=this.value,advance=nowIoMs-this.lastIoMs;v[current==='step'?'stepEntries':'messageEntries']++;
  if(advance<0)v.regressions++;else {v[current==='step'?'stepAdvanceIoMs':'messageAdvanceIoMs']+=advance;v.maxAdvanceIoMs=Math.max(v.maxAdvanceIoMs,advance);
   if(advance>COOP_CLOCK_JUMP_MS){v[current==='step'?'stepJumps':'messageJumps']++;v.lastJump={previous:this.previous,current,fromIoMs:this.lastIoMs,toIoMs:nowIoMs,advanceIoMs:advance,tick};}}
  this.previous=current;this.lastIoMs=nowIoMs;
 }
 sample():CoopClockObservation|undefined{return readCoopClockObservation(this.value);}
}
