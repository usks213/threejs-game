import {spatialSound} from './spatial';
import type { Snapshot } from '../simulation/protocol';
/** Synthesized calls with distance and left/right placement, independent of art assets. */
export function creatureVoices(context:AudioContext,output:AudioNode){
 let next=0,index=0;const active=new Set<OscillatorNode>();
 function call(frequency:number,length:number,gain:number,pan:number,rough:boolean){
  const t=context.currentTime,o=context.createOscillator(),v=context.createGain(),p=context.createStereoPanner();o.type=rough?'sawtooth':'sine';o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(frequency*.65,t+length);v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.035);v.gain.exponentialRampToValueAtTime(.0001,t+length);p.pan.value=pan;o.connect(v);v.connect(p);p.connect(output);active.add(o);o.start();o.stop(t+length+.01);o.onended=()=>{active.delete(o);o.disconnect();v.disconnect();p.disconnect();};
 }
 return {update(s:Snapshot){if(context.currentTime<next)return;next=context.currentTime+2.5;
 const nearby=s.adventure.enemies.filter(e=>e.health>0&&Math.hypot(e.x-s.player.x,e.y-s.player.y,e.z-s.player.z)<18);if(!nearby.length)return;
 const e=nearby[index++%nearby.length],mix=spatialSound(s.player,e,s.player.heading,18),v=.025*mix.gain,pan=mix.pan;
 const pitches:Record<string,number>={shellguard:130,reedspitter:740,cinderunner:175,veilray:520,loadwarden:60,echowarden:230,sailwarden:350,stormcore:75,deer:430,boar:90,neck:180,gull:1050,greyling:160,greydwarf:125,stormstag:55};call(pitches[e.definition]??100,e.boss?1:e.definition==='gull'?.4:.25,v,pan,!['deer','gull'].includes(e.definition));
 },dispose(){for(const o of active)o.stop();active.clear();}};
}
