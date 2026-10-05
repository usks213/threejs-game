/** Lossless JSON-state deltas. Water has its own bounded exact-value codec. */
export type WireJson=null|boolean|number|string|WireJson[]|{[key:string]:WireJson};
export type SnapshotChange=[(string|number)[],0]|[(string|number)[],1,WireJson];
export interface SnapshotDelta {base:number;revision:number;changes:SnapshotChange[]}
export const SNAPSHOT_WIRE_LIMITS={bytes:4*1024*1024,changes:12000,depth:24,pathKey:128} as const;
const utf8Bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
const safeKey=(key:string)=>key.length<=SNAPSHOT_WIRE_LIMITS.pathKey&&key!=='__proto__'&&key!=='prototype'&&key!=='constructor';
function normalized(value:unknown,size?:{bytes:number}):WireJson{
 const text=JSON.stringify(value,(key,v:unknown)=>{if(!safeKey(key)||typeof v==='number'&&!Number.isFinite(v))throw Error('状態の値が不正です');return v;});
 if(text===undefined)throw Error('状態の値が不正です');const bytes=utf8Bytes(text);if(bytes>SNAPSHOT_WIRE_LIMITS.bytes)throw Error('状態の通信量が上限を超えています');
 if(size)size.bytes=bytes;const result=JSON.parse(text) as WireJson;validateTree(result);return result;
}
function validateTree(value:WireJson,depth=0):void{
 if(depth>SNAPSHOT_WIRE_LIMITS.depth)throw Error('状態の階層が深すぎます');
 if(value===null||typeof value==='boolean'||typeof value==='string')return;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('状態の数値が不正です');return;}
 if(typeof value!=='object')throw Error('状態の値が不正です');
 for(const key of Object.keys(value)){if(!safeKey(key))throw Error('状態のキーが不正です');validateTree((value as Record<string,WireJson>)[key],depth+1);}
}
function sameContainer(a:WireJson,b:WireJson):boolean{return a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b);}
function difference(previous:WireJson,next:WireJson,path:(string|number)[],out:SnapshotChange[]):void{
 if(previous===next)return;
 if(!sameContainer(previous,next)||Array.isArray(previous)&&Array.isArray(next)&&previous.length!==next.length){out.push([[...path],1,next]);return;}
 if(Array.isArray(previous)&&Array.isArray(next)){for(let i=0;i<next.length;i++){path.push(i);difference(previous[i],next[i],path,out);path.pop();}return;}
 const a=previous as Record<string,WireJson>,b=next as Record<string,WireJson>;
 for(const key of Object.keys(a))if(!Object.hasOwn(b,key))out.push([[...path,key],0]);
 for(const key of Object.keys(b)){path.push(key);if(!Object.hasOwn(a,key))out.push([[...path],1,b[key]]);else difference(a[key],b[key],path,out);path.pop();}
}
export class SnapshotWireEncoder {
 private previous:WireJson|null=null;private revision=0;
 reset(snapshot:unknown):void{this.previous=normalized(snapshot);this.revision=0;}
 encode(snapshot:unknown):SnapshotDelta{
  if(this.previous===null)throw Error('状態の基準がありません');
  const size={bytes:0},next=normalized(snapshot,size),changes:SnapshotChange[]=[];difference(this.previous,next,[],changes);
  // A crowded reshuffle can cost more than a new baseline. Both preserve the same exact state.
  let delta:SnapshotDelta={base:this.revision,revision:this.revision+1,changes};
  if(changes.length>SNAPSHOT_WIRE_LIMITS.changes||utf8Bytes(JSON.stringify(delta))>size.bytes)delta={...delta,changes:[[[],1,next]]};
  this.previous=next;this.revision++;return delta;
 }
}
export class SnapshotWireDecoder<T> {
 private previous:WireJson|null=null;private revision=0;
 reset(snapshot:T):void{this.previous=normalized(snapshot);this.revision=0;}
 apply(raw:unknown):T{
  if(this.previous===null||!raw||typeof raw!=='object')throw Error('状態の基準がありません');
  const delta=raw as SnapshotDelta;
  if(delta.base!==this.revision||!Number.isSafeInteger(delta.revision)||delta.revision!==this.revision+1||!Array.isArray(delta.changes)||delta.changes.length>SNAPSHOT_WIRE_LIMITS.changes)throw Error('状態の差分が連続していません');
  if(utf8Bytes(JSON.stringify(delta))>SNAPSHOT_WIRE_LIMITS.bytes)throw Error('状態の差分が大きすぎます');
  const copy=(value:WireJson):WireJson=>Array.isArray(value)?[...value]:value!==null&&typeof value==='object'?{...value}:value;
  let next:WireJson=copy(this.previous);const writable=new WeakSet<object>();if(next!==null&&typeof next==='object')writable.add(next);
  for(const change of delta.changes){
   if(!Array.isArray(change)||!Array.isArray(change[0])||change[0].length>SNAPSHOT_WIRE_LIMITS.depth||(change[1]!==0&&change[1]!==1)||change.length!==(change[1]===0?2:3))throw Error('状態の操作が不正です');
   const[path,operation]=change;
   if(path.some(key=>typeof key==='string'?!safeKey(key):!Number.isSafeInteger(key)||key<0))throw Error('状態の経路が不正です');
   if(operation===1)validateTree(change[2],path.length);
   if(!path.length){if(operation!==1||delta.changes.length!==1)throw Error('状態の置換が不正です');next=structuredClone(change[2]);continue;}
   let parent:WireJson=next;
   for(const key of path.slice(0,-1)){if(parent===null||typeof parent!=='object'||!Object.hasOwn(parent,key))throw Error('状態の経路がありません');const record=parent as Record<string|number,WireJson>;let child=record[key];if(child!==null&&typeof child==='object'&&!writable.has(child)){child=copy(child);record[key]=child;writable.add(child as object);}parent=child;}
   const key=path.at(-1)!;
   if(parent===null||typeof parent!=='object'||Array.isArray(parent)&&(typeof key!=='number'||key>=parent.length||operation===0)||!Array.isArray(parent)&&typeof key!=='string')throw Error('状態の対象が不正です');
   if(operation===0){if(!Object.hasOwn(parent,key))throw Error('状態の削除対象がありません');delete(parent as Record<string,WireJson>)[key];}
   else(parent as Record<string|number,WireJson>)[key]=structuredClone(change[2]);
  }
  // Validate the complete candidate before committing its revision, including many small additions.
  if(utf8Bytes(JSON.stringify(next))>SNAPSHOT_WIRE_LIMITS.bytes)throw Error('状態の通信量が上限を超えています');
  this.previous=next;this.revision=delta.revision;return structuredClone(next) as T;
 }
}
