import {it,expect,vi,afterEach} from 'vitest';
import {pulseKeyboardInput,type KeyTransport} from '../e2e/helpers/keyboard-pulse';
afterEach(()=>vi.useRealTimers());
it('releases a real look key on schedule even while key-down acknowledgement is blocked',async()=>{
 vi.useFakeTimers();const events:Parameters<KeyTransport['send']>[1][]=[];
 let acknowledge!:()=>void;const blocked=new Promise<void>(resolve=>{acknowledge=resolve;});
 const transport:KeyTransport={send:async(_method,event)=>{events.push(event);if(event.type==='rawKeyDown')await blocked;}};
 const operation=pulseKeyboardInput(transport,'Home',false,80);
 await vi.advanceTimersByTimeAsync(79);expect(events.map(e=>e.type)).toEqual(['rawKeyDown']);
 await vi.advanceTimersByTimeAsync(1);expect(events.map(e=>e.type)).toEqual(['rawKeyDown','keyUp']);
 expect(events.every(e=>e.code==='Home'&&e.windowsVirtualKeyCode===36&&e.modifiers===0)).toBe(true);
 acknowledge();await operation;
});
it('releases both precision modifier and look key even when a press acknowledgement fails',async()=>{
 vi.useFakeTimers();const events:Parameters<KeyTransport['send']>[1][]=[];
 const transport:KeyTransport={send:async(_method,event)=>{events.push(event);if(event.code==='PageUp'&&event.type==='rawKeyDown')throw Error('input acknowledgement failed');}};
 const operation=pulseKeyboardInput(transport,'PageUp',true,100),failed=expect(operation).rejects.toThrow('input acknowledgement failed');
 await vi.advanceTimersByTimeAsync(100);await failed;
 expect(events.map(e=>[e.type,e.code,e.modifiers])).toEqual([['rawKeyDown','ShiftLeft',8],['rawKeyDown','PageUp',8],['keyUp','PageUp',8],['keyUp','ShiftLeft',0]]);
});
it('releases forward movement before waiting for a delayed movement acknowledgement',async()=>{
 vi.useFakeTimers();const events:Parameters<KeyTransport['send']>[1][]=[];let acknowledge!:()=>void;
 const blocked=new Promise<void>(resolve=>{acknowledge=resolve;}),transport:KeyTransport={send:async(_method,event)=>{events.push(event);if(event.type==='rawKeyDown')await blocked;}};
 const operation=pulseKeyboardInput(transport,'KeyW',false,150);await vi.advanceTimersByTimeAsync(150);
 expect(events.map(e=>[e.type,e.key,e.code,e.windowsVirtualKeyCode])).toEqual([['rawKeyDown','w','KeyW',87],['keyUp','w','KeyW',87]]);
 acknowledge();await operation;
});
