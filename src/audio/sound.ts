import { ambience } from './ambience';
import type { Snapshot } from '../simulation/protocol';
export function gameSound(signal:AbortSignal){
 let context:AudioContext|null=null,noise:AudioBuffer|null=null,muted=false,master:GainNode|null=null,ambient:ReturnType<typeof ambience>|null=null;
 const unlock=()=>{if(!context){context=new AudioContext();master=context.createGain();master.gain.value=.65;master.connect(context.destination);ambient=ambience(context,master);noise=context.createBuffer(1,context.sampleRate*.4,context.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);}void context.resume().catch(()=>{});};
 window.addEventListener('pointerdown',unlock,{signal,once:true});window.addEventListener('keydown',unlock,{signal,once:true});signal.addEventListener('abort',()=>{ambient?.dispose();void context?.close();},{once:true});
 return {update(s:Snapshot){if(!muted&&!document.hidden)ambient?.update(s);},toggle(){muted=!muted;if(master)master.gain.value=muted?0:.65;return muted;},effect(message:string){
  if(!context||muted||document.hidden||context.state!=='running')return;
  const time=context.currentTime,impact=/攻撃|命中|岩|掘|盛|水|木材|石 /.test(message);
  if(impact&&noise){const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noise;filter.type=/水/.test(message)?'bandpass':'lowpass';filter.frequency.value=/水/.test(message)?1100:/命中/.test(message)?650:260;gain.gain.setValueAtTime(.07,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.22);source.connect(filter);filter.connect(gain);gain.connect(master??context.destination);source.start();source.stop(time+.25);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};return;}
  const notes=/作りました|回復|倒|解放/.test(message)?[392,493.88,587.33]:[440,554.37];
  for(let i=0;i<notes.length;i++){const oscillator=context.createOscillator(),gain=context.createGain(),start=time+i*.065;oscillator.type='sine';oscillator.frequency.value=notes[i];gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.022,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.24);oscillator.connect(gain);gain.connect(master??context.destination);oscillator.start(start);oscillator.stop(start+.26);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}
 }};
}
