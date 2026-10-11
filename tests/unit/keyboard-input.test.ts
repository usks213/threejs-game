import {afterEach,expect,it,vi} from 'vitest';
import {keyboardInput} from '../../src/input/keyboard/keyboard';
import type {Axis} from '../../src/core/player';
afterEach(()=>vi.unstubAllGlobals());
function key(type:string,code:string){return Object.assign(new Event(type,{cancelable:true}),{code});}
function setup(){
 const window=new EventTarget(),document=new EventTarget();vi.stubGlobal('window',window);vi.stubGlobal('document',document);
 const controller=new AbortController(),motions:Axis[]=[];
 const read=keyboardInput(controller.signal,code=>code==='KeyL'?'KeyD':code,()=>{const axis={x:0,z:0};read(axis);motions.push(axis);});
 return {window,document,controller,read,motions};
}
it('publishes movement and release synchronously without a rendering frame or duplicate key repeats',()=>{
 const {window,controller,motions}=setup();
 window.dispatchEvent(key('keydown','KeyL'));expect(motions).toEqual([{x:1,z:0}]);
 window.dispatchEvent(key('keydown','KeyL'));expect(motions).toHaveLength(1);
 window.dispatchEvent(key('keydown','KeyW'));expect(motions.at(-1)).toEqual({x:1,z:-1});
 window.dispatchEvent(key('keyup','KeyL'));expect(motions.at(-1)).toEqual({x:0,z:-1});
 window.dispatchEvent(key('keyup','KeyW'));expect(motions.at(-1)).toEqual({x:0,z:0});controller.abort();
});
it('immediately clears movement on focus, blur, resize, hiding, modal reset, and disposal',()=>{
 const {window,document,controller,read,motions}=setup();
 for(const [target,event]of [[window,'focusin'],[window,'blur'],[window,'resize'],[document,'visibilitychange']]as const){window.dispatchEvent(key('keydown','KeyD'));target.dispatchEvent(new Event(event));expect(motions.at(-1)).toEqual({x:0,z:0});}
 window.dispatchEvent(key('keydown','KeyD'));read.clear();expect(motions.at(-1)).toEqual({x:0,z:0});
 window.dispatchEvent(key('keydown','KeyD'));controller.abort();expect(motions.at(-1)).toEqual({x:0,z:0});const count=motions.length;window.dispatchEvent(key('keydown','KeyD'));expect(motions).toHaveLength(count);
});
it('does not capture keys typed into text controls',()=>{
 const {window,controller,motions}=setup(),event=key('keydown','KeyD');Object.defineProperty(event,'target',{value:{closest:()=>({})}});window.dispatchEvent(event);expect(motions).toHaveLength(0);controller.abort();
});
