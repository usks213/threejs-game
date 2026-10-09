import {afterEach,expect,it,vi} from 'vitest';
import {createDungeonInputSender} from '../../src/dungeon/input-sender';
import type {Input} from '../../src/dungeon/types';
const neutral:Input={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
function harness(){vi.useFakeTimers();let time=0;const sent:Array<{at:number;input:Input}>=[],send=vi.fn((input:Input)=>{sent.push({at:time,input});return true;});const sender=createDungeonInputSender({now:()=>time,send});return {sender,send,sent,step(ms=1){for(let i=0;i<ms;i++){time++;vi.advanceTimersByTime(1);}}};}
it('coalesces a continuous flood at fixed deadlines without a trailing timer starvation or packet burst',()=>{
 const h=harness();for(let i=0;i<2000;i++){h.sender.submit({...neutral,yaw:i/2000});h.step();expect(vi.getTimerCount()).toBeLessThanOrEqual(1);}
 expect(h.sent).toHaveLength(51);expect(h.sent.every((value,i)=>value.at===i*40)).toBe(true);expect(h.sent.at(-1)!.input.yaw).toBe(1999/2000);h.sender.dispose();
});
it('reserves an immediate neutral release after a full 25 Hz second and stays inside the server packet budget',()=>{
 const h=harness();for(let i=0;i<25;i++){h.sender.submit({...neutral,z:1});if(i<24)h.step(40);}
 h.step(1);h.sender.submit(neutral,true);expect(h.sent.at(-1)).toEqual({at:961,input:neutral});expect(h.sent).toHaveLength(26);
 // Repeated blur + visibility reset uses no extra packet or timer.
 h.sender.submit(neutral,true);expect(h.sent).toHaveLength(26);expect(vi.getTimerCount()).toBe(0);
 expect(h.sent.length+12+1).toBeLessThanOrEqual(40);h.sender.dispose();
});
it('bounds adversarial reset traffic to 26 inputs in every rolling second and flushes the latest release at the first free slot',()=>{
 const h=harness();for(let i=0;i<26;i++){h.sender.submit({...neutral,yaw:i/100},true);h.step();}
 h.sender.submit({...neutral,yaw:1},true);expect(h.sent).toHaveLength(26);h.step(973);expect(h.sent).toHaveLength(26);h.step();expect(h.sent.at(-1)).toEqual({at:1000,input:{...neutral,yaw:1}});
 for(const entry of h.sent)expect(h.sent.filter(other=>other.at>entry.at-1000&&other.at<=entry.at).length).toBeLessThanOrEqual(26);h.sender.dispose();
});
it('does not grant urgent priority to held movement and replaces a waiting press with its released state',()=>{
 const h=harness();h.sender.submit(neutral);h.step();h.sender.submit({...neutral,z:1},true);h.step();h.sender.submit(neutral);h.step(38);expect(h.sent).toEqual([{at:0,input:neutral},{at:40,input:neutral}]);h.sender.dispose();
});
it('does not consume budget on failed transport writes or retry stale state across reset/dispose',()=>{
 const h=harness();h.send.mockReturnValueOnce(false);h.sender.submit({...neutral,z:1});h.sender.submit(neutral);expect(h.send).toHaveBeenCalledTimes(2);h.step();h.sender.submit({...neutral,block:true});h.sender.reset();h.step(100);expect(h.send).toHaveBeenCalledTimes(2);
 h.sender.submit(neutral);expect(h.send).toHaveBeenCalledTimes(3);h.step();h.sender.submit({...neutral,z:1});h.sender.dispose();h.sender.dispose();h.step(100);h.sender.submit(neutral);expect(h.send).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
it('copies pending samples so later caller mutations cannot replay a stale held input',()=>{
 const h=harness();h.sender.submit(neutral);h.step();const sample={...neutral,block:true};h.sender.submit(sample);sample.block=false;h.step(39);expect(h.sent.at(-1)!.input.block).toBe(true);h.sender.dispose();
});
it('keeps the last slot reserved for a later hide release after an earlier urgent reset shifted the regular cadence',()=>{
 const h=harness();h.sender.submit({...neutral,z:1});h.step();h.sender.submit(neutral,true);
 for(let i=0;i<24;i++){h.step(40);h.sender.submit({...neutral,z:1});}
 expect(h.sent).toHaveLength(25);expect(h.sent.at(-1)!.at).toBe(921);
 h.step(9);h.sender.submit(neutral,true);expect(h.sent).toHaveLength(26);expect(h.sent.at(-1)).toEqual({at:970,input:neutral});expect(vi.getTimerCount()).toBe(0);h.sender.dispose();
});
it('fits a real server connection with hello and twelve actions while preserving the unchanged thirteenth-action rejection',async()=>{
 const {DungeonServer}=await import('../../src/dungeon/server');const h=harness();let now=0;
 const closed:Array<{code:number;reason:string}>=[],server=new DungeonServer({save:async()=>{}},()=>now);
 server.connect('p',{send:()=>{},close:(code,reason)=>closed.push({code,reason})});await server.receive('p',JSON.stringify({type:'hello',protocol:1,key:'a'.repeat(64),name:'Input test'}));
 for(let i=0;i<25;i++){h.sender.submit({...neutral,z:1});if(i<24)h.step(40);}h.step();h.sender.submit(neutral,true);
 for(const [index,entry]of h.sent.entries()){now=entry.at;await server.receive('p',JSON.stringify({type:'input',sequence:index+1,input:entry.input}));}
 for(let sequence=1;sequence<=12;sequence++)await server.receive('p',JSON.stringify({type:'action',sequence,action:{kind:'class',classId:'bastion'}}));
 expect(closed).toEqual([]);expect(server.sim.state.profiles[0].actor.seq).toBe(26);expect(server.sim.state.profiles[0].actor.input).toEqual(neutral);
 await server.receive('p',JSON.stringify({type:'action',sequence:13,action:{kind:'class',classId:'bastion'}}));expect(closed).toEqual([{code:1008,reason:'操作が多すぎます'}]);h.sender.dispose();
});
it.each([false,true])('preserves pending release priority only while the newest heartbeat is neutral (held: %s)',held=>{
 const h=harness();h.sender.submit(neutral,true);h.step(100);
 for(let i=1;i<=25;i++)h.sender.submit({...neutral,yaw:i/100},true);
 expect(h.sent).toHaveLength(26);h.step();h.sender.submit({...neutral,yaw:1},true);h.step(50);
 h.sender.submit({...neutral,yaw:1.2,z:held?1:0});h.step(849);
 if(held){expect(h.sent).toHaveLength(26);h.step(100);}
 expect(h.sent).toHaveLength(27);expect(h.sent.at(-1)).toEqual({at:held?1100:1000,input:{...neutral,yaw:1.2,z:held?1:0}});h.sender.dispose();
});
