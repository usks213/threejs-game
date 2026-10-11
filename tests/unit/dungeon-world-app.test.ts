import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ClientOptions} from '../../src/dungeon/client';
import type {createDungeonUI} from '../../src/dungeon/ui';
import type {InputCallbacks} from '../../src/dungeon/input';
import type {Snapshot} from '../../src/dungeon/types';
import {DungeonSimulation} from '../../src/dungeon/simulation';

const h=vi.hoisted(()=>({ui:null as unknown as ReturnType<typeof createDungeonUI>,callbacks:null as unknown as Parameters<typeof createDungeonUI>[1],client:null as unknown as ClientOptions,
 inputCallbacks:null as unknown as InputCallbacks,active:false,held:false,resets:0,worldReady:false,worldStage:'idle',worldChanged:()=>{},canDraw:false,lost:false,raid:-1,
 raf:null as FrameRequestCallback|null,sent:vi.fn((_value:unknown)=>true),action:vi.fn((_value:unknown)=>true),loading:vi.fn(),notice:vi.fn(),render:vi.fn(),setActive:vi.fn()}));
vi.mock('../../src/dungeon/ui',()=>({createDungeonUI:(_root:HTMLElement,callbacks:Parameters<typeof createDungeonUI>[1])=>{h.callbacks=callbacks;return h.ui;}}));
vi.mock('../../src/dungeon/audio',()=>({createDungeonAudio:()=>({unlock:vi.fn(),update:vi.fn(),setMuted:vi.fn(),dispose:vi.fn()})}));
vi.mock('../../src/dungeon/client',()=>({
 randomToken:()=> 'a'.repeat(64),roomFromText:(text:string)=>text,roomIdentity:()=>({key:'b'.repeat(64),name:'Tester',persistent:true}),inviteURL:()=> 'https://example.test/?mode=dungeon',
 DungeonClient:class {connected=false;lastSentActionSequence=0;constructor(options:ClientOptions){h.client=options;}
  connect(){this.connected=true;h.client.callbacks.state('接続済み');}reconnect(){this.connect();}input(value:unknown){return h.sent(value);}action(value:unknown){return h.action(value);}dispose(){this.connected=false;}
 },
}));
vi.mock('../../src/dungeon/input',()=>({createDungeonInput:(_elements:unknown,callbacks:InputCallbacks)=>{
 h.inputCallbacks=callbacks;const reset=()=>{h.held=false;h.resets++;callbacks.changed?.(true);};
 return {sample:()=>({x:0,z:h.active&&h.held?1:0,yaw:.5,pitch:.2,block:h.active&&h.held,crouch:false}),reset,setLook:vi.fn(),
 setActive(value:boolean){h.setActive(value);if(h.active===value)return;h.active=value;reset();},dispose:vi.fn()};
}}));
vi.mock('../../src/dungeon/view',()=>({createDungeonView:(_canvas:HTMLCanvasElement,options:{worldChanged():void})=>{
 h.worldChanged=options.worldChanged;
 return {get lost(){return h.lost;},get worldReady(){return h.worldReady;},get worldStage(){return h.worldStage;},resize:vi.fn(),dispose:vi.fn(),
 resetWorld(){h.worldReady=false;h.worldStage='idle';h.raid=-1;h.worldChanged();},
 setSnapshot(next:Snapshot){if(next.raid>0&&next.raid!==h.raid){h.raid=next.raid;h.worldReady=false;h.worldStage='authoring';h.worldChanged();}},
 render(){h.render();if(h.lost)return;if(h.canDraw&&!h.worldReady){h.worldReady=true;h.worldStage='ready';h.worldChanged();}},
 };
}}));
vi.mock('../../src/dungeon/input-pump',()=>({startDungeonInputPump:()=>vi.fn()}));
import {startDungeon} from '../../src/dungeon/app';

