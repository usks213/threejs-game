import {afterEach,describe,it,expect,vi} from 'vitest';
import {setMaxListeners} from 'node:events';
import {createGamepadSettingsView} from '../../src/prototype/gamepad-settings-view';
import {defaultGamepadSettings} from '../../src/prototype/gamepad-settings';
class Element extends EventTarget {children:Element[]=[];dataset:Record<string,string>={};attributes=new Map<string,string>();className='';type='';value='';textContent='';constructor(readonly tag:string){super();}append(...children:Element[]){this.children.push(...children);}setAttribute(name:string,value:string){this.attributes.set(name,value);}}
const find=(root:Element,test:(element:Element)=>boolean):Element|undefined=>test(root)?root:root.children.map(child=>find(child,test)).find(Boolean);
function setup(){vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag)});const abort=new AbortController();setMaxListeners(30,abort.signal);const changed=vi.fn(),source=defaultGamepadSettings(),root=createGamepadSettingsView(source,changed,abort.signal) as unknown as Element;const control=(label:string)=>find(root,n=>n.attributes.get('aria-label')===label)!;return {root,changed,source,abort,control};}
const change=(node:Element,value:string)=>{node.value=value;node.dispatchEvent(new Event('change'));};
afterEach(()=>vi.unstubAllGlobals());
describe('stable gamepad editor',()=>{
 it('updates both sides of a swap immediately without relying on a parent rerender',()=>{const s=setup(),attack=s.control('斬撃のコントローラーボタン'),jump=s.control('ジャンプ/滑空のコントローラーボタン');change(attack,'0');expect(attack.value).toBe('0');expect(jump.value).toBe('7');expect(s.changed.mock.lastCall?.[0].buttons).toMatchObject({attack:0,jump:7});expect(s.source).toEqual(defaultGamepadSettings());s.abort.abort();});
 it('retains earlier edits through consecutive focused changes and copied callbacks',()=>{const s=setup();change(s.control('斬撃のコントローラーボタン'),'0');s.changed.mock.lastCall![0].buttons.attack=15;change(s.control('スティックの遊び'),'0.3');change(s.control('上下の視点を反転'),'1');change(s.control('左右のスティックを交換'),'1');expect(s.changed.mock.lastCall?.[0]).toMatchObject({buttons:{attack:0,jump:7},deadzone:.3,invertY:true,swapSticks:true});s.abort.abort();});
 it('resets all visible values and removes event listeners on disposal',()=>{const s=setup();change(s.control('斬撃のコントローラーボタン'),'0');change(s.control('上下の視点を反転'),'1');find(s.root,n=>n.tag==='button')!.dispatchEvent(new Event('click'));expect(s.changed.mock.lastCall?.[0]).toEqual(defaultGamepadSettings());expect(s.control('斬撃のコントローラーボタン').value).toBe('7');expect(s.control('上下の視点を反転').value).toBe('0');const count=s.changed.mock.calls.length;s.abort.abort();change(s.control('斬撃のコントローラーボタン'),'0');expect(s.changed).toHaveBeenCalledTimes(count);});
});
