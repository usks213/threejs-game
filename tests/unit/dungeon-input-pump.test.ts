import {afterEach,expect,it,vi} from 'vitest';
import {startDungeonInputPump} from '../../src/dungeon/input-pump';
import type {Input} from '../../src/dungeon/types';
const neutral:Input={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
afterEach(()=>vi.useRealTimers());
it('keeps movement, guard and keyboard aiming alive without any rendering frames',()=>{
 vi.useFakeTimers();let time=0,yaw=0;const send=vi.fn();
 const stop=startDungeonInputPump({now:()=>time,enabled:()=>true,sample:dt=>({...neutral,z:1,block:true,yaw:yaw+=dt}),send});
 for(let i=0;i<30;i++){time+=50;vi.advanceTimersByTime(50);}
 expect(send).toHaveBeenCalledTimes(30);expect(send.mock.calls.at(-1)?.[0]).toMatchObject({z:1,block:true,yaw:expect.closeTo(1.5)});
 stop();vi.advanceTimersByTime(500);expect(send).toHaveBeenCalledTimes(30);
});
it('does not heartbeat hidden or disconnected pages and resumes without a giant look jump',()=>{
 vi.useFakeTimers();let time=0,enabled=true;const sample=vi.fn(()=>neutral),send=vi.fn();
 const stop=startDungeonInputPump({now:()=>time,enabled:()=>enabled,sample,send});
 time=50;vi.advanceTimersByTime(50);enabled=false;time=5050;vi.advanceTimersByTime(5000);
 expect(send).toHaveBeenCalledTimes(1);enabled=true;time=5100;vi.advanceTimersByTime(50);
 expect(sample).toHaveBeenLastCalledWith(.05);expect(send).toHaveBeenCalledTimes(2);stop();stop();
});
it('sends the current released controls on the next bounded tick and clamps scheduling stalls',()=>{
 vi.useFakeTimers();let time=0,held=true;const sample=vi.fn((_dt:number)=>({...neutral,block:held,z:held?1:0})),send=vi.fn();
 const stop=startDungeonInputPump({now:()=>time,enabled:()=>true,sample,send});
 time=50;vi.advanceTimersByTime(50);held=false;time=3050;vi.advanceTimersByTime(50);
 expect(sample).toHaveBeenLastCalledWith(.1);expect(send).toHaveBeenLastCalledWith(neutral);stop();
});
