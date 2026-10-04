import type { Snapshot } from '../simulation/protocol';
/** Procedural original soundscape. No borrowed recordings or melodies. */
export function ambience(context:AudioContext,output:AudioNode){
 const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate),data=buffer.getChannelData(0);let previous=0;
 for(let i=0;i<data.length;i++){previous=previous*.97+(Math.random()*2-1)*.03;data[i]=previous;}
 const wind=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();wind.buffer=buffer;wind.loop=true;filter.type='lowpass';filter.frequency.value=450;gain.gain.value=.2;wind.connect(filter);filter.connect(gain);gain.connect(output);wind.start();
 let nextBird=0,nextNote=0,lastStep=0,lastX=0,lastZ=0,phrase=0;
 const tone=(frequency:number,length:number,volume:number,type:OscillatorType='sine',slide=frequency)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+length);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g);g.connect(output);o.start();o.stop(t+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};};
 return {update(s:Snapshot){
  if(context.state!=='running')return;const t=context.currentTime,e=s.adventure.environment,boss=s.adventure.enemies.some(e=>e.boss&&e.health>0);
  filter.frequency.setTargetAtTime(e.weather==='rain'||e.weather==='storm'?2200:450,t,.5);gain.gain.setTargetAtTime(e.weather==='storm'?.7:.23,t,.5);
  const d=Math.hypot(s.player.x-lastX,s.player.z-lastZ);if(d>.65&&s.player.grounded&&t-lastStep>.22){tone(s.adventure.wet?170:85,.08,.026,'triangle',40);lastStep=t;lastX=s.player.x;lastZ=s.player.z;}
  if(t>nextBird&&e.daylight>.3&&!boss){tone(1400+Math.sin(t)*400,.12,.012,'sine',2300);nextBird=t+5+Math.random()*8;}
  if(t>nextNote){const notes=boss?[110,123.47,130.81,110,164.81,123.47]:[196,293.66,246.94,220,293.66,329.63,246.94,196];tone(notes[phrase++%notes.length],boss?.8:3,boss?.025:.013,'triangle');nextNote=t+(boss?1.2:3.8);}
 },dispose(){wind.stop();wind.disconnect();filter.disconnect();gain.disconnect();}};
}
