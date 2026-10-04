/** Coalesces burst mutations into one snapshot while retaining persist-before-ACK. */
export class CheckpointQueue {
 private pending: {resolve:()=>void;reject:(error:unknown)=>void}[]=[];
 private timer:ReturnType<typeof setTimeout>|undefined;
 private writing=false;
 constructor(private readonly write:()=>Promise<void>,private readonly delay=80){}
 request():Promise<void>{
  if(this.pending.length>=512)return Promise.reject(new Error('Save queue is full'));
  const result=new Promise<void>((resolve,reject)=>this.pending.push({resolve,reject}));
  if(!this.writing&&this.timer===undefined)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.delay);
  return result;
 }
 async flush():Promise<void>{
  if(this.writing||!this.pending.length)return;
  if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.writing=true;
  const waiting=this.pending.splice(0);
  try{await this.write();for(const waiter of waiting)waiter.resolve();}
  catch(error){for(const waiter of waiting)waiter.reject(error);}
  finally{this.writing=false;if(this.pending.length&&this.timer===undefined)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.delay);}
 }
}
