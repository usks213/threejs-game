/** Test-only application-boundary impairment of real browser WebSockets.
 * No endpoint, packet contents, gameplay input, authority reply or saved state is
 * fabricated. Capabilities remain in the browser and are never exported. */
export interface CoopImpairmentStats {
 incoming:number;outgoing:number;receivedDeltas:number;droppedDeltas:number;duplicatedActions:number;droppedIdleInputs:number;
 delayedIncoming:number;delayedOutgoing:number;incomingDelayMs:number[];outgoingDelayMs:number[];pingRttMs:number[];queued:number;
}
export interface CoopImpairment {
 enabled:boolean;skipNextDelta:boolean;skipped:number;dropNextIdle:boolean;duplicateSuccessfulGather:boolean;
 stats:CoopImpairmentStats;
}
declare global {interface Window {coopDeliveryFault:CoopImpairment}}

export function installCoopBrowserImpairment():void {
 const stats:CoopImpairmentStats={incoming:0,outgoing:0,receivedDeltas:0,droppedDeltas:0,duplicatedActions:0,droppedIdleInputs:0,delayedIncoming:0,delayedOutgoing:0,incomingDelayMs:[],outgoingDelayMs:[],pingRttMs:[],queued:0};
 const fault:CoopImpairment={enabled:false,skipNextDelta:false,skipped:0,dropNextIdle:false,duplicateSuccessfulGather:true,stats};window.coopDeliveryFault=fault;
 const remember=(values:number[],value:number)=>{values.push(value);if(values.length>200)values.shift();};
 const Native=window.WebSocket;
 window.WebSocket=new Proxy(Native,{construct(Target,args,newTarget){
  const socket=Reflect.construct(Target,args,newTarget) as WebSocket;
  if(!/^\/coop\/[a-f0-9]{48}$/.test(new URL(String(args[0]),location.href).pathname))return socket;
  const nativeSend=socket.send.bind(socket),forwarded=new WeakSet<Event>(),gathers=new Map<string,string>(),pings:number[]=[];
  type Direction='incoming'|'outgoing';
  type Pending={run:()=>void;at:number;due:number;measured:boolean};
  const queues:Record<Direction,Pending[]>={incoming:[],outgoing:[]},timers:Partial<Record<Direction,ReturnType<typeof setTimeout>>>={};
  let closed=false,outIndex=0,inIndex=0;
  const arm=(direction:Direction)=>{
   const pending=queues[direction];if(closed||timers[direction]!==undefined||!pending.length)return;
   // Exactly one drain owns each direction. Independent equal-deadline timers
   // can reorder after fractional timeout rounding, unlike a real WebSocket.
   timers[direction]=setTimeout(()=>{delete timers[direction];
    while(!closed&&pending.length&&pending[0].due<=performance.now()+.001){
     const next=pending.shift()!;stats.queued--;
     if(next.measured){if(direction==='incoming'){stats.delayedIncoming++;remember(stats.incomingDelayMs,performance.now()-next.at);}else{stats.delayedOutgoing++;remember(stats.outgoingDelayMs,performance.now()-next.at);}}
     next.run();
    }
    arm(direction);
   },Math.max(0,Math.ceil(pending[0].due-performance.now())));
  };
  const queue=(direction:Direction,run:()=>void)=>{
   const now=performance.now(),index=direction==='incoming'?++inIndex:++outIndex,delay=fault.enabled?75+(index%6)*5:0,pending=queues[direction];
   if(!delay&&!pending.length){if(!closed)run();return;}
   const due=Math.max(now+delay,pending.at(-1)?.due??now);pending.push({run,at:now,due,measured:fault.enabled});stats.queued++;arm(direction);
  };
  socket.send=(data:Parameters<WebSocket['send']>[0])=>{
   if(socket.readyState!==Target.OPEN){nativeSend(data);return;}
   let packet:{type?:string;commandId?:string;input?:{x:number;z:number;jump:boolean};message?:{type?:string;action?:string}}|undefined;
   if(typeof data==='string')try{packet=JSON.parse(data);}catch{}
   if(fault.enabled){stats.outgoing++;
    if(packet?.type==='input'&&fault.dropNextIdle&&packet.input?.x===0&&packet.input.z===0&&!packet.input.jump){fault.dropNextIdle=false;stats.droppedIdleInputs++;return;}
    if(packet?.type==='action'&&packet.commandId&&packet.message?.type==='game-action'&&packet.message.action==='gather'&&fault.duplicateSuccessfulGather&&typeof data==='string'){gathers.set(packet.commandId,data);if(gathers.size>8)gathers.delete(gathers.keys().next().value!);}
    if(packet?.type==='ping')pings.push(performance.now());
   }
   queue('outgoing',()=>{if(socket.readyState===Target.OPEN)nativeSend(data);});
  };
  socket.addEventListener('message',event=>{
   if(forwarded.has(event))return;
   let packet:{type?:string;commandId?:string;accepted?:boolean}|undefined;try{packet=JSON.parse(String(event.data));}catch{}
   if(fault.skipNextDelta&&packet?.type==='delta'){fault.skipNextDelta=false;fault.skipped++;event.stopImmediatePropagation();return;}
   if(fault.enabled){stats.incoming++;
    if(packet?.type==='delta'){stats.receivedDeltas++;if(stats.receivedDeltas===50||stats.receivedDeltas===100){stats.droppedDeltas++;event.stopImmediatePropagation();return;}}
   }
   if(!fault.enabled&&!queues.incoming.length)return;
   event.stopImmediatePropagation();
   queue('incoming',()=>{
    if(socket.readyState!==Target.OPEN)return;
    if(packet?.type==='pong'&&pings.length)remember(stats.pingRttMs,performance.now()-pings.shift()!);
    // Resend exactly one successful UI-produced gather, with its original ID.
    // The losing pickup's rejection must never masquerade as a duplicate pass.
    if(fault.enabled&&fault.duplicateSuccessfulGather&&packet?.type==='ack'&&packet.accepted&&packet.commandId&&gathers.has(packet.commandId)){
     const original=gathers.get(packet.commandId)!;fault.duplicateSuccessfulGather=false;gathers.clear();queue('outgoing',()=>{if(socket.readyState===Target.OPEN){nativeSend(original);stats.duplicatedActions++;}});
    }else if(packet?.type==='ack'&&packet.commandId)gathers.delete(packet.commandId);
    const delivered=new MessageEvent('message',{data:event.data,origin:event.origin,lastEventId:event.lastEventId});forwarded.add(delivered);socket.dispatchEvent(delivered);
   });
  },{capture:true});
  socket.addEventListener('close',()=>{closed=true;for(const direction of['incoming','outgoing'] as const){clearTimeout(timers[direction]);delete timers[direction];stats.queued-=queues[direction].length;queues[direction].length=0;}gathers.clear();pings.length=0;},{capture:true,once:true});
  return socket;
 }});
}
