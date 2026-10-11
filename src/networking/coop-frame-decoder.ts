import {FluidWireDecoder} from './fluid-wire';
import {decodeCompactFluidDelta} from './compact-fluid';
import {SnapshotWireDecoder} from './snapshot-wire';
import type {Snapshot} from '../simulation/protocol';
import type {CoopServerPacket,CoopWireServerPacket} from './coop-protocol';
/** A failed compound frame requires a fresh welcome; no partial state is delivered. */
export class CoopFrameDecoder{
 constructor(private readonly received?:(token:string)=>void){}
 private receipt(packet:CoopWireServerPacket):void{if(typeof packet.delivery==='string')this.received?.(packet.delivery);}
 private readonly water=new FluidWireDecoder();private readonly state=new SnapshotWireDecoder<Snapshot>();private valid=false;private epoch='';
 accept(packet:CoopWireServerPacket):CoopServerPacket{
  if(packet.type==='welcome'){
   this.valid=false;this.water.reset(packet.state.fluids);this.state.reset({...packet.state,fluids:[]});this.epoch=packet.epoch;this.valid=true;this.receipt(packet);return packet;
  }
  if(packet.type!=='delta'){this.receipt(packet);return packet;}
  if(!this.valid||packet.epoch!==this.epoch)throw Error('共有状態の完全な再同期が必要です');
  try{
   const state=this.state.apply(packet.state),fluids=this.water.apply(decodeCompactFluidDelta(packet.water));
   if(!state||!Number.isSafeInteger(state.tick)||state.tick!==packet.tick||!Array.isArray(state.fluids))throw Error('共有状態のtickが一致しません');
   this.receipt(packet);return {type:'frame',epoch:packet.epoch,state:{...state,fluids},water:undefined,editBase:packet.editBase,edits:packet.edits};
  }catch(error){this.valid=false;throw error;}
 }
}
