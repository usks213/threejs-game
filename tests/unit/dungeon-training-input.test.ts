import {describe,it,expect,vi,afterEach} from 'vitest';
import {createDungeonInput} from '../../src/dungeon/input';
class Element extends EventTarget {
 tagName='DIV';disabled=false;isContentEditable=false;style={setProperty:vi.fn()};classList={add:vi.fn(),remove:vi.fn()};setPointerCapture=vi.fn();requestPointerLock=vi.fn();
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
}
function event(target:EventTarget,type:string,properties:Record<string,unknown>={}){const e=new Event(type,{cancelable:true});const {target: overrideTarget,...other}=properties;Object.assign(e,other);if(overrideTarget)Object.defineProperty(e,'target',{value:overrideTarget});target.dispatchEvent(e);return e;}
function harness(){const window=new EventTarget(),document=Object.assign(new EventTarget(),{hidden:false,pointerLockElement:null,exitPointerLock:vi.fn()});vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('HTMLElement',Element);const canvas=new Element(),movePad=new Element(),lookPad=new Element(),attack=new Element(),block=new Element(),skill=new Element(),shoot=new Element(),action=vi.fn();const input=createDungeonInput({canvas:canvas as unknown as HTMLCanvasElement,movePad:movePad as unknown as HTMLElement,lookPad:lookPad as unknown as HTMLElement,actionButtons:new Map([['attack',attack],['block',block],['skill',skill],['shoot',shoot]]) as unknown as Map<string,HTMLElement>},{action});input.setActive(true);return {window,document,canvas,movePad,lookPad,attack,block,skill,shoot,action,input};}
afterEach(()=>vi.unstubAllGlobals());
describe('training skill is an independent V / touch control', () => {
  it('maps V once, leaves F as bow, and respects disabled, typing and inactive state', () => {
    const h = harness(); event(h.window, 'keydown', { code: 'KeyV', repeat: false }); event(h.window, 'keydown', { code: 'KeyV', repeat: true });
    event(h.window, 'keydown', { code: 'KeyF', repeat: false }); expect(h.action.mock.calls.map(call => call[0])).toEqual(['skill', 'shoot']);
    h.skill.disabled = true; event(h.window, 'keydown', { code: 'KeyV', repeat: false }); expect(h.action).toHaveBeenCalledTimes(2);
    h.skill.disabled = false; const field = new Element(); field.tagName = 'INPUT'; event(h.window, 'keydown', { code: 'KeyV', repeat: false, target: field });
    h.input.setActive(false); event(h.window, 'keydown', { code: 'KeyV', repeat: false }); expect(h.action).toHaveBeenCalledTimes(2); h.input.dispose();
  });
  it('keeps movement and guard while tapping skill; ignores duplicate click and disabled activation', () => {
    const h = harness(); event(h.movePad, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 8 });
    event(h.block, 'pointerdown', { pointerId: 2, pointerType: 'touch' }); event(h.skill, 'pointerdown', { pointerId: 3, pointerType: 'touch' }); event(h.skill, 'click', { detail: 1 });
    expect(h.action).toHaveBeenCalledExactlyOnceWith('skill'); expect(h.input.sample()).toMatchObject({ z: 1, block: true });
    event(h.window, 'pointercancel', { pointerId: 3 }); expect(h.input.sample()).toMatchObject({ z: 1, block: true });
    h.skill.disabled = true; event(h.skill, 'pointerdown', { pointerId: 4, pointerType: 'touch' }); event(h.skill, 'click', { detail: 0 }); expect(h.action).toHaveBeenCalledTimes(1);
    h.skill.disabled = false; event(h.skill, 'click', { detail: 0 }); expect(h.action).toHaveBeenCalledTimes(2);
    event(h.window, 'blur'); expect(h.input.sample()).toMatchObject({ z: 0, block: false }); h.input.dispose();
    event(h.skill, 'pointerdown', { pointerId: 5, pointerType: 'touch' }); expect(h.action).toHaveBeenCalledTimes(2);
  });
});
