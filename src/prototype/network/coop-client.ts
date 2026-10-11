import {CAMPAIGN_PROTOCOL,MAX_PACKET_BYTES,HOST_LEASE_MS,byteLength,integer,record,validRoomCode,validResumeKey,validFrame,validGuestInput,validPose,validCommand,validManifest,snapshotChecksum,splitSnapshot,randomRoomCode,type GuestInput,type RoomRole,type RoomStatus,type PlayerPose,type RoomPlayer,type GuestCommand,type SnapshotManifest,type ServerPacket} from './protocol';
export interface CampaignCoopCallbacks {
 onSnapshot(text:string,sequence:number):void;
 onFrame?(payload:Record<string,unknown>,sequence:number):void;
 onInput?(input:GuestInput,playerId:'guest'):void;
 onCommand(command:GuestCommand,commandId:string,playerId:'guest'):void;
 onPlayers(players:RoomPlayer[]):void;
 onRole(role:RoomRole):void;
 onStatus(status:RoomStatus,message:string):void;
 onAck?(commandId:string,accepted:boolean|null,message:string):void;
 onChat?(playerId:RoomRole,text:string):void;
 onPermission?(guestBuild:boolean):void;
 onSnapshotRequested?():void;
}
export interface CampaignCoopOptions {room:string;resumeKey:string;mode:'create'|'join';endpoint:string;socketFactory?:(url:string)=>WebSocket}
/** Generic transport. Guest adapter must stop local authoritative simulation and
 * render only accepted host snapshots. Never inserts chat text into the DOM. */
