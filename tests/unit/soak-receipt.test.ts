import {afterEach,expect,it,vi} from 'vitest';
import {captureGuardReceipt} from '../../scripts/soak-receipt';
type Actor=Parameters<typeof captureGuardReceipt>[0];
const state=(tick:number,health:number,downedSeconds=0)=>({tick,adventure:{health,coop:{downedSeconds}}});
function actor(){return {name:'B',state:state(10,25),input:vi.fn(),act:vi.fn<Actor['act']>().mockImplementation(async(_action,_name,commandId)=>({type:'ack',commandId,accepted:true,message:''}))};}
afterEach(()=>vi.restoreAllMocks());
it('captures only an accepted live guard receipt and releases movement through normal input',async()=>{
 const c=actor(),wait=vi.fn(async(check:()=>boolean)=>{expect(check()).toBe(true);});
 const receipt=await captureGuardReceipt(c,wait);
 expect(c.input).toHaveBeenCalledExactlyOnceWith(0,0);
 expect(c.act).toHaveBeenCalledExactlyOnceWith({type:'game-action',action:'guard',id:'off',aim:{x:0,y:0,z:1}},'guard-receipt',receipt.commandId,expect.any(Number));
 expect(receipt.action).toEqual(c.act.mock.calls[0][0]);
});
it('waits through downed and dead snapshots without sending guard until ordinary respawn',async()=>{
 const c=actor();c.state=state(10,0,13.1);
 const wait=vi.fn(async(check:()=>boolean)=>{
  expect(check()).toBe(false);expect(c.act).not.toHaveBeenCalled();
  c.state=state(11,0);expect(check()).toBe(false);expect(c.act).not.toHaveBeenCalled();
  c.state=state(12,25);expect(check()).toBe(true);
 });
 await captureGuardReceipt(c,wait);expect(c.act).toHaveBeenCalledTimes(1);
});
it('retries the exact death race only after a newer live snapshot, with a fresh command ID',async()=>{
 const c=actor();let waits=0;
 c.act.mockImplementation(async(_action,_name,commandId)=>({type:'ack',commandId,accepted:c.act.mock.calls.length>1,message:c.act.mock.calls.length===1?'復活を待ってください':''}));
 const wait=vi.fn(async(check:()=>boolean)=>{
  if(++waits===1){expect(check()).toBe(true);return;}
  expect(check()).toBe(false); // The stale, apparently healthy frame cannot trigger a retry.
  c.state=state(11,0,20);expect(check()).toBe(false);
  c.state=state(12,0);expect(check()).toBe(false);
  c.state=state(13,25);expect(check()).toBe(true);
 });
 const receipt=await captureGuardReceipt(c,wait);
 expect(c.act).toHaveBeenCalledTimes(2);expect(c.input).toHaveBeenCalledTimes(2);
 expect(c.act.mock.calls[0][2]).not.toBe(receipt.commandId);expect(c.act.mock.calls[1][2]).toBe(receipt.commandId);
});
it('keeps unrelated ACK failures visible rather than retrying or claiming a receipt',async()=>{
 const c=actor();c.act.mockImplementation(async(_action,_name,commandId)=>({type:'ack',commandId,accepted:false,message:'unexpected rejection'}));
 await expect(captureGuardReceipt(c,async check=>{expect(check()).toBe(true);})).rejects.toThrow('Guard receipt rejected for B: unexpected rejection; {"tick":10,"health":25,"downedSeconds":0}');
 expect(c.act).toHaveBeenCalledTimes(1);
});
it('bounds recovery and all retries by one deadline and passes the remaining ACK budget',async()=>{
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const c=actor();c.state=state(10,0,20);
 c.act.mockImplementation(async(_action,_name,commandId)=>{now=90;return {type:'ack',commandId,accepted:false,message:'復活を待ってください'};});
 let waits=0;
 await expect(captureGuardReceipt(c,async(check,_label,timeout)=>{
  if(++waits===1){expect(timeout).toBe(100);now=70;c.state=state(11,25);expect(check()).toBe(true);}
  else{expect(timeout).toBe(10);now=101;c.state=state(12,25);expect(check()).toBe(true);}
 },100)).rejects.toThrow('Guard receipt timed out for B');
 expect(c.act).toHaveBeenCalledTimes(1);expect(c.act.mock.calls[0][3]).toBe(30);
});
it('propagates failed respawn waits without sending a guard command',async()=>{
 const c=actor();c.state=state(10,0,20);
 await expect(captureGuardReceipt(c,async check=>{expect(check()).toBe(false);throw Error('Timeout: B alive for guard receipt');})).rejects.toThrow('Timeout: B alive for guard receipt');
 expect(c.act).not.toHaveBeenCalled();
});
