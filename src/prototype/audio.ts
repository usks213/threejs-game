import type {WeatherKind} from './core/weather';

export interface AudioMix {music:number;effects:number;ambience:number}
export interface AudioEnvironment {
 seconds:number;
 weather:WeatherKind|{kind:WeatherKind};
 region?:string|null;
 active:boolean;
 danger:number|boolean;
 /** Optional cached roof result. Audio never casts extra world rays. */
 sheltered?:boolean;
}
export const DEFAULT_AUDIO_MIX:Readonly<AudioMix>=Object.freeze({music:.55,effects:1,ambience:.65});
export const AUDIO_LIMITS=Object.freeze({effectVoices:12,bedVoices:5,environmentInterval:.5,harmonyInterval:16});

const REGION_ROOTS:Readonly<Record<string,number>>={hearthfield:130.813,resinwood:146.832,rootfen:110,coppermesa:123.471,cinderkeep:98,rimepass:164.814,mirrorlake:146.832};
// Original, non-melodic open intervals. These are synthesis parameters, not a recorded score.
const HARMONY=[1,4/3,1,9/8] as const;
const clamp=(value:number,fallback:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
interface EffectVoice {source:AudioScheduledSourceNode;nodes:AudioNode[]}
interface Tone {source:OscillatorNode;gain:GainNode}
interface NoiseBed {filter:BiquadFilterNode;gain:GainNode}

/** User-gesture start, a fixed five-voice ambient bed and bounded procedural effects.
 * update() stores state every frame, but schedules at most one environment change
 * per interval. There are no timers, backlog notes, asset requests or microphone use. */
export function createAudio(){
 let context:AudioContext|null=null,noise:AudioBuffer|null=null,output:GainNode|null=null;
 let musicBus:GainNode|null=null,effectsBus:GainNode|null=null,ambienceBus:GainNode|null=null;
 let disposed=false,failed=false,master=.8,active=true,seenEnvironment=false;
 let seconds=0,weather:WeatherKind='clear',region='',danger=0,sheltered=false;
 let nextEnvironment=-Infinity,appliedOutput=-1;
 let desiredRunning=false,lastLifecycleRequest:boolean|null=null,lifecycleBusy=false;
 let visibilityDocument:Document|null=null;
 const mix:AudioMix={...DEFAULT_AUDIO_MIX},nodes=new Set<AudioNode>(),sources=new Set<AudioScheduledSourceNode>();
 const effects=new Set<EffectVoice>(),tones:Tone[]=[];
 const targets=new WeakMap<AudioParam,number>();
 let wind:NoiseBed|null=null,rain:NoiseBed|null=null;

 function own<T extends AudioNode>(node:T){nodes.add(node);return node;}
 function ownSource<T extends AudioScheduledSourceNode>(node:T){own(node);sources.add(node);return node;}
 function instant(param:AudioParam,value:number){
  if(targets.get(param)===value)return;
  param.cancelScheduledValues(context!.currentTime);param.setValueAtTime(value,context!.currentTime);targets.set(param,value);
 }
 function glide(param:AudioParam,value:number,time:number){
  if(targets.get(param)===value)return;
  const now=context!.currentTime;
  // cancelAndHold avoids resetting an unfinished fade on supporting browsers.
  if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(now);
  else {const current=param.value;param.cancelScheduledValues(now);param.setValueAtTime(current,now);}
  param.setTargetAtTime(value,now,time);targets.set(param,value);
 }
 function release(voice:EffectVoice){
  if(!effects.delete(voice))return;
  voice.source.onended=null;sources.delete(voice.source);
  for(const node of voice.nodes){node.disconnect();nodes.delete(node);}
 }
 function stopEffects(){for(const voice of effects){try{voice.source.stop();}catch{/* Already ended. */}release(voice);}}
 function hidden(){return visibilityDocument?.hidden??false;}
 function audible(){return active&&!hidden()&&master>0&&(mix.music>0||mix.effects>0||mix.ambience>0);}
 function pumpLifecycle(){
  const c=context;if(!c||lifecycleBusy||lastLifecycleRequest===desiredRunning||c.state==='closed')return;
  const running=desiredRunning;lastLifecycleRequest=running;
  if(running&&c.state==='running'||!running&&c.state==='suspended')return;
  lifecycleBusy=true;
  try{
   // Serialize suspend/resume: a late resume cannot leave a hidden tab running.
   const operation=running?c.resume():c.suspend();
   void operation.catch(()=>{/* A later user start may retry an autoplay refusal. */}).finally(()=>{
    if(context!==c)return;lifecycleBusy=false;pumpLifecycle();
   });
  }catch{lifecycleBusy=false;}
 }
 function synchronize(force=false){
  if(!context||!output)return;
  const running=audible(),value=running?master:0;
  if(appliedOutput!==value){instant(output.gain,value);appliedOutput=value;}
  if(!running||mix.effects===0)stopEffects();
  desiredRunning=running;if(force)lastLifecycleRequest=null;pumpLifecycle();
 }
 function visibilityChanged(){synchronize();}
 function cleanup(){
  visibilityDocument?.removeEventListener('visibilitychange',visibilityChanged);visibilityDocument=null;
  stopEffects();
  for(const source of sources){source.onended=null;try{source.stop();}catch{/* Not started/already ended. */}}
  sources.clear();
  for(const node of nodes)node.disconnect();nodes.clear();tones.length=0;wind=rain=null;
  const old=context;context=null;noise=null;output=musicBus=effectsBus=ambienceBus=null;
  lifecycleBusy=false;lastLifecycleRequest=null;appliedOutput=-1;
  if(old&&old.state!=='closed'){try{void old.close().catch(()=>{});}catch{/* No audio is preferable to a failed teardown. */}}
 }
 function disable(){failed=true;cleanup();}
 function bus(parent:AudioNode,value:number){const node=own(context!.createGain());node.gain.value=value;node.connect(parent);targets.set(node.gain,value);return node;}
 function createBed(filterType:BiquadFilterType,frequency:number,offset:number):NoiseBed {
  const c=context!,source=ownSource(c.createBufferSource()),filter=own(c.createBiquadFilter()),gain=bus(ambienceBus!,0);
  source.buffer=noise;source.loop=true;filter.type=filterType;filter.frequency.value=frequency;filter.Q.value=.55;
  source.connect(filter);filter.connect(gain);source.start(c.currentTime,offset);return {filter,gain};
 }
 function ensureBeds(){
  if(tones.length||!seenEnvironment||!audible())return;
  const c=context!;
  for(let i=0;i<3;i++){
   const source=ownSource(c.createOscillator()),gain=bus(musicBus!,0);source.type='sine';source.frequency.value=130.813;
   source.connect(gain);source.start();tones.push({source,gain});
  }
  wind=createBed('lowpass',280,0);rain=createBed('bandpass',2600,.73);nextEnvironment=-Infinity;
 }
 function refreshEnvironment(){
  if(!context||!seenEnvironment||!audible())return;
  ensureBeds();
  if(seconds<nextEnvironment)return;
  nextEnvironment=seconds+AUDIO_LIMITS.environmentInterval;
  const root=(Object.hasOwn(REGION_ROOTS,region)?REGION_ROOTS[region]:130.813)*HARMONY[Math.floor(seconds/AUDIO_LIMITS.harmonyInterval)%HARMONY.length];
  for(let i=0;i<tones.length;i++){
   const ratio=i===0?1:i===1?(danger>=.5?1.25:1.5):(danger>=.5?1.5:2);
   glide(tones[i].source.frequency,root*ratio,1.4);
   glide(tones[i].gain.gain,(i===0?.018:i===1?.01:.006)*(1-danger*.4),.8);
  }
  const gust=.85+.15*Math.sin(seconds*.23),windLevel=weather==='wind'?.06:weather==='snow'?.028:weather==='rain'?.023:.012;
  glide(wind!.gain.gain,windLevel*gust*(sheltered?.22:1),.55);
  glide(wind!.filter.frequency,(weather==='wind'?420:weather==='snow'?190:280)*(region==='rimepass'?1.2:1),1);
  glide(rain!.gain.gain,weather==='rain'?(sheltered?.004:.032):0,.65);
 }
 function envelope(node:AudioNode,volume:number,duration:number){
  const c=context!,gain=own(c.createGain()),now=c.currentTime;
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),now+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);node.connect(gain);gain.connect(effectsBus!);return gain;
 }
 function track(source:AudioScheduledSourceNode,voiceNodes:AudioNode[],duration:number){
  const voice={source,nodes:voiceNodes};effects.add(voice);source.onended=()=>release(voice);source.start();source.stop(context!.currentTime+duration+.02);
 }
 function air(frequency:number,volume:number,duration:number,filterType:BiquadFilterType='bandpass'){
  const c=context!,source=ownSource(c.createBufferSource()),filter=own(c.createBiquadFilter());source.buffer=noise;filter.type=filterType;
  filter.frequency.setValueAtTime(frequency,c.currentTime);filter.frequency.exponentialRampToValueAtTime(Math.max(80,frequency*.3),c.currentTime+duration);filter.Q.value=.6;
  source.connect(filter);const gain=envelope(filter,volume,duration);track(source,[source,filter,gain],duration);
 }
 function ring(frequency:number,volume:number,duration:number){
  const c=context!,source=ownSource(c.createOscillator());source.type='sine';source.frequency.setValueAtTime(frequency,c.currentTime);
  source.frequency.exponentialRampToValueAtTime(frequency*.94,c.currentTime+duration);const gain=envelope(source,volume,duration);track(source,[source,gain],duration);
 }
 return {
  setVolume(value:number){if(disposed)return;master=clamp(value,master);synchronize();},
  setMix(value:Partial<AudioMix>){
   if(disposed)return;
   for(const key of ['music','effects','ambience'] as const){const v=value[key];if(typeof v==='number')mix[key]=clamp(v,mix[key]);}
   if(context){instant(musicBus!.gain,mix.music);instant(effectsBus!.gain,mix.effects);instant(ambienceBus!.gain,mix.ambience);synchronize();}
  },
  start(){
   if(disposed||failed)return;
   try{
    if(!context){
     const Constructor=globalThis.AudioContext??(globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
     if(!Constructor)return;
     context=new Constructor();output=own(context.createGain());output.gain.value=0;output.connect(context.destination);
     musicBus=bus(output,mix.music);effectsBus=bus(output,mix.effects);ambienceBus=bus(output,mix.ambience);
     noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const data=noise.getChannelData(0);
     // One shared deterministic noise buffer; both weather sources loop it.
     let seed=0x1f123bb5;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=(seed>>>0)/2147483648-1;}
     if(typeof document!=='undefined'){visibilityDocument=document;document.addEventListener('visibilitychange',visibilityChanged);}
    }
    synchronize(true);refreshEnvironment();
   }catch{disable();}
  },
  update(state:AudioEnvironment){
   if(disposed||failed)return;
   const nextSeconds=Number.isFinite(state.seconds)?Math.max(0,state.seconds):seconds;
   const nextWeather=typeof state.weather==='string'?state.weather:state.weather.kind;
   const nextRegion=state.region??'',nextDanger=Math.round(clamp(typeof state.danger==='boolean'?Number(state.danger):state.danger,danger)*4)/4;
   const nextSheltered=state.sheltered??false;
   if(nextSeconds<seconds||!seenEnvironment||!active&&state.active)nextEnvironment=-Infinity;
   seconds=nextSeconds;weather=nextWeather;region=nextRegion;danger=nextDanger;sheltered=nextSheltered;active=state.active;seenEnvironment=true;
   if(context){try{synchronize();refreshEnvironment();}catch{disable();}}
  },
  play(kind:string){
   if(disposed||failed||!context||context.state!=='running'||!audible()||mix.effects===0)return;
   const needed=kind==='parry'?4:kind==='hit'||kind==='hurt'?2:1;
   if(effects.size+needed>AUDIO_LIMITS.effectVoices)return;
   try{
    if(kind==='swing')air(1500,.13,.24);
    else if(kind==='parry'){air(2900,.15,.08);ring(780,.045,.24);ring(1327,.023,.34);ring(2410,.011,.18);}
    else if(kind==='hit'||kind==='hurt'){air(kind==='hurt'?240:550,.28,.14,'lowpass');ring(76,.07,.13);}
    else if(kind==='step')air(320,.055,.085,'lowpass');
    else if(kind==='break')air(700,.2,.3,'lowpass');else air(600,.035,.06,'lowpass');
   }catch{disable();}
  },
  dispose(){if(disposed)return;disposed=true;cleanup();},
 };
}
