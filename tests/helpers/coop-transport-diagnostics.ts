export type CoopPacketCategory='hello'|'input'|'action'|'delivery'|'export'|'resync'|'ping'|'room-admin'|'welcome'|'frame'|'delta'|'ack'|'notice'|'pong'|'persisted-revision'|'room-access'|'other';
type Direction='sent'|'received';
type Counts={total:number;byType:Partial<Record<CoopPacketCategory,number>>;firstAtMs:number|null;lastAtMs:number|null};
type Sample={direction:Direction;type:CoopPacketCategory;atMs:number};
type Close={atMs:number;code:number|null;reason:string;reasonLength:number|null;wasClean:boolean|null;pendingIncoming:number|null;pendingOutgoing:number|null};

/** Passive, bounded metadata only. This factory is self-contained so the exact
 * same sanitizer can run in a browser init script and on Playwright's native
 * frames. It cannot send, acknowledge, authenticate or repair a connection. */
export function createCoopTransportDiagnostics(now:()=>number=()=>performance.now()){
 const origin=now(),windowMs=1000,sampleLimit=256,connectionLimit=8;
 const categories=new Set<string>(['hello','input','action','delivery','export','resync','ping','room-admin','welcome','frame','delta','ack','notice','pong','persisted-revision','room-access']);
 // Only exact, static reasons from this authority may leave the browser. An
 // unexpected reason can contain capabilities/URLs, so never log a substring.
 const reasons=new Set(['','Room reload required','Room full','Message too large','Rate limit','Room management is saving','Re-entry refused by administrator','New participation is locked','Replaced by reconnect','Removed by administrator; manual reconnect is allowed','Persistence outcome uncertain; reload required','Shared data transfer exceeds receive budget','Handshake timeout','Receive backlog; reconnect for current state','Invalid handshake','Text only','Room load failed']);
 const counts=():Counts=>({total:0,byType:{},firstAtMs:null,lastAtMs:null});
 const time=()=>Math.round((now()-origin)*1000)/1000;
 const copy=(value:Counts):Counts=>({...value,byType:{...value.byType}});
 type Connection={id:number;startedAtMs:number;sent:Counts;received:Counts;recent:Sample[];discardedAtMs:number|null;close:Close|null};
 const connections:Connection[]=[];let connectionCount=0,nativeSent=0,nativeReceived=0;
 const summarize=(value:Connection,atMs:number)=>{
  const samples=value.recent.filter(sample=>sample.atMs>=atMs-windowMs),sent=counts(),received=counts();
  for(const sample of samples){const target=sample.direction==='sent'?sent:received;target.total++;target.byType[sample.type]=(target.byType[sample.type]??0)+1;target.firstAtMs??=sample.atMs;target.lastAtMs=sample.atMs;}
  return {connection:value.id,startedAtMs:value.startedAtMs,sent:copy(value.sent),received:copy(value.received),close:value.close?{...value.close}:null,recent:{windowMs,sampleLimit,truncated:value.discardedAtMs!==null&&value.discardedAtMs>=atMs-windowMs,sent,received,samples:samples.map(sample=>({...sample,agoMs:Math.round((atMs-sample.atMs)*1000)/1000}))}};
 };
 return {
  connection(){
   const value:Connection={id:++connectionCount,startedAtMs:time(),sent:counts(),received:counts(),recent:[],discardedAtMs:null,close:null};connections.push(value);if(connections.length>connectionLimit)connections.shift();
   return {
    packet(direction:Direction,packet:unknown){
     if(value.close)return;
     const candidate=packet&&typeof packet==='object'?(packet as {type?:unknown}).type:undefined;
     const type=typeof candidate==='string'&&categories.has(candidate)?candidate as CoopPacketCategory:'other',atMs=time(),target=value[direction];
     target.total++;target.byType[type]=(target.byType[type]??0)+1;target.firstAtMs??=atMs;target.lastAtMs=atMs;
     if(direction==='sent')nativeSent++;else nativeReceived++;
     while(value.recent.length&&value.recent[0].atMs<atMs-windowMs)value.recent.shift();
     value.recent.push({direction,type,atMs});if(value.recent.length>sampleLimit)value.discardedAtMs=value.recent.shift()!.atMs;
    },
    close(event?:{code?:unknown;reason?:unknown;wasClean?:unknown},pending?:{incoming:number;outgoing:number}){
     if(value.close)return;
     const reason=event?.reason;
     value.close={atMs:time(),code:typeof event?.code==='number'&&Number.isSafeInteger(event.code)&&event.code>=0&&event.code<=4999?event.code:null,reason:typeof reason==='string'?(reasons.has(reason)?reason:'redacted'):'unavailable',reasonLength:typeof reason==='string'?reason.length:null,wasClean:typeof event?.wasClean==='boolean'?event.wasClean:null,pendingIncoming:pending?.incoming??null,pendingOutgoing:pending?.outgoing??null};
    }
   };
  },
  snapshot(){const atMs=time();return {clock:'observer-relative-ms',atMs,connectionCount,connectionLimit,nativeSent,nativeReceived,connections:connections.map(value=>summarize(value,value.close?.atMs??atMs))};}
 };
}
export type CoopTransportDiagnostics=ReturnType<typeof createCoopTransportDiagnostics>;
export type CoopTransportEvidence=ReturnType<CoopTransportDiagnostics['snapshot']>;
