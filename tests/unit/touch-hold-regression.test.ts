import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {holdAction} from '../../src/input/touch/hold';
import {SessionAuthority} from '../../src/simulation/session';
function event(target:EventTarget,type:string,values:Record<string,unknown>={}){const e=new Event(type,{cancelable:true});Object.assign(e,values);target.dispatchEvent(e);}
function setup(action=vi.fn(),repeat=()=>true){
 const controller=new AbortController(),button=Object.assign(new EventTarget(),{disabled:false,setPointerCapture:vi.fn(),classList:{add:vi.fn(),remove:vi.fn()}}) as unknown as HTMLButtonElement;
 holdAction(button,action,repeat,controller.signal);
 return{button,controller,action,down:()=>event(button,'pointerdown',{button:0,pointerId:7,pointerType:'touch'}),up:()=>event(button,'pointerup',{button:0,pointerId:7,pointerType:'touch'}),click:()=>event(button,'click',{detail:0,pointerId:7,pointerType:'touch',sourceCapabilities:{firesTouchEvents:true}})};
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('sends one attack for contact followed by an identified zero-detail touch compatibility click',()=>{
 const room=new SessionAuthority(),messages:string[]=[],action=vi.fn(()=>{try{messages.push(room.action('host',{type:'game-action',action:'attack',aim:{x:0,y:0,z:-1}}).message);}catch(error){messages.push((error as Error).message);}}),f=setup(action);
 f.down();f.up();event(f.button,'lostpointercapture',{pointerId:7});f.click();expect(action).toHaveBeenCalledTimes(1);expect(messages).toEqual(['攻撃']);
 // A distinct same-tick action still reaches the unchanged authority safety bound.
 expect(()=>room.action('host',{type:'game-action',action:'attack',aim:{x:0,y:0,z:-1}})).toThrow('操作の間隔を空けてください');f.controller.abort();
});
it('rejects a delayed identified touch click while preserving immediate keyboard and accessibility activation',()=>{
 const f=setup();f.down();f.up();vi.advanceTimersByTime(12000);f.click();expect(f.action).toHaveBeenCalledTimes(1);
 event(f.button,'click',{detail:0,pointerId:-1,pointerType:''});event(f.button,'keydown',{key:'Enter'});event(f.button,'click',{detail:0});expect(f.action).toHaveBeenCalledTimes(3);
 f.button.disabled=true;f.down();event(f.button,'click',{detail:0,pointerId:-1,pointerType:''});expect(f.action).toHaveBeenCalledTimes(3);f.controller.abort();
});
it('keeps unlimited water-style hold repetition and the dynamic repeat predicate',()=>{
 let repeat=true;const f=setup(vi.fn(),()=>repeat);f.down();vi.advanceTimersByTime(360);expect(f.action).toHaveBeenCalledTimes(4);repeat=false;vi.advanceTimersByTime(360);expect(f.action).toHaveBeenCalledTimes(4);repeat=true;vi.advanceTimersByTime(120);expect(f.action).toHaveBeenCalledTimes(5);f.up();vi.advanceTimersByTime(360);expect(f.action).toHaveBeenCalledTimes(5);f.controller.abort();
});
it.each(['pointercancel','lostpointercapture','blur','resize','visibilitychange','abort'])('stops hold repetition on %s',type=>{
 const f=setup();f.down();
 if(type==='abort')f.controller.abort();else if(type==='visibilitychange'){Object.defineProperty(document,'hidden',{value:true});event(document,type);}else event(type==='blur'||type==='resize'?window:f.button,type,{pointerId:7});
 vi.advanceTimersByTime(500);expect(f.action).toHaveBeenCalledTimes(1);f.controller.abort();
});
it('captures and marks the pointer before the initial action, then starts its repeat timer afterward',()=>{
 const action=vi.fn(()=>{expect(f.button.setPointerCapture).toHaveBeenCalledWith(7);expect(f.button.classList.add).toHaveBeenCalledWith('held');expect(vi.getTimerCount()).toBe(0);}),f=setup(action);
 f.down();expect(action).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(1);f.up();expect(vi.getTimerCount()).toBe(0);f.controller.abort();
});
it('never starts a hold interval from keyboard or accessibility activation alone',()=>{
 const f=setup();event(f.button,'keydown',{key:'Enter'});event(f.button,'click',{detail:0});expect(f.action).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);vi.advanceTimersByTime(1000);expect(f.action).toHaveBeenCalledTimes(1);f.controller.abort();
});
