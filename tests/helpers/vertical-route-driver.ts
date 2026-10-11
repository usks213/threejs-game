import type {Page} from '@playwright/test';
import type {Snapshot} from '../../src/simulation/protocol';

/** Observe real native events and worker messages without changing any payload. */
export async function installRouteObserver(page:Page){
 await page.addInitScript(()=>{
  type TraceWindow=typeof window&{routeState?:unknown;routeSnapshot?:{at:number;epoch:unknown;worker:number};routeTrace?:{origin:number;events:unknown[];dropped:number}};
  const w=window as TraceWindow,trace={origin:performance.timeOrigin,events:[] as unknown[],dropped:0};w.routeTrace=trace;
  const record=(event:Record<string,unknown>)=>{trace.events.push({at:performance.now(),...event});if(trace.events.length>20000){trace.events.splice(0,1000);trace.dropped+=1000;}};
  let workers=0;
  window.Worker=new Proxy(window.Worker,{construct(Target,args,newTarget){
   const worker=Reflect.construct(Target,args,newTarget) as Worker,id=++workers,post=worker.postMessage;
   worker.postMessage=((message:unknown,...rest:unknown[])=>{
    const m=(message&&typeof message==='object'?message:{}) as {type?:string;input?:unknown;action?:string;id?:string;paused?:boolean};
    if(['input','game-action','init','pause'].includes(m.type??''))record({kind:'sent',worker:id,type:m.type,input:m.input,action:m.action,id:m.id,paused:m.paused});
    return Reflect.apply(post,worker,[message,...rest]);
   }) as Worker['postMessage'];
   worker.addEventListener('message',(event:MessageEvent)=>{
    const m=event.data;if(!m||typeof m!=='object')return;
    if(m.type==='snapshot'){
     w.routeState=m.state;w.routeSnapshot={at:performance.now(),epoch:m.epoch,worker:id};
     const s=m.state;record({kind:'snapshot',worker:id,epoch:m.epoch,tick:s.tick,player:s.player,health:s.adventure.health,stamina:s.adventure.stamina,traversal:s.adventure.traversal,seconds:s.adventure.seconds});
    }else if(['health','ready','terrain-reset','error'].includes(m.type))record({kind:'received',worker:id,type:m.type,epoch:m.epoch,health:m.health,error:m.message});
   });
   return worker;
  }});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{
   const e=event as PointerEvent,el=e.target instanceof Element?e.target:null;
   record({kind:'native',type,trusted:e.isTrusted,pointerId:e.pointerId,pointerType:e.pointerType,x:e.clientX,y:e.clientY,target:el?.id,captured:el?.hasPointerCapture(e.pointerId)});
  },{capture:true,passive:true});
  for(const type of ['blur','resize','focus'])window.addEventListener(type,()=>record({kind:'lifecycle',type,width:innerWidth,height:innerHeight}));
  document.addEventListener('visibilitychange',()=>record({kind:'lifecycle',type:'visibilitychange',hidden:document.hidden}));
 });
}

