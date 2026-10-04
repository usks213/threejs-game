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
 const action=vi.fn(),input=createInput(canvas as unknown as HTMLCanvasElement,action,vi.fn(),vi.fn());input.setEnabled(true);return {button,action,input};
}
const send=(target:Surface,type:string,props:Record<string,unknown>={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);};
afterEach(()=>vi.unstubAllGlobals());
describe('prototype action button activation',()=>{
 it('does not double-activate a mobile pointer followed by zero-detail synthetic click',()=>{const {button,action,input}=setup();send(button,'pointerdown',{pointerId:1});send(button,'pointerup',{pointerId:1});send(button,'click',{detail:0});expect(action.mock.calls).toEqual([['element-next']]);input.dispose();});
 it('supports keyboard activation once and rejects repeats, disabled and paused inputs',()=>{const {button,action,input}=setup();send(button,'keydown',{code:'Enter',repeat:false});send(button,'click',{detail:0});send(button,'keydown',{code:'Enter',repeat:true});expect(action).toHaveBeenCalledTimes(1);button.disabled=true;send(button,'pointerdown',{pointerId:1});send(button,'keydown',{code:'Space',repeat:false});button.disabled=false;input.setEnabled(false);send(button,'pointerdown',{pointerId:1});expect(action).toHaveBeenCalledTimes(1);input.dispose();});
});