export class CampaignCoopClient {
 private socket:WebSocket|null=null;private stopped=false;private generation=0;private attempts=0;
 private retry:ReturnType<typeof setTimeout>|undefined;private heartbeat:ReturnType<typeof setInterval>|undefined;private opening:ReturnType<typeof setTimeout>|undefined;
 private lastReceive=0;private epoch='';private role:RoomRole|null=null;private hostOnline=false;private synchronized=false;
 private frameSequence=0;private lastFrameReceived=0;private lastFrameSent=-Infinity;private inputSequence=0;private lastInputSent=-Infinity;private commandSequence=0;private poseSequence=0;private snapshotSequence=0;private publishing=false;private muted=false;
 private readonly pending=new Set<string>();
 private incoming:{manifest:SnapshotManifest;chunks:string[];bytes:number}|null=null;
 constructor(readonly options:CampaignCoopOptions,readonly callbacks:CampaignCoopCallbacks){if(!validRoomCode(options.room)||!validResumeKey(options.resumeKey))throw new Error('Invalid room or resume key');const url=new URL(options.endpoint);if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid room endpoint');}
 get currentRole(){return this.role;}
 get online(){return !!this.role&&this.hostOnline&&(this.role==='host'||this.synchronized)&&this.socket?.readyState===1;}
 connect(){if(this.stopped)return;clearTimeout(this.retry);clearTimeout(this.opening);clearInterval(this.heartbeat);const generation=++this.generation;const old=this.socket;this.socket=null;old?.close();this.hostOnline=false;this.synchronized=false;this.incoming=null;
  const url=new URL('/campaign-room/'+this.options.room,this.options.endpoint);url.protocol=url.protocol==='https:'?'wss:':'ws:';this.callbacks.onStatus(this.attempts?'reconnecting':'connecting','共有ルームへ接続しています');const socket=this.socket=this.options.socketFactory?.(url.href)??new WebSocket(url.href);const current=()=>!this.stopped&&generation===this.generation;
  socket.onopen=()=>{if(!current()){socket.close();return;}clearTimeout(this.opening);this.lastReceive=Date.now();this.callbacks.onStatus('syncing','ホストの最新状態を待っています');this.send({type:'hello',protocol:CAMPAIGN_PROTOCOL,mode:this.options.mode,resumeKey:this.options.resumeKey});this.heartbeat=setInterval(()=>{if(Date.now()-this.lastReceive>HOST_LEASE_MS)socket.close();else if(this.epoch)this.send({type:'ping',epoch:this.epoch});},3000);};
  socket.onmessage=event=>{if(!current())return;try {this.receive(String(event.data));this.lastReceive=Date.now();}catch(error){this.callbacks.onStatus('paused',error instanceof Error?error.message:'共有状態を読み込めません');socket.close();}};
  socket.onerror=()=>{if(current())this.callbacks.onStatus('paused','接続できません。通信の復帰を待っています');};
  socket.onclose=event=>{if(!current())return;clearInterval(this.heartbeat);clearTimeout(this.opening);this.hostOnline=false;this.synchronized=false;this.incoming=null;this.publishing=false;for(const id of this.pending)this.callbacks.onAck?.(id,null,'接続が切れました。再同期して反映状況を確認してください');this.pending.clear();if(event.code===4001||event.code===1008||event.code===1009){this.disconnect();return;}this.callbacks.onStatus('reconnecting','共有世界を一時停止。再接続しています');this.retry=setTimeout(()=>this.connect(),Math.min(10000,500*2**Math.min(this.attempts++,5)));};
  this.opening=setTimeout(()=>{if(current()&&socket.readyState===0)socket.close();},10000);
 }
 private send(packet:unknown){if(this.socket?.readyState!==1)return false;const text=JSON.stringify(packet);if(byteLength(text)>MAX_PACKET_BYTES)return false;this.socket.send(text);return true;}
 private receive(text:string){if(byteLength(text)>MAX_PACKET_BYTES)throw new Error('通信サイズの上限を超えています');const raw:unknown=JSON.parse(text);if(!record(raw)||typeof raw.type!=='string')throw new Error('通信形式が不正です');const p=raw as unknown as ServerPacket;
  if(p.type==='notice'){if(typeof p.message!=='string')throw new Error('Invalid notice');this.callbacks.onStatus(this.online?'online':'paused',p.message);return;}
  if(p.type==='welcome'){if(p.protocol!==CAMPAIGN_PROTOCOL||!['host','guest'].includes(p.role)||typeof p.epoch!=='string'||!p.epoch||!integer(p.lastCommandSequence)||!integer(p.lastPoseSequence)||!integer(p.snapshotSequence)||typeof p.hostOnline!=='boolean'||p.role!==(this.options.mode==='create'?'host':'guest'))throw new Error('ルームの版または役割が一致しません');this.epoch=p.epoch;this.role=p.role;this.frameSequence=0;this.lastFrameReceived=0;this.lastFrameSent=-Infinity;this.inputSequence=0;this.lastInputSent=-Infinity;this.commandSequence=p.lastCommandSequence;this.poseSequence=p.lastPoseSequence;this.snapshotSequence=p.snapshotSequence;this.hostOnline=p.hostOnline;this.synchronized=p.role==='host';this.attempts=0;this.callbacks.onRole(p.role);this.callbacks.onPermission?.(p.guestBuild);this.callbacks.onStatus(this.online?'online':p.hostOnline?'syncing':'paused',p.role==='host'?'ホストとして接続。進行と保存を担当します':p.hostOnline?'ホストの状態を同期しています':'ホストの再接続を待っています');return;}
  if(!this.role||!('epoch' in p)||p.epoch!==this.epoch)return;
  if(p.type==='pong')return;
  if(p.type==='status'){if(typeof p.hostOnline!=='boolean')throw new Error('Invalid room status');this.hostOnline=p.hostOnline;if(!p.hostOnline){this.synchronized=false;this.lastFrameReceived=0;}this.callbacks.onStatus(this.online?'online':p.hostOnline?'syncing':'paused',p.message);return;}
  if(p.type==='players'){if(!Array.isArray(p.players)||p.players.length>2||p.players.some(v=>!record(v)||!['host','guest'].includes(v.id)||typeof v.connected!=='boolean'||v.pose!==null&&!validPose(v.pose)))throw new Error('Invalid player list');this.callbacks.onPlayers(p.players);return;}
  if(p.type==='permission'){if(typeof p.guestBuild!=='boolean')throw new Error('Invalid permission');this.callbacks.onPermission?.(p.guestBuild);return;}
  if(p.type==='frame'){if(this.role==='guest'&&this.online&&integer(p.sequence,1)&&p.sequence>this.lastFrameReceived&&validFrame(p.payload)){this.lastFrameReceived=p.sequence;this.callbacks.onFrame?.(p.payload,p.sequence);}return;}
  if(p.type==='input'){if(this.role==='host'&&this.online&&validGuestInput(p.input))this.callbacks.onInput?.(p.input,'guest');return;}
  if(p.type==='command'){if(this.role==='host'&&this.online&&validCommand(p.command)&&typeof p.commandId==='string')this.callbacks.onCommand(p.command,p.commandId,'guest');return;}
  if(p.type==='ack'){if(typeof p.commandId!=='string'||![true,false,null].includes(p.accepted)||typeof p.message!=='string')throw new Error('Invalid receipt');this.pending.delete(p.commandId);this.callbacks.onAck?.(p.commandId,p.accepted,p.message);return;}
  if(p.type==='chat'){if(!['host','guest'].includes(p.playerId)||typeof p.text!=='string'||p.text.length>240)throw new Error('Invalid chat');if(!this.muted)this.callbacks.onChat?.(p.playerId,p.text);return;}
  if(p.type==='snapshot-request'){if(this.role==='host'&&this.online)this.callbacks.onSnapshotRequested?.();return;}
  if(this.role!=='guest')return;
  if(p.type==='snapshot-begin'){if(!validManifest(p.manifest)||p.manifest.sequence<this.snapshotSequence)throw new Error('Invalid snapshot manifest');this.incoming={manifest:{...p.manifest},chunks:[],bytes:0};if(!this.synchronized)this.callbacks.onStatus('syncing','共有世界を受信しています');return;}
  if(p.type==='snapshot-chunk'){const t=this.incoming;if(!t||p.sequence!==t.manifest.sequence||p.index!==t.chunks.length||typeof p.data!=='string'||!p.data.length||byteLength(p.data)>32768||t.chunks.length>=t.manifest.chunks)throw new Error('共有世界の順序が不正です');t.bytes+=byteLength(p.data);if(t.bytes>t.manifest.bytes)throw new Error('共有世界のサイズが不正です');t.chunks.push(p.data);return;}
  if(p.type==='snapshot-end'){const t=this.incoming;if(!t||p.sequence!==t.manifest.sequence||t.chunks.length!==t.manifest.chunks||t.bytes!==t.manifest.bytes)throw new Error('共有世界の受信が不完全です');const snapshot=t.chunks.join('');if(snapshotChecksum(snapshot)!==t.manifest.checksum)throw new Error('共有世界の検査値が一致しません');this.callbacks.onSnapshot(snapshot,p.sequence);this.snapshotSequence=p.sequence;this.incoming=null;this.synchronized=true;this.callbacks.onStatus(this.hostOnline?'online':'paused',this.hostOnline?'ホストの共有世界に同期しました':'ホストの再接続を待っています');}
 }
 async hostPublish(text:string){if(this.role!=='host'||!this.online||this.publishing)return false;const transfer=splitSnapshot(text,this.snapshotSequence+1),generation=this.generation;this.publishing=true;try {if(!this.send({type:'snapshot-begin',epoch:this.epoch,manifest:transfer.manifest}))return false;for(let i=0;i<transfer.chunks.length;i++){if(generation!==this.generation||!this.online)return false;while((this.socket?.bufferedAmount??0)>512*1024){await new Promise(resolve=>setTimeout(resolve,50));if(generation!==this.generation||!this.online)return false;}if(!this.send({type:'snapshot-chunk',epoch:this.epoch,sequence:transfer.manifest.sequence,index:i,data:transfer.chunks[i]}))return false;if(i%8===7)await new Promise(resolve=>setTimeout(resolve,50));}if(!this.send({type:'snapshot-end',epoch:this.epoch,sequence:transfer.manifest.sequence}))return false;this.snapshotSequence=transfer.manifest.sequence;return true;}finally{this.publishing=false;}}
 guestRequest(command:GuestCommand){if(this.role!=='guest'||!this.online||!validCommand(command)||this.pending.size>=64)return null;const commandId=randomRoomCode();this.pending.add(commandId);if(!this.send({type:'command',epoch:this.epoch,sequence:++this.commandSequence,commandId,command})){this.pending.delete(commandId);return null;}return commandId;}
 hostAck(commandId:string,accepted:boolean,message:string){return this.role==='host'&&this.online&&this.send({type:'ack',epoch:this.epoch,commandId,accepted,message:message.slice(0,400)});}
 setGuestBuildAllowed(guestBuild:boolean){return this.role==='host'&&this.online&&this.send({type:'permission',epoch:this.epoch,guestBuild});}
 hostFrame(payload:Record<string,unknown>){const now=Date.now();if(this.role!=='host'||!this.online||!validFrame(payload)||now-this.lastFrameSent<100)return false;this.lastFrameSent=now;return this.send({type:'frame',epoch:this.epoch,sequence:++this.frameSequence,payload});}
 sendInput(input:GuestInput){const now=Date.now();if(this.role!=='guest'||!this.online||!validGuestInput(input)||now-this.lastInputSent<1000/30)return false;this.lastInputSent=now;return this.send({type:'input',epoch:this.epoch,sequence:++this.inputSequence,input});}
 sendPose(pose:PlayerPose){return this.online&&validPose(pose)&&this.send({type:'pose',epoch:this.epoch,sequence:++this.poseSequence,pose});}
 sendChat(text:string){return this.online&&text.length>0&&text.length<=240&&this.send({type:'chat',epoch:this.epoch,text});}
 setMuted(muted:boolean){this.muted=muted;}
 resync(){if(!this.role)return false;this.synchronized=this.role==='host';this.callbacks.onStatus('syncing','最新の共有世界を要求しています');return this.send({type:'resync',epoch:this.epoch});}
 disconnect(){this.stopped=true;this.generation++;clearTimeout(this.retry);clearTimeout(this.opening);clearInterval(this.heartbeat);this.hostOnline=false;this.synchronized=false;this.pending.clear();this.incoming=null;this.socket?.close();this.socket=null;this.callbacks.onStatus('closed','ルームから退出しました');}
}
