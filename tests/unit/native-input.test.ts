import {it,expect,vi,afterEach} from 'vitest';
import type {Page} from '@playwright/test';
import {contentCenter,createNativeKeyboard,nativeKeyName,relativeLookPixels,nativeWalkComplete,nativeWalkPulse,nativeKeyboard,nativeInputTimeLeft,type NativeWalkTarget,type NativeWalkState} from '../e2e/helpers/native-input';
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
