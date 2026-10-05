import type {Snapshot} from '../simulation/protocol';
import type {EditOperation} from '../world/types';
import type {ReplicaApplied,ReplicaMotion,ReplicaUpdate,ReplicaRejected} from '../simulation/local-protocol';
interface Frame {requestId:number;state:Snapshot;edits:EditOperation[]}
/** One full worker update in flight, plus only the newest complete authority
 * frame. Public deltas have already been validated and accumulated by networkUI. */
export class ReplicaBridge {
 private sequence=0;
 private epoch:number|null=null;
 private inFlight:Frame|null=null;
 private pending:Frame|null=null;
 private displayed:{requestId:number;state:Snapshot;sequence:number}|null=null;
 constructor(private readonly send:(message:ReplicaUpdate)=>void,private readonly publish:(state:Snapshot,motionOnly:boolean)=>void){}
 reset():void{this.epoch=null;this.inFlight=null;this.pending=null;this.displayed=null;}
 beginEpoch(epoch:number):void{this.epoch=epoch;this.flush();}
 offer(state:Snapshot,edits:EditOperation[]):void{
  const newest=this.pending?.state.tick??this.inFlight?.state.tick??this.displayed?.state.tick??-1;
  if(state.tick<newest)return;
  this.pending={requestId:++this.sequence,state,edits};this.flush();
 }
 private flush():void{
  if(this.epoch===null||this.inFlight||!this.pending)return;
  const frame=this.inFlight=this.pending;this.pending=null;
  this.send({type:'replica-update',...frame});
 }
 applied(message:ReplicaApplied):void{
  const frame=this.inFlight;
  if(!frame||message.epoch!==this.epoch||message.requestId!==frame.requestId||message.tick!==frame.state.tick)return;
  const state={...frame.state,player:message.player};
  this.displayed={requestId:frame.requestId,state,sequence:state.ack??0};this.inFlight=null;
  this.publish(state,false);this.flush();
 }
 rejected(message:ReplicaRejected):void{if(message.epoch===this.epoch&&message.requestId===this.inFlight?.requestId){this.inFlight=null;this.flush();}}
 motion(message:ReplicaMotion):void{
  const current=this.displayed;
  if(!current||message.epoch!==this.epoch||message.requestId!==current.requestId||message.tick!==current.state.tick||message.sequence<=current.sequence)return;
  current.sequence=message.sequence;current.state={...current.state,player:message.player};this.publish(current.state,true);
 }
 get stats(){return {inFlight:this.inFlight?1:0,pending:this.pending?1:0,latestTick:this.pending?.state.tick??this.inFlight?.state.tick??this.displayed?.state.tick??-1,displayedTick:this.displayed?.state.tick??-1};}
}
