export interface GameLoopState {active:boolean;paused:boolean;portrait:boolean;hidden:boolean;guest:boolean;hostRunning:boolean;needsRender:boolean}
/** A menu-open host remains authoritative; a hidden/portrait host does not.
 * Guest physics never runs here, even when the presentation timer is active. */
export function gameLoopPolicy(s:GameLoopState){return {simulate:!s.guest&&(s.active||s.hostRunning)&&(!s.paused||s.hostRunning)&&!s.portrait&&!s.hidden,inputActive:s.active&&!s.paused&&!s.portrait&&!s.hidden,render:!s.hidden&&(s.needsRender||s.active&&!s.paused&&!s.portrait)};}
export interface InputPolling {poll(dt:number):void;enabled():boolean}
export interface GameLoopClock {
 now():number;
 frame(callback:()=>void):number;
 cancelFrame(id:number):void;
 delay(callback:()=>void,ms:number):ReturnType<typeof setTimeout>;
 cancelDelay(id:ReturnType<typeof setTimeout>):void;
}
const browserClock:GameLoopClock={now:()=>performance.now(),frame:callback=>requestAnimationFrame(callback),cancelFrame:id=>cancelAnimationFrame(id),delay:(callback,ms)=>setTimeout(callback,ms),cancelDelay:id=>clearTimeout(id)};
/** Solo retains its RAF clock. A visible connected expedition has one timer-owned update
 * clock, independent of the compositor; RAF only presents it. Timers cannot run
 * through synchronous JavaScript/GPU submission, so these gaps stay observable.
 * The caller still owns pause, visibility, authority and fixed-step limits. */
export function startGameLoop(update:(dt:number,now:number)=>void,render:(dt:number,now:number)=>void,independent:()=>boolean,clock:GameLoopClock=browserClock,inputs?:InputPolling){
 let running=true,lastUpdate=clock.now(),lastRender=lastUpdate,lastInput=lastUpdate,frameId=0,timer:ReturnType<typeof setTimeout>|undefined;
 const stats={inputUpdates:0,inputGapMs:0,maxInputGapMs:0,updates:0,renders:0,updateGapMs:0,maxUpdateGapMs:0,updateMs:0,maxUpdateMs:0,renderGapMs:0,renderMs:0,maxRenderMs:0};
 const elapsed=(now:number,before:number)=>Math.max(0,Number.isFinite(now-before)?now-before:0);
 function stop(){if(!running)return;running=false;clock.cancelFrame(frameId);if(timer!==undefined)clock.cancelDelay(timer);timer=undefined;}
 function advance(now:number){const gap=elapsed(now,lastUpdate);lastUpdate=Math.max(now,lastUpdate);stats.updateGapMs=gap;stats.maxUpdateGapMs=Math.max(stats.maxUpdateGapMs,gap);try{update(Math.min(.1,gap/1000),now);}catch(error){stop();throw error;}stats.updates++;stats.updateMs=elapsed(clock.now(),now);stats.maxUpdateMs=Math.max(stats.maxUpdateMs,stats.updateMs);}
 function pulse(){if(!running)return;const now=clock.now(),gap=elapsed(now,lastInput);lastInput=Math.max(now,lastInput);try{if(inputs?.enabled()){inputs.poll(Math.min(.1,gap/1000));stats.inputUpdates++;stats.inputGapMs=gap;stats.maxInputGapMs=Math.max(stats.maxInputGapMs,gap);}}catch(error){stop();throw error;}if(independent())advance(clock.now());if(running)timer=clock.delay(pulse,1000/60);}
 function frame(){if(!running)return;const now=clock.now();if(!independent())advance(now);if(!running)return;const started=clock.now(),gap=elapsed(started,lastRender);lastRender=started;stats.renderGapMs=gap;try{render(Math.min(.1,gap/1000),started);}catch(error){stop();throw error;}stats.renders++;stats.renderMs=elapsed(clock.now(),started);stats.maxRenderMs=Math.max(stats.maxRenderMs,stats.renderMs);if(running)frameId=clock.frame(frame);}
 frameId=clock.frame(frame);timer=clock.delay(pulse,1000/60);
 return {stop,get stats(){return {...stats,independent:independent()};}};
}
