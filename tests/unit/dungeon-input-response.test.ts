import {afterEach,describe,expect,it,vi} from 'vitest';
import {createDungeonInput} from '../../src/dungeon/input';
import {startDungeonInputPump} from '../../src/dungeon/input-pump';
import {createDungeonInputSender} from '../../src/dungeon/input-sender';
import type {Input} from '../../src/dungeon/types';

class Element extends EventTarget {
 tagName='DIV';isContentEditable=false;disabled=false;style={setProperty:vi.fn()};classList={add:vi.fn(),remove:vi.fn()};setPointerCapture=vi.fn();requestPointerLock=vi.fn();
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
}
function event(target:EventTarget,type:string,properties:Record<string,unknown>={}){const value=new Event(type,{cancelable:true});Object.assign(value,properties);target.dispatchEvent(value);}
const neutral:Input={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
function harness(){
 vi.useFakeTimers();let time=0,connected=true,stopped=false;
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,exitPointerLock:vi.fn()});
 vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('HTMLElement',Element);
 const canvas=new Element(),movePad=new Element(),lookPad=new Element(),block=new Element(),crouch=new Element(),attack=new Element();
 const packets:Array<{at:number;input:Input}>=[],actions:string[]=[],actionInputs:Array<Input|undefined>=[],changed=vi.fn();
 const sender=createDungeonInputSender({now:()=>time,send:input=>{if(!connected)return false;packets.push({at:time,input});return true;}});
 let input:ReturnType<typeof createDungeonInput>|undefined;
 input=createDungeonInput({canvas,movePad,lookPad,actionButtons:new Map([['block',block],['crouch',crouch],['attack',attack]])} as unknown as Parameters<typeof createDungeonInput>[0],{
  action:action=>{actions.push(action);actionInputs.push(packets.at(-1)?.input);},changed:release=>{changed(release);if(input)sender.submit(input.sample(),release);},
 },()=>time);
 input.setActive(true);sender.reset();packets.length=0;changed.mockClear();
 const stopPump=startDungeonInputPump({now:()=>time,sample:()=>input!.sample(),send:value=>sender.submit(value),enabled:()=>connected&&!document.hidden});
 return {window,document,canvas,movePad,lookPad,block,crouch,attack,packets,actions,actionInputs,changed,sender,input,
  setTime(value:number){time=value;},
  elapse(ms:number,render=false){for(let i=0;i<ms;i++){time++;vi.advanceTimersByTime(1);if(render)input!.sample();}},
  disconnect(){connected=false;sender.reset();input!.setActive(false);},
  reconnect(){connected=true;sender.reset();input!.setActive(true);},
  stop(){if(stopped)return;stopped=true;stopPump();input!.dispose();sender.dispose();},
 };
}
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});

describe('shared monotonic dungeon input clock',()=>{
 it('turns on every render sample while the heartbeat consumes only the unsampled remainder',()=>{
  const h=harness();event(h.window,'keydown',{code:'Home'});
  h.elapse(16);expect(h.input.sample().yaw).toBeCloseTo(1.65*.016,10);
  h.elapse(16);expect(h.input.sample().yaw).toBeCloseTo(1.65*.032,10);
  h.elapse(18);expect(h.packets.at(-1)!.input.yaw).toBeCloseTo(1.65*.05,10);
  expect(h.input.sample().yaw).toBeCloseTo(1.65*.05,10);
  h.elapse(950,true);expect(h.input.sample().yaw).toBeCloseTo(1.65,10);h.stop();
 });
 it('keeps turning and renewing held movement during a RAF stall, then resumes without double turning',()=>{
  const h=harness();event(h.window,'keydown',{code:'Home'});event(h.window,'keydown',{code:'KeyW'});event(h.window,'keydown',{code:'KeyZ'});
  h.elapse(900);expect(h.packets.at(-1)!.input).toMatchObject({z:1,block:true,yaw:expect.closeTo(1.65*.9,10)});
  expect(h.input.sample().yaw).toBeCloseTo(1.65*.9,10);h.elapse(100,true);expect(h.input.sample().yaw).toBeCloseTo(1.65,10);
  const times=h.packets.map(packet=>packet.at);expect(Math.max(...times.slice(1).map((at,i)=>at-times[i]))).toBeLessThanOrEqual(50);h.stop();
 });
 it('integrates key edges at their actual time, including slow-aim changes and rapid releases',()=>{
  const h=harness();h.elapse(100);event(h.window,'keydown',{code:'Home'});h.elapse(10);event(h.window,'keydown',{code:'ShiftLeft'});h.elapse(20);event(h.window,'keyup',{code:'Home'});
  const yaw=1.65*.01+.65*.02;expect(h.input.sample().yaw).toBeCloseTo(yaw,10);h.elapse(100);expect(h.input.sample().yaw).toBeCloseTo(yaw,10);h.stop();
 });
 it('clamps a stalled event loop and ignores backwards timestamps without double-counting',()=>{
  const h=harness();event(h.window,'keydown',{code:'Home'});h.setTime(5000);expect(h.input.sample().yaw).toBeCloseTo(.165,10);
  h.setTime(4990);expect(h.input.sample().yaw).toBeCloseTo(.165,10);h.setTime(5010);expect(h.input.sample().yaw).toBeCloseTo(.1815,10);
  expect(h.input.sample().yaw).toBeCloseTo(.1815,10);h.stop();
 });
});

