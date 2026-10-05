/** Monotonic wall-time scheduling for a fixed-dt simulation. Timer latency does not
 * change dt. Short delays are recovered with bounded work; prolonged overload is
 * explicitly rebased and counted instead of silently claiming the target rate. */
export interface FixedStepStats {steps:number;turns:number;catchUpSteps:number;rebases:number;droppedMs:number;maxDebtMs:number}
export interface FixedStepOptions {
 intervalMs?:number;maxCatchUpSteps?:number;
 // Best-effort only when now() advances during synchronous work.
 maxWorkMs?:number;maxBacklogMs?:number;
 now?:()=>number;
 schedule?:(callback:()=>void,delayMs:number)=>()=>void;
 onOverload?:(event:{debtMs:number;droppedMs:number;stats:FixedStepStats})=>void;
}
export class FixedStepClock {
 private readonly now:()=>number;
 private readonly schedule:(callback:()=>void,delayMs:number)=>()=>void;
 private readonly interval:number;private readonly maxSteps:number;private readonly maxWork:number;private readonly maxBacklog:number;
 private readonly values:FixedStepStats={steps:0,turns:0,catchUpSteps:0,rebases:0,droppedMs:0,maxDebtMs:0};
 private running=false;private generation=0;private deadline=0;private cancel:(()=>void)|undefined;
 constructor(private readonly step:()=>void,private readonly options:FixedStepOptions={}){
  this.interval=options.intervalMs??1000/30;this.maxSteps=options.maxCatchUpSteps??3;this.maxWork=options.maxWorkMs??12;this.maxBacklog=options.maxBacklogMs??250;
  if(!Number.isFinite(this.interval)||this.interval<=0||!Number.isSafeInteger(this.maxSteps)||this.maxSteps<1||!Number.isFinite(this.maxWork)||this.maxWork<=0||!Number.isFinite(this.maxBacklog)||this.maxBacklog<this.interval)throw Error('Invalid fixed-step clock limits');
  this.now=options.now??(()=>performance.now());this.schedule=options.schedule??((callback,delay)=>{const timer=setTimeout(callback,delay);return()=>clearTimeout(timer);});
 }
 get active():boolean{return this.running;}
 get stats():FixedStepStats{return {...this.values};}
 start():void{if(this.running)return;this.running=true;this.generation++;this.deadline=this.now()+this.interval;this.arm();}
 stop():void{this.running=false;this.generation++;this.cancel?.();this.cancel=undefined;}
 private arm():void{
  const generation=this.generation;
  // Event-frozen integer clocks can repeatedly observe a fractional deadline as
  // still ahead after a sub-ms timeout is truncated to zero. Always yield a real
  // positive timer; epsilon only removes sub-nanosecond arithmetic residue.
  const delay=Math.max(1,Math.ceil(this.deadline-this.now()-1e-7));
  this.cancel=this.schedule(()=>{if(!this.running||generation!==this.generation)return;this.cancel=undefined;this.turn(generation);},delay);
 }
 private turn(generation:number):void{
  const started=this.now();let steps=0;this.values.turns++;
  try{
   const debt=Math.max(0,started-this.deadline);this.values.maxDebtMs=Math.max(this.values.maxDebtMs,debt);
   if(debt>this.maxBacklog){this.deadline=started;this.values.rebases++;this.values.droppedMs+=debt;this.options.onOverload?.({debtMs:debt,droppedMs:debt,stats:this.stats});}
   while(this.running&&generation===this.generation&&this.now()+1e-7>=this.deadline&&steps<this.maxSteps&&(steps===0||this.now()-started<this.maxWork)){
    this.deadline+=this.interval;this.step();this.values.steps++;if(steps++)this.values.catchUpSteps++;
   }
  }catch(error){this.stop();throw error;}
  if(this.running&&generation===this.generation)this.arm();
 }
}
