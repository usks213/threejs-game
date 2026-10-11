import {it,expect,vi} from 'vitest';
import {actionInput} from '../../src/input/touch/action';
function event(type:string,values:Record<string,unknown>){const e=new Event(type,{cancelable:true});Object.assign(e,values);return e;}
it('fires once for pointer contact followed by a zero-detail compatibility click, while preserving keyboard activation',()=>{
 const button=new EventTarget() as EventTarget&{disabled:boolean};button.disabled=false;let now=1000;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),action=vi.fn(),controller=new AbortController();
 try{actionInput(button as unknown as HTMLButtonElement,action,controller.signal);button.dispatchEvent(event('pointerdown',{button:0}));button.dispatchEvent(event('click',{detail:0}));expect(action).toHaveBeenCalledTimes(1);button.dispatchEvent(event('keydown',{key:'Enter'}));button.dispatchEvent(event('click',{detail:0}));expect(action).toHaveBeenCalledTimes(2);now+=1000;button.dispatchEvent(event('click',{detail:0}));expect(action).toHaveBeenCalledTimes(3);button.disabled=true;button.dispatchEvent(event('pointerdown',{button:0}));expect(action).toHaveBeenCalledTimes(3);controller.abort();button.disabled=false;button.dispatchEvent(event('pointerdown',{button:0}));expect(action).toHaveBeenCalledTimes(3);}finally{clock.mockRestore();}
});
