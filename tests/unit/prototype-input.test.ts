import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInput} from '../../src/prototype/input';
class Surface extends EventTarget {
 dataset:Record<string,string>={};disabled=false;style={transform:''};classList={add:vi.fn(),remove:vi.fn()};setPointerCapture(){}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
}
function setup(){
 const canvas=new Surface(),stick=new Surface(),knob=new Surface(),look=new Surface(),button=new Surface();button.dataset.action='element-next';
 const document=Object.assign(new EventTarget(),{pointerLockElement:null,querySelector:(s:string)=>s==='#move-pad'?stick:s==='#move-knob'?knob:look,querySelectorAll:()=>[button],exitPointerLock:vi.fn()});
 vi.stubGlobal('document',document);vi.stubGlobal('window',new EventTarget());vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('navigator',{maxTouchPoints:1});
 const action=vi.fn(),onLook=vi.fn(),input=createInput(canvas as unknown as HTMLCanvasElement,action,onLook,vi.fn());input.setEnabled(true);return {button,action,input,onLook,document};
}
const send=(target:EventTarget,type:string,props:Record<string,unknown>={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);};
afterEach(()=>vi.unstubAllGlobals());
describe('prototype action button activation',()=>{
 it('does not double-activate a mobile pointer followed by zero-detail synthetic click',()=>{const {button,action,input}=setup();send(button,'pointerdown',{pointerId:1});send(button,'pointerup',{pointerId:1});send(button,'click',{detail:0});expect(action.mock.calls).toEqual([['element-next']]);input.dispose();});
 it('supports keyboard activation once and rejects repeats, disabled and paused inputs',()=>{const {button,action,input}=setup();send(button,'keydown',{code:'Enter',repeat:false});send(button,'click',{detail:0});send(button,'keydown',{code:'Enter',repeat:true});expect(action).toHaveBeenCalledTimes(1);button.disabled=true;send(button,'pointerdown',{pointerId:1});send(button,'keydown',{code:'Space',repeat:false});button.disabled=false;input.setEnabled(false);send(button,'pointerdown',{pointerId:1});expect(action).toHaveBeenCalledTimes(1);input.dispose();});
});

describe('keyboard look accessibility',()=>{
 it('turns and tilts from real key state at bounded sensitivity-scaled rate',()=>{const {input,onLook,document}=setup();send(document,'keydown',{code:'Home'});send(document,'keydown',{code:'PageUp'});input.tick(.05);expect(onLook.mock.lastCall?.[0]).toBeCloseTo(-.07);expect(onLook.mock.lastCall?.[1]).toBeCloseTo(-.07);input.setSensitivity(2);input.tick(10);expect(onLook.mock.lastCall?.[0]).toBeCloseTo(-.28);expect(onLook.mock.lastCall?.[1]).toBeCloseTo(-.28);input.dispose();});
 it('supports fine aim with Shift without changing WASD and arrow movement',()=>{const {input,onLook,document}=setup();send(document,'keydown',{code:'End'});send(document,'keydown',{code:'ShiftLeft'});send(document,'keydown',{code:'KeyW'});input.tick(.1);expect(onLook.mock.lastCall?.[0]).toBeCloseTo(.0056);expect(onLook.mock.lastCall?.[1]).toBe(0);expect(input.controls()).toMatchObject({z:1,sprint:true});input.dispose();});
 it('cancels opposing look keys and clears held look on pause or blur',()=>{const {input,onLook,document}=setup();send(document,'keydown',{code:'Home'});send(document,'keydown',{code:'End'});input.tick(.1);expect(onLook).not.toHaveBeenCalled();send(document,'keyup',{code:'End'});input.setEnabled(false);input.tick(.1);input.setEnabled(true);input.tick(.1);expect(onLook).not.toHaveBeenCalled();send(document,'keydown',{code:'PageDown'});window.dispatchEvent(new Event('blur'));input.tick(.1);expect(onLook).not.toHaveBeenCalled();input.dispose();});
 it('ignores invalid delta and releases keys with keyup',()=>{const {input,onLook,document}=setup();send(document,'keydown',{code:'Home'});for(const dt of [0,-1,NaN,Infinity])input.tick(dt);send(document,'keyup',{code:'Home'});input.tick(.1);expect(onLook).not.toHaveBeenCalled();input.dispose();});
});

describe('keyboard combat accessibility',()=>{
 it('attacks with T once per press without repeat autoattacks',()=>{const {input,action,document}=setup();send(document,'keydown',{code:'KeyT'});send(document,'keydown',{code:'KeyT',repeat:true});expect(action.mock.calls).toEqual([['attack']]);send(document,'keyup',{code:'KeyT'});send(document,'keydown',{code:'KeyT'});expect(action).toHaveBeenCalledTimes(2);input.dispose();});
 it('holds shield with Z and clears it on keyup and pause',()=>{const {input,document}=setup();send(document,'keydown',{code:'KeyZ'});expect(input.controls().block).toBe(true);send(document,'keyup',{code:'KeyZ'});expect(input.controls().block).toBe(false);send(document,'keydown',{code:'KeyZ'});input.setEnabled(false);expect(input.controls().block).toBe(false);expect(input.bind('attack','KeyZ')).toBe(false);input.dispose();});
});

describe('precision look under delayed key release',()=>{it('bounds six queued 100ms fine-look frames below .035rad',()=>{const {input,onLook,document}=setup();send(document,'keydown',{code:'ShiftLeft'});send(document,'keydown',{code:'Home'});for(let i=0;i<6;i++)input.tick(.1);const yaw=onLook.mock.calls.reduce((sum,call)=>sum+Math.abs(call[0]),0);expect(yaw).toBeCloseTo(.0336);expect(yaw).toBeLessThan(.035);send(document,'keyup',{code:'Home'});input.tick(.1);expect(onLook).toHaveBeenCalledTimes(6);input.dispose();});});