/** One browser task samples pose, yaw and current hit geometry atomically. */
export function readRouteSample(page:Page){
 return page.locator('#app').evaluate((app:HTMLElement)=>{
  const w=window as typeof window&{routeState:Snapshot;routeSnapshot?:{at:number;epoch:unknown;worker:number}};
  const s=w.routeState,stick=document.querySelector<HTMLElement>('#stick')!,r=stick.getBoundingClientRect(),now=performance.now();
  const position=document.querySelector<HTMLElement>('#position')!,combat=JSON.parse(app.dataset.combat??'{}'),traversal=JSON.parse(app.dataset.traversal??'{}');
  return {at:now,wallTime:performance.timeOrigin+now,tick:s.tick,player:s.player,health:s.adventure.health,stamina:s.adventure.stamina,gliding:!!s.adventure.traversal?.gliding,
   snapshotEpoch:String(w.routeSnapshot?.epoch),snapshotAge:now-(w.routeSnapshot?.at??now),snapshotWorker:w.routeSnapshot?.worker,epoch:app.dataset.worldEpoch,state:app.dataset.state,yaw:Number(app.dataset.cameraYaw),pitch:Number(app.dataset.cameraPitch),
   viewport:{width:innerWidth,height:innerHeight,rotated:app.dataset.rotated},stick:{x:r.x,y:r.y,width:r.width,height:r.height,knob:document.querySelector<HTMLElement>('#knob')!.style.transform},
   rendered:{tick:Number(app.dataset.tick),player:{x:Number(position.dataset.x),y:Number(position.dataset.y),z:Number(position.dataset.z),grounded:position.dataset.grounded==='true'},stamina:combat.stamina as number,gliding:!!traversal.gliding,title:document.querySelector('#journey strong')?.textContent},
   diagnostics:app.dataset.diagnostics,journey:document.querySelector('#journey')?.textContent,notice:document.querySelector('#notice')?.textContent,dialogs:[...document.querySelectorAll('[role=dialog]:not([hidden])')].map(el=>el.id)};
 },undefined,{timeout:10000});
}
export type RouteSample=Awaited<ReturnType<typeof readRouteSample>>;

/** Check every received authority sample, not only slow Node polling instants. */
export function readGlideEvidence(page:Page,startTick:number,epoch:string){
 return page.locator('#app').evaluate((_app,{startTick,epoch})=>{
  type Sample={kind:string;tick:number;epoch:unknown;health:number;stamina:number;player:{grounded:boolean};traversal?:{gliding?:boolean}};
  const trace=(window as typeof window&{routeTrace:{events:Sample[];dropped:number}}).routeTrace;
  const sameWorld=trace.events.filter(e=>e.kind==='snapshot'&&String(e.epoch)===epoch),samples=sameWorld.filter(e=>e.tick>=startTick);
  let opened=false,landed=false,closedInAir=false,minimumHealth=Infinity,minimumStamina=Infinity,glidingSamples=0,inspected=0;
  for(const s of samples){inspected++;minimumHealth=Math.min(minimumHealth,s.health);minimumStamina=Math.min(minimumStamina,s.stamina);if(s.traversal?.gliding){opened=true;glidingSamples++;}else if(opened&&!s.player.grounded)closedInAir=true;if(opened&&s.player.grounded){landed=true;break;}}
  return {startTick,epoch,samples:inspected,glidingSamples,landed,closedInAir,minimumHealth,minimumStamina,complete:!!samples.length&&(!trace.dropped||(sameWorld[0]?.tick??Infinity)<=startTick),dropped:trace.dropped};
 },{startTick,epoch},{timeout:10000});
}

export interface RoutePoint{x:number;z:number}
/** A native-input test driver must ease its stick before delayed feedback can
 * carry it past a small waypoint. This changes test input, never game state.
 */
export function nativeRouteAxis(player:RoutePoint,target:RoutePoint,yaw:number,feedbackSeconds:number,speed:number){
 const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz);
 const horizon=Math.max(.1,Number.isFinite(feedbackSeconds)?feedbackSeconds:.1);
 const scale=Math.max(1,distance,speed*horizon*2);
 return {x:(dx*Math.cos(yaw)-dz*Math.sin(yaw))/scale,z:(dx*Math.sin(yaw)+dz*Math.cos(yaw))/scale,distance};
}
/** Keep the recent worst interval: a single fast poll does not erase a stall. */
export class RouteCadence {
 private previous:number|undefined;
 private intervals:number[]=[];
 observe(tick:number){
  if(this.previous!==undefined&&tick>this.previous){this.intervals.push((tick-this.previous)/30);if(this.intervals.length>3)this.intervals.shift();}
  this.previous=tick;
  return Math.max(.1,...this.intervals);
 }
}
