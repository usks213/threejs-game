import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AUDIO_LIMITS,createAudio,DEFAULT_AUDIO_MIX} from '../../src/prototype/audio';
import type {AudioEnvironment} from '../../src/prototype/audio';

class FakeParam {
 value=0;
 events:{kind:string;value:number;time:number}[]=[];
 cancelScheduledValues(time:number){this.events.push({kind:'cancel',value:this.value,time});return this;}
 cancelAndHoldAtTime(time:number){this.events.push({kind:'hold',value:this.value,time});return this;}
 setValueAtTime(value:number,time:number){this.value=value;this.events.push({kind:'set',value,time});return this;}
 exponentialRampToValueAtTime(value:number,time:number){this.value=value;this.events.push({kind:'ramp',value,time});return this;}
 setTargetAtTime(value:number,time:number,_constant:number){this.value=value;this.events.push({kind:'target',value,time});return this;}
}
class FakeNode {
 connections:FakeNode[]=[];disconnects=0;
 constructor(readonly context:FakeContext){context.nodes.push(this);}
 connect(node:FakeNode){this.connections.push(node);return node;}
 disconnect(){this.disconnects++;this.connections.length=0;}
}
class FakeGain extends FakeNode {gain=new FakeParam();}
class FakeFilter extends FakeNode {frequency=new FakeParam();Q=new FakeParam();type='lowpass';}
class FakeSource extends FakeNode {
 starts:number[][]=[];stops:(number|undefined)[]=[];onended:(()=>void)|null=null;ended=false;
 start(...args:number[]){this.starts.push(args);}
 stop(time?:number){this.stops.push(time);if(time===undefined||time<=this.context.currentTime)this.ended=true;}
 finish(){this.ended=true;this.onended?.();}
}
class FakeOscillator extends FakeSource {frequency=new FakeParam();type='sine';}
class FakeBufferSource extends FakeSource {buffer:unknown;loop=false;}
class FakeContext {
 nodes:FakeNode[]=[];sampleRate=8000;currentTime=0;state='suspended';
 destination=new FakeNode(this);bufferCount=0;resumes=0;suspends=0;closes=0;
 resumeError=false;deferredResume:(()=>void)|null=null;deferResume=false;
 get gains(){return this.nodes.filter((node):node is FakeGain=>node instanceof FakeGain);}
 get sources(){return this.nodes.filter((node):node is FakeSource=>node instanceof FakeSource);}
 get oscillators(){return this.nodes.filter((node):node is FakeOscillator=>node instanceof FakeOscillator);}
 createGain(){return new FakeGain(this);}
 createBiquadFilter(){return new FakeFilter(this);}
 createOscillator(){return new FakeOscillator(this);}
 createBufferSource(){return new FakeBufferSource(this);}
 createBuffer(_channels:number,length:number,_sampleRate:number){this.bufferCount++;const data=new Float32Array(length);return {getChannelData:()=>data};}
 resume(){
  this.resumes++;
  if(this.resumeError)return Promise.reject(new Error('Autoplay refused'));
  if(this.deferResume)return new Promise<void>(resolve=>{this.deferredResume=()=>{this.state='running';resolve();};});
  this.state='running';return Promise.resolve();
 }
 suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
 close(){this.closes++;this.state='closed';return Promise.resolve();}
}
class FakeDocument extends EventTarget {hidden=false;}
const scene=(changes:Partial<AudioEnvironment>={}):AudioEnvironment=>({seconds:0,weather:'clear',region:null,active:true,danger:0,...changes});
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
let contexts:FakeContext[],visibility:FakeDocument;
let audio:ReturnType<typeof createAudio>;
beforeEach(()=>{
 contexts=[];visibility=new FakeDocument();
 vi.stubGlobal('document',visibility);vi.stubGlobal('webkitAudioContext',undefined);
 vi.stubGlobal('AudioContext',class extends FakeContext {constructor(){super();contexts.push(this);}});
 audio=createAudio();
});
afterEach(async()=>{audio.dispose();await settle();vi.unstubAllGlobals();});

