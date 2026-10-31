import type { Build, Launch } from '../core/types';
import type { ClientMessage, ServerMessage } from './protocol';
export type { ServerMessage, StateMessage } from './protocol';
/** A tab is one player. Only server state is rendered; clients never submit scores. */
export class ArenaClient {
  private socket:WebSocket|null=null;private token='';private seq=0;private stopped=false;private retry:ReturnType<typeof setTimeout>|null=null;private heartbeat:ReturnType<typeof setInterval>|null=null;private attempts=0;
  constructor(private endpoint:string,private onMessage:(message:ServerMessage)=>void){}
  connect(){
    this.stopped=false;if(this.socket&&this.socket.readyState<2)return;
    const url=new URL(this.endpoint,location.href);url.protocol=url.protocol==='https:'?'wss:':url.protocol==='http:'?'ws:':url.protocol;if(this.token)url.searchParams.set('resume',this.token);
    const socket=new WebSocket(url);this.socket=socket;
    socket.onmessage=event=>{if(this.socket!==socket)return;let msg:ServerMessage;try{msg=JSON.parse(String(event.data)) as ServerMessage;}catch{return;}if(msg.type==='hello'){this.token=msg.token;this.seq=msg.lastSeq;this.attempts=0;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=setInterval(()=>this.send({type:'ping'}),5000);}this.onMessage(msg);};
    socket.onclose=()=>{if(this.socket!==socket)return;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;if(this.socket===socket)this.socket=null;if(this.stopped)return;if(++this.attempts<=4){this.onMessage({type:'error',message:'接続が中断されました。再接続しています…'});this.retry=setTimeout(()=>this.connect(),Math.min(3000,500*this.attempts));}else this.onMessage({type:'error',message:'サーバーに接続できません。URLとサーバー起動状態を確認してください。'});};
    socket.onerror=()=>{/* close handles retry; no opaque browser error is exposed as success. */};
  }
  queue(build:Build){return this.send({type:'queue',build});}
  launch(launch:Launch){return this.send({type:'launch',launch});}
  next(){return this.send({type:'next'});}
  cancel(){return this.send({type:'cancel'});}
  dispose(){this.stopped=true;if(this.retry)clearTimeout(this.retry);if(this.heartbeat)clearInterval(this.heartbeat);this.retry=null;this.heartbeat=null;this.socket?.close(1000,'client disposed');this.socket=null;}
  private send(message:Omit<Extract<ClientMessage,{type:'queue'}>,'seq'>|Omit<Extract<ClientMessage,{type:'launch'}>,'seq'>|{type:'next'|'cancel'|'ping'}):boolean {
    if(this.socket?.readyState!==WebSocket.OPEN){if(message.type!=='ping')this.onMessage({type:'error',message:'接続完了後に操作してください'});return false;}
    this.socket.send(JSON.stringify({...message,seq:++this.seq}));return true;
  }
}
