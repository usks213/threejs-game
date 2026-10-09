import {it,expect,vi,afterEach} from 'vitest';
import type {Page} from '@playwright/test';
import {contentCenter,createNativeKeyboard,nativeKeyName,relativeLookPixels,nativeWalkComplete,nativeWalkPulse,nativeKeyboard,nativeInputTimeLeft,nativeRelativeSteps,nativeMotionSettled,NativePointer,type NativeWalkTarget,type NativeWalkState} from '../e2e/helpers/native-input';
afterEach(()=>vi.restoreAllMocks());

it('maps DOM movement, combat and modifier codes to X11 keysyms without accepting command text',()=>{
 expect(['KeyW','KeyZ','KeyR','Digit2','Space','ShiftLeft','PageUp','Escape'].map(nativeKeyName)).toEqual(['w','z','r','2','space','Shift_L','Prior','Escape']);
 for(const invalid of ['w','keydown','KeyW sleep 5','--window',''])expect(()=>nativeKeyName(invalid)).toThrow('Unsupported native key');
});
it('schedules the real movement hold and release in the same X11 command before browser readback',async()=>{
 const calls:{args:string[];timeout:number|undefined}[]=[];
 const keyboard=createNativeKeyboard(async(args,timeout)=>{calls.push({args,timeout});});
 await keyboard.pulse('KeyW',150);
 expect(calls).toEqual([{args:['keydown','w','sleep','0.15','keyup','w'],timeout:5150}]);
 await expect(keyboard.pulse('KeyW',1201)).rejects.toThrow('bound');await expect(keyboard.pulse('KeyW',NaN)).rejects.toThrow('bound');
 expect(calls).toHaveLength(1);
});
it('releases a native key after a command failure while preserving the original failure',async()=>{
 const calls:string[][]=[],failure=Error('X11 input failed');
 const keyboard=createNativeKeyboard(async args=>{calls.push(args);throw failure;});
 await expect(keyboard.pulse('KeyR',40)).rejects.toBe(failure);
 expect(calls).toEqual([['keydown','r','sleep','0.04','keyup','r'],['keyup','r']]);
});
it('places an unlocked pointer in browser content despite the toolbar and window offset',()=>{
 expect(contentCenter({screenX:10,screenY:20,outerWidth:968,outerHeight:628,innerWidth:960,innerHeight:540})).toEqual({x:494,y:378});
 expect(()=>contentCenter({screenX:0,screenY:0,outerWidth:960,outerHeight:540,innerWidth:0,innerHeight:540})).toThrow('geometry');
});
it('bounds genuine relative corrections and accounts for configured sensitivity and attack slowdown',()=>{
 expect(relativeLookPixels(.154,1,'idle')).toBe(-70);expect(relativeLookPixels(-.154,1,'idle')).toBe(70);
 expect(relativeLookPixels(.154,2,'idle')).toBe(-35);expect(relativeLookPixels(.04312,1,'strike')).toBe(-70);
 expect(relativeLookPixels(Math.PI,1,'idle')).toBe(-320);expect(relativeLookPixels(-Math.PI,1,'idle')).toBe(320);
 expect(()=>relativeLookPixels(.2,0,'idle')).toThrow('Invalid');
});
it('conserves every requested integer pixel in small signed steps within the measured canvas',()=>{
 for(const size of [{width:960,height:540},{width:160,height:100},{width:8,height:8}])for(const dx of [-320,-65,-1,0,1,65,320])for(const dy of [-320,-65,-1,0,1,65,320]){
  const steps=[...nativeRelativeSteps(dx,dy,size)];
  expect(steps.reduce((sum,step)=>sum+step.dx,0)).toBe(dx);expect(steps.reduce((sum,step)=>sum+step.dy,0)).toBe(dy);
  for(const step of steps){
   expect(Number.isInteger(step.dx)&&Number.isInteger(step.dy)).toBe(true);
   expect(Math.abs(step.dx)).toBeLessThanOrEqual(Math.min(64,Math.floor(size.width/4)));
   expect(Math.abs(step.dy)).toBeLessThanOrEqual(Math.min(64,Math.floor(size.height/4)));
   expect(step.dx*dx).toBeGreaterThanOrEqual(0);expect(step.dy*dy).toBeGreaterThanOrEqual(0);
   expect(step.dx!==0||step.dy!==0).toBe(true);
  }
 }
 expect([...nativeRelativeSteps(0,-320,{width:960,height:540})]).toEqual(Array.from({length:5},()=>({dx:0,dy:-64})));
 expect([...nativeRelativeSteps(0,0,{width:960,height:540})]).toEqual([]);
});
it('rejects invalid native pixels and locked geometry before generating any steps',()=>{
 for(const dx of [NaN,Infinity,.5,Number.MAX_SAFE_INTEGER+1])expect(()=>[...nativeRelativeSteps(dx,0,{width:960,height:540})]).toThrow('integer pixels');
 for(const size of [{width:0,height:540},{width:960,height:7},{width:NaN,height:540},{width:960,height:Infinity}])expect(()=>[...nativeRelativeSteps(0,-320,size)]).toThrow('geometry');
});
it('requires fresh trusted nonzero motion in the requested direction and two subsequent browser frames',()=>{
 const event={sequence:42,frame:10,dx:0,dy:-64,locked:true,trusted:true};
 let state={epoch:0,frame:11,locked:true,events:[event]};
 const request={observer:{read:()=>state},sequence:41,epoch:0,dx:0,dy:-64};
 expect(nativeMotionSettled(request)).toBe(false);state.frame=12;expect(nativeMotionSettled(request)).toBe(true);
 for(const rejected of [{...event,sequence:41},{...event,trusted:false},{...event,locked:false},{...event,dy:0},{...event,dy:64}]){
  state={...state,events:[rejected]};expect(nativeMotionSettled(request)).toBe(false);
 }
 state={...state,events:[event]};expect(nativeMotionSettled({...request,dx:64})).toBe(false);
 state={...state,epoch:1};expect(()=>nativeMotionSettled(request)).toThrow('Pointer Lock changed');
 state={...state,epoch:0,locked:false};expect(()=>nativeMotionSettled(request)).toThrow('Pointer Lock changed');
});
it('does not let zero-motion recentering satisfy even the initial ignored-move preparation',()=>{
 const state={epoch:0,frame:12,locked:true,events:[{sequence:42,frame:10,dx:0,dy:0,locked:true,trusted:true}]};
 const request={observer:{read:()=>state},sequence:41,epoch:0,dx:1,dy:1,prime:true};
 expect(nativeMotionSettled(request)).toBe(false);state.events[0].dx=1;expect(nativeMotionSettled(request)).toBe(true);
});
it.each(['complete','delivery failure','deadline'] as const)('paces real OS steps with one deadline and stops on errors: %s',async(mode)=>{
 let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);
 const failure=Error('trusted motion did not arrive');
 const calls:{dx:number;dy:number;timeout:number}[]=[],waits:number[]=[],order:string[]=[];
 const state={sequence:0,epoch:0,frame:0,locked:true,size:{width:960,height:540},events:[] as {sequence:number;frame:number;dx:number;dy:number;locked:boolean;trusted:boolean}[]};
 const value={read:()=>state,stop:()=>{order.push('stop');}},observer={...value,evaluate:async(callback:(v:typeof value)=>unknown)=>{now++;return structuredClone(callback(value));},dispose:async()=>{order.push('dispose');}};
 const page={evaluateHandle:async()=>observer,waitForFunction:async(predicate:typeof nativeMotionSettled,arg:Parameters<typeof nativeMotionSettled>[0],options:{timeout:number})=>{
  expect(options.timeout).toBe(1100-now);waits.push(options.timeout);expect(nativeMotionSettled(arg)).toBe(false);
  if(mode==='delivery failure'&&calls.length===3)throw failure;
  state.frame+=2;now+=2;expect(predicate(arg)).toBe(true);order.push('settled');
  if(mode==='deadline'&&calls.length===3)now=1100;
  return {dispose:async()=>{order.push('wait-dispose');}};
 }};
 const pointer=await NativePointer.create(page as unknown as Page,async(dx,dy,timeout=5000)=>{
  expect(timeout).toBe(1100-now);if(calls.length)expect(order.at(-1)).toBe('wait-dispose');
  calls.push({dx,dy,timeout});order.push('move');now++;
  state.events.push({sequence:++state.sequence,frame:state.frame,dx,dy,locked:true,trusted:true});
 });
 try{
  const movement=pointer.move(0,-320,1100);
  if(mode==='complete')await movement;
  else if(mode==='delivery failure')await expect(movement).rejects.toBe(failure);
  else await expect(movement).rejects.toThrow('time budget');
 }finally{await pointer.dispose();}
 expect(calls.map(({dx,dy})=>({dx,dy}))).toEqual([{dx:1,dy:1},...Array.from({length:mode==='complete'?5:2},()=>({dx:0,dy:-64}))]);
 expect(waits).toHaveLength(mode==='complete'?6:3);expect(waits.every((timeout,i)=>i===0||timeout<waits[i-1])).toBe(true);
 expect(order.slice(-2)).toEqual(['stop','dispose']);
});
it('does not end a held movement before trusted keydown and actual subsequent simulation time',()=>{
 const target:NativeWalkTarget={x:0,z:0,dx:0,dz:-1,length:1,brake:.12,seconds:.15};
 let state:NativeWalkState={hp:100,running:true,seconds:100,position:{x:0,z:1}},pressedAt:number|null=null;
 const observer={read:()=>({state,pressedAt,target})};
 expect(nativeWalkComplete(observer)).toBe(false);
 pressedAt=100;expect(nativeWalkComplete(observer)).toBe(false);
 state={...state,seconds:100.1,position:{x:0,z:.85}};expect(nativeWalkComplete(observer)).toBe(false);
 state={...state,seconds:100.16};expect(nativeWalkComplete(observer)).toBe(true);
});
it('ends native holding promptly at the unchanged brake, death or pause',()=>{
 const target:NativeWalkTarget={x:0,z:0,dx:0,dz:-1,length:1,brake:.12,seconds:.4};
 const sample=(hp:number,running:boolean,z:number)=>({read:()=>({state:{hp,running,seconds:2.02,position:{x:0,z}},pressedAt:2,target})});
 expect(nativeWalkComplete(sample(100,true,.11))).toBe(true);
 expect(nativeWalkComplete(sample(100,true,.13))).toBe(false);
 expect(nativeWalkComplete(sample(0,true,1))).toBe(true);expect(nativeWalkComplete(sample(100,false,1))).toBe(true);
});
it('charges observer setup and OS keydown against the same movement deadline',async()=>{
 let now=1000;vi.spyOn(Date,'now').mockImplementation(()=>now);
 const order:string[]=[],held={evaluate:async()=>{order.push('cleanup');},dispose:async()=>{}},complete={dispose:async()=>{}};
 const page={evaluateHandle:async()=>{now+=40;return held;},waitForFunction:vi.fn(async(_predicate,_held,options:{timeout:number})=>{expect(options.timeout).toBe(50);order.push('wait');now+=20;return complete;})};
 vi.spyOn(nativeKeyboard,'down').mockImplementation(async()=>{now+=10;order.push('down');});
 vi.spyOn(nativeKeyboard,'up').mockImplementation(async()=>{order.push('up');});
 await nativeWalkPulse(page as unknown as Page,{x:0,z:0,dx:0,dz:-1,length:1,brake:.12,seconds:.15},100);
 expect(order).toEqual(['down','wait','up','cleanup']);
 expect(nativeInputTimeLeft(1071)).toBe(1);expect(()=>nativeInputTimeLeft(1070)).toThrow('time budget');
});
it('releases the OS hold before renderer cleanup when the bounded movement wait fails',async()=>{
 const order:string[]=[],failure=Error('movement deadline reached'),held={evaluate:async()=>{order.push('cleanup');},dispose:async()=>{}};
 const page={evaluateHandle:async()=>held,waitForFunction:async()=>{throw failure;}};
 vi.spyOn(nativeKeyboard,'down').mockResolvedValue();vi.spyOn(nativeKeyboard,'up').mockImplementation(async()=>{order.push('up');});
 await expect(nativeWalkPulse(page as unknown as Page,{x:0,z:0,dx:0,dz:-1,length:1,brake:.12,seconds:.15},100)).rejects.toBe(failure);
 expect(order).toEqual(['up','cleanup']);
});
