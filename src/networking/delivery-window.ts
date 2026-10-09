/** Application-level receive receipts bound slow-peer output even on runtimes without bufferedAmount. */
export const DELIVERY_LIMITS={frames:20,bytes:2*1024*1024,packetBytes:16*1024*1024,timeoutSeconds:10} as const;
export class DeliveryWindow{
 private pending:{token:string;bytes:number;at:number}[]=[];private total=0;
 get count():number{return this.pending.length;}
 get bytes():number{return this.total;}
 get writable():boolean{return this.pending.length<DELIVERY_LIMITS.frames&&this.total<DELIVERY_LIMITS.bytes;}
 issue(bytes:number,now:number):string{
  if(!this.writable||!Number.isSafeInteger(bytes)||bytes<0||bytes>DELIVERY_LIMITS.packetBytes||!Number.isFinite(now))throw Error('受信待ちの共有データが上限です');
  // Unpredictable receipt proves the peer received this message; guessing a future tick is insufficient.
  const token=crypto.randomUUID();this.pending.push({token,bytes,at:now});this.total+=bytes;return token;
 }
 acknowledge(token:unknown):boolean{
  if(typeof token!=='string'||token.length!==36)return false;const at=this.pending.findIndex(p=>p.token===token);if(at<0)return false;
  for(const item of this.pending.splice(0,at+1))this.total-=item.bytes;return true;
 }
 stalled(now:number):boolean{return !this.writable&&!!this.pending.length&&now-this.pending[0].at>=DELIVERY_LIMITS.timeoutSeconds;}
}
