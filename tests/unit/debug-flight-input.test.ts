import {afterEach,expect,it,vi} from 'vitest';
import {debugFlightInput} from '../../src/input/debug-flight-input';
class Button extends EventTarget{disabled=false;attributes=new Map<string,string>();setAttribute(k:string,v:string){this.attributes.set(k,v);}setPointerCapture(){}}
function event(type:string,properties:Record<string,unknown>){const e=new Event(type,{cancelable:true});Object.assign(e,properties);return e;}
function setup(){const window=new EventTarget(),document=Object.assign(new EventTarget(),{hidden:false,querySelector:()=>null as object|null});vi.stubGlobal('window',window);vi.stubGlobal('document',document);const up=new Button(),down=new Button(),changed=vi.fn(),controller=new AbortController();let active=true;const controls=debugFlightInput(up as unknown as HTMLButtonElement,down as unknown as HTMLButtonElement,controller.signal,()=>active,changed,code=>code==='KeyU'?'Space':code);return {window,document,up,down,changed,controller,controls,disable:()=>{active=false;controls.release();}};}
afterEach(()=>vi.unstubAllGlobals());
it('holds touch ascent through other fingers, cancels only the matching pointer and ignores compatibility clicks',()=>{
 const {up,down,changed,controls,controller}=setup();up.dispatchEvent(event('pointerdown',{pointerId:1,button:0}));expect(changed).toHaveBeenLastCalledWith(1);up.dispatchEvent(event('pointerup',{pointerId:9}));expect(changed).toHaveBeenCalledTimes(1);
 down.dispatchEvent(event('pointerdown',{pointerId:2,button:0}));expect(changed).toHaveBeenLastCalledWith(0);down.dispatchEvent(event('pointercancel',{pointerId:2}));expect(changed).toHaveBeenLastCalledWith(1);up.dispatchEvent(event('lostpointercapture',{pointerId:1}));expect(changed).toHaveBeenLastCalledWith(0);
 const calls=changed.mock.calls.length;up.dispatchEvent(new Event('click'));down.dispatchEvent(new Event('click'));expect(changed).toHaveBeenCalledTimes(calls);controls.release();controller.abort();
});
it('holds remapped PC ascent/descent, suppresses repeated press edges and clears on release/menu/blur/rotation/hidden/abort',()=>{
 const c=setup();c.window.dispatchEvent(event('keydown',{code:'KeyU'}));c.window.dispatchEvent(event('keydown',{code:'KeyU',repeat:true}));expect(c.changed).toHaveBeenCalledTimes(1);expect(c.changed).toHaveBeenLastCalledWith(1);
 c.window.dispatchEvent(event('keydown',{code:'KeyV'}));expect(c.changed).toHaveBeenLastCalledWith(0);c.window.dispatchEvent(event('keyup',{code:'KeyU'}));expect(c.changed).toHaveBeenLastCalledWith(-1);c.window.dispatchEvent(event('keyup',{code:'KeyV'}));expect(c.changed).toHaveBeenLastCalledWith(0);
 for(const reason of['menu','blur','resize','hidden','abort']){c.window.dispatchEvent(event('keydown',{code:'KeyU'}));expect(c.changed).toHaveBeenLastCalledWith(1);if(reason==='menu')c.controls.release();else if(reason==='hidden'){c.document.hidden=true;c.document.dispatchEvent(new Event('visibilitychange'));c.document.hidden=false;}else if(reason==='abort')c.controller.abort();else c.window.dispatchEvent(new Event(reason));expect(c.changed).toHaveBeenLastCalledWith(0);}
});
it('keeps normal controls untouched when flight is unavailable or a dialog is open and supports focused Enter holds',()=>{
 const c=setup();c.document.querySelector=()=>({});const space=event('keydown',{code:'Space'});c.window.dispatchEvent(space);expect(space.defaultPrevented).toBe(false);expect(c.changed).not.toHaveBeenCalled();c.document.querySelector=()=>null;
 c.down.dispatchEvent(event('keydown',{key:'Enter'}));expect(c.changed).toHaveBeenLastCalledWith(-1);c.down.dispatchEvent(new Event('blur'));expect(c.changed).toHaveBeenLastCalledWith(0);
 c.up.dispatchEvent(event('keydown',{key:'Enter'}));expect(c.changed).toHaveBeenLastCalledWith(1);c.up.dispatchEvent(event('keyup',{key:'Enter'}));expect(c.changed).toHaveBeenLastCalledWith(0);c.disable();const inactive=event('keydown',{code:'Space'});c.window.dispatchEvent(inactive);expect(inactive.defaultPrevented).toBe(false);c.controller.abort();
});