class Node extends EventTarget {dataset:Record<string,string>={};className='';textContent='';type='';setAttribute=vi.fn();prepend=vi.fn();querySelector=()=>this;}
let dispose=()=>{};
beforeEach(()=>{
 vi.clearAllMocks();h.active=h.held=h.worldReady=h.canDraw=h.lost=false;h.resets=0;h.raid=-1;h.worldStage='idle';
 const root=new Node(),canvas=new Node(),window=Object.assign(new EventTarget(),{location:new URL('https://example.test/?mode=dungeon&test=1'),localStorage:{getItem:()=>null,setItem:vi.fn()}}),document=Object.assign(new EventTarget(),{hidden:false,title:'Before',querySelector:()=>root,createElement:()=>new Node()});
 vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('location',window.location);vi.stubGlobal('history',{replaceState:vi.fn()});
 vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{h.raf=callback;return 1;}));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 h.ui={canvas,setWorldLoading:h.loading,notice:h.notice,update:vi.fn(),setRoom:vi.fn(),setInvite:vi.fn(),setConnection:vi.fn(),setInventory:vi.fn(),setGraphicsError:vi.fn(),renderFeedback:vi.fn(),dispose:vi.fn()} as unknown as ReturnType<typeof createDungeonUI>;
 dispose=startDungeon();
});
afterEach(()=>{dispose();vi.unstubAllGlobals();});
function snapshot(raid=false){const sim=new DungeonSimulation(),profile=sim.join('a'.repeat(64),'Tester')!;
 if(raid){sim.command(profile.actor.id,1,{kind:'ready'});sim.command(profile.actor.id,2,{kind:'start'});}return sim.snapshot(profile.actor.id);}
function receive(value:Snapshot){h.client.callbacks.snapshot(value);}
function draw(){h.raf?.(performance.now());}

