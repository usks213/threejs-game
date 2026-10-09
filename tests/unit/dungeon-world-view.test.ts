import {afterEach,expect,it,vi} from 'vitest';
import type * as THREE from 'three';
import {DungeonSimulation} from '../../src/dungeon/simulation';
const h=vi.hoisted(()=>({request:vi.fn(),clear:vi.fn(),dispose:vi.fn(),draw:vi.fn(),order:[] as string[],presentable:false,ready:false,lantern:null as {intensity:number;distance:number;decay:number;position:number[];exposure:number}|null}));
vi.mock('three',async importOriginal=>{
 const actual=await importOriginal<typeof import('three')>();
 return {...actual,WebGLRenderer:class {toneMappingExposure=0;renderLists={dispose:vi.fn()};setPixelRatio=vi.fn();setSize=vi.fn();clear=vi.fn();dispose=vi.fn();render(_scene:THREE.Scene,camera:THREE.Camera){const light=camera.children.find(child=>child instanceof actual.PointLight);if(light instanceof actual.PointLight)h.lantern={intensity:light.intensity,distance:light.distance,decay:light.decay,position:light.position.toArray(),exposure:this.toneMappingExposure};h.draw();h.order.push('draw');}}};
});
vi.mock('../../src/dungeon/world-loader',()=>({DungeonWorldLoader:class {
 constructor(private readonly _scene:unknown,private readonly options:{changed?():void}){}
 get ready(){return h.ready;}get presentable(){return h.presentable;}get state(){return 'authoring';}get coverage(){return {};}
 request=h.request;clear(){h.clear();h.ready=false;this.options.changed?.();}dispose=h.dispose;
 show(){h.order.push('show');}rendered(){h.ready=true;h.order.push('ready');this.options.changed?.();}
}}));
import {createDungeonView} from '../../src/dungeon/view';
afterEach(()=>vi.unstubAllGlobals());
it('does not reveal partial geometry, records readiness only after draw, and stops all work after context loss',()=>{
 vi.clearAllMocks();h.order=[];h.presentable=h.ready=false;vi.stubGlobal('devicePixelRatio',1);
 const canvas=Object.assign(new EventTarget(),{dataset:{},clientWidth:800,clientHeight:500});
 const view=createDungeonView(canvas as unknown as HTMLCanvasElement);
 const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'Tester')!;sim.command(p.actor.id,1,{kind:'ready'});sim.command(p.actor.id,2,{kind:'start'});
 const snapshot=sim.snapshot(p.actor.id),look={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
 view.setSnapshot(snapshot);view.render(.016,look);expect(h.request).toHaveBeenCalledOnce();expect(h.draw).not.toHaveBeenCalled();expect(h.ready).toBe(false);
 h.presentable=true;view.render(.016,look);expect(h.order).toEqual(['show','draw','ready']);
 expect(h.lantern).toEqual({intensity:14,distance:10,decay:2,position:[0,.15,.65],exposure:1.3});
 const event=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(h.clear).toHaveBeenCalledOnce();
 view.setSnapshot({...snapshot,raid:2,seed:15838});view.render(.016,look);expect(h.request).toHaveBeenCalledOnce();expect(h.draw).toHaveBeenCalledOnce();
 view.dispose();view.dispose();expect(h.dispose).toHaveBeenCalledOnce();
});

it('fails closed when the first complete draw throws without a context-loss event',()=>{
 vi.clearAllMocks();h.order=[];h.presentable=true;h.ready=false;vi.stubGlobal('devicePixelRatio',1);
 const canvas=Object.assign(new EventTarget(),{dataset:{} as Record<string,string>,clientWidth:800,clientHeight:500});
 const states:boolean[]=[],view=createDungeonView(canvas as unknown as HTMLCanvasElement,{worldChanged:()=>states.push(view.worldReady)});
 const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'Tester')!;sim.command(p.actor.id,1,{kind:'ready'});sim.command(p.actor.id,2,{kind:'start'});
 const snapshot=sim.snapshot(p.actor.id),look={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
 view.setSnapshot(snapshot);h.draw.mockImplementationOnce(()=>{throw new Error('GPU draw failed');});
 expect(()=>view.render(.016,look)).not.toThrow();expect(view.lost).toBe(true);expect(view.worldReady).toBe(false);
 expect(canvas.dataset.worldReady).toBe('false');expect(states).toEqual([false]);expect(h.order).toEqual(['show']);expect(h.clear).toHaveBeenCalledOnce();
 view.setSnapshot({...snapshot,raid:2});view.render(.016,look);expect(h.request).toHaveBeenCalledOnce();expect(h.draw).toHaveBeenCalledOnce();
 view.dispose();expect(h.dispose).toHaveBeenCalledOnce();
});
