import {randomUUID} from 'node:crypto';
import type {CoopAction,CoopServerPacket} from '../src/networking/coop-protocol';
import type {Snapshot} from '../src/simulation/protocol';
type Ack=Extract<CoopServerPacket,{type:'ack'}>;
interface ReceiptActor {
 readonly name:string;
 readonly state:Pick<Snapshot,'tick'> & {adventure:Pick<Snapshot['adventure'],'health'|'coop'>}|undefined;
 input(x:number,z:number):void;
 act(action:CoopAction,name:string,commandId:string,timeoutMs?:number):Promise<Ack>;
}
type ReceiptWait=(test:()=>boolean,label:string,timeout:number)=>Promise<void>;
/** A live server may legitimately down an actor at any lifecycle boundary. Wait
 * for its ordinary revive/respawn before probing persisted receipts; never edit
 * the simulation or count a rejected command as a successful receipt. */
export async function captureGuardReceipt(actor:ReceiptActor,wait:ReceiptWait,timeoutMs=120000){
 const deadline=performance.now()+timeoutMs;
 const describe=()=>JSON.stringify({tick:actor.state?.tick,health:actor.state?.adventure.health,downedSeconds:actor.state?.adventure.coop?.downedSeconds});
 const remaining=()=>{const ms=deadline-performance.now();if(ms<=0)throw Error('Guard receipt timed out for '+actor.name+': '+describe());return ms;};
 let afterTick=-1;
 for(;;){
  actor.input(0,0);
  await wait(()=>{const state=actor.state;return !!state&&state.tick>afterTick&&state.adventure.health>0&&!(state.adventure.coop?.downedSeconds!>0);},actor.name+' alive for guard receipt '+describe(),remaining());
  const tick=actor.state!.tick,commandId=randomUUID(),action:CoopAction={type:'game-action',action:'guard',id:'off',aim:{x:0,y:0,z:1}};
  const ack=await actor.act(action,'guard-receipt',commandId,remaining());
  if(ack.accepted)return {commandId,action};
  // The actor can die after the latest frame but before the action reaches the
  // authority. Its rejected command ID stays rejected: use a fresh ID only
  // after a newer, living snapshot. All other rejections remain hard failures.
  if(ack.message!=='復活を待ってください')throw Error('Guard receipt rejected for '+actor.name+': '+ack.message+'; '+describe());
  afterTick=tick;
 }
}
