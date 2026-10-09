export interface TouchPoint {id:number;x:number;y:number}
export interface TouchEvent {type:'touchStart'|'touchMove'|'touchEnd';touchPoints:TouchPoint[]}

/** Serialize actual CDP contacts, including concurrent look and tell reactions.
 * Ending one gesture must not lift the movement or shield fingers. */
export class TouchContacts {
 private points=new Map<number,TouchPoint>();
 private queue:Promise<void>=Promise.resolve();
 constructor(private dispatch:(event:TouchEvent)=>Promise<unknown>){}
 private enqueue(operation:()=>Promise<void>){
  const pending=this.queue.then(operation);
  // A failed dispatch is returned to its caller; cleanup must still be possible.
  this.queue=pending.catch(()=>{});return pending;
 }
 set(id:number,point:{x:number;y:number}){
  return this.enqueue(async()=>{
   const previous=this.points.get(id);if(previous?.x===point.x&&previous.y===point.y)return;
   const next=new Map(this.points);next.set(id,{id,...point});
   // The pinned Chromium's normal CDP path adds unknown IDs on touchMove.
   // Omitted IDs stay down until an explicit touchEnd names the released finger.
   await this.dispatch({type:this.points.size?'touchMove':'touchStart',touchPoints:[...next.values()]});this.points=next;
  });
 }
 release(id:number){
  return this.enqueue(async()=>{
   const released=this.points.get(id);if(!released)return;
   const next=new Map(this.points);next.delete(id);
   // Legacy CDP touchEnd lists the changed/released contact, not the remaining
   // contacts. Empty touchEnd is reserved for ending the entire gesture.
   await this.dispatch({type:'touchEnd',touchPoints:next.size?[released]:[]});this.points=next;
  });
 }
 clear(){
  return this.enqueue(async()=>{
   if(!this.points.size)return;
   await this.dispatch({type:'touchEnd',touchPoints:[]});this.points.clear();
  });
 }
}