describe('procedural game audio',()=>{
 it('is lazy, applies pre-start mix, and supports existing start/play callers without a bed',async()=>{
  audio.setVolume(.4);audio.setMix({music:.2,effects:.3,ambience:.7});audio.play('parry');
  expect(contexts).toHaveLength(0);audio.start();await settle();const c=contexts[0];
  expect(c.gains.slice(0,4).map(g=>g.gain.value)).toEqual([.4,.2,.3,.7]);expect(c.sources).toHaveLength(0);
  audio.play('swing');expect(c.sources).toHaveLength(1);expect(c.gains.at(-1)!.connections).toEqual([c.gains[2]]);
  audio.start();await settle();expect(contexts).toHaveLength(1);expect(c.bufferCount).toBe(1);expect(c.resumes).toBe(1);
 });
 it('has a reused, bounded five-source bed with no per-frame allocations or backlog after large jumps',async()=>{
  audio.update(scene());expect(contexts).toHaveLength(0);audio.start();await settle();const c=contexts[0];
  expect(c.sources).toHaveLength(AUDIO_LIMITS.bedVoices);expect(c.oscillators).toHaveLength(3);
  expect(c.sources.filter(s=>s instanceof FakeBufferSource&&s.loop)).toHaveLength(2);
  const nodeCount=c.nodes.length,eventCount=c.gains.at(-2)!.gain.events.length;
  for(let i=0;i<30;i++)audio.update(scene({seconds:i/60,weather:i%2?'rain':'wind',danger:i%2,region:i%2?'cinderkeep':'resinwood'}));
  expect(c.nodes).toHaveLength(nodeCount);expect(c.gains.at(-2)!.gain.events).toHaveLength(eventCount);
  audio.update(scene({seconds:1000000}));const afterJump=c.gains.at(-2)!.gain.events.length;
  expect(afterJump-eventCount).toBe(2);expect(c.nodes).toHaveLength(nodeCount);
  for(let i=0;i<10000;i++)audio.update(scene({seconds:1000000+i/60}));
  expect(c.nodes).toHaveLength(nodeCount);expect(c.sources.every(s=>s.starts.length===1)).toBe(true);expect(c.bufferCount).toBe(1);
 });
 it('changes weather, shelter, region and danger using existing nodes and handles clock rewind',async()=>{
  audio.update(scene());audio.start();await settle();const c=contexts[0],wind=c.gains.at(-2)!,rain=c.gains.at(-1)!;
  expect(rain.gain.value).toBe(0);const calmRoot=c.oscillators[0].frequency.value,calmWind=wind.gain.value;
  audio.update(scene({seconds:.5,weather:{kind:'rain'}}));expect(rain.gain.value).toBe(.032);
  audio.update(scene({seconds:1,weather:'rain',sheltered:true}));expect(rain.gain.value).toBe(.004);expect(wind.gain.value).toBeLessThan(calmWind);
  audio.update(scene({seconds:1.5,weather:'wind',region:'cinderkeep',danger:true}));
  expect(rain.gain.value).toBe(0);expect(wind.gain.value).toBeGreaterThan(calmWind);
  expect(c.oscillators[0].frequency.value).toBeLessThan(calmRoot);expect(c.oscillators[1].frequency.value/c.oscillators[0].frequency.value).toBe(1.25);
  audio.update(scene({seconds:16}));expect(c.oscillators[0].frequency.value).toBeCloseTo(calmRoot*4/3);
  audio.update(scene());expect(c.oscillators[0].frequency.value).toBe(calmRoot);expect(c.sources).toHaveLength(5);
 });
 it('enforces the exact transient cap before a multi-voice effect and frees completed voices',async()=>{
  audio.start();await settle();const c=contexts[0];
  for(let i=0;i<10;i++)audio.play('step');audio.play('parry');expect(c.sources).toHaveLength(10);
  audio.play('hit');expect(c.sources).toHaveLength(AUDIO_LIMITS.effectVoices);
  for(let i=0;i<100;i++)audio.play('swing');expect(c.sources).toHaveLength(AUDIO_LIMITS.effectVoices);
  const completed=c.sources.slice(0,4);for(const source of completed)source.finish();
  audio.play('parry');expect(c.sources).toHaveLength(16);expect(completed.every(s=>s.disconnects===1&&s.onended===null)).toBe(true);
  audio.dispose();expect(c.sources.every(s=>s.disconnects===1)).toBe(true);
 });
 it('applies volume to currently playing effects and mutes buses without leaving stale effect tails',async()=>{
  audio.update(scene());audio.start();await settle();const c=contexts[0];audio.play('hurt');const hurt=c.sources.slice(5);
  audio.setVolume(.2);expect(c.gains[0].gain.value).toBe(.2);expect(hurt.every(s=>s.onended!==null)).toBe(true);
  audio.setMix({effects:0,music:0});expect(c.gains[1].gain.value).toBe(0);expect(c.gains[2].gain.value).toBe(0);
  expect(hurt.every(s=>s.ended&&s.disconnects===1&&s.onended===null)).toBe(true);
  const count=c.sources.length;audio.play('swing');expect(c.sources).toHaveLength(count);
  audio.setMix({effects:1});audio.play('step');expect(c.sources).toHaveLength(count+1);
  audio.setVolume(0);expect(c.gains[0].gain.value).toBe(0);expect(c.sources.at(-1)!.ended).toBe(true);await settle();expect(c.state).toBe('suspended');
  audio.setVolume(.8);await settle();expect(c.state).toBe('running');expect(c.sources).toHaveLength(count+1);
 });
 it('pauses immediately, does not queue effects, and resumes the same ambient nodes',async()=>{
  audio.update(scene());audio.start();await settle();const c=contexts[0];audio.play('parry');
  audio.update(scene({active:false}));expect(c.gains[0].gain.value).toBe(0);expect(c.sources.slice(5).every(s=>s.ended)).toBe(true);
  await settle();expect(c.state).toBe('suspended');const count=c.sources.length;
  for(let i=0;i<100;i++){audio.play('parry');audio.update(scene({seconds:i,active:false}));}
  expect(c.sources).toHaveLength(count);expect(c.suspends).toBe(1);
  audio.update(scene({seconds:100,active:true}));await settle();expect(c.state).toBe('running');expect(c.gains[0].gain.value).toBe(.8);
  expect(c.sources).toHaveLength(count);expect(c.sources.slice(0,5).every(s=>s.starts.length===1&&s.stops.length===0)).toBe(true);
 });
 it('gates document hiding even when no animation frame is delivered and removes its listener on dispose',async()=>{
  audio.update(scene());audio.start();await settle();const c=contexts[0];audio.play('step');
  visibility.hidden=true;visibility.dispatchEvent(new Event('visibilitychange'));expect(c.gains[0].gain.value).toBe(0);expect(c.sources.at(-1)!.ended).toBe(true);
  await settle();expect(c.state).toBe('suspended');visibility.hidden=false;visibility.dispatchEvent(new Event('visibilitychange'));await settle();expect(c.state).toBe('running');
  audio.dispose();audio.dispose();const resumes=c.resumes,suspends=c.suspends;
  visibility.hidden=true;visibility.dispatchEvent(new Event('visibilitychange'));audio.start();audio.update(scene());audio.play('hit');
  expect(c.closes).toBe(1);expect(c.resumes).toBe(resumes);expect(c.suspends).toBe(suspends);expect(contexts).toHaveLength(1);
  expect(c.nodes.filter(n=>n!==c.destination).every(n=>n.disconnects===1)).toBe(true);
 });
 it('serializes a late resume followed by pause and does not revive a disposed context',async()=>{
  vi.stubGlobal('AudioContext',class extends FakeContext {constructor(){super();this.deferResume=true;contexts.push(this);}});
  audio.update(scene());audio.start();const c=contexts[0];audio.update(scene({active:false}));
  expect(c.gains[0].gain.value).toBe(0);c.deferredResume!();await settle();expect(c.state).toBe('suspended');expect(c.suspends).toBe(1);
  audio.update(scene());expect(c.resumes).toBe(2);audio.dispose();c.deferredResume!();await settle();
  // The fake permits resolution after close. There must still be no new API calls/resources.
  expect(c.closes).toBe(1);expect(c.resumes).toBe(2);expect(c.sources.every(s=>s.ended&&s.disconnects===1)).toBe(true);
 });
 it('does not retry rejected autoplay on every frame; explicit start may retry',async()=>{
  vi.stubGlobal('AudioContext',class extends FakeContext {constructor(){super();this.resumeError=true;contexts.push(this);}});
  audio.update(scene());audio.start();await settle();const c=contexts[0];
  for(let i=0;i<300;i++)audio.update(scene({seconds:i/60}));expect(c.resumes).toBe(1);expect(c.state).toBe('suspended');
  c.resumeError=false;audio.start();await settle();expect(c.resumes).toBe(2);expect(c.state).toBe('running');expect(c.sources).toHaveLength(5);
 });
 it('supports prefixed Web Audio or silent absence/construction failure without crashing',async()=>{
  vi.stubGlobal('AudioContext',undefined);audio.start();audio.update(scene());audio.play('hit');expect(contexts).toHaveLength(0);
  vi.stubGlobal('webkitAudioContext',class extends FakeContext {constructor(){super();contexts.push(this);}});
  audio.start();await settle();expect(contexts).toHaveLength(1);audio.dispose();
  vi.stubGlobal('AudioContext',class {constructor(){throw new Error('No audio device');}});audio=createAudio();
  expect(()=>{audio.start();audio.update(scene());audio.play('hit');audio.dispose();}).not.toThrow();
 });
 it('closes and disconnects partially initialized audio when a required node fails',()=>{
  vi.stubGlobal('AudioContext',class extends FakeContext {constructor(){super();contexts.push(this);}override createBufferSource():FakeBufferSource {throw new Error('Audio unavailable');}});
  audio.update(scene());expect(()=>audio.start()).not.toThrow();const c=contexts[0];
  expect(c.closes).toBe(1);expect(c.nodes.filter(n=>n!==c.destination).every(n=>n.disconnects===1)).toBe(true);
  audio.start();audio.dispose();expect(contexts).toHaveLength(1);expect(c.closes).toBe(1);
 });
 it('sanitizes nonfinite gains, clamps valid gains, and suspends an entirely muted mix',async()=>{
  audio.setVolume(NaN);audio.setMix({music:Infinity,effects:-1,ambience:2});audio.update(scene({seconds:NaN,danger:NaN,region:'toString'}));audio.start();await settle();const c=contexts[0];
  expect(c.gains.slice(0,4).map(g=>g.gain.value)).toEqual([.8,DEFAULT_AUDIO_MIX.music,0,1]);
  expect(c.oscillators.every(s=>Number.isFinite(s.frequency.value))).toBe(true);
  audio.setMix({music:0,ambience:0});await settle();expect(c.state).toBe('suspended');expect(c.gains[0].gain.value).toBe(0);
 });
});
