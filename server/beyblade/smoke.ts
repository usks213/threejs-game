/** Read-only game smoke: creates only transient anonymous match state at an authorized endpoint. */
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { defaultBuild } from '../../src/beyblade/data/catalog';
import type { ServerMessage, StateMessage } from '../../src/beyblade/network/protocol';
const base=process.env.BEYBLADE_SMOKE_URL;
if(!base)throw new Error('Set BEYBLADE_SMOKE_URL to an explicitly authorized local/preview origin');
const url=new URL('/api/beyblade',base);url.protocol=url.protocol==='https:'?'wss:':'ws:';
const health=await fetch(new URL('/api/beyblade/health',base));assert.equal(health.status,200);assert.equal((await health.json() as {service:string}).service,'beyblade-authoritative');
interface Peer { socket:WebSocket;state:StateMessage|null;seq:number;token:string;heartbeat:ReturnType<typeof setInterval>|null }
const peers:Peer[]=[];
const wait=async(check:()=>boolean,ms=15_000)=>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for authoritative multiplayer state');await new Promise(resolve=>setTimeout(resolve,25));}};
const send=(p:Peer,data:object)=>p.socket.send(JSON.stringify({...data,seq:++p.seq}));
async function connect(resume=''):Promise<Peer>{
  const endpoint=new URL(url);if(resume)endpoint.searchParams.set('resume',resume);
  const p:Peer={socket:new WebSocket(endpoint,{origin:new URL(base!).origin}),state:null,seq:0,token:'',heartbeat:null};peers.push(p);
  p.socket.on('error',error=>console.error('WebSocket transport error:',error.message));
  p.socket.on('message',data=>{const m=JSON.parse(data.toString()) as ServerMessage;if(m.type==='hello'){p.token=m.token;p.seq=m.lastSeq;}if(m.type==='state')p.state=m;if(m.type==='error')console.error('Server rejected command:',m.message);});
  await wait(()=>Boolean(p.token)&&p.state!==null);p.heartbeat=setInterval(()=>{if(p.socket.readyState===WebSocket.OPEN)send(p,{type:'ping'});},5000);return p;
}
try{
  if(process.argv.includes('--restart-check')){
    const checkpoint=process.env.BEYBLADE_RESTART_CHECKPOINT;if(!checkpoint)throw new Error('Missing isolated restart checkpoint');
    const previous=JSON.parse(await readFile(checkpoint,'utf8')) as {tokens:string[];roomId:string};
    for(const token of previous.tokens){const p=await connect(token);assert.notEqual(p.token,token);assert.equal(p.state?.phase,'idle');assert.equal(p.state?.roomId,null);assert.equal(p.state?.match,null);}
    console.info(JSON.stringify({ok:true,restart:'fresh sessions, no fabricated recovered result',clients:2}));
  }else{
  await connect();await connect();
  const [a,b]=peers;send(a,{type:'queue',build:defaultBuild});send(b,{type:'queue',build:defaultBuild});await wait(()=>a.state?.phase==='ready'&&b.state?.phase==='ready');assert.equal(a.state?.roomId,b.state?.roomId);assert.notEqual(a.state?.player,b.state?.player);
  let rounds=0;
  while(rounds++<12){
    send(a,{type:'launch',launch:{power:.2,angle:.3,tilt:.6}});send(b,{type:'launch',launch:{power:1,angle:0,tilt:0}});
    await wait(()=>['round-end','match-end'].includes(a.state?.phase??'')&&['round-end','match-end'].includes(b.state?.phase??''),60_000);
    assert.deepEqual(a.state?.match,b.state?.match);assert.deepEqual(a.state?.battle,b.state?.battle);assert.ok(a.state?.battle?.result);assert.ok(a.state!.battle!.tick>0);
    if(a.state?.phase==='match-end'){assert.ok(Math.max(...a.state.match!.scores)>=4);break;}
    send(a,{type:'next'});send(b,{type:'next'});await wait(()=>a.state?.phase==='ready'&&b.state?.phase==='ready');
  }
  assert.equal(a.state?.phase,'match-end');const result={rounds,scores:a.state?.match?.scores,winner:a.state?.match?.winner};
  send(a,{type:'cancel'});send(b,{type:'cancel'});await wait(()=>a.state?.phase==='idle'&&b.state?.phase==='idle');
  send(a,{type:'queue',build:defaultBuild});send(b,{type:'queue',build:defaultBuild});await wait(()=>a.state?.phase==='ready'&&b.state?.phase==='ready');
  const roomId=a.state!.roomId;const token=a.token;if(a.heartbeat)clearInterval(a.heartbeat);a.socket.close();await wait(()=>b.state?.phase==='opponent-disconnected');
  const resumed=await connect(token);await wait(()=>resumed.state?.phase==='ready'&&b.state?.phase==='ready');assert.equal(resumed.state?.roomId,roomId);assert.equal(resumed.state?.player,0);
  send(resumed,{type:'cancel'});await wait(()=>b.state?.phase==='match-end');assert.equal(b.state?.reason,'opponent-left');assert.equal(b.state?.match?.winner,1);send(b,{type:'cancel'});await wait(()=>resumed.state?.phase==='idle'&&b.state?.phase==='idle');
  if(process.env.BEYBLADE_RESTART_CHECKPOINT){send(resumed,{type:'queue',build:defaultBuild});send(b,{type:'queue',build:defaultBuild});await wait(()=>resumed.state?.phase==='ready'&&b.state?.phase==='ready');await writeFile(process.env.BEYBLADE_RESTART_CHECKPOINT,JSON.stringify({tokens:[resumed.token,b.token],roomId:resumed.state?.roomId}),{mode:0o600});}
  console.info(JSON.stringify({ok:true,clients:2,authority:'server',reconnect:true,forfeit:true,...result}));
  }
}finally{for(const p of peers){if(p.heartbeat)clearInterval(p.heartbeat);p.socket.close();p.socket.terminate();}}
