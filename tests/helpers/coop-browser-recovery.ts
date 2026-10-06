import {CoopFrameDecoder} from '../../src/networking/coop-frame-decoder';
import type {CoopWireServerPacket} from '../../src/networking/coop-protocol';
import type {SkyboundSnapshot} from '../../src/game/skybound/types';
import type {EditOperation} from '../../src/world/types';

export interface CoopRecoveryFrame {
 epoch:string;
 tick:number;
 inventory:Record<string,number>;
 parts:SkyboundSnapshot['parts'];
}
export interface CoopRecoveryWelcome extends CoopRecoveryFrame {
 playerId:string;
 edits:EditOperation[];
}

/** Passive observation of actual browser WebSocket frames, never a game client.
 * The production decoder keeps its current water baseline internally. History
 * retains only the complete fields under comparison, bounded by frame count;
 * no hello, resume capability, delivery token or full saved world is retained. */
export class CoopBrowserRecoveryObserver {
 readonly history=new Map<number,CoopRecoveryFrame>();
 readonly decodeFailures:{type:'welcome'|'delta';tick?:number}[]=[];
 latest?:CoopRecoveryFrame;
 welcome?:CoopRecoveryWelcome;
 welcomeCount=0;
 private connectionCount=0;
 constructor(readonly historyLimit=120){
  if(!Number.isSafeInteger(historyLimit)||historyLimit<1)throw Error('Recovery history must have a positive finite limit');
 }
 connection():(packet:CoopWireServerPacket)=>void{
  const connection=++this.connectionCount;
  // Deliberately omit the delivery callback: only the real browser may ACK or
  // request resynchronization. A passive observer must not repair its transport.
  const decoder=new CoopFrameDecoder();
  return raw=>{
   if(connection!==this.connectionCount||(raw.type!=='welcome'&&raw.type!=='delta'))return;
   try{
    const packet=decoder.accept(raw);
    if(packet.type!=='welcome'&&packet.type!=='frame')return;
    const frame:CoopRecoveryFrame={epoch:packet.epoch,tick:packet.state.tick,inventory:{...packet.state.adventure.inventory},parts:structuredClone(packet.state.adventure.skybound?.parts??[])};
    if(this.latest?.epoch!==frame.epoch)this.history.clear();
    this.latest=frame;this.history.set(frame.tick,frame);
    while(this.history.size>this.historyLimit)this.history.delete(this.history.keys().next().value!);
    if(packet.type==='welcome'){
     this.welcomeCount++;
     this.welcome={...structuredClone(frame),playerId:packet.playerId,edits:structuredClone(packet.save.edits)};
    }
   }catch{
    // Keep failures visible without copying a packet or an untrusted error
    // string into the artifact. A later welcome may restore decoding, but does
    // not erase the fact that an observed frame could not be reconstructed.
    this.decodeFailures.push({type:raw.type,...(raw.type==='delta'?{tick:raw.tick}:{})});
    if(this.decodeFailures.length>8)this.decodeFailures.shift();
   }
  };
 }
 commonFrame(other:CoopBrowserRecoveryObserver,afterTick:number):{left:CoopRecoveryFrame;right:CoopRecoveryFrame}|undefined{
  for(const [tick,left]of [...this.history].reverse()){
   if(tick<=afterTick)continue;
   const right=other.history.get(tick);
   if(right&&left.epoch===right.epoch)return {left,right};
  }
 }
}
