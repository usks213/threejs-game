import {spatialSound} from './spatial';
import { creatureVoices } from './creatures';
import type { Snapshot } from '../simulation/protocol';
/** Procedural original soundscape. No borrowed recordings or melodies. */
export function ambience(context:AudioContext,output:AudioNode,musicOutput:AudioNode=output,effectsOutput:AudioNode=output){
 const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate),data=buffer.getChannelData(0);let previous=0;
 for(let i=0;i<data.length;i++){previous=previous*.97+(Math.random()*2-1)*.03;data[i]=previous;}
 const wind=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();wind.buffer=buffer;wind.loop=true;filter.type='lowpass';filter.frequency.value=450;gain.gain.value=.2;wind.connect(filter);filter.connect(gain);gain.connect(output);wind.start();
 const voices=creatureVoices(context,output);
 const tells=new Map<number,boolean>();
 let nextBird=0,nextNote=0,lastStep=0,lastX=0,lastZ=0,phrase=0;
 const tone=(frequency:number,length:number,volume:number,type:OscillatorType='sine',slide=frequency,destination:AudioNode=output)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+length);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g);g.connect(destination);o.start();o.stop(t+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};};
 return {update(s:Snapshot){
  if(context.state!=='running')return;voices.update(s);const t=context.currentTime,e=s.adventure.environment,boss=s.adventure.enemies.some(e=>e.boss&&e.health>0&&Math.hypot(e.x-s.player.x,e.y-s.player.y,e.z-s.player.z)<30);
  const depth=s.adventure.generator===4&&s.player.y<-3,sky=s.adventure.generator===4&&s.player.y>17;
  filter.frequency.setTargetAtTime(depth?180:sky?800:e.weather==='rain'||e.weather==='storm'?2200:450,t,.5);gain.gain.setTargetAtTime(depth?.13:sky?.34:e.weather==='storm'?.7:.23,t,.5);
  for(const enemy of s.adventure.enemies){const mix=spatialSound(s.player,enemy,s.player.heading,25),active=enemy.windup>0;if(active&&!tells.get(enemy.id)&&mix.gain>0)tone(enemy.boss?65:enemy.definition==='boar'?140:220,enemy.boss?1.2:.18,(enemy.boss?.08:.025)*mix.gain,'sawtooth',enemy.boss?180:70,effectsOutput);tells.set(enemy.id,active);}
  if(tells.size>256){const live=new Set(s.adventure.enemies.map(e=>e.id));for(const id of tells.keys())if(!live.has(id))tells.delete(id);}
  const d=Math.hypot(s.player.x-lastX,s.player.z-lastZ);if(d>.65&&s.player.grounded&&t-lastStep>.22){tone(s.adventure.wet?170:85,.08,.026,'triangle',40);lastStep=t;lastX=s.player.x;lastZ=s.player.z;}
  if(t>nextBird&&e.daylight>.3&&!boss&&!depth){tone(1400+Math.sin(t)*400,.12,.012,'sine',2300);nextBird=t+5+Math.random()*8;}
  if(t>nextNote){const notes=depth?[98,146.83,123.47,110]:sky?[261.63,392,349.23,523.25,329.63]:boss?[110,123.47,130.81,110,164.81,123.47]:[196,293.66,246.94,220,293.66,329.63,246.94,196];const note=notes[phrase++%notes.length];tone(note,boss?.8:3,boss?.025:.013,'triangle',note,musicOutput);nextNote=t+(boss?1.2:3.8);}
 },dispose(){voices.dispose();wind.stop();wind.disconnect();filter.disconnect();gain.disconnect();}};
}