describe('independent input edges and bounded release delivery',()=>{
 it('coalesces a rapid press/release into the newest state without dropping the trailing release',()=>{
  const h=harness();event(h.window,'keydown',{code:'KeyW'});h.elapse(5);event(h.window,'keyup',{code:'KeyW'});
  expect(h.packets).toHaveLength(1);h.elapse(34);expect(h.packets).toHaveLength(1);h.elapse(1);
  expect(h.packets).toEqual([{at:0,input:{...neutral,z:1}},{at:40,input:neutral}]);h.stop();
 });
 it('delivers touch move, look, guard, crouch, cancel and window releases without waiting for a heartbeat',()=>{
  const h=harness();event(h.movePad,'pointerdown',{pointerId:1,pointerType:'touch',clientX:50,clientY:8});
  expect(h.packets.at(-1)!.input.z).toBe(1);h.elapse(1);
  event(h.block,'pointerdown',{pointerId:2,pointerType:'touch'});event(h.crouch,'pointerdown',{pointerId:3,pointerType:'touch'});
  event(h.lookPad,'pointerdown',{pointerId:4,pointerType:'touch',clientX:50,clientY:50});event(h.lookPad,'pointermove',{pointerId:4,clientX:75,clientY:50});
  h.elapse(39);expect(h.packets.at(-1)).toEqual({at:40,input:{...neutral,z:1,block:true,crouch:true,yaw:-.1}});
  event(h.movePad,'pointercancel',{pointerId:1});event(h.window,'pointercancel',{pointerId:4});h.elapse(40);
  expect(h.packets.at(-1)!.input).toMatchObject({z:0,block:true,crouch:true,yaw:-.1});
  event(h.block,'lostpointercapture',{pointerId:2});event(h.window,'pointerup',{pointerId:3});h.elapse(40);
  expect(h.packets.at(-1)!.input).toEqual({...neutral,yaw:-.1});h.stop();
 });
 it('notifies accessible guard toggles and right mouse releases, without duplicate release edges',()=>{
  const h=harness();event(h.block,'click',{detail:0});expect(h.packets.at(-1)!.input.block).toBe(true);h.elapse(1);event(h.block,'click',{detail:0});h.elapse(39);expect(h.packets.at(-1)!.input.block).toBe(false);
  Object.assign(h.document,{pointerLockElement:h.canvas});event(h.canvas,'pointerdown',{pointerId:10,pointerType:'mouse',button:2});h.elapse(40);expect(h.packets.at(-1)!.input.block).toBe(true);
  const before=h.changed.mock.calls.length;event(h.canvas,'lostpointercapture',{pointerId:10});event(h.window,'pointerup',{pointerId:10});expect(h.changed.mock.calls.length-before).toBe(1);h.elapse(40);expect(h.packets.at(-1)!.input.block).toBe(false);h.stop();
 });
 it.each(['blur','hidden','resize','orientationchange','menu'])('sends an immediate neutral %s release before the ordinary send interval elapses',reason=>{
  const h=harness();event(h.window,'keydown',{code:'KeyW'});event(h.block,'pointerdown',{pointerId:2,pointerType:'touch'});h.elapse(1);
  if(reason==='hidden'){h.document.hidden=true;event(h.document,'visibilitychange');}else if(reason==='menu')h.input.setActive(false);else event(h.window,reason);
  expect(h.packets.at(-1)).toEqual({at:1,input:neutral});expect(vi.getTimerCount()).toBe(1);
  if(reason==='hidden'){h.elapse(2000);expect(h.packets).toHaveLength(2);h.document.hidden=false;event(h.document,'visibilitychange');}
  h.elapse(50);expect(h.packets.at(-1)!.input).toEqual(neutral);h.stop();
 });
 it('cancels the pending packet and heartbeat on disposal; reconnect never replays an old held sample',()=>{
  const h=harness();event(h.window,'keydown',{code:'KeyW'});h.elapse(1);event(h.window,'keydown',{code:'KeyZ'});h.disconnect();h.elapse(100);expect(h.packets).toHaveLength(1);
  h.reconnect();expect(h.packets.at(-1)!.input).toEqual(neutral);h.elapse(1);event(h.window,'keydown',{code:'KeyW'});h.stop();const count=h.packets.length;
  h.elapse(2000);event(h.movePad,'pointerdown',{pointerId:1,pointerType:'touch',clientX:50,clientY:8});expect(h.packets).toHaveLength(count);expect(vi.getTimerCount()).toBe(0);h.stop();
 });
});

it('samples fresh keyboard aim before an action when the bounded input send slot is available',()=>{
 const h=harness();event(h.window,'keydown',{code:'Home'});h.elapse(40);event(h.attack,'pointerdown',{pointerId:1,pointerType:'touch'});
 expect(h.actions).toEqual(['attack']);expect(h.actionInputs[0]!.yaw).toBeCloseTo(1.65*.04,10);h.stop();
});
it('preserves synchronous action acknowledgement rather than bypassing the input cap when aim is still coalesced',()=>{
 const h=harness();event(h.window,'keydown',{code:'Home'});h.elapse(10);event(h.attack,'pointerdown',{pointerId:1,pointerType:'touch'});
 expect(h.actions).toEqual(['attack']);expect(h.packets).toHaveLength(1);expect(h.actionInputs[0]!.yaw).toBe(0);h.elapse(30);
 expect(h.packets.at(-1)!.input.yaw).toBeCloseTo(1.65*.01,10);h.stop();
});