describe('initial dungeon drawing and authorized server time',()=>{
 it('starts from a lobby, gates raid controls until a full draw, and keeps authoritative time moving',()=>{
  h.callbacks.create('Tester');receive(snapshot());expect(h.worldStage).toBe('idle');expect(h.active).toBe(false);
  h.callbacks.action({kind:'start'});expect(h.action).toHaveBeenCalledWith({kind:'start'});
  const raid=snapshot(true);receive(raid);expect(h.loading).toHaveBeenLastCalledWith(true,false);expect(h.active).toBe(false);
  for(const action of [{kind:'attack'},{kind:'skill'},{kind:'interact',target:'door-north'},{kind:'heal'}] as const)h.callbacks.action(action);
  expect(h.action).toHaveBeenCalledTimes(1);
  raid.elapsed=19;raid.tick=380;receive(raid);expect(window.__dungeonProbe!()?.elapsed).toBe(19);expect(h.active).toBe(false);
  h.worldStage='awaiting-frame';h.worldChanged();expect(h.active).toBe(false);
  h.canDraw=true;draw();expect(h.render).toHaveBeenCalled();expect(h.active).toBe(true);expect(h.loading).toHaveBeenLastCalledWith(false,false);
  h.callbacks.action({kind:'attack'});expect(h.action).toHaveBeenLastCalledWith({kind:'attack'});
 });
 it('joins a running raid while hidden and never enables play merely because CPU preparation ended',()=>{
  Object.assign(document,{hidden:true});h.callbacks.join('c'.repeat(64),'Tester');const raid=snapshot(true);raid.elapsed=117;receive(raid);
  h.canDraw=true;h.worldStage='awaiting-frame';h.worldChanged();draw();expect(h.render).not.toHaveBeenCalled();expect(h.active).toBe(false);
  raid.elapsed=122;receive(raid);expect(window.__dungeonProbe!()?.elapsed).toBe(122);
  Object.assign(document,{hidden:false});document.dispatchEvent(new Event('visibilitychange'));expect(h.active).toBe(false);
  draw();expect(h.active).toBe(true);expect(window.__dungeonProbe!()?.elapsed).toBe(122);
 });
 it('keeps held movement and guard through ordinary door snapshots, but clears them on leaving',()=>{
  h.callbacks.create('Tester');const raid=snapshot(true);receive(raid);h.canDraw=true;draw();h.held=true;const resets=h.resets;
  raid.doors[0].open=true;receive(raid);draw();expect(h.active).toBe(true);expect(h.held).toBe(true);expect(h.resets).toBe(resets);
  h.callbacks.leave();expect(h.active).toBe(false);expect(h.held).toBe(false);expect(h.worldReady).toBe(false);expect(window.__dungeonProbe!()).toBeNull();
 });
 it('retains a ready world on transport reconnect but waits for a fresh confirming snapshot',()=>{
  h.callbacks.create('Tester');const raid=snapshot(true);receive(raid);h.canDraw=true;draw();expect(h.active).toBe(true);
  h.callbacks.reconnect();expect(h.worldReady).toBe(true);expect(h.active).toBe(false);h.callbacks.action({kind:'attack'});expect(h.action).not.toHaveBeenCalled();
  raid.elapsed=50;receive(raid);expect(h.worldReady).toBe(true);expect(h.active).toBe(true);expect(h.loading).toHaveBeenLastCalledWith(false,false);
  h.callbacks.reconnect();receive({...raid,raid:2,seed:15838});expect(h.worldReady).toBe(false);expect(h.active).toBe(false);
 });
 it('does not label lost GPU context as loading or suggest a transport reconnect repairs it',()=>{
  h.callbacks.create('Tester');receive(snapshot(true));h.canDraw=true;draw();h.lost=true;h.worldReady=false;h.worldChanged();
  expect(h.active).toBe(false);expect(h.loading).toHaveBeenLastCalledWith(false,false);
  h.callbacks.action({kind:'attack'});expect(h.notice).toHaveBeenLastCalledWith(expect.stringContaining('ページを更新'));
  expect(h.notice).toHaveBeenLastCalledWith(expect.stringContaining('再接続だけでは復旧できません'));
  h.callbacks.action({kind:'start'});expect(h.action).not.toHaveBeenCalled();
 });
 it('replaces initial loading with a reload-required graphics error and keeps RAF alive after a failed draw',()=>{
  h.callbacks.create('Tester');receive(snapshot(true));expect(h.loading).toHaveBeenLastCalledWith(true,false);
  h.canDraw=true;h.render.mockImplementationOnce(()=>{h.lost=true;h.worldChanged();});
  const frames=vi.mocked(requestAnimationFrame).mock.calls.length;
  draw();expect(h.worldReady).toBe(false);expect(h.active).toBe(false);expect(h.loading).toHaveBeenLastCalledWith(false,false);
  expect(h.ui.canvas.dataset.ready).toBe('false');expect(h.ui.setGraphicsError).toHaveBeenCalledOnce();
  expect(h.ui.setGraphicsError).toHaveBeenCalledWith(expect.stringContaining('ページを更新してください。再接続だけでは復旧できません。'));
  expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(frames+1);
  h.callbacks.reconnect();receive(snapshot(true));draw();expect(h.worldReady).toBe(false);expect(h.active).toBe(false);
  expect(h.loading).toHaveBeenLastCalledWith(false,false);expect(h.ui.setGraphicsError).toHaveBeenCalledOnce();
 });

 it('exposes bounded RAF diagnostics only under test=1 and removes the probe on disposal',()=>{
  draw();draw();const evidence=window.__dungeonRenderProbe!();expect(evidence!.diagnostics.raf.callbacks).toBe(2);
  expect(evidence!.diagnostics.raf.gaps.bins).toHaveLength(8);dispose();expect(window.__dungeonRenderProbe).toBeUndefined();
  vi.stubGlobal('location',new URL('https://example.test/?mode=dungeon'));dispose=startDungeon();draw();expect(window.__dungeonRenderProbe).toBeUndefined();
 });

});
