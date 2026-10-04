/** Procedural placeholders: filtered blade air, low body impact and inharmonic steel ringing. */
export function createAudio(){
 let context:AudioContext|null=null,noise:AudioBuffer|null=null,voices=0;
 function envelope(node:AudioNode,volume:number,duration:number){const c=context!,gain=c.createGain(),now=c.currentTime;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.009);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);node.connect(gain);gain.connect(c.destination);return gain;}
 function air(frequency:number,volume:number,duration:number,filterType:BiquadFilterType='bandpass'){
  const c=context!,source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=noise;filter.type=filterType;filter.frequency.setValueAtTime(frequency,c.currentTime);filter.frequency.exponentialRampToValueAtTime(Math.max(80,frequency*.3),c.currentTime+duration);filter.Q.value=.6;source.connect(filter);const gain=envelope(filter,volume,duration);voices++;source.onended=()=>{voices--;source.disconnect();filter.disconnect();gain.disconnect();};source.start();source.stop(c.currentTime+duration+.02);
 }
 function ring(frequency:number,volume:number,duration:number){const c=context!,o=c.createOscillator();o.type='sine';o.frequency.setValueAtTime(frequency,c.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.94,c.currentTime+duration);const gain=envelope(o,volume,duration);voices++;o.onended=()=>{voices--;o.disconnect();gain.disconnect();};o.start();o.stop(c.currentTime+duration+.02);}
 return {
  start(){if(!context){context=new AudioContext();noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}void context.resume();},
  play(kind:string){if(!context||context.state!=='running'||voices>12)return;
   if(kind==='swing')air(1500,.13,.24);
   else if(kind==='parry'){air(2900,.15,.08);for(const [f,g,d] of [[780,.045,.24],[1327,.023,.34],[2410,.011,.18]])ring(f,g,d);}
   else if(kind==='hit'||kind==='hurt'){air(kind==='hurt'?240:550,.28,.14,'lowpass');ring(76,.07,.13);}
   else if(kind==='step')air(320,.055,.085,'lowpass');
   else if(kind==='break')air(700,.2,.3,'lowpass');else air(600,.035,.06,'lowpass');
  },
  dispose(){void context?.close();context=null;noise=null;},
 };
}
